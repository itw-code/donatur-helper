-- ==============================================================================
-- Donatur Helper - SuperAdmin Remove Member Mutation RPC Migration
-- Migration File: 20260819210000_superadmin_remove_member.sql
-- Description: Creates superadmin_remove_member mutation RPC function for SuperAdmins
--              to soft-delete a member record and revoke associated access.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: superadmin_remove_member
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION superadmin_remove_member(
    p_token TEXT,
    p_whatsapp TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_normalized_whatsapp TEXT;
    v_member RECORD;
    v_updated_member RECORD;
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
            'message', 'Hanya SuperAdmin yang dapat menghapus member.'
        );
    END IF;

    -- 2. Validate inputs
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid.'
        );
    END IF;

    -- 3. Lock and validate member
    SELECT * INTO v_member
    FROM members
    WHERE whatsapp = v_normalized_whatsapp
    FOR UPDATE;

    IF v_member.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Member dengan nomor WhatsApp ini tidak ditemukan.'
        );
    END IF;

    -- 4. Soft-delete member (status = 'DELETED')
    UPDATE members
    SET
        status = 'DELETED',
        modified_by = 'superadmin:' || COALESCE(v_auth.alias, 'SuperAdmin'),
        modified_at = NOW()
    WHERE id = v_member.id
    RETURNING * INTO v_updated_member;

    -- 5. Revoke active auth tokens created for this member phone
    UPDATE auth_tokens
    SET
        status = 'REVOKED',
        revoked_at = NOW()
    WHERE created_by = v_normalized_whatsapp
      AND status = 'ACTIVE';

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
        'superadmin_remove_member',
        'member',
        v_updated_member.id::TEXT,
        jsonb_build_object(
            'member_id', v_updated_member.id,
            'name', v_updated_member.name,
            'whatsapp', v_normalized_whatsapp,
            'superadmin_alias', v_auth.alias
        )
    );

    -- 7. Return sanitized response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'superadmin_remove_member',
        'message', 'Member ' || v_updated_member.name || ' berhasil dihapus.',
        'member_id', v_updated_member.id,
        'status', 'DELETED'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION superadmin_remove_member(TEXT, TEXT) IS 'SuperAdmin mutation RPC to soft-delete a member record and revoke access.';

GRANT EXECUTE ON FUNCTION superadmin_remove_member(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION superadmin_remove_member(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION superadmin_remove_member(TEXT, TEXT) TO service_role;
