-- ==============================================================================
-- Donatur Helper - Admin Bulk Update Member Status Mutation RPC Migration
-- Migration File: 20260819060000_admin_bulk_update_member_status.sql
-- Description: Creates admin_bulk_update_member_status mutation RPC function for
--              Admins and SuperAdmins to batch update member statuses atomically.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: admin_bulk_update_member_status
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_bulk_update_member_status(
    p_token TEXT,
    p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_item JSONB;
    v_raw_wa TEXT;
    v_normalized_wa TEXT;
    v_status TEXT;
    v_updated_count INTEGER := 0;
    v_updated_members JSONB := jsonb_build_array();
    v_member RECORD;
BEGIN
    -- 1. Authenticate token using verify_auth_token
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
            'message', 'Hanya Admin atau SuperAdmin yang dapat mengubah status member.'
        );
    END IF;

    -- 2. Validate updates array
    IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' OR jsonb_array_length(p_updates) = 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Daftar perubahan status member tidak boleh kosong.'
        );
    END IF;

    -- 3. Process each update atomically
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_updates)
    LOOP
        v_raw_wa := v_item->>'whatsapp';
        IF v_raw_wa IS NULL THEN
            v_raw_wa := v_item->>'wa';
        END IF;

        v_status := UPPER(NULLIF(TRIM(v_item->>'status'), ''));

        IF v_raw_wa IS NULL OR v_status IS NULL THEN
            CONTINUE;
        END IF;

        v_normalized_wa := normalize_whatsapp(v_raw_wa);
        IF v_normalized_wa IS NULL OR v_normalized_wa = '' THEN
            CONTINUE;
        END IF;

        IF v_status NOT IN ('ACTIVE', 'PENDING', 'REJECTED', 'DELETED', 'EX') THEN
            CONTINUE;
        END IF;

        -- Lock and update member
        UPDATE members
        SET
            status = v_status,
            modified_by = COALESCE(v_auth.alias, 'Admin'),
            modified_at = NOW()
        WHERE whatsapp = v_normalized_wa
        RETURNING * INTO v_member;

        IF v_member.id IS NOT NULL THEN
            v_updated_count := v_updated_count + 1;
            v_updated_members := v_updated_members || jsonb_build_object(
                'whatsapp', v_member.whatsapp,
                'name', v_member.name,
                'status', v_member.status
            );
        END IF;
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
        'admin:' || COALESCE(v_auth.alias, 'unknown'),
        'admin_bulk_update_member_status',
        'member',
        'bulk:' || v_updated_count::TEXT,
        jsonb_build_object(
            'admin_alias', v_auth.alias,
            'updated_count', v_updated_count,
            'updates', v_updated_members
        )
    );

    -- 5. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'admin_bulk_update_member_status',
        'message', 'Berhasil memperbarui status ' || v_updated_count::TEXT || ' member.',
        'updated_count', v_updated_count,
        'members', v_updated_members
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION admin_bulk_update_member_status(TEXT, JSONB) IS 'Admin mutation RPC to batch update status of multiple members atomically.';

GRANT EXECUTE ON FUNCTION admin_bulk_update_member_status(TEXT, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION admin_bulk_update_member_status(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_bulk_update_member_status(TEXT, JSONB) TO service_role;
