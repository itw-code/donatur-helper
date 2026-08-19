-- ==============================================================================
-- Donatur Helper - Admin Dashboard Stage 1 RPC Function Migration
-- Migration File: 20260818020000_get_admin_dashboard_stage1.sql
-- Description: Aggregated RPC function for Admin dashboard Stage 1 (critical initial paint).
--              Consolidates summary metrics, pending member registrations, and
--              pending late pledge requests into a single fast Postgres call.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: get_admin_dashboard_stage1
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_dashboard_stage1(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_summary JSONB;
    v_pending_members JSONB;
    v_pending_late_requests JSONB;
BEGIN
    -- 1. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    -- 2. Authorization check: Token must exist, be ACTIVE, and belong to an ADMIN or SUPER_ADMIN
    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE' 
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW())
       OR v_auth.role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token tidak valid atau tidak memiliki akses admin.'
        );
    END IF;

    -- 3. Aggregate summary metrics (counts with COALESCE fallback to 0)
    WITH member_counts AS (
        SELECT
            COUNT(*) AS total_members,
            COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_members,
            COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_members_count
        FROM members
    ),
    campaign_counts AS (
        SELECT
            COUNT(*) AS total_campaigns,
            COUNT(*) FILTER (WHERE status = 'OPEN') AS open_campaigns
        FROM campaigns
    ),
    donor_counts AS (
        SELECT
            COUNT(*) AS total_donors,
            COUNT(*) FILTER (WHERE paid IS TRUE AND verified IS FALSE) AS unverified_donors
        FROM donors
    )
    SELECT jsonb_build_object(
        'total_members', COALESCE(m.total_members, 0),
        'active_members', COALESCE(m.active_members, 0),
        'pending_members_count', COALESCE(m.pending_members_count, 0),
        'total_campaigns', COALESCE(c.total_campaigns, 0),
        'open_campaigns', COALESCE(c.open_campaigns, 0),
        'total_donors', COALESCE(d.total_donors, 0),
        'unverified_donors', COALESCE(d.unverified_donors, 0)
    )
    INTO v_summary
    FROM member_counts m
    CROSS JOIN campaign_counts c
    CROSS JOIN donor_counts d;

    -- 4. Aggregate pending members list (max 10, newest first)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', pm.id,
                'name', pm.name,
                'whatsapp', pm.whatsapp,
                'added_at', pm.added_at
            )
        ),
        '[]'::jsonb
    )
    INTO v_pending_members
    FROM (
        SELECT id, name, whatsapp, added_at
        FROM members
        WHERE status = 'PENDING'
        ORDER BY added_at DESC
        LIMIT 10
    ) pm;

    -- 5. Aggregate pending late requests (max 10, newest first)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'request_id', plr.request_id,
                'campaign_id', plr.campaign_id,
                'donor_name', plr.donor_name,
                'donor_whatsapp', plr.donor_whatsapp,
                'reason', plr.reason,
                'created_at', plr.created_at
            )
        ),
        '[]'::jsonb
    )
    INTO v_pending_late_requests
    FROM (
        SELECT request_id, campaign_id, donor_name, donor_whatsapp, reason, created_at
        FROM late_requests
        WHERE status = 'PENDING'
        ORDER BY created_at DESC
        LIMIT 10
    ) plr;

    -- 6. Return consolidated JSONB response object
    RETURN jsonb_build_object(
        'summary', v_summary,
        'pending_members_list', v_pending_members,
        'pending_late_requests', v_pending_late_requests
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION get_admin_dashboard_stage1(TEXT) IS 'Aggregates Stage 1 metrics (summary counts, pending members, and pending late requests) for the Admin dashboard in a single fast call.';

GRANT EXECUTE ON FUNCTION get_admin_dashboard_stage1(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_admin_dashboard_stage1(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_dashboard_stage1(TEXT) TO service_role;
