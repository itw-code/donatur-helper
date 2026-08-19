-- ==============================================================================
-- Donatur Helper - SuperAdmin Dashboard Stage 1 RPC Function Migration
-- Migration File: 20260818050000_get_superadmin_dashboard_stage1.sql
-- Description: Aggregated RPC function for SuperAdmin dashboard Stage 1.
--              Consolidates operational summary metrics (members, campaigns,
--              donors, tokens, late requests, settings), pending member
--              registrations, pending late requests, masked system settings,
--              and token status transition into a single fast PostgreSQL call.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: get_superadmin_dashboard_stage1
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_superadmin_dashboard_stage1(p_token TEXT)
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
    v_settings JSONB;
BEGIN
    -- 1. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    -- 2. Authorization check:
    --    - Token must exist
    --    - Token status must be ACTIVE or UNUSED
    --    - Token role must be SUPER_ADMIN
    --    - If token expires_at is not null and is in the past, return unauthorized
    IF v_auth.token_id IS NULL 
       OR v_auth.role <> 'SUPER_ADMIN'
       OR v_auth.status NOT IN ('ACTIVE', 'UNUSED')
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token SuperAdmin tidak valid.'
        );
    END IF;

    -- 3. If token status is UNUSED, update it to ACTIVE during this call
    IF v_auth.status = 'UNUSED' THEN
        UPDATE auth_tokens
        SET status = 'ACTIVE'
        WHERE id = v_auth.token_id;
        v_auth.status := 'ACTIVE';
    END IF;

    -- 4. Build summary metrics across all system domains
    WITH member_metrics AS (
        SELECT
            COUNT(*)::INTEGER AS total_members,
            COUNT(*) FILTER (WHERE status = 'ACTIVE')::INTEGER AS active_members,
            COUNT(*) FILTER (WHERE status = 'PENDING')::INTEGER AS pending_members,
            COUNT(*) FILTER (WHERE status = 'REJECTED')::INTEGER AS rejected_members,
            COUNT(*) FILTER (WHERE status = 'DELETED')::INTEGER AS deleted_members,
            COUNT(*) FILTER (WHERE status = 'EX')::INTEGER AS ex_members,
            COUNT(*) FILTER (WHERE role IN ('ADMIN', 'SUPER_ADMIN'))::INTEGER AS admin_members
        FROM members
    ),
    campaign_metrics AS (
        SELECT
            COUNT(*)::INTEGER AS total_campaigns,
            COUNT(*) FILTER (WHERE status = 'OPEN')::INTEGER AS open_campaigns,
            COUNT(*) FILTER (WHERE status = 'CLOSED')::INTEGER AS closed_campaigns,
            COUNT(*) FILTER (WHERE status = 'FINALIZED')::INTEGER AS finalized_campaigns,
            COUNT(*) FILTER (WHERE status = 'ARCHIVED')::INTEGER AS archived_campaigns,
            COUNT(*) FILTER (WHERE status = 'OPEN' AND deadline < NOW())::INTEGER AS overdue_open_campaigns
        FROM campaigns
    ),
    donor_metrics AS (
        SELECT
            COUNT(*)::INTEGER AS total_donors,
            COUNT(*) FILTER (WHERE donor_status = 'PLEDGED')::INTEGER AS pledged_donors,
            COUNT(*) FILTER (WHERE paid = true)::INTEGER AS paid_donors,
            COUNT(*) FILTER (WHERE paid = true AND verified = true AND refunded = false)::INTEGER AS verified_donors,
            COUNT(*) FILTER (WHERE refunded = true)::INTEGER AS refunded_donors,
            COALESCE(SUM(amount_paid) FILTER (WHERE paid = true), 0)::NUMERIC AS total_paid,
            COALESCE(SUM(GREATEST(amount_due - amount_paid, 0)) FILTER (WHERE donor_status = 'PLEDGED' AND paid = false), 0)::NUMERIC AS outstanding_amount
        FROM donors
    ),
    token_metrics AS (
        SELECT
            COUNT(*)::INTEGER AS total_tokens,
            COUNT(*) FILTER (WHERE status = 'ACTIVE')::INTEGER AS active_tokens,
            COUNT(*) FILTER (WHERE status = 'UNUSED')::INTEGER AS unused_tokens,
            COUNT(*) FILTER (WHERE status = 'EXPIRED')::INTEGER AS expired_tokens,
            COUNT(*) FILTER (WHERE status = 'REVOKED')::INTEGER AS revoked_tokens,
            COUNT(*) FILTER (WHERE role = 'PIC')::INTEGER AS pic_tokens,
            COUNT(*) FILTER (WHERE role = 'ADMIN')::INTEGER AS admin_tokens,
            COUNT(*) FILTER (WHERE role = 'SUPER_ADMIN')::INTEGER AS superadmin_tokens
        FROM auth_tokens
    ),
    late_request_metrics AS (
        SELECT
            COUNT(*)::INTEGER AS total_late_requests,
            COUNT(*) FILTER (WHERE status = 'PENDING')::INTEGER AS pending_late_requests,
            COUNT(*) FILTER (WHERE status = 'APPROVED')::INTEGER AS approved_late_requests,
            COUNT(*) FILTER (WHERE status = 'REJECTED')::INTEGER AS rejected_late_requests,
            COUNT(*) FILTER (WHERE status = 'DUPLICATE')::INTEGER AS duplicate_late_requests
        FROM late_requests
    ),
    setting_metrics AS (
        SELECT
            COUNT(*)::INTEGER AS total_settings,
            COUNT(*) FILTER (WHERE is_secret = true)::INTEGER AS secret_settings
        FROM app_settings
    )
    SELECT jsonb_build_object(
        'members', jsonb_build_object(
            'total_members', COALESCE(m.total_members, 0),
            'active_members', COALESCE(m.active_members, 0),
            'pending_members', COALESCE(m.pending_members, 0),
            'rejected_members', COALESCE(m.rejected_members, 0),
            'deleted_members', COALESCE(m.deleted_members, 0),
            'ex_members', COALESCE(m.ex_members, 0),
            'admin_members', COALESCE(m.admin_members, 0)
        ),
        'campaigns', jsonb_build_object(
            'total_campaigns', COALESCE(c.total_campaigns, 0),
            'open_campaigns', COALESCE(c.open_campaigns, 0),
            'closed_campaigns', COALESCE(c.closed_campaigns, 0),
            'finalized_campaigns', COALESCE(c.finalized_campaigns, 0),
            'archived_campaigns', COALESCE(c.archived_campaigns, 0),
            'overdue_open_campaigns', COALESCE(c.overdue_open_campaigns, 0)
        ),
        'donors', jsonb_build_object(
            'total_donors', COALESCE(d.total_donors, 0),
            'pledged_donors', COALESCE(d.pledged_donors, 0),
            'paid_donors', COALESCE(d.paid_donors, 0),
            'verified_donors', COALESCE(d.verified_donors, 0),
            'refunded_donors', COALESCE(d.refunded_donors, 0),
            'total_paid', COALESCE(d.total_paid, 0),
            'outstanding_amount', COALESCE(d.outstanding_amount, 0)
        ),
        'tokens', jsonb_build_object(
            'total_tokens', COALESCE(t.total_tokens, 0),
            'active_tokens', COALESCE(t.active_tokens, 0),
            'unused_tokens', COALESCE(t.unused_tokens, 0),
            'expired_tokens', COALESCE(t.expired_tokens, 0),
            'revoked_tokens', COALESCE(t.revoked_tokens, 0),
            'pic_tokens', COALESCE(t.pic_tokens, 0),
            'admin_tokens', COALESCE(t.admin_tokens, 0),
            'superadmin_tokens', COALESCE(t.superadmin_tokens, 0)
        ),
        'late_requests', jsonb_build_object(
            'total_late_requests', COALESCE(lr.total_late_requests, 0),
            'pending_late_requests', COALESCE(lr.pending_late_requests, 0),
            'approved_late_requests', COALESCE(lr.approved_late_requests, 0),
            'rejected_late_requests', COALESCE(lr.rejected_late_requests, 0),
            'duplicate_late_requests', COALESCE(lr.duplicate_late_requests, 0)
        ),
        'settings', jsonb_build_object(
            'total_settings', COALESCE(s.total_settings, 0),
            'secret_settings', COALESCE(s.secret_settings, 0)
        )
    )
    INTO v_summary
    FROM member_metrics m
    CROSS JOIN campaign_metrics c
    CROSS JOIN donor_metrics d
    CROSS JOIN token_metrics t
    CROSS JOIN late_request_metrics lr
    CROSS JOIN setting_metrics s;

    -- 5. Aggregate pending members list (max 10, newest first)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', pm.id,
                'name', pm.name,
                'whatsapp', pm.whatsapp,
                'role', pm.role,
                'status', pm.status,
                'added_by', pm.added_by,
                'added_at', to_char(pm.added_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
        ),
        '[]'::jsonb
    )
    INTO v_pending_members
    FROM (
        SELECT id, name, whatsapp, role, status, added_by, added_at
        FROM members
        WHERE status = 'PENDING'
        ORDER BY added_at DESC NULLS LAST, id ASC
        LIMIT 10
    ) pm;

    -- 6. Aggregate pending late requests (max 10, newest first)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'request_id', plr.request_id,
                'campaign_id', plr.campaign_id,
                'donor_name', plr.donor_name,
                'donor_whatsapp', plr.donor_whatsapp,
                'reason', plr.reason,
                'status', plr.status,
                'created_at', to_char(plr.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
        ),
        '[]'::jsonb
    )
    INTO v_pending_late_requests
    FROM (
        SELECT request_id, campaign_id, donor_name, donor_whatsapp, reason, status, created_at
        FROM late_requests
        WHERE status = 'PENDING'
        ORDER BY created_at DESC, id ASC
        LIMIT 10
    ) plr;

    -- 7. Fetch system settings list (values masked if is_secret = true, ordered by key ASC)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'key', s.key,
                'value', CASE 
                    WHEN s.is_secret IS TRUE THEN '"***"'::jsonb 
                    ELSE s.value 
                END,
                'description', s.description,
                'is_secret', s.is_secret,
                'updated_at', to_char(s.updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
            ORDER BY s.key ASC
        ),
        '[]'::jsonb
    )
    INTO v_settings
    FROM (
        SELECT key, value, description, is_secret, updated_at
        FROM app_settings
        ORDER BY key ASC
    ) s;

    -- 8. Return consolidated JSONB response object
    RETURN jsonb_build_object(
        'token', jsonb_build_object(
            'alias', v_auth.alias,
            'role', v_auth.role,
            'status', v_auth.status
        ),
        'summary', v_summary,
        'pending_members_list', v_pending_members,
        'pending_late_requests', v_pending_late_requests,
        'settings', v_settings,
        'server_time', to_char(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION get_superadmin_dashboard_stage1(TEXT) IS 'Aggregated Stage 1 RPC function for SuperAdmin dashboard: returns token metadata, domain summary counts, pending members, pending late requests, and masked system settings.';

GRANT EXECUTE ON FUNCTION get_superadmin_dashboard_stage1(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_superadmin_dashboard_stage1(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_superadmin_dashboard_stage1(TEXT) TO service_role;
