-- ==============================================================================
-- Donatur Helper - Verify Auth Token RPC Function Migration
-- Migration File: 20260818010000_verify_auth_token.sql
-- Description: Creates verify_auth_token RPC function to authenticate legacy
--              plaintext URL tokens against stored SHA-256 hashes.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: verify_auth_token
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION verify_auth_token(p_token TEXT)
RETURNS TABLE (
    token_id UUID,
    role TEXT,
    status TEXT,
    linked_campaign_id TEXT,
    alias TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_token TEXT;
    v_token_hash TEXT;
BEGIN
    -- Validate input: return immediately if token is NULL or empty
    IF p_token IS NULL OR TRIM(p_token) = '' THEN
        RETURN;
    END IF;

    -- Trim incoming plaintext token
    v_clean_token := TRIM(p_token);

    -- Compute SHA-256 hash via pgcrypto digest (hex encoded)
    v_token_hash := encode(extensions.digest(v_clean_token, 'sha256'), 'hex');

    -- Look up token_hash, update last_used_at, and return safe metadata
    RETURN QUERY
    UPDATE auth_tokens t
    SET last_used_at = NOW()
    WHERE t.token_hash = v_token_hash
    RETURNING
        t.id AS token_id,
        t.role,
        t.status,
        t.linked_campaign_id,
        t.alias,
        t.created_by,
        t.created_at,
        t.expires_at;
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION verify_auth_token(TEXT) IS 'Verifies a plaintext legacy auth token against stored SHA-256 hashes and returns safe role metadata.';

GRANT EXECUTE ON FUNCTION verify_auth_token(TEXT) TO anon, authenticated, service_role;
