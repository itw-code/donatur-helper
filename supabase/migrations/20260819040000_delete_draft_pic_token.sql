-- ==============================================================================
-- Donatur Helper - Delete Draft PIC Token Mutation RPC Migration
-- Migration File: 20260819040000_delete_draft_pic_token.sql
-- Description: Creates delete_draft_pic_token mutation RPC function to discard
--              unused draft PIC tokens that are not linked to any campaign.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: delete_draft_pic_token
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_draft_pic_token(
    p_pic_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_token TEXT;
    v_token_hash TEXT;
    v_token RECORD;
BEGIN
    -- 1. Validate input
    v_clean_token := NULLIF(TRIM(p_pic_token), '');
    IF v_clean_token IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Token PIC tidak boleh kosong.'
        );
    END IF;

    -- 2. Compute SHA-256 hash
    v_token_hash := encode(extensions.digest(v_clean_token, 'sha256'), 'hex');

    -- 3. Lock and check token record
    SELECT * INTO v_token
    FROM auth_tokens
    WHERE token_hash = v_token_hash
    FOR UPDATE;

    IF v_token.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Token PIC tidak ditemukan.'
        );
    END IF;

    IF v_token.role <> 'PIC' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_role',
            'message', 'Token ini bukan token PIC.'
        );
    END IF;

    IF v_token.linked_campaign_id IS NOT NULL AND TRIM(v_token.linked_campaign_id) <> '' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_already_linked',
            'message', 'Token sudah terhubung dengan campaign dan tidak dapat dihapus sebagai draf.'
        );
    END IF;

    -- 4. Delete the draft token
    DELETE FROM auth_tokens
    WHERE id = v_token.id;

    -- 5. Insert audit log
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NULL,
        'donor:' || COALESCE(v_token.created_by, 'unknown'),
        'delete_draft_pic_token',
        'auth_token',
        v_token.id::TEXT,
        jsonb_build_object(
            'token_id', v_token.id,
            'role', v_token.role,
            'created_by', v_token.created_by,
            'alias', v_token.alias
        )
    );

    -- 6. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'delete_draft_pic_token',
        'message', 'Draf campaign berhasil dibatalkan dan token dihapus.'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION delete_draft_pic_token(TEXT) IS 'Deletes an unused draft PIC token that is not linked to any campaign.';

GRANT EXECUTE ON FUNCTION delete_draft_pic_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION delete_draft_pic_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_draft_pic_token(TEXT) TO service_role;
