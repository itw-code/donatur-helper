-- ==============================================================================
-- Donatur Helper - Admin Recalculate Campaign Mutation RPC Migration
-- Migration File: 20260819090000_admin_recalculate_campaign.sql
-- Description: Creates admin_recalculate_campaign mutation RPC function for Admins
--              to recompute and balance individual donor billing obligations
--              using standard rounding and deterministic residual correction.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: admin_recalculate_campaign
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_recalculate_campaign(
    p_token TEXT,
    p_campaign_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_clean_campaign_id TEXT;
    v_campaign RECORD;
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
BEGIN
    -- 1. Authenticate token using verify_auth_token
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
            'message', 'Hanya Admin atau SuperAdmin yang dapat menghitung ulang campaign.'
        );
    END IF;

    -- 2. Validate input
    v_clean_campaign_id := NULLIF(TRIM(p_campaign_id), '');
    IF v_clean_campaign_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Campaign ID tidak valid.'
        );
    END IF;

    -- 3. Lock campaign and validate status
    PERFORM pg_advisory_xact_lock(hashtext('recalculate_campaign:' || v_clean_campaign_id));

    SELECT * INTO v_campaign
    FROM campaigns
    WHERE campaign_id = v_clean_campaign_id
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
            'message', 'Hanya campaign berstatus FINALIZED yang dapat dihitung ulang.'
        );
    END IF;

    IF v_campaign.gift_amount <= 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_gift_amount',
            'message', 'Nominal hadiah campaign tidak valid.'
        );
    END IF;

    -- 4. Lock pledged donors and compute split statistics
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

    IF v_total_pledged = 0 THEN
        RETURN jsonb_build_object(
            'error', 'no_pledged_donors',
            'message', 'Campaign tidak memiliki donatur aktif.'
        );
    END IF;

    IF v_custom_total > v_campaign.gift_amount THEN
        RETURN jsonb_build_object(
            'error', 'custom_amount_exceeds_target',
            'message', 'Total donasi custom melebihi nominal hadiah.'
        );
    END IF;

    v_remaining_amount := v_campaign.gift_amount - v_custom_total;

    IF v_regular_count = 0 AND v_remaining_amount > 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_split',
            'message', 'Tidak ada donatur reguler untuk membagi sisa nominal hadiah.'
        );
    END IF;

    -- 5. Fetch rounding configuration from app_settings with campaign fallback
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

    -- 6. Compute split shares and deterministic residual correction
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

        v_assigned_total := v_custom_total + (v_regular_share * v_regular_count);
        v_delta := v_campaign.gift_amount - v_assigned_total;

        SELECT id INTO v_delta_donor_id
        FROM donors
        WHERE campaign_id = v_campaign.campaign_id
          AND donor_status = 'PLEDGED'
          AND (custom_amount IS NULL OR custom_amount <= 0)
        ORDER BY joined_at DESC, id DESC
        LIMIT 1;

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

    -- 7. Update custom donors
    UPDATE donors
    SET
        amount_due = custom_amount,
        modified_by = COALESCE(v_auth.alias, 'Admin'),
        modified_at = NOW()
    WHERE campaign_id = v_campaign.campaign_id
      AND donor_status = 'PLEDGED'
      AND custom_amount IS NOT NULL
      AND custom_amount > 0;

    -- 8. Update regular donors with deterministic residual correction
    IF v_regular_count > 0 THEN
        UPDATE donors
        SET
            amount_due = CASE
                WHEN id = v_delta_donor_id THEN v_regular_share + v_delta
                ELSE v_regular_share
            END,
            modified_by = COALESCE(v_auth.alias, 'Admin'),
            modified_at = NOW()
        WHERE campaign_id = v_campaign.campaign_id
          AND donor_status = 'PLEDGED'
          AND (custom_amount IS NULL OR custom_amount <= 0);
    END IF;

    -- 9. Update campaign rounding state
    UPDATE campaigns
    SET
        rounding_used = v_enable_rounding,
        round_to = v_round_to::INTEGER,
        modified_by = COALESCE(v_auth.alias, 'Admin'),
        modified_at = NOW()
    WHERE campaign_id = v_campaign.campaign_id;

    -- 10. Record audit log
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
        'admin_recalculate_campaign',
        'campaign',
        v_campaign.campaign_id,
        jsonb_build_object(
            'campaign_id', v_campaign.campaign_id,
            'gift_amount', v_campaign.gift_amount,
            'total_pledged', v_total_pledged,
            'custom_count', v_custom_count,
            'regular_count', v_regular_count,
            'regular_share', v_regular_share,
            'delta', v_delta,
            'admin_alias', v_auth.alias
        )
    );

    -- 11. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'admin_recalculate_campaign',
        'message', 'Tagihan donatur berhasil dihitung ulang.',
        'campaign_id', v_campaign.campaign_id,
        'gift_amount', v_campaign.gift_amount,
        'split', jsonb_build_object(
            'total_pledged', v_total_pledged,
            'custom_count', v_custom_count,
            'regular_count', v_regular_count,
            'custom_total', v_custom_total,
            'remaining_amount', v_remaining_amount,
            'regular_share', v_regular_share,
            'total_assigned', v_campaign.gift_amount
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION admin_recalculate_campaign(TEXT, TEXT) IS 'Admin mutation RPC to recalculate and balance donor bills for finalized campaigns.';

GRANT EXECUTE ON FUNCTION admin_recalculate_campaign(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_recalculate_campaign(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_recalculate_campaign(TEXT, TEXT) TO service_role;
