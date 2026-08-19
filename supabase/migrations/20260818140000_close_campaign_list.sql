-- ==============================================================================
-- Donatur Helper - Close Campaign List Mutation RPC Function Migration
-- Migration File: 20260818140000_close_campaign_list.sql
-- Description: Creates close_campaign_list mutation RPC function for PICs to
--              close campaign registrations, replacing legacy Google Apps Script
--              closeCampaignList action. Validates PIC token and campaign status,
--              locks campaign, idempotently transitions status to CLOSED,
--              records audit logs, and returns sanitized campaign state.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: close_campaign_list
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_campaign_list(
    p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_campaign RECORD;
    v_updated_campaign RECORD;
BEGIN
    -- 1. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    -- 2. Token authentication and status check
    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE'
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

    -- 4. Check if token is linked to a campaign
    IF v_auth.linked_campaign_id IS NULL OR TRIM(v_auth.linked_campaign_id) = '' THEN
        RETURN jsonb_build_object(
            'error', 'token_not_linked',
            'message', 'Token PIC ini belum terhubung ke campaign.'
        );
    END IF;

    -- 5. Advisory transaction lock and campaign validation
    PERFORM pg_advisory_xact_lock(hashtext('close_campaign_list:' || v_auth.linked_campaign_id));

    SELECT * INTO v_campaign
    FROM campaigns
    WHERE campaign_id = v_auth.linked_campaign_id
    FOR UPDATE;

    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Campaign tidak ditemukan.'
        );
    END IF;

    -- 6. Status handling: Idempotent return if already CLOSED
    IF v_campaign.status = 'CLOSED' THEN
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
            'close_campaign_list',
            'campaign',
            v_campaign.campaign_id,
            jsonb_build_object(
                'campaign_id', v_campaign.campaign_id,
                'previous_status', v_campaign.status,
                'already_closed', TRUE
            )
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'action', 'close_campaign_list',
            'already_closed', TRUE,
            'message', 'Pendaftaran campaign ini sudah ditutup sebelumnya.',
            'campaign', jsonb_build_object(
                'campaign_id', v_campaign.campaign_id,
                'target_name', v_campaign.target_name,
                'status', v_campaign.status,
                'deadline', to_char(v_campaign.deadline AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'modified_at', to_char(v_campaign.modified_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
        );
    END IF;

    -- 7. Status handling: Require OPEN status to close
    IF v_campaign.status <> 'OPEN' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_not_open',
            'message', 'Campaign ini tidak sedang membuka pendaftaran.'
        );
    END IF;

    -- 8. Campaign update: Transition to CLOSED
    UPDATE campaigns
    SET
        status = 'CLOSED',
        modified_by = COALESCE(NULLIF(TRIM(v_auth.alias), ''), 'PIC'),
        modified_at = NOW()
    WHERE campaign_id = v_campaign.campaign_id
    RETURNING * INTO v_updated_campaign;

    -- 9. Audit logging
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
        'close_campaign_list',
        'campaign',
        v_updated_campaign.campaign_id,
        jsonb_build_object(
            'campaign_id', v_updated_campaign.campaign_id,
            'previous_status', v_campaign.status,
            'already_closed', FALSE
        )
    );

    -- 10. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'close_campaign_list',
        'message', 'Pendaftaran campaign berhasil ditutup.',
        'campaign', jsonb_build_object(
            'campaign_id', v_updated_campaign.campaign_id,
            'target_name', v_updated_campaign.target_name,
            'status', v_updated_campaign.status,
            'deadline', to_char(v_updated_campaign.deadline AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'modified_at', to_char(v_updated_campaign.modified_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION close_campaign_list(TEXT) IS 'PIC campaign registration closing mutation RPC replacing legacy closeCampaignList. Validates PIC token and campaign status, idempotently transitions status to CLOSED, records audit trail, and returns sanitized campaign state.';

GRANT EXECUTE ON FUNCTION close_campaign_list(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION close_campaign_list(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION close_campaign_list(TEXT) TO service_role;
