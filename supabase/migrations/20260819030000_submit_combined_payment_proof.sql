-- ==============================================================================
-- Donatur Helper - Submit Combined Payment Proof Mutation RPC Migration
-- Migration File: 20260819030000_submit_combined_payment_proof.sql
-- Description: Creates submit_combined_payment_proof mutation RPC function for donors
--              to submit a single combined payment proof for multiple finalized
--              campaigns sharing identical bank details.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: submit_combined_payment_proof
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_combined_payment_proof(
    p_campaign_ids TEXT[],
    p_whatsapp TEXT,
    p_proof_storage_path TEXT,
    p_proof_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_normalized_whatsapp TEXT;
    v_clean_storage_path TEXT;
    v_clean_proof_url TEXT;
    v_cid TEXT;
    v_campaign RECORD;
    v_first_bank_name TEXT;
    v_first_bank_account TEXT;
    v_first_account_holder TEXT;
    v_donor RECORD;
    v_updated_campaigns TEXT[] := ARRAY[]::TEXT[];
    v_total_amount_paid NUMERIC := 0;
    v_actor_member_id UUID;
BEGIN
    -- 1. Normalize WhatsApp number
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid.'
        );
    END IF;

    -- 2. Validate Campaign IDs
    IF p_campaign_ids IS NULL OR cardinality(p_campaign_ids) = 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Daftar campaign tidak boleh kosong.'
        );
    END IF;

    -- 3. Validate Proof Storage Path
    v_clean_storage_path := NULLIF(TRIM(p_proof_storage_path), '');
    IF v_clean_storage_path IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Bukti pembayaran tidak ditemukan. Silakan unggah bukti transfer.'
        );
    END IF;

    v_clean_proof_url := NULLIF(TRIM(p_proof_url), '');

    -- 4. Pre-validate all campaigns: must be FINALIZED and share identical bank details
    FOREACH v_cid IN ARRAY p_campaign_ids
    LOOP
        v_cid := TRIM(v_cid);
        IF v_cid IS NULL OR v_cid = '' THEN
            CONTINUE;
        END IF;

        SELECT * INTO v_campaign
        FROM campaigns
        WHERE campaign_id = v_cid
        FOR UPDATE;

        IF v_campaign.id IS NULL THEN
            RETURN jsonb_build_object(
                'error', 'not_found',
                'message', 'Campaign ' || v_cid || ' tidak ditemukan.'
            );
        END IF;

        IF v_campaign.status <> 'FINALIZED' THEN
            RETURN jsonb_build_object(
                'error', 'campaign_not_finalized',
                'message', 'Campaign ' || v_cid || ' belum difinalisasi.'
            );
        END IF;

        -- Check identical bank details
        IF v_first_bank_account IS NULL THEN
            v_first_bank_name := v_campaign.bank_name;
            v_first_bank_account := v_campaign.bank_account;
            v_first_account_holder := v_campaign.account_holder;
        ELSE
            IF COALESCE(v_campaign.bank_account, '') <> COALESCE(v_first_bank_account, '') OR
               COALESCE(v_campaign.bank_name, '') <> COALESCE(v_first_bank_name, '') THEN
                RETURN jsonb_build_object(
                    'error', 'bank_mismatch',
                    'message', 'Campaign yang dipilih memiliki rekening tujuan transfer yang berbeda.'
                );
            END IF;
        END IF;

        -- Check donor record
        SELECT * INTO v_donor
        FROM donors
        WHERE campaign_id = v_cid
          AND whatsapp = v_normalized_whatsapp
        FOR UPDATE;

        IF v_donor.id IS NULL THEN
            RETURN jsonb_build_object(
                'error', 'donor_not_found',
                'message', 'Anda tidak terdaftar di campaign ' || v_cid || '.'
            );
        END IF;

        IF v_donor.donor_status IN ('WITHDRAWN', 'CANCELLED') THEN
            RETURN jsonb_build_object(
                'error', 'donor_inactive',
                'message', 'Status keikutsertaan di campaign ' || v_cid || ' sudah tidak aktif.'
            );
        END IF;

        IF v_donor.paid IS TRUE AND v_donor.verified IS TRUE THEN
            RETURN jsonb_build_object(
                'error', 'already_verified',
                'message', 'Pembayaran untuk campaign ' || v_cid || ' sudah diverifikasi.'
            );
        END IF;

        IF v_actor_member_id IS NULL AND v_donor.member_id IS NOT NULL THEN
            v_actor_member_id := v_donor.member_id;
        END IF;
    END LOOP;

    -- 5. Update all donors
    FOREACH v_cid IN ARRAY p_campaign_ids
    LOOP
        v_cid := TRIM(v_cid);
        IF v_cid IS NULL OR v_cid = '' THEN
            CONTINUE;
        END IF;

        UPDATE donors
        SET
            proof_storage_path = v_clean_storage_path,
            proof_link = COALESCE(v_clean_proof_url, proof_link),
            paid = TRUE,
            paid_at = NOW(),
            amount_paid = amount_due,
            verified = FALSE,
            modified_at = NOW()
        WHERE campaign_id = v_cid
          AND whatsapp = v_normalized_whatsapp
        RETURNING amount_due INTO v_donor.amount_due;

        v_total_amount_paid := v_total_amount_paid + COALESCE(v_donor.amount_due, 0);
        v_updated_campaigns := array_append(v_updated_campaigns, v_cid);
    END LOOP;

    -- 6. Insert audit log
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_actor_member_id,
        'donor:' || v_normalized_whatsapp,
        'submit_combined_payment_proof',
        'donor',
        v_normalized_whatsapp,
        jsonb_build_object(
            'whatsapp', v_normalized_whatsapp,
            'campaign_ids', v_updated_campaigns,
            'storage_path', v_clean_storage_path,
            'total_amount_paid', v_total_amount_paid
        )
    );

    -- 7. Return success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'submit_combined_payment_proof',
        'message', 'Bukti transfer gabungan berhasil dikirim untuk ' || cardinality(v_updated_campaigns)::TEXT || ' campaign.',
        'updated_campaigns', v_updated_campaigns,
        'total_amount_paid', v_total_amount_paid,
        'proof_storage_path', v_clean_storage_path
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION submit_combined_payment_proof(TEXT[], TEXT, TEXT, TEXT) IS 'Submits a single combined payment proof for multiple finalized campaigns sharing identical bank details.';

GRANT EXECUTE ON FUNCTION submit_combined_payment_proof(TEXT[], TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_combined_payment_proof(TEXT[], TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_combined_payment_proof(TEXT[], TEXT, TEXT, TEXT) TO service_role;
