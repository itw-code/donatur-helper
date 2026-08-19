-- ==============================================================================
-- Donatur Helper - SuperAdmin Add Member Mutation RPC Migration
-- Migration File: 20260819200000_superadmin_add_member.sql
-- Description: Creates superadmin_add_member mutation RPC function for SuperAdmins
--              to directly register and activate new members.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: superadmin_add_member
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION superadmin_add_member(
    p_token TEXT,
    p_name TEXT,
    p_whatsapp TEXT,
    p_status TEXT DEFAULT 'ACTIVE',
    p_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_clean_name TEXT;
    v_normalized_whatsapp TEXT;
    v_clean_status TEXT;
    v_clean_email TEXT;
    v_new_member RECORD;
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
            'message', 'Hanya SuperAdmin yang dapat menambahkan member baru secara langsung.'
        );
    END IF;

    -- 2. Validate inputs
    v_clean_name := NULLIF(TRIM(p_name), '');
    IF v_clean_name IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nama lengkap wajib diisi.'
        );
    END IF;

    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid.'
        );
    END IF;

    v_clean_status := UPPER(NULLIF(TRIM(p_status), ''));
    IF v_clean_status IS NULL OR v_clean_status NOT IN ('ACTIVE', 'PENDING', 'EX', 'REJECTED', 'DELETED') THEN
        v_clean_status := 'ACTIVE';
    END IF;

    v_clean_email := NULLIF(TRIM(p_email), '');
    IF v_clean_email IS NOT NULL AND v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Format email tidak valid.'
        );
    END IF;

    -- 3. Check for existing member with same WhatsApp
    IF EXISTS (SELECT 1 FROM members WHERE whatsapp = v_normalized_whatsapp) THEN
        RETURN jsonb_build_object(
            'error', 'duplicate_whatsapp',
            'message', 'Member dengan nomor WhatsApp ini sudah terdaftar.'
        );
    END IF;

    -- 4. Insert new member
    INSERT INTO members (
        name,
        whatsapp,
        email,
        status,
        role,
        added_by,
        added_at
    ) VALUES (
        v_clean_name,
        v_normalized_whatsapp,
        v_clean_email,
        v_clean_status,
        'MEMBER',
        'superadmin:' || COALESCE(v_auth.alias, 'SuperAdmin'),
        NOW()
    )
    RETURNING * INTO v_new_member;

    -- 5. Record audit log
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
        'superadmin_add_member',
        'member',
        v_new_member.id::TEXT,
        jsonb_build_object(
            'member_id', v_new_member.id,
            'name', v_clean_name,
            'whatsapp', v_normalized_whatsapp,
            'status', v_clean_status,
            'superadmin_alias', v_auth.alias
        )
    );

    -- 6. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'superadmin_add_member',
        'message', 'Member ' || v_clean_name || ' berhasil ditambahkan.',
        'member', jsonb_build_object(
            'id', v_new_member.id,
            'name', v_new_member.name,
            'whatsapp', v_new_member.whatsapp,
            'email', v_new_member.email,
            'status', v_new_member.status,
            'role', v_new_member.role,
            'added_at', to_char(v_new_member.added_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION superadmin_add_member(TEXT, TEXT, TEXT, TEXT, TEXT) IS 'SuperAdmin mutation RPC to directly register and activate a new member.';

GRANT EXECUTE ON FUNCTION superadmin_add_member(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION superadmin_add_member(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION superadmin_add_member(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
