-- ==============================================================================
-- Donatur Helper - Admin Stage 2 Paginated RPC Functions Migration
-- Migration File: 20260818030000_get_admin_stage2.sql
-- Description: Creates paginated RPC functions for Admin Stage 2 data:
--              1. get_admin_campaigns (paginated campaign list with metrics & filtering)
--              2. get_admin_members (paginated member list with search & filtering)
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Supporting Indexes for Pagination and Filtering
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_added_at ON members(added_at DESC NULLS LAST);

-- ------------------------------------------------------------------------------
-- 2. Function: get_admin_campaigns
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_campaigns(
    p_token TEXT,
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 20,
    p_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_page INTEGER;
    v_page_size INTEGER;
    v_offset INTEGER;
    v_total_count INTEGER;
    v_total_pages INTEGER;
    v_campaigns JSONB;
BEGIN
    -- 1. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    -- 2. Authorization check: Token must exist, be ACTIVE, not expired, and belong to ADMIN or SUPER_ADMIN
    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE' 
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW())
       OR v_auth.role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token tidak valid.'
        );
    END IF;

    -- 3. Sanitize and clamp pagination arguments
    v_page := GREATEST(COALESCE(p_page, 1), 1);
    v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 50);
    v_offset := (v_page - 1) * v_page_size;

    -- 4. Calculate total record count matching optional status filter
    SELECT COUNT(*)
    INTO v_total_count
    FROM campaigns c
    WHERE (p_status IS NULL OR TRIM(p_status) = '' OR c.status = UPPER(TRIM(p_status)));

    -- 5. Calculate total pages
    v_total_pages := CASE 
        WHEN v_total_count = 0 THEN 0 
        ELSE CEIL(v_total_count::NUMERIC / v_page_size::NUMERIC)::INTEGER 
    END;

    -- 6. Fetch paginated campaign records with aggregated donor metrics and PIC alias
    WITH paginated_campaigns AS (
        SELECT c.*
        FROM campaigns c
        WHERE (p_status IS NULL OR TRIM(p_status) = '' OR c.status = UPPER(TRIM(p_status)))
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT v_page_size OFFSET v_offset
    ),
    campaign_donors AS (
        SELECT 
            d.campaign_id,
            COUNT(d.id)::INTEGER AS donor_count,
            COALESCE(SUM(d.amount_paid) FILTER (WHERE d.paid IS TRUE), 0)::NUMERIC AS total_collected
        FROM donors d
        WHERE d.campaign_id IN (SELECT campaign_id FROM paginated_campaigns)
        GROUP BY d.campaign_id
    ),
    campaign_pics AS (
        SELECT DISTINCT ON (t.linked_campaign_id)
            t.linked_campaign_id,
            COALESCE(t.alias, t.created_by) AS pic_alias
        FROM auth_tokens t
        WHERE t.role = 'PIC'
          AND t.linked_campaign_id IN (SELECT campaign_id FROM paginated_campaigns)
        ORDER BY t.linked_campaign_id, (t.status = 'ACTIVE') DESC, t.created_at DESC
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', pc.id,
                'campaign_id', pc.campaign_id,
                'target_name', pc.target_name,
                'reason', pc.reason,
                'gift_amount', pc.gift_amount,
                'status', pc.status,
                'start_date', to_char(pc.start_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'deadline', to_char(pc.deadline AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'created_at', to_char(pc.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'finalized_at', to_char(pc.finalized_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'donor_count', COALESCE(cd.donor_count, 0),
                'total_collected', COALESCE(cd.total_collected, 0),
                'pic_alias', cp.pic_alias
            )
            ORDER BY pc.created_at DESC, pc.id DESC
        ),
        '[]'::jsonb
    )
    INTO v_campaigns
    FROM paginated_campaigns pc
    LEFT JOIN campaign_donors cd ON cd.campaign_id = pc.campaign_id
    LEFT JOIN campaign_pics cp ON cp.linked_campaign_id = pc.campaign_id;

    -- 7. Return paginated JSONB response
    RETURN jsonb_build_object(
        'campaigns', v_campaigns,
        'pagination', jsonb_build_object(
            'page', v_page,
            'page_size', v_page_size,
            'total_count', v_total_count,
            'total_pages', v_total_pages
        )
    );
END;
$$;

-- Function Documentation & Permissions
COMMENT ON FUNCTION get_admin_campaigns(TEXT, INTEGER, INTEGER, TEXT) IS 'Returns a paginated list of campaigns with summary donor metrics and PIC alias for admin dashboard.';

GRANT EXECUTE ON FUNCTION get_admin_campaigns(TEXT, INTEGER, INTEGER, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_admin_campaigns(TEXT, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_campaigns(TEXT, INTEGER, INTEGER, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Function: get_admin_members
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_admin_members(
    p_token TEXT,
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 20,
    p_search TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_page INTEGER;
    v_page_size INTEGER;
    v_offset INTEGER;
    v_total_count INTEGER;
    v_total_pages INTEGER;
    v_members JSONB;
BEGIN
    -- 1. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    -- 2. Authorization check: Token must exist, be ACTIVE, not expired, and belong to ADMIN or SUPER_ADMIN
    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE' 
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW())
       OR v_auth.role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token tidak valid.'
        );
    END IF;

    -- 3. Sanitize and clamp pagination arguments
    v_page := GREATEST(COALESCE(p_page, 1), 1);
    v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 50);
    v_offset := (v_page - 1) * v_page_size;

    -- 4. Calculate total record count matching filters
    SELECT COUNT(*)
    INTO v_total_count
    FROM members m
    WHERE (p_search IS NULL OR TRIM(p_search) = '' OR m.name ILIKE ('%' || TRIM(p_search) || '%') OR m.whatsapp ILIKE ('%' || TRIM(p_search) || '%'))
      AND (p_status IS NULL OR TRIM(p_status) = '' OR m.status = UPPER(TRIM(p_status)))
      AND (p_role IS NULL OR TRIM(p_role) = '' OR m.role = UPPER(TRIM(p_role)));

    -- 5. Calculate total pages
    v_total_pages := CASE 
        WHEN v_total_count = 0 THEN 0 
        ELSE CEIL(v_total_count::NUMERIC / v_page_size::NUMERIC)::INTEGER 
    END;

    -- 6. Fetch paginated member records
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', m.id,
                'name', m.name,
                'whatsapp', m.whatsapp,
                'email', m.email,
                'status', m.status,
                'role', m.role,
                'added_by', m.added_by,
                'added_at', to_char(m.added_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
        ),
        '[]'::jsonb
    )
    INTO v_members
    FROM (
        SELECT id, name, whatsapp, email, status, role, added_by, added_at
        FROM members m
        WHERE (p_search IS NULL OR TRIM(p_search) = '' OR m.name ILIKE ('%' || TRIM(p_search) || '%') OR m.whatsapp ILIKE ('%' || TRIM(p_search) || '%'))
          AND (p_status IS NULL OR TRIM(p_status) = '' OR m.status = UPPER(TRIM(p_status)))
          AND (p_role IS NULL OR TRIM(p_role) = '' OR m.role = UPPER(TRIM(p_role)))
        ORDER BY m.added_at DESC NULLS LAST, m.id DESC
        LIMIT v_page_size OFFSET v_offset
    ) m;

    -- 7. Return paginated JSONB response
    RETURN jsonb_build_object(
        'members', v_members,
        'pagination', jsonb_build_object(
            'page', v_page,
            'page_size', v_page_size,
            'total_count', v_total_count,
            'total_pages', v_total_pages
        )
    );
END;
$$;

-- Function Documentation & Permissions
COMMENT ON FUNCTION get_admin_members(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT) IS 'Returns a paginated, searchable, and filterable list of members for admin directory.';

GRANT EXECUTE ON FUNCTION get_admin_members(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_admin_members(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_members(TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT) TO service_role;
