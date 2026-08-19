-- ==============================================================================
-- Donatur Helper - Create Campaign for PIC Mutation RPC Migration
-- Migration File: 20260818090000_create_campaign_for_pic.sql
-- Description: Creates create_campaign_for_pic mutation RPC function for PICs
--              holding unlinked draft tokens to create a new donation campaign,
--              set target, deadline, reason, gift amount, link the PIC token,
--              and record an audit log.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: create_campaign_for_pic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_campaign_for_pic(
    p_token TEXT,
    p_target_name TEXT,
    p_deadline TIMESTAMPTZ,
    p_reason TEXT DEFAULT NULL,
    p_gift_amount NUMERIC DEFAULT 0,
    p_start_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_locked_token RECORD;
    v_updated_token RECORD;
    v_campaign RECORD;
    v_clean_target_name TEXT;
    v_clean_reason TEXT;
    v_gift_amount NUMERIC;
    v_new_campaign_id TEXT;
    v_id_exists BOOLEAN;
    v_attempt INTEGER;
BEGIN
    -- 1. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    -- 2. Token authentication and status check
    IF v_auth.token_id IS NULL 
       OR v_auth.status NOT IN ('ACTIVE', 'UNUSED')
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid.'
        );
    END IF;

    -- 3. Token role check
    IF v_auth.role <> 'PIC' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token ini bukan token PIC.'
        );
    END IF;

    -- 4. Check if token is already linked to a campaign
    IF v_auth.linked_campaign_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'error', 'token_already_linked',
            'message', 'Token PIC ini sudah terhubung ke campaign lain.'
        );
    END IF;

    -- 5. Input validation
    v_clean_target_name := NULLIF(TRIM(p_target_name), '');
    IF v_clean_target_name IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nama target campaign tidak boleh kosong.'
        );
    END IF;

    IF p_deadline IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Tanggal deadline campaign tidak boleh kosong.'
        );
    END IF;

    IF p_deadline < NOW() THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Tanggal deadline harus di masa depan.'
        );
    END IF;

    IF p_gift_amount IS NOT NULL AND p_gift_amount < 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nominal hadiah tidak boleh negatif.'
        );
    END IF;

    v_clean_reason := NULLIF(TRIM(p_reason), '');
    v_gift_amount := COALESCE(p_gift_amount, 0);

    -- 6. Lock the auth_tokens row for the PIC token to prevent concurrent double-creation
    SELECT * INTO v_locked_token
    FROM auth_tokens
    WHERE id = v_auth.token_id
    FOR UPDATE;

    IF v_locked_token.id IS NULL OR v_locked_token.status NOT IN ('ACTIVE', 'UNUSED') THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid.'
        );
    END IF;

    IF v_locked_token.role <> 'PIC' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token ini bukan token PIC.'
        );
    END IF;

    IF v_locked_token.linked_campaign_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'error', 'token_already_linked',
            'message', 'Token PIC ini sudah terhubung ke campaign lain.'
        );
    END IF;

    -- 7. Generate a unique campaign_id in format C-XXXXXXXX (uppercase 8-char hex, max 5 attempts)
    FOR v_attempt IN 1..5 LOOP
        v_new_campaign_id := 'C-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));
        
        SELECT EXISTS (
            SELECT 1 FROM campaigns WHERE campaign_id = v_new_campaign_id
        ) INTO v_id_exists;

        IF NOT v_id_exists THEN
            EXIT;
        END IF;

        IF v_attempt = 5 THEN
            RETURN jsonb_build_object(
                'error', 'id_generation_failed',
                'message', 'Gagal menghasilkan Campaign ID yang unik. Silakan coba lagi.'
            );
        END IF;
    END LOOP;

    -- 8. Insert new campaign record
    INSERT INTO campaigns (
        campaign_id,
        target_name,
        reason,
        gift_amount,
        status,
        start_date,
        deadline,
        rounding_used,
        round_to,
        created_at
    ) VALUES (
        v_new_campaign_id,
        v_clean_target_name,
        v_clean_reason,
        v_gift_amount,
        'OPEN',
        p_start_date,
        p_deadline,
        FALSE,
        500,
        NOW()
    )
    RETURNING * INTO v_campaign;

    -- 9. Link the campaign to the PIC token and update status to ACTIVE
    UPDATE auth_tokens
    SET
        linked_campaign_id = v_campaign.campaign_id,
        status = 'ACTIVE',
        last_used_at = NOW()
    WHERE id = v_locked_token.id
    RETURNING * INTO v_updated_token;

    -- 10. Audit logging
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NULL,
        'pic:' || COALESCE(v_updated_token.alias, ''),
        'create_campaign_for_pic',
        'campaign',
        v_campaign.campaign_id,
        jsonb_build_object(
            'campaign_id', v_campaign.campaign_id,
            'target_name', v_campaign.target_name,
            'deadline', to_char(v_campaign.deadline AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'gift_amount', v_campaign.gift_amount,
            'token_role', v_locked_token.role
        )
    );

    -- 11. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'create_campaign_for_pic',
        'message', 'Campaign berhasil dibuat.',
        'campaign', jsonb_build_object(
            'campaign_id', v_campaign.campaign_id,
            'target_name', v_campaign.target_name,
            'reason', v_campaign.reason,
            'gift_amount', v_campaign.gift_amount,
            'status', v_campaign.status,
            'deadline', to_char(v_campaign.deadline AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'start_date', to_char(v_campaign.start_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'created_at', to_char(v_campaign.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ),
        'token', jsonb_build_object(
            'alias', v_updated_token.alias,
            'status', v_updated_token.status,
            'linked_campaign_id', v_updated_token.linked_campaign_id
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION create_campaign_for_pic(TEXT, TEXT, TIMESTAMPTZ, TEXT, NUMERIC, TIMESTAMPTZ) IS 'PIC campaign creation mutation RPC replacing legacy createCampaign. Allows a PIC holding an unlinked token to initialize a new campaign, set targets, link token, and create audit trail.';

GRANT EXECUTE ON FUNCTION create_campaign_for_pic(TEXT, TEXT, TIMESTAMPTZ, TEXT, NUMERIC, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION create_campaign_for_pic(TEXT, TEXT, TIMESTAMPTZ, TEXT, NUMERIC, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION create_campaign_for_pic(TEXT, TEXT, TIMESTAMPTZ, TEXT, NUMERIC, TIMESTAMPTZ) TO service_role;
