-- ==============================================================================
-- Donatur Helper - SuperAdmin Delete Campaign Mutation RPC Migration
-- Migration File: 20260819220000_superadmin_delete_campaign.sql
-- Description: Creates superadmin_delete_campaign mutation RPC function for
--              SuperAdmins to permanently delete a campaign and its associated records.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: superadmin_delete_campaign
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION superadmin_delete_campaign(
    p_token TEXT,
    p_campaign_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_clean_campaign_id TEXT;
    v_campaign RECORD;
    v_donor_count INTEGER;
BEGIN
    -- 1. Authenticate superadmin token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE'
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token SuperAdmin tidak valid.'
        );
    END IF;

    IF v_auth.role <> 'SUPER_ADMIN' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Hanya SuperAdmin yang dapat menghapus campaign secara permanen.'
        );
    END IF;

    -- 2. Validate input
    v_clean_campaign_id := NULLIF(TRIM(p_campaign_id), '');
    IF v_clean_campaign_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Campaign ID tidak valid.'
        );
    END IF;

    -- 3. Lock and validate campaign
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

    SELECT COUNT(*)::INTEGER INTO v_donor_count
    FROM donors
    WHERE campaign_id = v_clean_campaign_id;

    -- 4. Expire associated PIC tokens
    UPDATE auth_tokens
    SET
        status = 'EXPIRED',
        revoked_at = NOW()
    WHERE linked_campaign_id = v_clean_campaign_id;

    -- 5. Delete campaign (cascades to donors, late_requests)
    DELETE FROM campaigns
    WHERE campaign_id = v_clean_campaign_id;

    -- 6. Record audit log
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NULL,
        'superadmin:' || COALESCE(v_auth.alias, 'unknown'),
        'superadmin_delete_campaign',
        'campaign',
        v_clean_campaign_id,
        jsonb_build_object(
            'campaign_id', v_clean_campaign_id,
            'target_name', v_campaign.target_name,
            'status', v_campaign.status,
            'gift_amount', v_campaign.gift_amount,
            'cascaded_donors_count', v_donor_count,
            'superadmin_alias', v_auth.alias
        )
    );

    -- 7. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'superadmin_delete_campaign',
        'message', 'Campaign ' || v_campaign.target_name || ' (' || v_clean_campaign_id || ') berhasil dihapus permanen.',
        'deleted_campaign_id', v_clean_campaign_id
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION superadmin_delete_campaign(TEXT, TEXT) IS 'SuperAdmin mutation RPC to permanently delete a campaign and cascade all pledges/requests.';

GRANT EXECUTE ON FUNCTION superadmin_delete_campaign(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION superadmin_delete_campaign(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION superadmin_delete_campaign(TEXT, TEXT) TO service_role;
