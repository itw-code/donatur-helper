-- ==============================================================================
-- Donatur Helper - PIC Batch Payment Verification Mutation RPC Migration
-- Migration File: 20260818210000_verify_all_donor_payments.sql
-- Description: Creates verify_all_donor_payments mutation RPC function for PICs
--              to batch-verify all pending donor payment proofs for a finalized
--              campaign, replacing legacy Google Apps Script picVerifyAllPayments.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: verify_all_donor_payments
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_all_donor_payments(
    p_token TEXT,
    p_campaign_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_campaign_id TEXT;
    v_auth RECORD;
    v_campaign RECORD;
    v_count INTEGER;
BEGIN
    -- 1. Input sanitization
    v_clean_campaign_id := NULLIF(TRIM(p_campaign_id), '');
    IF v_clean_campaign_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Campaign tidak valid.'
        );
    END IF;

    -- 2. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE'
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid.'
        );
    END IF;

    -- 3. Token role validation: Must be 'PIC'
    IF v_auth.role <> 'PIC' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token ini bukan token PIC.'
        );
    END IF;

    -- 4. Token & Campaign validation: Token linked_campaign_id must match p_campaign_id
    IF v_auth.linked_campaign_id IS NULL OR v_auth.linked_campaign_id <> v_clean_campaign_id THEN
        RETURN jsonb_build_object(
            'error', 'token_campaign_mismatch',
            'message', 'Token PIC tidak memiliki akses ke campaign ini.'
        );
    END IF;

    -- 5. Campaign locking and validation
    -- Advisory lock for concurrency protection
    PERFORM pg_advisory_xact_lock(hashtext('verify_all_donor_payments:' || v_clean_campaign_id));

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
            'message', 'Pembayaran hanya bisa diverifikasi massal setelah campaign difinalisasi.'
        );
    END IF;

    -- 6. Batch update: Update donors with paid proof awaiting verification
    UPDATE donors
    SET
        verified = TRUE,
        modified_by = COALESCE(NULLIF(TRIM(v_auth.alias), ''), 'PIC'),
        modified_at = NOW()
    WHERE campaign_id = v_campaign.campaign_id
      AND paid = TRUE
      AND verified = FALSE
      AND (proof_storage_path IS NOT NULL OR proof_link IS NOT NULL);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- 7. Audit logging
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NULL,
        'pic:' || COALESCE(NULLIF(TRIM(v_auth.alias), ''), 'PIC'),
        'verify_all_donor_payments',
        'campaign',
        v_campaign.campaign_id,
        jsonb_build_object(
            'batch_verified_count', v_count
        )
    );

    -- 8. Success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'verify_all_donor_payments',
        'message', 'Berhasil memverifikasi ' || v_count || ' bukti pembayaran.',
        'campaign_id', v_campaign.campaign_id,
        'verified_count', v_count
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION verify_all_donor_payments(TEXT, TEXT) IS 'PIC batch payment verification mutation RPC replacing legacy picVerifyAllPayments. Validates PIC token and campaign status (FINALIZED), batch marks all unverified paid donors with proof as verified, logs audit entry, and returns verified count.';

GRANT EXECUTE ON FUNCTION verify_all_donor_payments(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION verify_all_donor_payments(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_all_donor_payments(TEXT, TEXT) TO service_role;
