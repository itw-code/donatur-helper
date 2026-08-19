-- ==============================================================================
-- Donatur Helper - SuperAdmin Update Settings Mutation RPC Migration
-- Migration File: 20260819230000_superadmin_update_settings.sql
-- Description: Creates superadmin_update_settings mutation RPC function for
--              SuperAdmins to update global system configuration settings.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: superadmin_update_settings
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION superadmin_update_settings(
    p_token TEXT,
    p_settings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_key TEXT;
    v_val JSONB;
    v_val_text TEXT;
    v_updated_keys TEXT[] := ARRAY[]::TEXT[];
    v_updated_count INTEGER := 0;
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
            'message', 'Hanya SuperAdmin yang dapat mengubah pengaturan sistem.'
        );
    END IF;

    -- 2. Validate input object
    IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Pengaturan harus berupa objek JSON (key-value).'
        );
    END IF;

    -- 3. Process each setting key-value pair
    FOR v_key, v_val IN SELECT * FROM jsonb_each(p_settings)
    LOOP
        v_key := TRIM(v_key);
        IF v_key IS NULL OR v_key = '' THEN
            CONTINUE;
        END IF;

        v_val_text := v_val #>> '{}';

        -- If secret is masked as "***", do not overwrite existing stored secret value
        IF v_val_text = '***' THEN
            CONTINUE;
        END IF;

        -- Upsert into app_settings
        INSERT INTO app_settings (
            key,
            value,
            is_secret,
            updated_at
        ) VALUES (
            v_key,
            v_val,
            FALSE,
            NOW()
        )
        ON CONFLICT (key) DO UPDATE
        SET
            value = EXCLUDED.value,
            updated_at = NOW();

        v_updated_keys := array_append(v_updated_keys, v_key);
        v_updated_count := v_updated_count + 1;
    END LOOP;

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
        'superadmin:' || COALESCE(v_auth.alias, 'unknown'),
        'superadmin_update_settings',
        'app_settings',
        'global',
        jsonb_build_object(
            'updated_keys', v_updated_keys,
            'updated_count', v_updated_count,
            'superadmin_alias', v_auth.alias
        )
    );

    -- 5. Return sanitized response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'superadmin_update_settings',
        'message', 'Pengaturan sistem berhasil diperbarui.',
        'updated_count', v_updated_count,
        'updated_keys', v_updated_keys
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION superadmin_update_settings(TEXT, JSONB) IS 'SuperAdmin mutation RPC to update global application settings and feature toggles.';

GRANT EXECUTE ON FUNCTION superadmin_update_settings(TEXT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION superadmin_update_settings(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION superadmin_update_settings(TEXT, JSONB) TO service_role;
