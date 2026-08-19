-- ==============================================================================
-- Donatur Helper - SuperAdmin Assign Member Role Mutation RPC Migration
-- Migration File: 20260819190000_superadmin_assign_member_role.sql
-- Description: Creates superadmin_assign_member_role mutation RPC function for
--              SuperAdmins to promote or demote member roles and auto-provision
--              admin tokens when elevated to ADMIN.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: superadmin_assign_member_role
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION superadmin_assign_member_role(
    p_token TEXT,
    p_whatsapp TEXT,
    p_new_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_auth RECORD;
    v_normalized_whatsapp TEXT;
    v_clean_role TEXT;
    v_member RECORD;
    v_updated_member RECORD;
    v_new_admin_token TEXT := NULL;
    v_token_hash TEXT;
    v_token_exists BOOLEAN;
    v_attempt INTEGER;
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
            'message', 'Hanya SuperAdmin yang dapat mengubah role member.'
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

    v_clean_role := UPPER(NULLIF(TRIM(p_new_role), ''));
    IF v_clean_role IS NULL OR v_clean_role NOT IN ('MEMBER', 'ADMIN', 'SUPER_ADMIN') THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Role tidak valid. Role yang diizinkan: MEMBER, ADMIN, SUPER_ADMIN.'
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

    -- 4. Update member role
    UPDATE members
    SET
        role = v_clean_role,
        modified_by = COALESCE(v_auth.alias, 'SuperAdmin'),
        modified_at = NOW()
    WHERE id = v_member.id
    RETURNING * INTO v_updated_member;

    -- 5. If promoted to ADMIN, ensure an active Admin token exists
    IF v_clean_role = 'ADMIN' THEN
        FOR v_attempt IN 1..5 LOOP
            v_new_admin_token := 'ADM-' || UPPER(encode(extensions.gen_random_bytes(4), 'hex'));
            v_token_hash := encode(extensions.digest(v_new_admin_token, 'sha256'), 'hex');

            SELECT EXISTS (
                SELECT 1 FROM auth_tokens WHERE token_hash = v_token_hash
            ) INTO v_token_exists;

            IF NOT v_token_exists THEN
                EXIT;
            END IF;
        END LOOP;

        INSERT INTO auth_tokens (
            token_hash,
            role,
            status,
            alias,
            created_by,
            created_at,
            expires_at
        ) VALUES (
            v_token_hash,
            'ADMIN',
            'ACTIVE',
            v_member.name,
            v_normalized_whatsapp,
            NOW(),
            NOW() + INTERVAL '90 days'
        );
    END IF;

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
        'superadmin_assign_member_role',
        'member',
        v_updated_member.id::TEXT,
        jsonb_build_object(
            'member_id', v_updated_member.id,
            'whatsapp', v_normalized_whatsapp,
            'old_role', v_member.role,
            'new_role', v_clean_role,
            'superadmin_alias', v_auth.alias
        )
    );

    -- 7. Return sanitized response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'superadmin_assign_member_role',
        'message', 'Role member ' || v_updated_member.name || ' berhasil diubah menjadi ' || v_clean_role || '.',
        'member', jsonb_build_object(
            'id', v_updated_member.id,
            'name', v_updated_member.name,
            'whatsapp', v_updated_member.whatsapp,
            'role', v_updated_member.role,
            'status', v_updated_member.status
        ),
        'generated_admin_token', v_new_admin_token
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION superadmin_assign_member_role(TEXT, TEXT, TEXT) IS 'SuperAdmin mutation RPC to update member role and provision admin access tokens.';

GRANT EXECUTE ON FUNCTION superadmin_assign_member_role(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION superadmin_assign_member_role(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION superadmin_assign_member_role(TEXT, TEXT, TEXT) TO service_role;
