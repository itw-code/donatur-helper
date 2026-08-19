-- ==============================================================================
-- Donatur Helper - Join Campaign Mutation RPC Function Migration
-- Migration File: 20260818070000_join_campaign.sql
-- Description: Creates join_campaign mutation RPC function for donors to join
--              or pledge to an open donation campaign, with phone number
--              normalization, input validation, member lookup, pledge upsert,
--              and audit logging.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: join_campaign
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_campaign(
    p_campaign_id TEXT,
    p_name TEXT,
    p_whatsapp TEXT,
    p_custom_amount NUMERIC DEFAULT NULL,
    p_alias TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_campaign_id TEXT;
    v_normalized_whatsapp TEXT;
    v_clean_name TEXT;
    v_clean_alias TEXT;
    v_member RECORD;
    v_member_id UUID;
    v_campaign RECORD;
    v_donor RECORD;
    v_is_update BOOLEAN;
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
    v_clean_campaign_id := TRIM(p_campaign_id);
    IF p_campaign_id IS NULL OR v_clean_campaign_id = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Campaign tidak valid.'
        );
    END IF;

    -- 4. Validate custom amount if provided
    IF p_custom_amount IS NOT NULL AND p_custom_amount <= 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nominal donasi harus lebih besar dari nol.'
        );
    END IF;

    -- 5. Prepare clean name and alias
    v_clean_name := NULLIF(TRIM(p_name), '');
    v_clean_alias := NULLIF(TRIM(p_alias), '');

    -- 6. Lookup and validate member
    SELECT * INTO v_member
    FROM members
    WHERE whatsapp = v_normalized_whatsapp;

    IF v_member.id IS NOT NULL THEN
        -- Member found: check if status is DELETED or REJECTED
        IF v_member.status IN ('DELETED', 'REJECTED') THEN
            RETURN jsonb_build_object(
                'error', 'member_not_active',
                'message', 'Akun Anda tidak aktif. Silakan hubungi admin untuk bantuan lebih lanjut.'
            );
        END IF;

        v_member_id := v_member.id;
        IF v_clean_name IS NULL THEN
            v_clean_name := v_member.name;
        END IF;
    ELSE
        -- No member record found
        v_member_id := NULL;
        IF v_clean_name IS NULL THEN
            RETURN jsonb_build_object(
                'error', 'invalid_input',
                'message', 'Nama tidak boleh kosong.'
            );
        END IF;
    END IF;

    -- 7. Validate and lock campaign row
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
            'message', 'Campaign ini tidak bisa diikuti karena sudah ditutup atau selesai.'
        );
    END IF;

    -- 8. Check if pledge already exists (for audit log reactivation tracking)
    SELECT EXISTS (
        SELECT 1
        FROM donors
        WHERE campaign_id = v_campaign.campaign_id
          AND whatsapp = v_normalized_whatsapp
    ) INTO v_is_update;

    -- 9. Upsert pledge record into donors table
    INSERT INTO donors (
        campaign_id,
        member_id,
        name,
        whatsapp,
        alias,
        donor_status,
        amount_due,
        custom_amount,
        amount_paid,
        paid,
        verified,
        refunded,
        joined_at
    ) VALUES (
        v_campaign.campaign_id,
        v_member_id,
        v_clean_name,
        v_normalized_whatsapp,
        v_clean_alias,
        'PLEDGED',
        COALESCE(p_custom_amount, 0),
        p_custom_amount,
        0,
        FALSE,
        FALSE,
        FALSE,
        NOW()
    )
    ON CONFLICT (campaign_id, whatsapp) DO UPDATE
    SET
        name = EXCLUDED.name,
        alias = EXCLUDED.alias,
        custom_amount = EXCLUDED.custom_amount,
        amount_due = COALESCE(EXCLUDED.custom_amount, 0),
        donor_status = 'PLEDGED',
        member_id = COALESCE(EXCLUDED.member_id, donors.member_id),
        modified_at = NOW()
    RETURNING * INTO v_donor;

    -- 10. Audit logging
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_member_id,
        'donor',
        'join_campaign',
        'donor',
        v_campaign.campaign_id || ':' || v_normalized_whatsapp,
        jsonb_build_object(
            'campaign_id', v_campaign.campaign_id,
            'custom_amount', p_custom_amount,
            'alias', v_clean_alias,
            'reactivated', v_is_update
        )
    );

    -- 11. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'join_campaign',
        'campaign_id', v_campaign.campaign_id,
        'message', 'Anda berhasil bergabung dalam campaign ini.',
        'donor', jsonb_build_object(
            'id', v_donor.id,
            'campaign_id', v_donor.campaign_id,
            'name', v_donor.name,
            'alias', v_donor.alias,
            'donor_status', v_donor.donor_status,
            'amount_due', v_donor.amount_due,
            'custom_amount', v_donor.custom_amount,
            'paid', v_donor.paid,
            'verified', v_donor.verified,
            'refunded', v_donor.refunded,
            'joined_at', to_char(v_donor.joined_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION join_campaign(TEXT, TEXT, TEXT, NUMERIC, TEXT) IS 'Donor campaign join mutation RPC replacing legacy joinCampaign. Handles pledge insertion and reactivation with input validation, member linking, and audit logging.';

GRANT EXECUTE ON FUNCTION join_campaign(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION join_campaign(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION join_campaign(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO service_role;
