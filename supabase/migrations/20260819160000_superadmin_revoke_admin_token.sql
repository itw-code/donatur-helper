-- ==============================================================================
-- Donatur Helper - SuperAdmin Revoke Admin Token Mutation RPC Migration
-- Migration File: 20260819160000_superadmin_revoke_admin_token.sql
-- Description: Creates superadmin_revoke_admin_token mutation RPC function for
--              SuperAdmins to revoke an Admin or PIC access token.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: superadmin_revoke_admin_token
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION superadmin_revoke_admin_token(
    p_token TEXT,
    p_token_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_target_token RECORD;
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
            'message', 'Hanya SuperAdmin yang dapat menonaktifkan token.'
        );
    END IF;

    -- 2. Validate token ID input
    IF p_token_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'ID token tidak valid.'
        );
    END IF;

    -- 3. Prevent revoking own active token
    IF v_auth.token_id = p_token_id THEN
        RETURN jsonb_build_object(
            'error', 'self_revocation_blocked',
            'message', 'Anda tidak dapat menonaktifkan token yang sedang Anda gunakan.'
        );
    END IF;

    -- 4. Lock and validate target token
    SELECT * INTO v_target_token
    FROM auth_tokens
    WHERE id = p_token_id
    FOR UPDATE;

    IF v_target_token.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Token yang dituju tidak ditemukan.'
        );
    END IF;

    -- 5. Revoke token
    UPDATE auth_tokens
    SET
        status = 'REVOKED',
        revoked_at = NOW()
    WHERE id = p_token_id;

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
        'superadmin_revoke_admin_token',
        'auth_token',
        p_token_id::TEXT,
        jsonb_build_object(
            'token_id', p_token_id,
            'role', v_target_token.role,
            'alias', v_target_token.alias,
            'superadmin_alias', v_auth.alias
        )
    );

    -- 7. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'superadmin_revoke_admin_token',
        'message', 'Token ' || COALESCE(v_target_token.alias, '') || ' berhasil dinonaktifkan.',
        'token_id', p_token_id,
        'status', 'REVOKED'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION superadmin_revoke_admin_token(TEXT, UUID) IS 'SuperAdmin mutation RPC to revoke an active authentication token.';

GRANT EXECUTE ON FUNCTION superadmin_revoke_admin_token(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION superadmin_revoke_admin_token(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION superadmin_revoke_admin_token(TEXT, UUID) TO service_role;
