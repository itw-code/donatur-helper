-- ==============================================================================
-- Donatur Helper - Donor Dashboard Aggregated RPC Function Migration
-- Migration File: 20260818060000_get_donor_dashboard.sql
-- Description: Creates normalize_whatsapp helper and get_donor_dashboard RPC function
--              for donor access using WhatsApp phone number authentication.
--              Consolidates donor identity, pledge summary, joined campaigns with
--              bank details, open campaigns, and late requests into a single fast call.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Supporting Indexes for Donor WhatsApp Lookup and Late Requests
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_late_requests_donor_whatsapp ON late_requests(donor_whatsapp);

-- ------------------------------------------------------------------------------
-- 2. Function: normalize_whatsapp
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_whatsapp(p_raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    WITH cleaned AS (
        SELECT regexp_replace(COALESCE(p_raw, ''), '\D', '', 'g') AS digits
    ),
    stripped AS (
        SELECT regexp_replace(regexp_replace(digits, '^62', ''), '^0+', '') AS core
        FROM cleaned
    )
    SELECT 
        CASE 
            WHEN core IS NULL OR core = '' THEN NULL
            ELSE '+62' || core
        END
    FROM stripped;
$$;

COMMENT ON FUNCTION normalize_whatsapp(TEXT) IS 'Normalizes raw WhatsApp phone numbers to E.164 Indonesian format (+62...) by stripping non-digits, country code prefix (62), and leading zeroes.';

GRANT EXECUTE ON FUNCTION normalize_whatsapp(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION normalize_whatsapp(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION normalize_whatsapp(TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Function: get_donor_dashboard
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_donor_dashboard(p_whatsapp TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_normalized_whatsapp TEXT;
    v_member RECORD;
    v_first_donor RECORD;
    v_is_registered_member BOOLEAN;
    v_member_status TEXT;
    v_donor_name TEXT;
    v_donor_alias TEXT;
    v_masked_whatsapp TEXT;
    v_donor_exists BOOLEAN;
    v_identity JSONB;
    v_summary_record RECORD;
    v_summary JSONB;
    v_joined_campaigns JSONB;
    v_open_campaigns JSONB;
    v_my_late_requests JSONB;
BEGIN
    -- 1. Normalize input WhatsApp number
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);

    -- 2. Validate normalized phone number
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid. Silakan periksa kembali nomor Anda.'
        );
    END IF;

    -- 3. Lookup member identity
    SELECT * INTO v_member
    FROM members
    WHERE whatsapp = v_normalized_whatsapp;

    IF v_member.id IS NOT NULL THEN
        -- Member found: check if status is DELETED or REJECTED
        IF v_member.status IN ('DELETED', 'REJECTED') THEN
            RETURN jsonb_build_object(
                'error', 'not_found',
                'message', 'Data tidak ditemukan atau tidak aktif.'
            );
        END IF;

        v_is_registered_member := TRUE;
        v_member_status := v_member.status;
        v_donor_name := v_member.name;
    ELSE
        -- No member found: check if donors table has records for this phone number
        SELECT EXISTS(
            SELECT 1 FROM donors WHERE whatsapp = v_normalized_whatsapp
        ) INTO v_donor_exists;

        IF NOT v_donor_exists THEN
            RETURN jsonb_build_object(
                'error', 'not_found',
                'message', 'Data tidak ditemukan. Periksa kembali nomor WhatsApp Anda.'
            );
        END IF;

        v_is_registered_member := FALSE;
        v_member_status := NULL;
    END IF;

    -- Fetch first donor record ordered by joined_at ASC for fallback name / alias
    SELECT name, alias INTO v_first_donor
    FROM donors
    WHERE whatsapp = v_normalized_whatsapp
    ORDER BY joined_at ASC, id ASC
    LIMIT 1;

    -- Resolve name and alias
    IF v_donor_name IS NULL THEN
        v_donor_name := v_first_donor.name;
    END IF;
    v_donor_alias := v_first_donor.alias;

    -- Compute masked WhatsApp (+628112002122 -> +6281****122)
    IF length(v_normalized_whatsapp) >= 8 THEN
        v_masked_whatsapp := substr(v_normalized_whatsapp, 1, 5) || '****' || substr(v_normalized_whatsapp, length(v_normalized_whatsapp) - 2, 3);
    ELSE
        v_masked_whatsapp := '***';
    END IF;

    -- Build identity object
    v_identity := jsonb_build_object(
        'name', v_donor_name,
        'alias', v_donor_alias,
        'whatsapp_masked', v_masked_whatsapp,
        'member_status', v_member_status,
        'is_registered_member', v_is_registered_member
    );

    -- 4. Build summary object from donors where whatsapp = normalized phone
    SELECT
        COUNT(*)::INTEGER AS total_joined,
        COUNT(*) FILTER (WHERE paid = false AND donor_status = 'PLEDGED')::INTEGER AS need_payment_count,
        COUNT(*) FILTER (WHERE paid = true AND verified = false AND refunded = false)::INTEGER AS waiting_verification_count,
        COUNT(*) FILTER (WHERE paid = true AND verified = true AND refunded = false)::INTEGER AS verified_count,
        COUNT(*) FILTER (WHERE refunded = true)::INTEGER AS refunded_count,
        COUNT(*) FILTER (WHERE donor_status = 'WITHDRAWN')::INTEGER AS withdrawn_count,
        COUNT(*) FILTER (WHERE donor_status = 'CANCELLED')::INTEGER AS cancelled_count,
        COALESCE(SUM(amount_due), 0)::NUMERIC AS total_amount_due,
        COALESCE(SUM(amount_paid) FILTER (WHERE paid = true), 0)::NUMERIC AS total_amount_paid,
        COALESCE(SUM(GREATEST(amount_due - amount_paid, 0)) FILTER (WHERE donor_status = 'PLEDGED' AND paid = false), 0)::NUMERIC AS outstanding_amount
    INTO v_summary_record
    FROM donors
    WHERE whatsapp = v_normalized_whatsapp;

    v_summary := jsonb_build_object(
        'total_joined', COALESCE(v_summary_record.total_joined, 0),
        'need_payment_count', COALESCE(v_summary_record.need_payment_count, 0),
        'waiting_verification_count', COALESCE(v_summary_record.waiting_verification_count, 0),
        'verified_count', COALESCE(v_summary_record.verified_count, 0),
        'refunded_count', COALESCE(v_summary_record.refunded_count, 0),
        'withdrawn_count', COALESCE(v_summary_record.withdrawn_count, 0),
        'cancelled_count', COALESCE(v_summary_record.cancelled_count, 0),
        'total_amount_due', COALESCE(v_summary_record.total_amount_due, 0),
        'total_amount_paid', COALESCE(v_summary_record.total_amount_paid, 0),
        'outstanding_amount', COALESCE(v_summary_record.outstanding_amount, 0)
    );

    -- 5. Build joined_campaigns array
    WITH donor_campaign_data AS (
        SELECT 
            d.id AS donor_id,
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
                WHEN d.paid = true AND d.verified = false AND d.refunded = false THEN 'WAITING_VERIFICATION'
                WHEN d.paid = false AND d.donor_status = 'PLEDGED' THEN 'NEED_PAYMENT'
                WHEN d.donor_status = 'WITHDRAWN' THEN 'WITHDRAWN'
                WHEN d.donor_status = 'CANCELLED' THEN 'CANCELLED'
                ELSE 'INACTIVE'
            END AS action_group,
            c.campaign_id,
            c.target_name,
            c.reason,
            c.gift_amount,
            c.status AS campaign_status,
            c.start_date,
            c.deadline,
            c.created_at AS campaign_created_at,
            c.finalized_at,
            c.rounding_used,
            c.round_to,
            c.bank_name,
            c.bank_account,
            c.account_holder
        FROM donors d
        JOIN campaigns c ON d.campaign_id = c.campaign_id
        WHERE d.whatsapp = v_normalized_whatsapp
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'donor_id', dcd.donor_id,
                'donor_status', dcd.donor_status,
                'amount_due', dcd.amount_due,
                'custom_amount', dcd.custom_amount,
                'amount_paid', dcd.amount_paid,
                'paid', dcd.paid,
                'verified', dcd.verified,
                'refunded', dcd.refunded,
                'proof_link', dcd.proof_link,
                'proof_storage_path', dcd.proof_storage_path,
                'paid_at', to_char(dcd.paid_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'joined_at', to_char(dcd.joined_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'last_reminder_sent_at', to_char(dcd.last_reminder_sent_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'action_group', dcd.action_group,
                'campaign', jsonb_build_object(
                    'campaign_id', dcd.campaign_id,
                    'target_name', dcd.target_name,
                    'reason', dcd.reason,
                    'gift_amount', dcd.gift_amount,
                    'status', dcd.campaign_status,
                    'start_date', to_char(dcd.start_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                    'deadline', to_char(dcd.deadline AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                    'created_at', to_char(dcd.campaign_created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                    'finalized_at', to_char(dcd.finalized_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                    'rounding_used', dcd.rounding_used,
                    'round_to', dcd.round_to,
                    'bank_name', dcd.bank_name,
                    'bank_account', dcd.bank_account,
                    'account_holder', dcd.account_holder
                )
            )
        ),
        '[]'::jsonb
    )
    INTO v_joined_campaigns
    FROM (
        SELECT *
        FROM donor_campaign_data
        ORDER BY
            CASE action_group
                WHEN 'NEED_PAYMENT' THEN 1
                WHEN 'WAITING_VERIFICATION' THEN 2
                WHEN 'REFUND' THEN 3
                WHEN 'FINAL' THEN 4
                WHEN 'WITHDRAWN' THEN 5
                WHEN 'CANCELLED' THEN 6
                ELSE 7
            END,
            joined_at DESC NULLS LAST,
            donor_id ASC
    ) dcd;

    -- 6. Build open_campaigns array (OPEN status, not already joined by donor)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'campaign_id', oc.campaign_id,
                'target_name', oc.target_name,
                'reason', oc.reason,
                'gift_amount', oc.gift_amount,
                'status', oc.status,
                'start_date', to_char(oc.start_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'deadline', to_char(oc.deadline AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'gift_image', oc.gift_image,
                'gift_link', oc.gift_link
            )
        ),
        '[]'::jsonb
    )
    INTO v_open_campaigns
    FROM (
        SELECT c.*
        FROM campaigns c
        WHERE c.status = 'OPEN'
          AND NOT EXISTS (
              SELECT 1 
              FROM donors d 
              WHERE d.campaign_id = c.campaign_id 
                AND d.whatsapp = v_normalized_whatsapp
          )
        ORDER BY c.deadline ASC NULLS LAST, c.created_at DESC, c.id ASC
    ) oc;

    -- 7. Build my_late_requests array
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'request_id', mlr.request_id,
                'campaign_id', mlr.campaign_id,
                'campaign_target_name', mlr.target_name,
                'donor_alias', mlr.donor_alias,
                'is_custom', mlr.is_custom,
                'custom_amount', mlr.custom_amount,
                'reason', mlr.reason,
                'status', mlr.status,
                'created_at', to_char(mlr.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
        ),
        '[]'::jsonb
    )
    INTO v_my_late_requests
    FROM (
        SELECT 
            lr.request_id,
            lr.campaign_id,
            lr.donor_alias,
            lr.is_custom,
            lr.custom_amount,
            lr.reason,
            lr.status,
            lr.created_at,
            c.target_name
        FROM late_requests lr
        LEFT JOIN campaigns c ON lr.campaign_id = c.campaign_id
        WHERE lr.donor_whatsapp = v_normalized_whatsapp
        ORDER BY lr.created_at DESC, lr.id ASC
    ) mlr;

    -- 8. Return final JSONB response
    RETURN jsonb_build_object(
        'identity', v_identity,
        'summary', v_summary,
        'joined_campaigns', v_joined_campaigns,
        'open_campaigns', v_open_campaigns,
        'my_late_requests', v_my_late_requests,
        'server_time', to_char(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION get_donor_dashboard(TEXT) IS 'Donor dashboard aggregated RPC function using WhatsApp-only lookup with E.164 normalization. Returns donor identity, pledge summary, joined campaigns with bank details, open campaigns, and late requests.';

GRANT EXECUTE ON FUNCTION get_donor_dashboard(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_donor_dashboard(TEXT) TO authenticated;
