-- ==============================================================================
-- Donatur Helper - Donor Self-Registration Mutation RPC Migration
-- Migration File: 20260818120000_register_donor_member.sql
-- Description: Creates register_donor_member mutation RPC function for donor
--              self-registration, replacing legacy Google Apps Script registerUser.
--              Handles phone normalization, Indonesian mobile validation, advisory
--              locking, existing member status handling (active/ex/pending/rejected/deleted),
--              audit logging, and masked WhatsApp responses.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: register_donor_member
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_donor_member(
    p_name TEXT,
    p_whatsapp TEXT,
    p_emp_status TEXT DEFAULT 'active'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_name TEXT;
    v_normalized_whatsapp TEXT;
    v_clean_emp_status TEXT;
    v_masked_whatsapp TEXT;
    v_member RECORD;
BEGIN
    -- 1. Normalize WhatsApp number
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);

    -- 2. Input validation: WhatsApp number presence
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid. Silakan periksa kembali nomor Anda.'
        );
    END IF;

    -- 3. Input validation: Indonesian mobile phone format (^\+628\d{7,13}$)
    IF v_normalized_whatsapp !~ '^\+628\d{7,13}$' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid. Gunakan nomor HP Indonesia, contoh: 0812xxxxxxx.'
        );
    END IF;

    -- 4. Input validation: Name presence
    v_clean_name := TRIM(p_name);
    IF v_clean_name IS NULL OR v_clean_name = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nama tidak boleh kosong.'
        );
    END IF;

    -- 5. Input validation: Employee status normalization and check
    v_clean_emp_status := LOWER(TRIM(COALESCE(p_emp_status, '')));
    IF v_clean_emp_status NOT IN ('active', 'ex') THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Status karyawan tidak valid.'
        );
    END IF;

    -- 6. Concurrency control: Transaction-scoped advisory lock keyed by WhatsApp
    PERFORM pg_advisory_xact_lock(hashtext('register_donor_member:' || v_normalized_whatsapp));

    -- 7. Compute masked WhatsApp (+628112002122 -> +6281****122)
    IF length(v_normalized_whatsapp) >= 8 THEN
        v_masked_whatsapp := substr(v_normalized_whatsapp, 1, 5) || '****' || substr(v_normalized_whatsapp, length(v_normalized_whatsapp) - 2, 3);
    ELSE
        v_masked_whatsapp := '***';
    END IF;

    -- 8. Existing member lookup
    SELECT * INTO v_member
    FROM members
    WHERE whatsapp = v_normalized_whatsapp;

    -- 9. Existing member handling by status
    IF v_member.id IS NOT NULL THEN
        -- Case A: Active or Ex member already registered
        IF v_member.status IN ('ACTIVE', 'EX') THEN
            RETURN jsonb_build_object(
                'error', 'member_exists',
                'message', 'Nomor WhatsApp ini sudah terdaftar.'
            );
        END IF;

        -- Case B: Member registration already pending approval (Idempotent response)
        IF v_member.status = 'PENDING' THEN
            -- Record audit trail
            INSERT INTO audit_logs (
                actor_member_id,
                actor_description,
                action,
                entity_type,
                entity_id,
                metadata
            ) VALUES (
                v_member.id,
                'donor',
                'register_donor_member',
                'member',
                v_normalized_whatsapp,
                jsonb_build_object(
                    'name', v_clean_name,
                    'emp_status', v_clean_emp_status,
                    're_registered', FALSE,
                    'already_pending', TRUE
                )
            );

            RETURN jsonb_build_object(
                'success', TRUE,
                'action', 'register_donor_member',
                'already_pending', TRUE,
                'message', 'Pendaftaran Anda sedang menunggu persetujuan admin.',
                'member', jsonb_build_object(
                    'name', v_member.name,
                    'whatsapp_masked', v_masked_whatsapp,
                    'status', 'PENDING',
                    'role', 'MEMBER'
                )
            );
        END IF;

        -- Case C: Rejected or Deleted member re-registration
        IF v_member.status IN ('REJECTED', 'DELETED') THEN
            UPDATE members
            SET
                name = v_clean_name,
                status = 'PENDING',
                role = 'MEMBER',
                added_by = 'Self-Registered - ' || v_clean_emp_status,
                added_at = NOW(),
                modified_by = 'self-re-registration',
                modified_at = NOW()
            WHERE id = v_member.id
            RETURNING * INTO v_member;

            -- Record audit trail
            INSERT INTO audit_logs (
                actor_member_id,
                actor_description,
                action,
                entity_type,
                entity_id,
                metadata
            ) VALUES (
                v_member.id,
                'donor',
                'register_donor_member',
                'member',
                v_normalized_whatsapp,
                jsonb_build_object(
                    'name', v_clean_name,
                    'emp_status', v_clean_emp_status,
                    're_registered', TRUE,
                    'already_pending', FALSE
                )
            );

            RETURN jsonb_build_object(
                'success', TRUE,
                'action', 'register_donor_member',
                'message', 'Pendaftaran berhasil dikirim ulang. Akun Anda menunggu persetujuan admin.',
                'member', jsonb_build_object(
                    'name', v_member.name,
                    'whatsapp_masked', v_masked_whatsapp,
                    'status', 'PENDING',
                    'role', 'MEMBER'
                )
            );
        END IF;
    END IF;

    -- 10. New member registration
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
        NULL,
        'PENDING',
        'MEMBER',
        'Self-Registered - ' || v_clean_emp_status,
        NOW()
    )
    RETURNING * INTO v_member;

    -- Record audit trail
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_member.id,
        'donor',
        'register_donor_member',
        'member',
        v_normalized_whatsapp,
        jsonb_build_object(
            'name', v_clean_name,
            'emp_status', v_clean_emp_status,
            're_registered', FALSE,
            'already_pending', FALSE
        )
    );

    -- 11. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'register_donor_member',
        'message', 'Pendaftaran berhasil. Akun Anda menunggu persetujuan admin.',
        'member', jsonb_build_object(
            'name', v_member.name,
            'whatsapp_masked', v_masked_whatsapp,
            'status', 'PENDING',
            'role', 'MEMBER'
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION register_donor_member(TEXT, TEXT, TEXT) IS 'Donor self-registration mutation RPC replacing legacy registerUser. Validates name, WhatsApp phone number, and employee status, enforces advisory concurrency lock, handles existing member statuses (ACTIVE, EX, PENDING, REJECTED, DELETED), records audit logs, and returns masked donor state.';

GRANT EXECUTE ON FUNCTION register_donor_member(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION register_donor_member(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION register_donor_member(TEXT, TEXT, TEXT) TO service_role;
