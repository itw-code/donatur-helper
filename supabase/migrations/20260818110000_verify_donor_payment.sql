-- ==============================================================================
-- Donatur Helper - PIC Payment Verification Mutation RPC Migration
-- Migration File: 20260818110000_verify_donor_payment.sql
-- Description: Creates verify_donor_payment mutation RPC function for PICs to
--              verify (approve) or reject donor payment proofs, manage payment
--              settlement state, record audit trails, and return sanitized donor state.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: verify_donor_payment
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_donor_payment(
    p_token TEXT,
    p_campaign_id TEXT,
    p_whatsapp TEXT,
    p_is_valid BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_campaign_id TEXT;
    v_normalized_whatsapp TEXT;
    v_auth RECORD;
    v_campaign RECORD;
    v_donor RECORD;
    v_updated_donor RECORD;
    v_previous_paid BOOLEAN;
    v_previous_verified BOOLEAN;
BEGIN
    -- 1. Input validation: Campaign ID
    v_clean_campaign_id := NULLIF(TRIM(p_campaign_id), '');
    IF v_clean_campaign_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Campaign tidak valid.'
        );
    END IF;

    -- 2. Input validation: WhatsApp number normalization
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid.'
        );
    END IF;

    -- 3. Input validation: Verification status
    IF p_is_valid IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Status verifikasi tidak valid.'
        );
    END IF;

    -- 4. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE'
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid.'
        );
    END IF;

    -- 5. Token role check
    IF v_auth.role <> 'PIC' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token ini bukan token PIC.'
        );
    END IF;

    -- 6. Token campaign scope validation
    IF v_auth.linked_campaign_id IS NULL OR v_auth.linked_campaign_id <> v_clean_campaign_id THEN
        RETURN jsonb_build_object(
            'error', 'token_campaign_mismatch',
            'message', 'Token PIC tidak memiliki akses ke campaign ini.'
        );
    END IF;

    -- 7. Campaign validation: Lock campaign row
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

    -- 8. Donor validation: Lock donor row
    SELECT * INTO v_donor
    FROM donors
    WHERE campaign_id = v_campaign.campaign_id
      AND whatsapp = v_normalized_whatsapp
    FOR UPDATE;

    IF v_donor.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Donatur tidak ditemukan di campaign ini.'
        );
    END IF;

    IF v_donor.donor_status IN ('WITHDRAWN', 'CANCELLED') THEN
        RETURN jsonb_build_object(
            'error', 'donor_inactive',
            'message', 'Status keikutsertaan donatur ini sudah tidak aktif.'
        );
    END IF;

    -- Capture previous states for audit trail
    v_previous_paid := COALESCE(v_donor.paid, FALSE);
    v_previous_verified := COALESCE(v_donor.verified, FALSE);

    -- 9. Verification flow: Approval vs Rejection
    IF p_is_valid IS TRUE THEN
        -- Approval precondition: Donor must have submitted payment proof
        IF v_donor.paid IS FALSE THEN
            RETURN jsonb_build_object(
                'error', 'donor_not_paid',
                'message', 'Donatur belum mengirim bukti pembayaran.'
            );
        END IF;

        IF v_donor.proof_link IS NULL AND v_donor.proof_storage_path IS NULL THEN
            RETURN jsonb_build_object(
                'error', 'proof_missing',
                'message', 'Bukti pembayaran tidak ditemukan.'
            );
        END IF;

        -- Idempotent check: Already verified
        IF v_donor.verified IS TRUE THEN
            INSERT INTO audit_logs (
                actor_member_id,
                actor_description,
                action,
                entity_type,
                entity_id,
                metadata
            ) VALUES (
                NULL,
                'pic:' || COALESCE(v_auth.alias, 'PIC'),
                'verify_donor_payment',
                'donor',
                v_campaign.campaign_id || ':' || v_normalized_whatsapp,
                jsonb_build_object(
                    'campaign_id', v_campaign.campaign_id,
                    'is_valid', p_is_valid,
                    'previous_paid', v_previous_paid,
                    'previous_verified', v_previous_verified,
                    'already_verified', TRUE
                )
            );

            RETURN jsonb_build_object(
                'success', TRUE,
                'action', 'verify_donor_payment',
                'already_verified', TRUE,
                'message', 'Pembayaran donatur ini sudah diverifikasi sebelumnya.',
                'campaign_id', v_campaign.campaign_id,
                'donor', jsonb_build_object(
                    'id', v_donor.id,
                    'name', v_donor.name,
                    'whatsapp', v_donor.whatsapp,
                    'donor_status', v_donor.donor_status,
                    'amount_due', v_donor.amount_due,
                    'amount_paid', v_donor.amount_paid,
                    'paid', v_donor.paid,
                    'verified', v_donor.verified,
                    'refunded', v_donor.refunded,
                    'paid_at', to_char(v_donor.paid_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                    'proof_link', v_donor.proof_link,
                    'proof_storage_path', v_donor.proof_storage_path
                )
            );
        END IF;

        -- Apply approval update
        UPDATE donors
        SET
            verified = TRUE,
            modified_by = COALESCE(v_auth.alias, 'PIC'),
            modified_at = NOW()
        WHERE id = v_donor.id
        RETURNING * INTO v_updated_donor;

        -- Audit logging: Approval
        INSERT INTO audit_logs (
            actor_member_id,
            actor_description,
            action,
            entity_type,
            entity_id,
            metadata
        ) VALUES (
            NULL,
            'pic:' || COALESCE(v_auth.alias, 'PIC'),
            'verify_donor_payment',
            'donor',
            v_campaign.campaign_id || ':' || v_normalized_whatsapp,
            jsonb_build_object(
                'campaign_id', v_campaign.campaign_id,
                'is_valid', p_is_valid,
                'previous_paid', v_previous_paid,
                'previous_verified', v_previous_verified,
                'already_verified', FALSE
            )
        );

        -- Success response: Approval
        RETURN jsonb_build_object(
            'success', TRUE,
            'action', 'verify_donor_payment',
            'message', 'Pembayaran donatur berhasil diverifikasi.',
            'campaign_id', v_campaign.campaign_id,
            'donor', jsonb_build_object(
                'id', v_updated_donor.id,
                'name', v_updated_donor.name,
                'whatsapp', v_updated_donor.whatsapp,
                'donor_status', v_updated_donor.donor_status,
                'amount_due', v_updated_donor.amount_due,
                'amount_paid', v_updated_donor.amount_paid,
                'paid', v_updated_donor.paid,
                'verified', v_updated_donor.verified,
                'refunded', v_updated_donor.refunded,
                'paid_at', to_char(v_updated_donor.paid_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'proof_link', v_updated_donor.proof_link,
                'proof_storage_path', v_updated_donor.proof_storage_path
            )
        );
    ELSE
        -- Apply rejection update: Reset payment state so donor can re-upload
        UPDATE donors
        SET
            paid = FALSE,
            verified = FALSE,
            amount_paid = 0,
            paid_at = NULL,
            proof_link = NULL,
            proof_storage_path = NULL,
            modified_by = COALESCE(v_auth.alias, 'PIC'),
            modified_at = NOW()
        WHERE id = v_donor.id
        RETURNING * INTO v_updated_donor;

        -- Audit logging: Rejection
        INSERT INTO audit_logs (
            actor_member_id,
            actor_description,
            action,
            entity_type,
            entity_id,
            metadata
        ) VALUES (
            NULL,
            'pic:' || COALESCE(v_auth.alias, 'PIC'),
            'verify_donor_payment',
            'donor',
            v_campaign.campaign_id || ':' || v_normalized_whatsapp,
            jsonb_build_object(
                'campaign_id', v_campaign.campaign_id,
                'is_valid', p_is_valid,
                'previous_paid', v_previous_paid,
                'previous_verified', v_previous_verified,
                'already_verified', FALSE
            )
        );

        -- Success response: Rejection
        RETURN jsonb_build_object(
            'success', TRUE,
            'action', 'verify_donor_payment',
            'message', 'Bukti pembayaran ditolak. Donatur dapat mengunggah bukti baru.',
            'campaign_id', v_campaign.campaign_id,
            'donor', jsonb_build_object(
                'id', v_updated_donor.id,
                'name', v_updated_donor.name,
                'whatsapp', v_updated_donor.whatsapp,
                'donor_status', v_updated_donor.donor_status,
                'amount_due', v_updated_donor.amount_due,
                'amount_paid', 0,
                'paid', FALSE,
                'verified', FALSE,
                'refunded', v_updated_donor.refunded,
                'paid_at', NULL,
                'proof_link', NULL,
                'proof_storage_path', NULL
            )
        );
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION verify_donor_payment(TEXT, TEXT, TEXT, BOOLEAN) IS 'PIC payment verification and rejection mutation RPC replacing legacy picVerifyPayment. Validates PIC token and campaign scope, approves or rejects payment proof, updates donor verification state, records audit log, and returns sanitized donor state.';

GRANT EXECUTE ON FUNCTION verify_donor_payment(TEXT, TEXT, TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION verify_donor_payment(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_donor_payment(TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
