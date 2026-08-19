-- ==============================================================================
-- Donatur Helper - Admin Update Member Status Mutation RPC Migration
-- Migration File: 20260818150000_admin_update_member_status.sql
-- Description: Creates admin_update_member_status mutation RPC function for Admins
--              and SuperAdmins to approve, reject, or update member status
--              (ACTIVE, PENDING, REJECTED, DELETED, EX), replacing legacy
--              Google Apps Script adminUpdateMemberStatus action.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: admin_update_member_status
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_update_member_status(
    p_token TEXT,
    p_whatsapp TEXT,
    p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_normalized_whatsapp TEXT;
    v_new_status TEXT;
    v_previous_status TEXT;
    v_member RECORD;
    v_updated_member RECORD;
    v_modified_by TEXT;
    v_actor_desc TEXT;
BEGIN
    -- 1. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE' 
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token admin tidak valid atau tidak aktif.'
        );
    END IF;

    -- 2. Role validation: Token role must be ADMIN or SUPER_ADMIN
    IF v_auth.role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Akses ditolak. Hanya Admin atau SuperAdmin yang dapat mengubah status member.'
        );
    END IF;

    -- 3. Input validation: Normalize and validate WhatsApp
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid.'
        );
    END IF;

    -- 4. Input validation: Normalize and validate new member status
    v_new_status := UPPER(TRIM(COALESCE(p_new_status, '')));
    IF v_new_status NOT IN ('ACTIVE', 'PENDING', 'REJECTED', 'DELETED', 'EX') THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Status member tidak valid.'
        );
    END IF;

    -- 5. Member locking and existence validation
    SELECT * INTO v_member
    FROM members
    WHERE whatsapp = v_normalized_whatsapp
    FOR UPDATE;

    IF v_member.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Member dengan nomor WhatsApp tersebut tidak ditemukan.'
        );
    END IF;

    -- 6. Capture previous status and actor descriptor
    v_previous_status := v_member.status;
    v_modified_by := COALESCE(NULLIF(TRIM(v_auth.alias), ''), v_auth.role);
    v_actor_desc := v_auth.role || ':' || COALESCE(NULLIF(TRIM(v_auth.alias), ''), 'unknown');

    -- 7. Update member status
    UPDATE members
    SET
        status = v_new_status,
        modified_by = v_modified_by,
        modified_at = NOW()
    WHERE id = v_member.id
    RETURNING * INTO v_updated_member;

    -- 8. Audit logging
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NULL,
        v_actor_desc,
        'admin_update_member_status',
        'member',
        v_normalized_whatsapp,
        jsonb_build_object(
            'previous_status', v_previous_status,
            'new_status', v_new_status
        )
    );

    -- 9. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'admin_update_member_status',
        'message', 'Status member berhasil diperbarui.',
        'member', jsonb_build_object(
            'name', v_updated_member.name,
            'whatsapp', v_updated_member.whatsapp,
            'status', v_updated_member.status,
            'role', v_updated_member.role,
            'modified_at', to_char(v_updated_member.modified_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION admin_update_member_status(TEXT, TEXT, TEXT) IS 'Admin member status update mutation RPC replacing legacy adminUpdateMemberStatus. Authenticates Admin/SuperAdmin token, validates WhatsApp and new member status, updates member status, records audit log, and returns sanitized member state.';

GRANT EXECUTE ON FUNCTION admin_update_member_status(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_update_member_status(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_member_status(TEXT, TEXT, TEXT) TO service_role;
