-- ==============================================================================
-- Donatur Helper - Admin Set Campaign Status Mutation RPC Migration
-- Migration File: 20260819140000_admin_set_campaign_status.sql
-- Description: Creates admin_set_campaign_status mutation RPC function for Admins
--              and SuperAdmins to update the lifecycle status of a campaign.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: admin_set_campaign_status
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_set_campaign_status(
    p_token TEXT,
    p_campaign_id TEXT,
    p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_clean_campaign_id TEXT;
    v_clean_status TEXT;
    v_campaign RECORD;
    v_updated_campaign RECORD;
BEGIN
    -- 1. Authenticate admin token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE'
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token admin tidak valid.'
        );
    END IF;

    IF v_auth.role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Hanya Admin atau SuperAdmin yang dapat mengubah status campaign.'
        );
    END IF;

    -- 2. Validate inputs
    v_clean_campaign_id := NULLIF(TRIM(p_campaign_id), '');
    IF v_clean_campaign_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Campaign ID tidak valid.'
        );
    END IF;

    v_clean_status := UPPER(NULLIF(TRIM(p_new_status), ''));
    IF v_clean_status IS NULL OR v_clean_status NOT IN ('OPEN', 'CLOSED', 'FINALIZED', 'ARCHIVED') THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Status campaign tidak valid. Status yang diizinkan: OPEN, CLOSED, FINALIZED, ARCHIVED.'
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

    -- 4. If setting to ARCHIVED, expire linked PIC tokens
    IF v_clean_status = 'ARCHIVED' THEN
        UPDATE auth_tokens
        SET
            status = 'EXPIRED',
            revoked_at = NOW()
        WHERE linked_campaign_id = v_clean_campaign_id
          AND status = 'ACTIVE';
    END IF;

    -- 5. Update campaign status
    UPDATE campaigns
    SET
        status = v_clean_status,
        modified_by = COALESCE(v_auth.alias, 'Admin'),
        modified_at = NOW()
    WHERE id = v_campaign.id
    RETURNING * INTO v_updated_campaign;

    -- 6. Insert audit log
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NULL,
        'admin:' || COALESCE(v_auth.alias, 'unknown'),
        'admin_set_campaign_status',
        'campaign',
        v_clean_campaign_id,
        jsonb_build_object(
            'campaign_id', v_clean_campaign_id,
            'old_status', v_campaign.status,
            'new_status', v_clean_status,
            'admin_alias', v_auth.alias
        )
    );

    -- 7. Return sanitized response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'admin_set_campaign_status',
        'message', 'Status campaign berhasil diubah menjadi ' || v_clean_status || '.',
        'campaign_id', v_clean_campaign_id,
        'status', v_updated_campaign.status
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION admin_set_campaign_status(TEXT, TEXT, TEXT) IS 'Admin mutation RPC to update a campaign lifecycle status.';

GRANT EXECUTE ON FUNCTION admin_set_campaign_status(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_set_campaign_status(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_campaign_status(TEXT, TEXT, TEXT) TO service_role;
