-- ==============================================================================
-- Donatur Helper - Archive Campaign PIC Mutation RPC Function Migration
-- Migration File: 20260818220000_archive_campaign_pic.sql
-- Description: Creates archive_campaign_pic mutation RPC function for PICs to
--              archive a finalized campaign and expire all linked PIC tokens,
--              replacing legacy Google Apps Script archiveCampaign action.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: archive_campaign_pic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION archive_campaign_pic(
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
    v_expired_count INTEGER := 0;
BEGIN
    -- 1. Input check and token verification
    IF p_token IS NULL OR TRIM(p_token) = '' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid.'
        );
    END IF;

    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    -- 2. Token existence check
    IF v_auth.token_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid.'
        );
    END IF;

    -- 3. Token revoked check
    IF v_auth.status = 'REVOKED' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC ini sudah dicabut.'
        );
    END IF;

    -- 4. Token role check
    IF v_auth.role <> 'PIC' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token ini bukan token PIC.'
        );
    END IF;

    -- 5. Check if token is linked to a campaign
    IF v_auth.linked_campaign_id IS NULL OR TRIM(v_auth.linked_campaign_id) = '' THEN
        RETURN jsonb_build_object(
            'error', 'token_not_linked',
            'message', 'Token PIC ini belum terhubung ke campaign.'
        );
    END IF;

    -- 6. Advisory transaction lock and campaign validation
    PERFORM pg_advisory_xact_lock(hashtext('archive_campaign_pic:' || v_auth.linked_campaign_id));

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

    -- 7. Status handling: Idempotent return if already ARCHIVED
    IF v_campaign.status = 'ARCHIVED' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'action', 'archive_campaign_pic',
            'already_archived', TRUE,
            'message', 'Campaign ini sudah diarsipkan sebelumnya.',
            'campaign', jsonb_build_object(
                'campaign_id', v_campaign.campaign_id,
                'target_name', v_campaign.target_name,
                'status', v_campaign.status,
                'finalized_at', to_char(v_campaign.finalized_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'modified_at', to_char(v_campaign.modified_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
        );
    END IF;

    -- 8. Token status and expiration check for non-archived campaigns
    IF v_auth.status <> 'ACTIVE'
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid.'
        );
    END IF;

    -- 9. Status handling: Disallow archiving if not FINALIZED
    IF v_campaign.status <> 'FINALIZED' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_not_finalized',
            'message', 'Hanya campaign yang sudah difinalisasi yang dapat diarsipkan.'
        );
    END IF;

    -- 10. Campaign update: Transition status to ARCHIVED
    UPDATE campaigns
    SET
        status = 'ARCHIVED',
        modified_by = COALESCE(NULLIF(TRIM(v_auth.alias), ''), 'PIC'),
        modified_at = NOW()
    WHERE campaign_id = v_campaign.campaign_id
    RETURNING * INTO v_updated_campaign;

    -- 11. Expire all PIC tokens linked to this campaign that are still ACTIVE or UNUSED
    UPDATE auth_tokens
    SET
        status = 'EXPIRED',
        expires_at = COALESCE(expires_at, NOW())
    WHERE role = 'PIC'
      AND linked_campaign_id = v_campaign.campaign_id
      AND status IN ('ACTIVE', 'UNUSED');

    GET DIAGNOSTICS v_expired_count = ROW_COUNT;

    -- 12. Record audit log
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
        'archive_campaign_pic',
        'campaign',
        v_updated_campaign.campaign_id,
        jsonb_build_object(
            'campaign_id', v_updated_campaign.campaign_id,
            'previous_status', v_campaign.status,
            'expired_pic_tokens_count', v_expired_count
        )
    );

    -- 13. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'archive_campaign_pic',
        'message', 'Campaign berhasil diarsipkan. Token PIC untuk campaign ini tidak dapat digunakan lagi.',
        'campaign', jsonb_build_object(
            'campaign_id', v_updated_campaign.campaign_id,
            'target_name', v_updated_campaign.target_name,
            'status', v_updated_campaign.status,
            'finalized_at', to_char(v_updated_campaign.finalized_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'modified_at', to_char(v_updated_campaign.modified_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ),
        'expired_pic_tokens_count', v_expired_count
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION archive_campaign_pic(TEXT) IS 'Terminal PIC campaign archiving mutation RPC replacing legacy archiveCampaign. Validates PIC token and campaign status (FINALIZED), archives campaign, expires linked PIC tokens, logs audit trail, and returns sanitized campaign state.';

GRANT EXECUTE ON FUNCTION archive_campaign_pic(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION archive_campaign_pic(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION archive_campaign_pic(TEXT) TO service_role;
