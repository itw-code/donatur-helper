-- ==============================================================================
-- Donatur Helper - PIC Dashboard Aggregated RPC Function Migration
-- Migration File: 20260818040000_get_pic_dashboard.sql
-- Description: Creates get_pic_dashboard aggregated RPC function for PIC dashboard.
--              Consolidates token metadata, campaign information, summary progress
--              metrics, and prioritized paginated donor queue into a single fast call.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Supporting Indexes for PIC Donor Queue Performance
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_donors_campaign_status ON donors(campaign_id, donor_status);
CREATE INDEX IF NOT EXISTS idx_donors_campaign_queue ON donors(campaign_id, paid, verified, refunded);

-- ------------------------------------------------------------------------------
-- 2. Function: get_pic_dashboard
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_pic_dashboard(
    p_token TEXT,
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_campaign RECORD;
    v_page INTEGER;
    v_page_size INTEGER;
    v_offset INTEGER;
    v_total_count INTEGER;
    v_total_pages INTEGER;
    v_summary_record RECORD;
    v_campaign_json JSONB;
    v_summary JSONB;
    v_donors JSONB;
BEGIN
    -- 1. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    -- 2. Authorization rules:
    --    - Token must exist.
    --    - Token status must be ACTIVE or UNUSED.
    --    - Token role must be PIC.
    --    - Token linked_campaign_id must not be null.
    --    - If token expires_at is not null and is in the past, return unauthorized.
    IF v_auth.token_id IS NULL 
       OR v_auth.role <> 'PIC'
       OR v_auth.linked_campaign_id IS NULL
       OR v_auth.status NOT IN ('ACTIVE', 'UNUSED')
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid atau tidak terhubung ke campaign.'
        );
    END IF;

    -- 3. If token status is UNUSED, update it to ACTIVE during this call
    IF v_auth.status = 'UNUSED' THEN
        UPDATE auth_tokens
        SET status = 'ACTIVE'
        WHERE id = v_auth.token_id;
        v_auth.status := 'ACTIVE';
    END IF;

    -- 4. Load the linked campaign
    SELECT * INTO v_campaign
    FROM campaigns
    WHERE campaign_id = v_auth.linked_campaign_id;

    -- If campaign does not exist, return not_found
    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Campaign untuk token PIC ini tidak ditemukan.'
        );
    END IF;

    -- 5. Format campaign fields with ISO 8601 text timestamps
    v_campaign_json := jsonb_build_object(
        'id', v_campaign.id,
        'campaign_id', v_campaign.campaign_id,
        'target_name', v_campaign.target_name,
        'reason', v_campaign.reason,
        'gift_amount', v_campaign.gift_amount,
        'status', v_campaign.status,
        'start_date', to_char(v_campaign.start_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'deadline', to_char(v_campaign.deadline AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'bank_name', v_campaign.bank_name,
        'bank_account', v_campaign.bank_account,
        'account_holder', v_campaign.account_holder,
        'rounding_used', v_campaign.rounding_used,
        'round_to', v_campaign.round_to,
        'gift_link', v_campaign.gift_link,
        'gift_image', v_campaign.gift_image,
        'created_at', to_char(v_campaign.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'finalized_at', to_char(v_campaign.finalized_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );

    -- 6. Build summary counts from donors where donors.campaign_id = linked campaign
    SELECT
        COUNT(*)::INTEGER AS total_donors,
        COUNT(*) FILTER (WHERE donor_status = 'PLEDGED')::INTEGER AS active_pledges,
        COUNT(*) FILTER (WHERE paid = false AND donor_status = 'PLEDGED')::INTEGER AS pending_payment_count,
        COUNT(*) FILTER (WHERE paid = true AND verified = false AND refunded = false)::INTEGER AS proof_review_count,
        COUNT(*) FILTER (WHERE paid = true AND verified = true AND refunded = false)::INTEGER AS verified_count,
        COUNT(*) FILTER (WHERE refunded = true)::INTEGER AS refunded_count,
        COUNT(*) FILTER (WHERE donor_status = 'WITHDRAWN')::INTEGER AS withdrawn_count,
        COUNT(*) FILTER (WHERE donor_status = 'CANCELLED')::INTEGER AS cancelled_count,
        COALESCE(SUM(amount_due), 0)::NUMERIC AS total_pledged,
        COALESCE(SUM(amount_paid) FILTER (WHERE paid = true), 0)::NUMERIC AS total_paid,
        COALESCE(SUM(GREATEST(amount_due - amount_paid, 0)) FILTER (WHERE donor_status = 'PLEDGED' AND paid = false), 0)::NUMERIC AS outstanding_amount
    INTO v_summary_record
    FROM donors
    WHERE campaign_id = v_campaign.campaign_id;

    v_summary := jsonb_build_object(
        'total_donors', COALESCE(v_summary_record.total_donors, 0),
        'active_pledges', COALESCE(v_summary_record.active_pledges, 0),
        'pending_payment_count', COALESCE(v_summary_record.pending_payment_count, 0),
        'proof_review_count', COALESCE(v_summary_record.proof_review_count, 0),
        'verified_count', COALESCE(v_summary_record.verified_count, 0),
        'refunded_count', COALESCE(v_summary_record.refunded_count, 0),
        'withdrawn_count', COALESCE(v_summary_record.withdrawn_count, 0),
        'cancelled_count', COALESCE(v_summary_record.cancelled_count, 0),
        'total_pledged', COALESCE(v_summary_record.total_pledged, 0),
        'total_paid', COALESCE(v_summary_record.total_paid, 0),
        'outstanding_amount', COALESCE(v_summary_record.outstanding_amount, 0)
    );

    -- 7. Sanitize and clamp pagination arguments
    v_page := GREATEST(COALESCE(p_page, 1), 1);
    v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
    v_offset := (v_page - 1) * v_page_size;
    v_total_count := COALESCE(v_summary_record.total_donors, 0);
    v_total_pages := CASE 
        WHEN v_total_count = 0 THEN 0 
        ELSE CEIL(v_total_count::NUMERIC / v_page_size::NUMERIC)::INTEGER 
    END;

    -- 8. Fetch paginated donor records with action_group and queue priority ordering
    WITH categorized_donors AS (
        SELECT 
            d.id,
            d.name,
            d.whatsapp,
            d.alias,
            d.donor_status,
            d.amount_due,
            d.custom_amount,
            d.amount_paid,
            d.paid,
            d.verified,
            d.refunded,
            d.proof_link,
            d.proof_storage_path,
            d.paid_at,
            d.joined_at,
            d.last_reminder_sent_at,
            CASE
                WHEN d.refunded = true THEN 'REFUND'
                WHEN d.paid = true AND d.verified = true AND d.refunded = false THEN 'FINAL'
                WHEN d.paid = true AND d.verified = false AND d.refunded = false THEN 'REVIEW_PROOF'
                WHEN d.paid = false AND d.donor_status = 'PLEDGED' THEN 'REMINDER'
                ELSE 'INACTIVE'
            END AS action_group
        FROM donors d
        WHERE d.campaign_id = v_campaign.campaign_id
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', cd.id,
                'name', cd.name,
                'whatsapp', cd.whatsapp,
                'alias', cd.alias,
                'donor_status', cd.donor_status,
                'amount_due', cd.amount_due,
                'custom_amount', cd.custom_amount,
                'amount_paid', cd.amount_paid,
                'paid', cd.paid,
                'verified', cd.verified,
                'refunded', cd.refunded,
                'proof_link', cd.proof_link,
                'proof_storage_path', cd.proof_storage_path,
                'paid_at', to_char(cd.paid_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'joined_at', to_char(cd.joined_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'last_reminder_sent_at', to_char(cd.last_reminder_sent_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'action_group', cd.action_group
            )
        ),
        '[]'::jsonb
    )
    INTO v_donors
    FROM (
        SELECT *
        FROM categorized_donors cd
        ORDER BY 
            CASE cd.action_group
                WHEN 'REMINDER' THEN 1
                WHEN 'REVIEW_PROOF' THEN 2
                WHEN 'REFUND' THEN 3
                WHEN 'FINAL' THEN 4
                ELSE 5
            END,
            cd.joined_at DESC NULLS LAST,
            cd.id ASC
        LIMIT v_page_size OFFSET v_offset
    ) cd;

    -- 9. Return final JSONB response object
    RETURN jsonb_build_object(
        'token', jsonb_build_object(
            'alias', v_auth.alias,
            'role', v_auth.role,
            'status', v_auth.status
        ),
        'campaign', v_campaign_json,
        'summary', v_summary,
        'donors', v_donors,
        'pagination', jsonb_build_object(
            'page', v_page,
            'page_size', v_page_size,
            'total_count', v_total_count,
            'total_pages', v_total_pages
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION get_pic_dashboard(TEXT, INTEGER, INTEGER) IS 'Aggregated RPC function for the PIC dashboard. Returns token metadata, campaign information, summary progress metrics, and a prioritized paginated donor queue.';

GRANT EXECUTE ON FUNCTION get_pic_dashboard(TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION get_pic_dashboard(TEXT, INTEGER, INTEGER) TO authenticated;
