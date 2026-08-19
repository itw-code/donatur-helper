-- ==============================================================================
-- Donatur Helper - Delete Campaign PIC Mutation RPC Function Migration
-- Migration File: 20260818230000_delete_campaign_pic.sql
-- Description: Creates delete_campaign_pic mutation RPC function for PICs to
--              permanently delete a campaign and its associated records (Danger Zone),
--              replacing legacy Google Apps Script deleteCampaign action.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: delete_campaign_pic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_campaign_pic(
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
    v_campaign_id TEXT;
    v_target_name TEXT;
    v_previous_status TEXT;
    v_deleted_donors_count INTEGER := 0;
BEGIN
    -- 1. Input check and token verification
    IF p_token IS NULL OR TRIM(p_token) = '' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid.'
        );
    END IF;

    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    -- 2. Token existence, status, and expiration check
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
    PERFORM pg_advisory_xact_lock(hashtext('delete_campaign_pic:' || v_auth.linked_campaign_id));

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

    -- 6. Status handling (CRITICAL SAFETY CHECK)
    IF v_campaign.status = 'FINALIZED' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_finalized',
            'message', 'Campaign yang sudah difinalisasi tidak dapat dihapus oleh PIC karena mengandung catatan keuangan.'
        );
    END IF;

    IF v_campaign.status = 'ARCHIVED' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_archived',
            'message', 'Campaign yang sudah diarsipkan tidak dapat dihapus.'
        );
    END IF;

    IF v_campaign.status NOT IN ('OPEN', 'CLOSED') THEN
        RETURN jsonb_build_object(
            'error', 'invalid_status',
            'message', 'Campaign tidak dapat dihapus dalam status saat ini.'
        );
    END IF;

    -- 7. Capture campaign details and donor count before deletion
    v_campaign_id := v_campaign.campaign_id;
    v_target_name := v_campaign.target_name;
    v_previous_status := v_campaign.status;

    SELECT COUNT(*)::INTEGER INTO v_deleted_donors_count
    FROM donors
    WHERE campaign_id = v_campaign_id;

    -- 8. Campaign deletion (cascades to donors and late_requests)
    DELETE FROM campaigns
    WHERE campaign_id = v_campaign_id;

    -- 9. Expire auth token used for this operation
    UPDATE auth_tokens
    SET
        status = 'EXPIRED',
        expires_at = NOW(),
        revoked_at = NOW()
    WHERE id = v_auth.token_id;

    -- 10. Record audit log
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
        'delete_campaign_pic',
        'campaign',
        v_campaign_id,
        jsonb_build_object(
            'campaign_id', v_campaign_id,
            'target_name', v_target_name,
            'previous_status', v_previous_status,
            'deleted_donors_count', v_deleted_donors_count
        )
    );

    -- 11. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'delete_campaign_pic',
        'message', 'Campaign dan seluruh data pendaftarannya berhasil dihapus permanen.',
        'deleted_campaign_id', v_campaign_id
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION delete_campaign_pic(TEXT) IS 'Destructive PIC campaign deletion mutation RPC replacing legacy deleteCampaign. Restricted to OPEN or CLOSED campaigns. Permanently deletes campaign, pledges, and late requests, expires the PIC token, and records audit trail.';

GRANT EXECUTE ON FUNCTION delete_campaign_pic(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION delete_campaign_pic(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_campaign_pic(TEXT) TO service_role;
