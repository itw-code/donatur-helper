-- ==============================================================================
-- Donatur Helper - Update Campaign Gift Proof Mutation RPC Migration
-- Migration File: 20260818200000_update_campaign_gift_proof.sql
-- Description: Creates update_campaign_gift_proof mutation RPC function for PICs to
--              upload and update documentation proof of purchased gifts (link and/or
--              image storage path), replacing legacy Google Apps Script updateGiftProof.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: update_campaign_gift_proof
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_campaign_gift_proof(
    p_token TEXT,
    p_link TEXT DEFAULT NULL,
    p_image_path TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_link TEXT;
    v_clean_image_path TEXT;
    v_auth RECORD;
    v_campaign RECORD;
    v_updated_campaign RECORD;
BEGIN
    -- 1. Input sanitization
    v_clean_link := NULLIF(TRIM(p_link), '');
    v_clean_image_path := NULLIF(TRIM(p_image_path), '');

    -- 2. Input validation: At least one of link or image path must be provided
    IF v_clean_link IS NULL AND v_clean_image_path IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Minimal satu dari link hadiah atau foto dokumentasi harus diisi.'
        );
    END IF;

    -- 3. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE'
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid.'
        );
    END IF;

    -- 4. Token role check
    IF v_auth.role <> 'PIC' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token ini bukan token PIC.'
        );
    END IF;

    -- 5. Token campaign link check
    IF v_auth.linked_campaign_id IS NULL OR TRIM(v_auth.linked_campaign_id) = '' THEN
        RETURN jsonb_build_object(
            'error', 'token_not_linked',
            'message', 'Token PIC ini belum terhubung ke campaign.'
        );
    END IF;

    -- 6. Advisory transaction lock and campaign validation
    PERFORM pg_advisory_xact_lock(hashtext('update_campaign_gift_proof:' || v_auth.linked_campaign_id));

    SELECT * INTO v_campaign
    FROM campaigns
    WHERE campaign_id = v_auth.linked_campaign_id
    FOR UPDATE;

    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Campaign tidak ditemukan.'
        );
    END IF;

    -- 7. Campaign status validation: Must be FINALIZED or CLOSED
    IF v_campaign.status NOT IN ('FINALIZED', 'CLOSED') THEN
        RETURN jsonb_build_object(
            'error', 'campaign_not_ready',
            'message', 'Dokumentasi hadiah hanya bisa diunggah setelah campaign difinalisasi atau ditutup.'
        );
    END IF;

    -- 8. Campaign update
    UPDATE campaigns
    SET
        gift_link = COALESCE(v_clean_link, gift_link),
        gift_image = COALESCE(v_clean_image_path, gift_image),
        modified_by = COALESCE(NULLIF(TRIM(v_auth.alias), ''), 'PIC'),
        modified_at = NOW()
    WHERE campaign_id = v_campaign.campaign_id
    RETURNING * INTO v_updated_campaign;

    -- 9. Audit logging
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NULL,
        'pic:' || COALESCE(NULLIF(TRIM(v_auth.alias), ''), 'PIC'),
        'update_campaign_gift_proof',
        'campaign',
        v_updated_campaign.campaign_id,
        jsonb_build_object(
            'campaign_id', v_updated_campaign.campaign_id,
            'has_link', (v_clean_link IS NOT NULL),
            'has_image', (v_clean_image_path IS NOT NULL)
        )
    );

    -- 10. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'update_campaign_gift_proof',
        'message', 'Dokumentasi hadiah berhasil disimpan.',
        'campaign', jsonb_build_object(
            'campaign_id', v_updated_campaign.campaign_id,
            'target_name', v_updated_campaign.target_name,
            'gift_link', v_updated_campaign.gift_link,
            'gift_image', v_updated_campaign.gift_image,
            'modified_at', to_char(v_updated_campaign.modified_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION update_campaign_gift_proof(TEXT, TEXT, TEXT) IS 'PIC gift documentation upload mutation RPC replacing legacy updateGiftProof. Validates PIC token and campaign status (FINALIZED or CLOSED), updates gift_link and gift_image, records audit log, and returns updated campaign gift proof details.';

GRANT EXECUTE ON FUNCTION update_campaign_gift_proof(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION update_campaign_gift_proof(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_campaign_gift_proof(TEXT, TEXT, TEXT) TO service_role;
