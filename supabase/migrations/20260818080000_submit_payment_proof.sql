-- ==============================================================================
-- Donatur Helper - Submit Payment Proof Mutation RPC Function Migration
-- Migration File: 20260818080000_submit_payment_proof.sql
-- Description: Creates submit_payment_proof mutation RPC function for donors to
--              submit payment proof (storage path and optional URL) after uploading
--              to Supabase Storage. Handles phone normalization, campaign status
--              check, donor validation, payment status update, and audit logging.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: submit_payment_proof
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_payment_proof(
    p_campaign_id TEXT,
    p_whatsapp TEXT,
    p_storage_path TEXT,
    p_proof_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_campaign_id TEXT;
    v_normalized_whatsapp TEXT;
    v_clean_storage_path TEXT;
    v_clean_proof_url TEXT;
    v_campaign RECORD;
    v_donor RECORD;
    v_updated_donor RECORD;
    v_was_paid BOOLEAN;
BEGIN
    -- 1. Normalize WhatsApp number
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);

    -- 2. Validate normalized WhatsApp number
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid. Silakan periksa kembali nomor Anda.'
        );
    END IF;

    -- 3. Validate Campaign ID
    v_clean_campaign_id := NULLIF(TRIM(p_campaign_id), '');
    IF v_clean_campaign_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Campaign tidak valid.'
        );
    END IF;

    -- 4. Validate Storage Path
    v_clean_storage_path := NULLIF(TRIM(p_storage_path), '');
    IF v_clean_storage_path IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Bukti pembayaran tidak ditemukan. Silakan unggah bukti transfer Anda.'
        );
    END IF;

    -- Prepare clean proof URL if provided
    v_clean_proof_url := NULLIF(TRIM(p_proof_url), '');

    -- 5. Validate and lock campaign row
    SELECT * INTO v_campaign
    FROM campaigns
    WHERE campaign_id = v_clean_campaign_id
    FOR UPDATE;

    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Campaign tidak ditemukan.'
        );
    END IF;

    IF v_campaign.status <> 'FINALIZED' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_not_finalized',
            'message', 'Campaign belum difinalisasi. Bukti pembayaran hanya bisa dikirim setelah PIC memfinalisasi campaign.'
        );
    END IF;

    -- 6. Validate and lock donor record
    SELECT * INTO v_donor
    FROM donors
    WHERE campaign_id = v_campaign.campaign_id
      AND whatsapp = v_normalized_whatsapp
    FOR UPDATE;

    IF v_donor.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Anda belum terdaftar sebagai donatur di campaign ini.'
        );
    END IF;

    IF v_donor.donor_status IN ('WITHDRAWN', 'CANCELLED') THEN
        RETURN jsonb_build_object(
            'error', 'donor_inactive',
            'message', 'Status keikutsertaan Anda di campaign ini sudah tidak aktif.'
        );
    END IF;

    IF v_donor.paid IS TRUE AND v_donor.verified IS TRUE THEN
        RETURN jsonb_build_object(
            'error', 'already_verified',
            'message', 'Pembayaran Anda sudah diverifikasi oleh PIC.'
        );
    END IF;

    -- 7. Track previous payment state for audit logging
    v_was_paid := COALESCE(v_donor.paid, FALSE);

    -- 8. Update donor record
    UPDATE donors
    SET
        proof_storage_path = v_clean_storage_path,
        proof_link = COALESCE(v_clean_proof_url, proof_link),
        paid = TRUE,
        paid_at = NOW(),
        amount_paid = amount_due,
        verified = FALSE,
        modified_at = NOW()
    WHERE id = v_donor.id
    RETURNING * INTO v_updated_donor;

    -- 9. Insert audit log
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_donor.member_id,
        'donor',
        'submit_payment_proof',
        'donor',
        v_campaign.campaign_id || ':' || v_normalized_whatsapp,
        jsonb_build_object(
            'campaign_id', v_campaign.campaign_id,
            'storage_path', v_clean_storage_path,
            'proof_url', v_clean_proof_url,
            'amount_paid', v_updated_donor.amount_paid,
            'reupload', v_was_paid
        )
    );

    -- 10. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'submit_payment_proof',
        'campaign_id', v_campaign.campaign_id,
        'message', 'Bukti pembayaran berhasil dikirim. Menunggu verifikasi PIC.',
        'donor', jsonb_build_object(
            'id', v_updated_donor.id,
            'campaign_id', v_updated_donor.campaign_id,
            'name', v_updated_donor.name,
            'amount_due', v_updated_donor.amount_due,
            'amount_paid', v_updated_donor.amount_paid,
            'paid', v_updated_donor.paid,
            'verified', v_updated_donor.verified,
            'paid_at', to_char(v_updated_donor.paid_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'proof_storage_path', v_updated_donor.proof_storage_path
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION submit_payment_proof(TEXT, TEXT, TEXT, TEXT) IS 'Donor payment proof submission mutation RPC replacing legacy submitPaymentProof. Handles storage path and proof URL registration, payment status update, and audit logging.';

GRANT EXECUTE ON FUNCTION submit_payment_proof(TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_payment_proof(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_payment_proof(TEXT, TEXT, TEXT, TEXT) TO service_role;
