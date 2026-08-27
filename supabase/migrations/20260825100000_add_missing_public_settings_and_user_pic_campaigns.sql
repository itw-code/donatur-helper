-- ==============================================================================
-- Donatur Helper - Missing RPC Functions Migration
-- Migration File: 20260825100000_add_missing_public_settings_and_user_pic_campaigns.sql
-- Description: Creates the two RPCs the frontend calls but that were never
--              created by any earlier migration:
--                1. get_public_settings()            -> used by getPublicSettings
--                2. get_user_pic_campaigns(p_whatsapp) -> used by getUserPicCampaigns
-- Reference implementations: Google Apps Script backend (Code.js):
--                getPublicSettings() line ~377, getUserPicCampaigns(whatsapp) line ~2129.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Function: get_public_settings
--    Returns non-secret runtime settings as camelCase JSONB matching the shape
--    the frontend expects: { enableRounding, roundTo, maxActiveCampaigns }.
--    SECURITY DEFINER so it can read app_settings despite RLS (no policy grants
--    anon direct table access; all reads go through RPC by design).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_public_settings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_enable_rounding BOOLEAN;
    v_round_to        INTEGER;
    v_max_active      INTEGER;
BEGIN
    -- app_settings.value is JSONB; cast scalar JSON to native types.
    SELECT COALESCE(s.value #>> '{}', 'true')::BOOLEAN
      INTO v_enable_rounding
      FROM app_settings s
     WHERE s.key = 'EnableRounding' AND s.is_secret = FALSE;

    SELECT NULLIF(s.value #>> '{}', '')::INTEGER
      INTO v_round_to
      FROM app_settings s
     WHERE s.key = 'RoundToNearest' AND s.is_secret = FALSE;

    SELECT NULLIF(s.value #>> '{}', '')::INTEGER
      INTO v_max_active
      FROM app_settings s
     WHERE s.key = 'MaxActiveCampaigns' AND s.is_secret = FALSE;

    RETURN jsonb_build_object(
        'enableRounding',     COALESCE(v_enable_rounding, TRUE),
        'roundTo',            COALESCE(v_round_to, 500),
        'maxActiveCampaigns', COALESCE(v_max_active, 5)
    );
END;
$$;

COMMENT ON FUNCTION get_public_settings() IS 'Returns public (non-secret) app settings for the frontend: rounding toggle, rounding unit, and max active campaigns.';

GRANT EXECUTE ON FUNCTION get_public_settings() TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 1b. Schema drift reconciliation: the LIVE project has an auth_tokens.token
--     column (plaintext token) that NO migration in this repo creates. It is
--     declared here so this function compiles against a freshly migrated DB too.
--     SECURITY NOTE: storing plaintext tokens weakens the hash-only design used
--     by generate_seamless_pic_token / admin_generate_pic_token. See report.
-- ------------------------------------------------------------------------------
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS token TEXT;

-- ------------------------------------------------------------------------------
-- 2. Function: get_user_pic_campaigns(p_whatsapp)
--    Lists all PIC campaigns belonging to a WhatsApp holder, including draft
--    tokens not yet linked to a campaign (status 'Draft'), mirroring GAS
--    getUserPicCampaigns(): tokens where role=PIC, normalized created_by matches,
--    status <> EXPIRED; archived linked campaigns are excluded entirely.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_pic_campaigns(p_whatsapp TEXT)
RETURNS TABLE (
    campaign_id     TEXT,
    target_name     TEXT,
    reason          TEXT,
    gift_amount     NUMERIC,
    status          TEXT,
    deadline        TEXT,
    token           TEXT,
    donor_count     INTEGER,
    total_collected NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        t.linked_campaign_id
            AS campaign_id,
        CASE WHEN t.linked_campaign_id IS NULL OR TRIM(t.linked_campaign_id) = ''
             THEN '(Draft Campaign Baru)'
             ELSE c.target_name END
            AS target_name,
        COALESCE(c.reason, '')
            AS reason,
        COALESCE(c.gift_amount, 0)
            AS gift_amount,
        CASE WHEN t.linked_campaign_id IS NULL OR TRIM(t.linked_campaign_id) = ''
             THEN 'Draft'
             ELSE c.status END
            AS status,
        CASE WHEN c.deadline IS NOT NULL THEN c.deadline::text ELSE '' END
            AS deadline,
        t.token
            AS token,
        COALESCE(dc.donor_count, 0)
            AS donor_count,
        COALESCE(dc.total_collected, 0)
            AS total_collected
    FROM auth_tokens t
    LEFT JOIN campaigns c
           ON c.campaign_id = t.linked_campaign_id
    LEFT JOIN LATERAL (
        SELECT COUNT(d.id)::INTEGER AS donor_count,
               COALESCE(SUM(d.amount_paid) FILTER (WHERE d.paid IS TRUE), 0)::NUMERIC AS total_collected
        FROM donors d
        WHERE d.campaign_id = t.linked_campaign_id
    ) dc ON TRUE
    WHERE UPPER(t.role) = 'PIC'
      AND normalize_whatsapp(t.created_by) = normalize_whatsapp(p_whatsapp)
      AND UPPER(t.status) <> 'EXPIRED'
      AND (t.linked_campaign_id IS NULL OR TRIM(t.linked_campaign_id) = ''
           OR UPPER(c.status) <> 'ARCHIVED')
    ORDER BY CASE WHEN c.campaign_id IS NULL THEN 0 ELSE 1 END, c.created_at DESC;
$$;

COMMENT ON FUNCTION get_user_pic_campaigns(TEXT) IS 'Lists PIC campaigns (plus unlinked draft tokens) for a WhatsApp number, with donor counts and collected totals.';

GRANT EXECUTE ON FUNCTION get_user_pic_campaigns(TEXT) TO anon, authenticated, service_role;
