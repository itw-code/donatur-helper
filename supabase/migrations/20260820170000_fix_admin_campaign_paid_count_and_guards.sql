-- ==============================================================================
-- Donatur Helper - Fix Admin Campaign Paid Count & Guard Open Campaign Payments
-- Migration File: 20260820170000_fix_admin_campaign_paid_count_and_guards.sql
-- Description:
--   1. Fixes get_admin_campaigns RPC to return paid_count for each campaign.
--   2. Prevents admin_toggle_paid_status on OPEN campaigns.
--   3. Prevents admin_update_donor_paid_amount on OPEN campaigns.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Function: get_admin_campaigns (Updated with paid_count)
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

    -- 6. Fetch paginated campaign records with aggregated donor metrics, paid_count, and PIC alias
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
            COUNT(d.id) FILTER (WHERE d.paid IS TRUE)::INTEGER AS paid_count,
            COALESCE(SUM(d.amount_paid) FILTER (WHERE d.paid IS TRUE), 0)::NUMERIC AS total_collected
        FROM donors d
        WHERE d.campaign_id IN (SELECT campaign_id FROM paginated_campaigns)
          AND (d.donor_status IS NULL OR d.donor_status <> 'WITHDRAWN')
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
                'paid_count', COALESCE(cd.paid_count, 0),
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

