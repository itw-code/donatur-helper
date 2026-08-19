-- ==============================================================================
-- Donatur Helper - Withdraw Campaign Mutation RPC Function Migration
-- Migration File: 20260818130000_withdraw_campaign.sql
-- Description: Creates withdraw_campaign mutation RPC function for donors to
--              withdraw from an open donation campaign, replacing legacy Google
--              Apps Script withdrawCampaign action. Handles phone number
--              normalization, campaign/donor validations, payment record checks,
--              idempotent handling, withdrawal state update, and audit logging.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: withdraw_campaign
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION withdraw_campaign(
    p_campaign_id TEXT,
    p_whatsapp TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_campaign_id TEXT;
    v_normalized_whatsapp TEXT;
    v_campaign RECORD;
    v_donor RECORD;
    v_updated_donor RECORD;
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

    -- 4. Validate and lock campaign row
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

    IF v_campaign.status <> 'OPEN' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_not_open',
            'message', 'Campaign ini sudah ditutup atau diselesaikan, sehingga pengunduran diri tidak bisa dilakukan.'
        );
    END IF;

    -- 5. Validate and lock donor record
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

    -- 6. Idempotent check: already withdrawn
    IF v_donor.donor_status = 'WITHDRAWN' THEN
        -- Insert audit log for idempotent call
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
            'withdraw_campaign',
            'donor',
            v_campaign.campaign_id || ':' || v_normalized_whatsapp,
            jsonb_build_object(
                'campaign_id', v_campaign.campaign_id,
                'previous_donor_status', v_donor.donor_status,
                'already_withdrawn', TRUE
            )
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'action', 'withdraw_campaign',
            'already_withdrawn', TRUE,
            'message', 'Anda sudah mengundurkan diri dari campaign ini sebelumnya.',
            'campaign_id', v_campaign.campaign_id,
            'donor', jsonb_build_object(
                'id', v_donor.id,
                'campaign_id', v_donor.campaign_id,
                'donor_status', v_donor.donor_status,
                'amount_due', v_donor.amount_due,
                'custom_amount', v_donor.custom_amount,
                'paid', v_donor.paid,
                'verified', v_donor.verified,
                'joined_at', to_char(v_donor.joined_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
        );
    END IF;

    -- 7. Validate donor status is not CANCELLED
    IF v_donor.donor_status = 'CANCELLED' THEN
        RETURN jsonb_build_object(
            'error', 'donor_inactive',
            'message', 'Keikutsertaan Anda di campaign ini sudah dibatalkan.'
        );
    END IF;

    -- 8. Validate payment has not been recorded
    IF v_donor.paid IS TRUE OR COALESCE(v_donor.amount_paid, 0) > 0 THEN
        RETURN jsonb_build_object(
            'error', 'payment_recorded',
            'message', 'Pembayaran Anda sudah tercatat. Silakan hubungi admin untuk bantuan lebih lanjut.'
        );
    END IF;

    -- 9. Withdrawal update (do not delete row, do not reset amount_due, custom_amount, alias, or joined_at)
    UPDATE donors
    SET
        donor_status = 'WITHDRAWN',
        modified_by = 'donor-self-withdrawal',
        modified_at = NOW()
    WHERE id = v_donor.id
    RETURNING * INTO v_updated_donor;

    -- 10. Audit logging
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
        'withdraw_campaign',
        'donor',
        v_campaign.campaign_id || ':' || v_normalized_whatsapp,
        jsonb_build_object(
            'campaign_id', v_campaign.campaign_id,
            'previous_donor_status', v_donor.donor_status,
            'already_withdrawn', FALSE
        )
    );

    -- 11. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'withdraw_campaign',
        'message', 'Anda telah mengundurkan diri dari campaign ini.',
        'campaign_id', v_campaign.campaign_id,
        'donor', jsonb_build_object(
            'id', v_updated_donor.id,
            'campaign_id', v_updated_donor.campaign_id,
            'donor_status', v_updated_donor.donor_status,
            'amount_due', v_updated_donor.amount_due,
            'custom_amount', v_updated_donor.custom_amount,
            'paid', v_updated_donor.paid,
            'verified', v_updated_donor.verified,
            'joined_at', to_char(v_updated_donor.joined_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION withdraw_campaign(TEXT, TEXT) IS 'Donor campaign withdrawal mutation RPC replacing legacy withdrawCampaign. Validates open campaign status, donor existence, payment record state, sets donor_status to WITHDRAWN with audit logging, and returns sanitized donor state.';

GRANT EXECUTE ON FUNCTION withdraw_campaign(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION withdraw_campaign(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION withdraw_campaign(TEXT, TEXT) TO service_role;
