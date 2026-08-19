-- ==============================================================================
-- Donatur Helper - Admin Transfer Campaign Ownership Mutation RPC Migration
-- Migration File: 20260819080000_admin_transfer_campaign_ownership.sql
-- Description: Creates admin_transfer_campaign_ownership mutation RPC function for
--              Admins and SuperAdmins to reassign campaign PIC ownership to another
--              active member and issue a new PIC token.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: admin_transfer_campaign_ownership
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_transfer_campaign_ownership(
    p_token TEXT,
    p_campaign_id TEXT,
    p_target_whatsapp TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_auth RECORD;
    v_clean_campaign_id TEXT;
    v_normalized_target_wa TEXT;
    v_campaign RECORD;
    v_target_member RECORD;
    v_plaintext_token TEXT;
    v_token_hash TEXT;
    v_token_exists BOOLEAN;
    v_attempt INTEGER;
    v_new_token RECORD;
    v_revoked_count INTEGER;
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
            'message', 'Hanya Admin atau SuperAdmin yang dapat mengalihkan kepemilikan campaign.'
        );
    END IF;

    -- 2. Validate inputs
    v_clean_campaign_id := NULLIF(TRIM(p_campaign_id), '');
    IF v_clean_campaign_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Campaign ID tidak valid.'
        );
    END IF;

    v_normalized_target_wa := normalize_whatsapp(p_target_whatsapp);
    IF v_normalized_target_wa IS NULL OR v_normalized_target_wa = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tujuan transfer tidak valid.'
        );
    END IF;

    -- 3. Lock and validate campaign
    SELECT * INTO v_campaign
    FROM campaigns
    WHERE campaign_id = v_clean_campaign_id
    FOR UPDATE;

    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Campaign tidak ditemukan.'
        );
    END IF;

    -- 4. Lock and validate target member
    SELECT * INTO v_target_member
    FROM members
    WHERE whatsapp = v_normalized_target_wa
    FOR UPDATE;

    IF v_target_member.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'target_member_not_found',
            'message', 'Member tujuan tidak ditemukan dalam sistem.'
        );
    END IF;

    IF v_target_member.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object(
            'error', 'target_member_not_active',
            'message', 'Member tujuan harus berstatus ACTIVE untuk menjadi PIC campaign.'
        );
    END IF;

    -- 5. Expire existing PIC tokens linked to this campaign
    UPDATE auth_tokens
    SET
        status = 'EXPIRED',
        revoked_at = NOW()
    WHERE linked_campaign_id = v_clean_campaign_id
      AND status = 'ACTIVE';

    GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

    -- 6. Generate new PIC token for target member
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
                'message', 'Gagal membuat token PIC baru. Silakan coba lagi.'
            );
        END IF;
    END LOOP;

    -- 7. Insert active token for target member
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
        'ACTIVE',
        v_clean_campaign_id,
        v_target_member.name,
        v_normalized_target_wa,
        NOW(),
        NOW() + INTERVAL '90 days'
    )
    RETURNING * INTO v_new_token;

    -- 8. Update campaign modifier
    UPDATE campaigns
    SET
        modified_by = COALESCE(v_auth.alias, 'Admin'),
        modified_at = NOW()
    WHERE id = v_campaign.id;

    -- 9. Insert audit log
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
        'admin_transfer_campaign_ownership',
        'campaign',
        v_clean_campaign_id,
        jsonb_build_object(
            'campaign_id', v_clean_campaign_id,
            'target_whatsapp', v_normalized_target_wa,
            'target_name', v_target_member.name,
            'revoked_tokens_count', v_revoked_count,
            'new_token_id', v_new_token.id,
            'admin_alias', v_auth.alias
        )
    );

    -- 10. Return sanitized response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'admin_transfer_campaign_ownership',
        'message', 'Kepemilikan campaign berhasil dialihkan ke ' || v_target_member.name || '.',
        'campaign_id', v_clean_campaign_id,
        'target_name', v_target_member.name,
        'target_whatsapp', v_normalized_target_wa,
        'new_pic_token', v_plaintext_token,
        'revoked_tokens_count', v_revoked_count
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION admin_transfer_campaign_ownership(TEXT, TEXT, TEXT) IS 'Transfers campaign ownership to another active member, revoking old PIC tokens and generating a new PIC token.';

GRANT EXECUTE ON FUNCTION admin_transfer_campaign_ownership(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_transfer_campaign_ownership(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_transfer_campaign_ownership(TEXT, TEXT, TEXT) TO service_role;