GRANT EXECUTE ON FUNCTION get_admin_campaigns(TEXT, INTEGER, INTEGER, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_admin_campaigns(TEXT, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_campaigns(TEXT, INTEGER, INTEGER, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 2. Function: admin_toggle_paid_status (Guarded against OPEN campaigns)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_toggle_paid_status(
    p_token TEXT,
    p_campaign_id TEXT,
    p_donor_whatsapp TEXT,
    p_is_paid BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_clean_campaign_id TEXT;
    v_normalized_whatsapp TEXT;
    v_campaign RECORD;
    v_donor RECORD;
    v_updated_donor RECORD;
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
            'message', 'Hanya Admin atau SuperAdmin yang dapat mengubah status pembayaran donatur.'
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

    v_normalized_whatsapp := normalize_whatsapp(p_donor_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp donatur tidak valid.'
        );
    END IF;

    IF p_is_paid IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Status pembayaran (p_is_paid) harus ditentukan.'
        );
    END IF;

    -- 3. Check campaign status (Cannot mark paid on OPEN campaign)
    SELECT * INTO v_campaign
    FROM campaigns
    WHERE campaign_id = v_clean_campaign_id;

    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Campaign tidak ditemukan.'
        );
    END IF;

    IF p_is_paid AND v_campaign.status = 'OPEN' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_still_open',
            'message', 'Campaign masih berstatus Open. Tutup atau finalisasi campaign terlebih dahulu sebelum mengubah status pembayaran donatur.'
        );
    END IF;

    -- 4. Lock and validate donor
    SELECT * INTO v_donor
    FROM donors
    WHERE campaign_id = v_clean_campaign_id
      AND whatsapp = v_normalized_whatsapp
    FOR UPDATE;

    IF v_donor.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Donatur tidak ditemukan di campaign ini.'
        );
    END IF;

    -- 5. Update donor record
    IF p_is_paid THEN
        UPDATE donors
        SET
            paid = TRUE,
            verified = TRUE,
            amount_paid = CASE WHEN amount_paid > 0 THEN amount_paid ELSE amount_due END,
            paid_at = COALESCE(paid_at, NOW()),
            modified_by = COALESCE(v_auth.alias, 'Admin'),
            modified_at = NOW()
        WHERE id = v_donor.id
        RETURNING * INTO v_updated_donor;
    ELSE
        UPDATE donors
        SET
            paid = FALSE,
            verified = FALSE,
            modified_by = COALESCE(v_auth.alias, 'Admin'),
            modified_at = NOW()
        WHERE id = v_donor.id
        RETURNING * INTO v_updated_donor;
    END IF;

    -- 6. Insert audit log
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
        'admin_toggle_paid_status',
        'donor',
        v_clean_campaign_id || ':' || v_normalized_whatsapp,
        jsonb_build_object(
            'campaign_id', v_clean_campaign_id,
            'whatsapp', v_normalized_whatsapp,
            'new_paid_status', p_is_paid,
            'amount_paid', v_updated_donor.amount_paid,
            'amount_due', v_updated_donor.amount_due,
            'admin_alias', v_auth.alias
        )
    );

    -- 7. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'admin_toggle_paid_status',
        'message', CASE 
            WHEN p_is_paid THEN 'Donatur berhasil ditandai telah lunas dan terverifikasi.'
            ELSE 'Status pembayaran donatur berhasil direset ke belum lunas.'
        END,
        'donor', jsonb_build_object(
            'whatsapp', v_updated_donor.whatsapp,
            'name', v_updated_donor.name,
            'paid', v_updated_donor.paid,
            'verified', v_updated_donor.verified,
            'amount_paid', v_updated_donor.amount_paid
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_toggle_paid_status(TEXT, TEXT, TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION admin_toggle_paid_status(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_toggle_paid_status(TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

-- ------------------------------------------------------------------------------
-- 3. Function: admin_update_donor_paid_amount (Guarded against OPEN campaigns)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_update_donor_paid_amount(
    p_token TEXT,
    p_campaign_id TEXT,
    p_whatsapp TEXT,
    p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_clean_campaign_id TEXT;
    v_normalized_whatsapp TEXT;
    v_campaign RECORD;
    v_donor RECORD;
    v_updated_donor RECORD;
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
            'message', 'Hanya Admin atau SuperAdmin yang dapat mengubah nominal bayar donatur.'
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

    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp donatur tidak valid.'
        );
    END IF;

    IF p_amount IS NULL OR p_amount < 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nominal bayar tidak boleh bernilai negatif.'
        );
    END IF;

    -- 3. Check campaign status (Cannot adjust payment on OPEN campaign)
    SELECT * INTO v_campaign
    FROM campaigns
    WHERE campaign_id = v_clean_campaign_id;

    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Campaign tidak ditemukan.'
        );
    END IF;

    IF p_amount > 0 AND v_campaign.status = 'OPEN' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_still_open',
            'message', 'Campaign masih berstatus Open. Tutup atau finalisasi campaign terlebih dahulu sebelum memasukkan nominal pembayaran donatur.'
        );
    END IF;

    -- 4. Lock and validate donor
    SELECT * INTO v_donor
    FROM donors
    WHERE campaign_id = v_clean_campaign_id
      AND whatsapp = v_normalized_whatsapp
    FOR UPDATE;

    IF v_donor.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Donatur tidak ditemukan di campaign ini.'
        );
    END IF;

    -- 5. Update donor record
    UPDATE donors
    SET
        amount_paid = p_amount,
        paid = (p_amount > 0 AND p_amount >= amount_due),
        verified = (p_amount > 0 AND p_amount >= amount_due),
        paid_at = CASE WHEN p_amount > 0 THEN COALESCE(paid_at, NOW()) ELSE NULL END,
        modified_by = COALESCE(v_auth.alias, 'Admin'),
        modified_at = NOW()
    WHERE id = v_donor.id
    RETURNING * INTO v_updated_donor;

    -- 6. Insert audit log
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
        'admin_update_donor_paid_amount',
        'donor',
        v_clean_campaign_id || ':' || v_normalized_whatsapp,
        jsonb_build_object(
            'campaign_id', v_clean_campaign_id,
            'whatsapp', v_normalized_whatsapp,
            'new_amount_paid', p_amount,
            'old_amount_paid', v_donor.amount_paid,
            'admin_alias', v_auth.alias
        )
    );

    -- 7. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'admin_update_donor_paid_amount',
        'message', 'Nominal bayar donatur berhasil diperbarui.',
        'donor', jsonb_build_object(
            'whatsapp', v_updated_donor.whatsapp,
            'name', v_updated_donor.name,
            'amount_paid', v_updated_donor.amount_paid,
            'paid', v_updated_donor.paid,
            'verified', v_updated_donor.verified
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_donor_paid_amount(TEXT, TEXT, TEXT, NUMERIC) TO anon;
GRANT EXECUTE ON FUNCTION admin_update_donor_paid_amount(TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_donor_paid_amount(TEXT, TEXT, TEXT, NUMERIC) TO service_role;
