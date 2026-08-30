-- ==============================================================================
-- Donatur Helper - PIC Manual Verify Donor Mutation RPC Migration
-- Migration File: 20260830133000_pic_manual_verify_donor.sql
-- Description: Creates pic_manual_verify_donor mutation RPC function for PICs
--              (or Admins) to manually verify a donor's payment received directly
--              via WhatsApp chat, cash, or offline transfer, with optional proof upload.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: pic_manual_verify_donor
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pic_manual_verify_donor(
    p_token TEXT,
    p_campaign_id TEXT,
    p_whatsapp TEXT,
    p_amount_paid NUMERIC DEFAULT NULL,
    p_storage_path TEXT DEFAULT NULL,
    p_note TEXT DEFAULT NULL
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
    v_clean_note TEXT;
    v_auth RECORD;
    v_campaign RECORD;
    v_donor RECORD;
    v_amount_to_pay NUMERIC;
    v_updated_donor RECORD;
    v_previous_paid BOOLEAN;
    v_previous_verified BOOLEAN;
    v_previous_amount_paid NUMERIC;
    v_pic_alias TEXT;
BEGIN
    -- 1. Input validation: Campaign ID
    v_clean_campaign_id := NULLIF(TRIM(p_campaign_id), '');
    IF v_clean_campaign_id IS NULL THEN
        RETURN jsonb_build_object('error', 'invalid_input', 'message', 'Campaign tidak valid.');
    END IF;

    -- 2. Input validation: WhatsApp number
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object('error', 'invalid_input', 'message', 'Nomor WhatsApp tidak valid.');
    END IF;

    -- 3. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);
    IF v_auth.token_id IS NULL OR v_auth.status <> 'ACTIVE'
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object('error', 'unauthorized', 'message', 'Token PIC tidak valid atau sudah kedaluwarsa.');
    END IF;

    -- 4. Role check: Allow PIC (with linked campaign) or ADMIN / SUPER_ADMIN
    IF v_auth.role = 'PIC' THEN
        IF v_auth.linked_campaign_id IS NULL OR v_auth.linked_campaign_id <> v_clean_campaign_id THEN
            RETURN jsonb_build_object('error', 'token_campaign_mismatch', 'message', 'Token PIC tidak memiliki akses ke campaign ini.');
        END IF;
    ELSIF v_auth.role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
        RETURN jsonb_build_object('error', 'unauthorized', 'message', 'Hanya PIC atau Admin yang dapat memverifikasi pembayaran donatur.');
    END IF;

    v_pic_alias := COALESCE(v_auth.alias, 'PIC');

    -- 5. Lock campaign row
    SELECT * INTO v_campaign FROM campaigns WHERE campaign_id = v_clean_campaign_id FOR UPDATE;
    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object('error', 'not_found', 'message', 'Campaign tidak ditemukan.');
    END IF;

    IF v_campaign.status NOT IN ('FINALIZED', 'CLOSED') THEN
        RETURN jsonb_build_object('error', 'campaign_not_finalized', 'message', 'Verifikasi manual hanya bisa dilakukan untuk campaign yang sudah difinalisasi.');
    END IF;

    -- 6. Lock donor row
    SELECT * INTO v_donor FROM donors WHERE campaign_id = v_campaign.campaign_id AND whatsapp = v_normalized_whatsapp FOR UPDATE;
    IF v_donor.id IS NULL THEN
        RETURN jsonb_build_object('error', 'not_found', 'message', 'Donatur tidak ditemukan di campaign ini.');
    END IF;

    IF v_donor.donor_status IN ('WITHDRAWN', 'CANCELLED') THEN
        RETURN jsonb_build_object('error', 'donor_inactive', 'message', 'Status donatur ini sudah dibatalkan/tidak aktif.');
    END IF;

    v_previous_paid := COALESCE(v_donor.paid, FALSE);
    v_previous_verified := COALESCE(v_donor.verified, FALSE);
    v_previous_amount_paid := COALESCE(v_donor.amount_paid, 0);

    -- 7. Determine payment amount
    IF p_amount_paid IS NOT NULL AND p_amount_paid > 0 THEN
        v_amount_to_pay := p_amount_paid;
    ELSIF v_previous_amount_paid > 0 THEN
        v_amount_to_pay := v_previous_amount_paid;
    ELSIF v_donor.amount_due IS NOT NULL AND v_donor.amount_due > 0 THEN
        v_amount_to_pay := v_donor.amount_due;
    ELSIF v_donor.custom_amount IS NOT NULL AND v_donor.custom_amount > 0 THEN
        v_amount_to_pay := v_donor.custom_amount;
    ELSE
        v_amount_to_pay := 0;
    END IF;

    v_clean_storage_path := NULLIF(TRIM(p_storage_path), '');
    v_clean_note := NULLIF(TRIM(p_note), '');

    -- 8. Update donor record to paid and verified
    UPDATE donors
    SET paid = TRUE,
        verified = TRUE,
        amount_paid = v_amount_to_pay,
        paid_at = COALESCE(paid_at, NOW()),
        proof_storage_path = COALESCE(v_clean_storage_path, proof_storage_path),
        proof_link = CASE
            WHEN v_clean_storage_path IS NOT NULL THEN v_clean_storage_path
            WHEN proof_link IS NOT NULL AND proof_link <> '' THEN proof_link
            ELSE 'MANUAL_VERIFIED_VIA_WHATSAPP'
        END,
        modified_by = v_pic_alias,
        modified_at = NOW()
    WHERE id = v_donor.id
    RETURNING * INTO v_updated_donor;

    -- 9. Audit log
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NULL,
        'pic:' || v_pic_alias,
        'pic_manual_verify_donor',
        'donor',
        v_campaign.campaign_id || ':' || v_normalized_whatsapp,
        jsonb_build_object(
            'campaign_id', v_campaign.campaign_id,
            'whatsapp', v_normalized_whatsapp,
            'amount_paid', v_amount_to_pay,
            'storage_path', v_clean_storage_path,
            'note', v_clean_note,
            'verified_by', v_pic_alias,
            'previous_paid', v_previous_paid,
            'previous_verified', v_previous_verified,
            'previous_amount_paid', v_previous_amount_paid
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'pic_manual_verify_donor',
        'message', 'Pembayaran donatur berhasil diverifikasi secara manual oleh PIC.',
        'campaign_id', v_campaign.campaign_id,
        'donor', jsonb_build_object(
            'id', v_updated_donor.id,
            'name', v_updated_donor.name,
            'whatsapp', v_updated_donor.whatsapp,
            'amount_due', v_updated_donor.amount_due,
            'amount_paid', v_updated_donor.amount_paid,
            'paid', v_updated_donor.paid,
            'verified', v_updated_donor.verified,
            'proof_storage_path', v_updated_donor.proof_storage_path,
            'proof_link', v_updated_donor.proof_link,
            'modified_by', v_updated_donor.modified_by,
            'modified_at', v_updated_donor.modified_at
        )
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION pic_manual_verify_donor(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) IS 'PIC mutation RPC to manually verify a donor payment received directly via WhatsApp or cash, with optional storage proof attachment.';

GRANT EXECUTE ON FUNCTION pic_manual_verify_donor(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION pic_manual_verify_donor(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION pic_manual_verify_donor(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
