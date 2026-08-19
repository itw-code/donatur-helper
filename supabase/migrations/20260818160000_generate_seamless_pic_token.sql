-- ==============================================================================
-- Donatur Helper - Generate Seamless PIC Token Mutation RPC Migration
-- Migration File: 20260818160000_generate_seamless_pic_token.sql
-- Description: Creates generate_seamless_pic_token mutation RPC function for
--              approved active members to seamlessly generate a PIC token
--              for campaign creation without requiring manual Admin token
--              generation, replacing legacy Google Apps Script generateSeamlessPicToken.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: generate_seamless_pic_token
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_seamless_pic_token(
    p_whatsapp TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_normalized_whatsapp TEXT;
    v_member RECORD;
    v_plaintext_token TEXT;
    v_token_hash TEXT;
    v_expires_at TIMESTAMPTZ;
    v_new_token RECORD;
    v_token_exists BOOLEAN;
    v_attempt INTEGER;
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

    -- 4. Concurrency control: Transaction-scoped advisory lock keyed by WhatsApp
    PERFORM pg_advisory_xact_lock(hashtext('generate_seamless_pic_token:' || v_normalized_whatsapp));

    -- 5. Member validation: Row locking and status checks
    SELECT * INTO v_member
    FROM members
    WHERE whatsapp = v_normalized_whatsapp
    FOR UPDATE;

    IF v_member.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Nomor WhatsApp ini belum terdaftar sebagai member.'
        );
    END IF;

    IF v_member.status = 'PENDING' THEN
        RETURN jsonb_build_object(
            'error', 'member_pending',
            'message', 'Pendaftaran Anda masih menunggu persetujuan admin.'
        );
    END IF;

    IF v_member.status IN ('REJECTED', 'DELETED') THEN
        RETURN jsonb_build_object(
            'error', 'member_not_active',
            'message', 'Akun Anda tidak aktif. Silakan hubungi admin untuk bantuan lebih lanjut.'
        );
    END IF;

    IF v_member.status = 'EX' THEN
        RETURN jsonb_build_object(
            'error', 'member_alumni',
            'message', 'Alumni tidak dapat membuat campaign baru.'
        );
    END IF;

    IF v_member.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object(
            'error', 'member_not_active',
            'message', 'Akun Anda tidak aktif. Silakan hubungi admin untuk bantuan lebih lanjut.'
        );
    END IF;

    -- 6. Draft token cleanup: Expire previous unused draft PIC tokens for this member
    UPDATE auth_tokens
    SET status = 'EXPIRED',
        revoked_at = NOW()
    WHERE role = 'PIC'
      AND status = 'UNUSED'
      AND linked_campaign_id IS NULL
      AND created_by = v_normalized_whatsapp;

    -- 7. Token generation: PIC-XXXXXXXX (uppercase 8-char hex from 4 random bytes)
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
                'message', 'Gagal membuat token PIC. Silakan coba lagi.'
            );
        END IF;
    END LOOP;

    -- 8. Token insertion: Insert hashed token with 30-day validity
    v_expires_at := NOW() + INTERVAL '30 days';

    INSERT INTO auth_tokens (
        token_hash,
        role,
        status,
        linked_campaign_id,
        alias,
        created_by,
        created_at,
        expires_at,
        revoked_at,
        last_used_at
    ) VALUES (
        v_token_hash,
        'PIC',
        'UNUSED',
        NULL,
        v_member.name,
        v_normalized_whatsapp,
        NOW(),
        v_expires_at,
        NULL,
        NULL
    )
    RETURNING * INTO v_new_token;

    -- 9. Audit logging: Record action without plaintext token or token hash
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
        'generate_seamless_pic_token',
        'auth_token',
        v_normalized_whatsapp,
        jsonb_build_object(
            'member_status', v_member.status,
            'token_role', 'PIC',
            'expires_in_days', 30
        )
    );

    -- 10. Success response: Return plaintext token exactly once
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'generate_seamless_pic_token',
        'message', 'Token PIC berhasil dibuat. Simpan token ini baik-baik.',
        'token', v_plaintext_token,
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
COMMENT ON FUNCTION generate_seamless_pic_token(TEXT) IS 'Donor-to-PIC seamless token generation mutation RPC replacing legacy generateSeamlessPicToken. Allows an approved ACTIVE member to instantly generate an unlinked PIC draft token for campaign creation with advisory locking, draft cleanup, and audit logging.';

GRANT EXECUTE ON FUNCTION generate_seamless_pic_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION generate_seamless_pic_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_seamless_pic_token(TEXT) TO service_role;
