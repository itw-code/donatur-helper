-- ==============================================================================
-- Donatur Helper - Update Member Profile RPC Function Migration
-- Migration File: 20260819010000_update_member_profile.sql
-- Description: Creates update_member_profile RPC function for registered members
--              to update their name and email address.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: update_member_profile
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_member_profile(
    p_whatsapp TEXT,
    p_name TEXT,
    p_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_normalized_whatsapp TEXT;
    v_clean_name TEXT;
    v_clean_email TEXT;
    v_member RECORD;
    v_updated_member RECORD;
BEGIN
    -- 1. Normalize WhatsApp number
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);

    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid. Silakan periksa kembali nomor Anda.'
        );
    END IF;

    -- 2. Validate Name
    v_clean_name := NULLIF(TRIM(p_name), '');
    IF v_clean_name IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nama lengkap tidak boleh kosong.'
        );
    END IF;

    -- 3. Validate Email format if provided
    v_clean_email := NULLIF(TRIM(p_email), '');
    IF v_clean_email IS NOT NULL AND v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Format email tidak valid.'
        );
    END IF;

    -- 4. Check member exists and is active
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

    IF v_member.status NOT IN ('ACTIVE', 'PENDING') THEN
        RETURN jsonb_build_object(
            'error', 'inactive_member',
            'message', 'Akun member tidak aktif (status: ' || v_member.status || ').'
        );
    END IF;

    -- 5. Update member record
    UPDATE members
    SET
        name = v_clean_name,
        email = CASE WHEN v_clean_email IS NOT NULL THEN v_clean_email ELSE email END,
        modified_by = 'Donor',
        modified_at = NOW()
    WHERE id = v_member.id
    RETURNING * INTO v_updated_member;

    -- 6. Insert audit log
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_updated_member.id,
        'donor:' || v_normalized_whatsapp,
        'update_member_profile',
        'member',
        v_updated_member.id::TEXT,
        jsonb_build_object(
            'whatsapp', v_normalized_whatsapp,
            'name_old', v_member.name,
            'name_new', v_updated_member.name,
            'email_old', v_member.email,
            'email_new', v_updated_member.email
        )
    );

    -- 7. Return success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'update_member_profile',
        'message', 'Profil berhasil diperbarui.',
        'member', jsonb_build_object(
            'id', v_updated_member.id,
            'name', v_updated_member.name,
            'whatsapp', v_updated_member.whatsapp,
            'email', v_updated_member.email,
            'status', v_updated_member.status,
            'role', v_updated_member.role
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION update_member_profile(TEXT, TEXT, TEXT) IS 'Updates member name and optional email for active/pending registered members.';

GRANT EXECUTE ON FUNCTION update_member_profile(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION update_member_profile(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_member_profile(TEXT, TEXT, TEXT) TO service_role;
