-- ==============================================================================
-- Donatur Helper - Admin Approve / Reject Late Donor Mutation RPC Migration
-- Migration File: 20260818180000_admin_approve_late_donor.sql
-- Description: Creates admin_approve_late_donor mutation RPC function for
--              Admins and SuperAdmins to approve or reject late donor requests,
--              recalculate campaign donor split and obligations with rounding,
--              auto-register members, and record audit logs.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Schema Enhancements: Ensure late_requests audit fields exist
-- ------------------------------------------------------------------------------
ALTER TABLE late_requests ADD COLUMN IF NOT EXISTS modified_by TEXT;
ALTER TABLE late_requests ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ;

-- ------------------------------------------------------------------------------
-- 2. Function: admin_approve_late_donor
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_approve_late_donor(
    p_token TEXT,
    p_req_id TEXT,
    p_is_approved BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_clean_req_id TEXT;
    v_late_req RECORD;
    v_campaign RECORD;
    v_normalized_whatsapp TEXT;
    v_member RECORD;
    v_member_id UUID;
    v_donor RECORD;
    v_new_custom_amount NUMERIC;
    v_initial_amount_due NUMERIC;
    v_split_stats RECORD;
    v_total_pledged INTEGER;
    v_custom_count INTEGER;
    v_regular_count INTEGER;
    v_custom_total NUMERIC;
    v_remaining_amount NUMERIC;
    v_setting_enable_rounding JSONB;
    v_setting_round_to JSONB;
    v_enable_rounding BOOLEAN;
    v_round_to NUMERIC;
    v_exact_share NUMERIC;
    v_regular_share NUMERIC;
    v_regular_share_before_correction NUMERIC;
    v_assigned_total NUMERIC;
    v_delta NUMERIC;
    v_delta_donor_id UUID;
    v_modified_by TEXT;
    v_actor_desc TEXT;
BEGIN
    -- 1. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE' 
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token admin tidak valid atau tidak aktif.'
        );
    END IF;

    -- 2. Role validation: Token role must be ADMIN or SUPER_ADMIN
    IF v_auth.role NOT IN ('ADMIN', 'SUPER_ADMIN') THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Akses ditolak. Hanya Admin atau SuperAdmin yang dapat memproses permintaan ini.'
        );
    END IF;

    -- 3. Input validation: Request ID and Approval Status
    v_clean_req_id := TRIM(COALESCE(p_req_id, ''));
    IF v_clean_req_id = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'ID permintaan tidak boleh kosong.'
        );
    END IF;

    IF p_is_approved IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Status persetujuan harus ditentukan.'
        );
    END IF;

    -- 4. Request locking and existence validation
    SELECT * INTO v_late_req
    FROM late_requests
    WHERE request_id = v_clean_req_id
    FOR UPDATE;

    IF v_late_req.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Permintaan tidak ditemukan.'
        );
    END IF;

    IF v_late_req.status <> 'PENDING' THEN
        RETURN jsonb_build_object(
            'error', 'request_already_processed',
            'message', 'Permintaan ini sudah diproses sebelumnya.'
        );
    END IF;

    -- Prepare actor descriptors for audit trails
    v_modified_by := COALESCE(NULLIF(TRIM(v_auth.alias), ''), v_auth.role);
    v_actor_desc := v_auth.role || ':' || COALESCE(NULLIF(TRIM(v_auth.alias), ''), 'unknown');

    -- 5. Rejection flow (p_is_approved = FALSE)
    IF NOT p_is_approved THEN
        UPDATE late_requests
        SET
            status = 'REJECTED',
            modified_by = v_modified_by,
            modified_at = NOW()
        WHERE id = v_late_req.id;

        -- Record audit trail
        INSERT INTO audit_logs (
            actor_member_id,
            actor_description,
            action,
            entity_type,
            entity_id,
            metadata
        ) VALUES (
            NULL,
            v_actor_desc,
            'reject_late_donor',
            'late_request',
            v_late_req.request_id,
            jsonb_build_object(
                'request_id', v_late_req.request_id,
                'campaign_id', v_late_req.campaign_id,
                'donor_name', v_late_req.donor_name,
                'donor_whatsapp', v_late_req.donor_whatsapp,
                'status', 'REJECTED'
            )
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'action', 'admin_approve_late_donor',
            'message', 'Permintaan donatur terlambat ditolak.',
            'late_request', jsonb_build_object(
                'request_id', v_late_req.request_id,
                'status', 'REJECTED'
            )
        );
    END IF;

    -- 6. Approval flow (p_is_approved = TRUE)
    -- Transaction-scoped advisory lock for campaign concurrency
    PERFORM pg_advisory_xact_lock(hashtext('admin_approve_late_donor:' || v_late_req.campaign_id));

    -- Lock campaign row
    SELECT * INTO v_campaign
    FROM campaigns
    WHERE campaign_id = v_late_req.campaign_id
    FOR UPDATE;

    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Campaign tidak ditemukan.'
        );
    END IF;

    IF v_campaign.status <> 'FINALIZED' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_not_finalized',
            'message', 'Campaign harus berstatus FINALIZED untuk menambahkan donatur terlambat.'
        );
    END IF;

    -- Normalize donor WhatsApp number
    v_normalized_whatsapp := normalize_whatsapp(v_late_req.donor_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp donatur tidak valid.'
        );
    END IF;

    -- Member auto-registration / lookup
    SELECT * INTO v_member
    FROM members
    WHERE whatsapp = v_normalized_whatsapp
    FOR UPDATE;

    IF v_member.id IS NULL THEN
        INSERT INTO members (
            name,
            whatsapp,
            status,
            role,
            added_by,
            added_at
        ) VALUES (
            v_late_req.donor_name,
            v_normalized_whatsapp,
            'ACTIVE',
            'MEMBER',
            'Late Request Approval',
            NOW()
        )
        RETURNING * INTO v_member;
    END IF;
    v_member_id := v_member.id;

    -- Determine custom donation values
    IF v_late_req.is_custom AND v_late_req.custom_amount IS NOT NULL AND v_late_req.custom_amount > 0 THEN
        v_new_custom_amount := v_late_req.custom_amount;
        v_initial_amount_due := v_late_req.custom_amount;
    ELSE
        v_new_custom_amount := NULL;
        v_initial_amount_due := 0;
    END IF;

    -- Donor duplicate check & upsert / reactivate
    SELECT * INTO v_donor
    FROM donors
    WHERE campaign_id = v_campaign.campaign_id
      AND whatsapp = v_normalized_whatsapp
    FOR UPDATE;

    IF v_donor.id IS NOT NULL THEN
        IF v_donor.donor_status = 'PLEDGED' THEN
            UPDATE late_requests
            SET
                status = 'DUPLICATE',
                modified_by = v_modified_by,
                modified_at = NOW()
            WHERE id = v_late_req.id;

            RETURN jsonb_build_object(
                'error', 'donor_already_pledged',
                'message', 'Nomor WhatsApp ini sudah terdaftar sebagai donatur aktif di campaign ini.'
            );
        ELSIF v_donor.donor_status IN ('WITHDRAWN', 'CANCELLED') THEN
            UPDATE donors
            SET
                member_id = COALESCE(v_donor.member_id, v_member_id),
                name = v_late_req.donor_name,
                alias = COALESCE(NULLIF(TRIM(v_late_req.donor_alias), ''), v_donor.alias),
                donor_status = 'PLEDGED',
                custom_amount = v_new_custom_amount,
                amount_due = v_initial_amount_due,
                amount_paid = 0,
                paid = FALSE,
                verified = FALSE,
                refunded = FALSE,
                proof_link = NULL,
                proof_storage_path = NULL,
                paid_at = NULL,
                modified_by = v_modified_by,
                modified_at = NOW()
            WHERE id = v_donor.id;
        END IF;
    ELSE
        INSERT INTO donors (
            campaign_id,
            member_id,
            name,
            whatsapp,
            alias,
            donor_status,
            amount_due,
            custom_amount,
            amount_paid,
            paid,
            verified,
            refunded,
            joined_at,
            modified_by,
            modified_at
        ) VALUES (
            v_campaign.campaign_id,
            v_member_id,
            v_late_req.donor_name,
            v_normalized_whatsapp,
            NULLIF(TRIM(v_late_req.donor_alias), ''),
            'PLEDGED',
            v_initial_amount_due,
            v_new_custom_amount,
            0,
            FALSE,
            FALSE,
            FALSE,
            NOW(),
            v_modified_by,
            NOW()
        );
    END IF;

    -- 7. Recalculate Campaign Split (CRITICAL MATH)
    PERFORM 1
    FROM donors
    WHERE campaign_id = v_campaign.campaign_id
      AND donor_status = 'PLEDGED'
    FOR UPDATE;

    SELECT
        COUNT(*)::INTEGER AS total_pledged,
        COUNT(*) FILTER (WHERE custom_amount IS NOT NULL AND custom_amount > 0)::INTEGER AS custom_count,
        COUNT(*) FILTER (WHERE custom_amount IS NULL OR custom_amount <= 0)::INTEGER AS regular_count,
        COALESCE(SUM(custom_amount) FILTER (WHERE custom_amount IS NOT NULL AND custom_amount > 0), 0)::NUMERIC AS custom_total
    INTO v_split_stats
    FROM donors
    WHERE campaign_id = v_campaign.campaign_id
      AND donor_status = 'PLEDGED';

    v_total_pledged := COALESCE(v_split_stats.total_pledged, 0);
    v_custom_count := COALESCE(v_split_stats.custom_count, 0);
    v_regular_count := COALESCE(v_split_stats.regular_count, 0);
    v_custom_total := COALESCE(v_split_stats.custom_total, 0);

    -- Check custom amount does not exceed target
    IF v_custom_total > v_campaign.gift_amount THEN
        RETURN jsonb_build_object(
            'error', 'custom_amount_exceeds_target',
            'message', 'Total donasi custom melebihi nominal hadiah campaign.'
        );
    END IF;

    v_remaining_amount := v_campaign.gift_amount - v_custom_total;

    -- Check regular split viability
    IF v_regular_count = 0 AND v_remaining_amount > 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_split',
            'message', 'Tidak ada donatur reguler untuk membagi sisa nominal hadiah.'
        );
    END IF;

    -- Read rounding configuration from app_settings with campaign fallback
    SELECT value INTO v_setting_enable_rounding FROM app_settings WHERE key = 'EnableRounding';
    SELECT value INTO v_setting_round_to FROM app_settings WHERE key = 'RoundToNearest';

    IF v_setting_enable_rounding IS NOT NULL THEN
        IF jsonb_typeof(v_setting_enable_rounding) = 'boolean' THEN
            v_enable_rounding := (v_setting_enable_rounding)::BOOLEAN;
        ELSIF jsonb_typeof(v_setting_enable_rounding) = 'string' THEN
            v_enable_rounding := UPPER(v_setting_enable_rounding #>> '{}') IN ('TRUE', '1', 'YES', 'ON');
        ELSE
            v_enable_rounding := COALESCE(v_campaign.rounding_used, FALSE);
        END IF;
    ELSE
        v_enable_rounding := COALESCE(v_campaign.rounding_used, FALSE);
    END IF;

    IF v_setting_round_to IS NOT NULL THEN
        IF jsonb_typeof(v_setting_round_to) = 'number' THEN
            v_round_to := (v_setting_round_to)::NUMERIC;
        ELSIF jsonb_typeof(v_setting_round_to) = 'string' AND (v_setting_round_to #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' THEN
            v_round_to := (v_setting_round_to #>> '{}')::NUMERIC;
        ELSE
            v_round_to := COALESCE(v_campaign.round_to, 500);
        END IF;
    ELSE
        v_round_to := COALESCE(v_campaign.round_to, 500);
    END IF;

    IF v_round_to IS NULL OR v_round_to <= 0 THEN
        v_round_to := COALESCE(v_campaign.round_to, 500);
    END IF;

    -- Compute split shares and deterministic residual correction
    IF v_regular_count > 0 THEN
        v_exact_share := v_remaining_amount / v_regular_count;

        IF v_enable_rounding AND v_round_to > 1 THEN
            v_regular_share := ROUND(v_exact_share / v_round_to) * v_round_to;
            IF v_regular_share <= 0 THEN
                v_regular_share := ROUND(v_exact_share, 2);
            END IF;
        ELSE
            v_regular_share := ROUND(v_exact_share, 2);
        END IF;

        v_regular_share_before_correction := v_regular_share;

        -- Exact total correction
        v_assigned_total := v_custom_total + (v_regular_share * v_regular_count);
        v_delta := v_campaign.gift_amount - v_assigned_total;

        -- Select the last regular donor deterministically ordered by joined_at DESC, id DESC
        SELECT id INTO v_delta_donor_id
        FROM donors
        WHERE campaign_id = v_campaign.campaign_id
          AND donor_status = 'PLEDGED'
          AND (custom_amount IS NULL OR custom_amount <= 0)
        ORDER BY joined_at DESC, id DESC
        LIMIT 1;

        -- Fallback to exact_share if applying delta would make donor amount negative
        IF (v_regular_share + v_delta) < 0 THEN
            v_regular_share := ROUND(v_exact_share, 2);
            v_regular_share_before_correction := v_regular_share;
            v_assigned_total := v_custom_total + (v_regular_share * v_regular_count);
            v_delta := v_campaign.gift_amount - v_assigned_total;
        END IF;
    ELSE
        v_exact_share := 0;
        v_regular_share := 0;
        v_regular_share_before_correction := 0;
        v_assigned_total := v_custom_total;
        v_delta := 0;
        v_delta_donor_id := NULL;
    END IF;

    -- Update custom donors
    UPDATE donors
    SET
        amount_due = custom_amount,
        modified_by = v_modified_by,
        modified_at = NOW()
    WHERE campaign_id = v_campaign.campaign_id
      AND donor_status = 'PLEDGED'
      AND custom_amount IS NOT NULL
      AND custom_amount > 0;

    -- Update regular donors with deterministic residual correction
    IF v_regular_count > 0 THEN
        UPDATE donors
        SET
            amount_due = CASE
                WHEN id = v_delta_donor_id THEN v_regular_share + v_delta
                ELSE v_regular_share
            END,
            modified_by = v_modified_by,
            modified_at = NOW()
        WHERE campaign_id = v_campaign.campaign_id
          AND donor_status = 'PLEDGED'
          AND (custom_amount IS NULL OR custom_amount <= 0);
    END IF;

    -- Update late request status to APPROVED
    UPDATE late_requests
    SET
        status = 'APPROVED',
        modified_by = v_modified_by,
        modified_at = NOW()
    WHERE id = v_late_req.id;

    -- Record audit trail
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NULL,
        v_actor_desc,
        'approve_late_donor',
        'late_request',
        v_late_req.request_id,
        jsonb_build_object(
            'req_id', v_late_req.request_id,
            'campaign_id', v_campaign.campaign_id,
            'new_donor_count', v_total_pledged,
            'recalculated', TRUE,
            'custom_count', v_custom_count,
            'regular_count', v_regular_count,
            'regular_share', v_regular_share,
            'custom_total', v_custom_total
        )
    );

    -- Return success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'admin_approve_late_donor',
        'message', 'Donatur terlambat berhasil disetujui dan tagihan donatur dihitung ulang.',
        'late_request', jsonb_build_object(
            'request_id', v_late_req.request_id,
            'status', 'APPROVED'
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION admin_approve_late_donor(TEXT, TEXT, BOOLEAN) IS 'Admin mutation RPC to approve or reject late donor requests for finalized campaigns, recalculating donor split obligations with deterministic delta balancing, auto-registering members, and recording audit logs.';

GRANT EXECUTE ON FUNCTION admin_approve_late_donor(TEXT, TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION admin_approve_late_donor(TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_approve_late_donor(TEXT, TEXT, BOOLEAN) TO service_role;
