-- ==============================================================================
-- Donatur Helper - Admin Generate PIC Token Mutation RPC Migration
-- Migration File: 20260819070000_admin_generate_pic_token.sql
-- Description: Creates admin_generate_pic_token mutation RPC function for Admins
--              and SuperAdmins to generate new standalone PIC tokens.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: admin_generate_pic_token
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_generate_pic_token(
    p_token TEXT,
    p_alias TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_auth RECORD;
    v_clean_alias TEXT;
    v_plaintext_token TEXT;
    v_token_hash TEXT;
    v_expires_at TIMESTAMPTZ;
    v_token_exists BOOLEAN;
    v_attempt INTEGER;
    v_new_token RECORD;
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
            'message', 'Hanya Admin atau SuperAdmin yang dapat membuat token PIC.'
        );
    END IF;

    v_clean_alias := NULLIF(TRIM(p_alias), '');

    -- 2. Generate unique PIC token (PIC-XXXXXXXX)
    FOR v_attempt IN 1..5 LOOP
        v_plaintext_token := 'PIC-' || UPPER(encode(extensions.gen_random_bytes(4), 'hex'));
        v_token_hash := encode(extensions.digest(v_plaintext_token, 'sha256'), 'hex');

        SELECT EXISTS (
            SELECT 1 FROM auth_tokens WHERE token_hash = v_token_hash
        ) INTO v_token_exists;

        IF NOT v_token_exists THEN
            EXIT;
        END IF;

        IF v_attempt = 5 THEN
            RETURN jsonb_build_object(
                'error', 'token_generation_failed',
                'message', 'Gagal membuat token PIC unik. Silakan coba lagi.'
            );
        END IF;
    END LOOP;

    v_expires_at := NOW() + INTERVAL '30 days';

    -- 3. Insert new token record
    INSERT INTO auth_tokens (
        token_hash,
        role,
        status,
        linked_campaign_id,
        alias,
        created_by,
        created_at,
        expires_at
    ) VALUES (
        v_token_hash,
        'PIC',
        'UNUSED',
        NULL,
        COALESCE(v_clean_alias, 'PIC Baru'),
        'admin:' || COALESCE(v_auth.alias, 'Admin'),
        NOW(),
        v_expires_at
    )
    RETURNING * INTO v_new_token;

    -- 4. Record audit log
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
        'admin_generate_pic_token',
        'auth_token',
        v_new_token.id::TEXT,
        jsonb_build_object(
            'token_id', v_new_token.id,
            'role', 'PIC',
            'alias', v_new_token.alias,
            'admin_alias', v_auth.alias
        )
    );

    -- 5. Return sanitized response containing plaintext token
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'admin_generate_pic_token',
        'message', 'Token PIC berhasil dibuat.',
        'token', v_plaintext_token,
        'token_id', v_new_token.id,
        'role', v_new_token.role,
        'status', v_new_token.status,
        'alias', v_new_token.alias,
        'expires_at', to_char(v_new_token.expires_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION admin_generate_pic_token(TEXT, TEXT) IS 'Admin mutation RPC to generate a new standalone PIC token.';

GRANT EXECUTE ON FUNCTION admin_generate_pic_token(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_generate_pic_token(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_generate_pic_token(TEXT, TEXT) TO service_role;
