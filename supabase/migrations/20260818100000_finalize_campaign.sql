-- ==============================================================================
-- Donatur Helper - Finalize Campaign Mutation RPC Migration
-- Migration File: 20260818100000_finalize_campaign.sql
-- Description: Creates finalize_campaign mutation RPC function for PICs to lock
--              and finalize donation campaigns, capture bank details, compute and
--              balance individual donor obligations with rounding rules,
--              atomically update pledged donors, and record audit trails.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: finalize_campaign
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finalize_campaign(
    p_token TEXT,
    p_bank_name TEXT,
    p_bank_account TEXT,
    p_account_holder TEXT,
    p_final_gift_amount NUMERIC,
    p_gift_link TEXT DEFAULT NULL,
    p_gift_image TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_campaign RECORD;
    v_updated_campaign RECORD;
    v_clean_bank_name TEXT;
    v_clean_bank_account TEXT;
    v_clean_account_holder TEXT;
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

    -- 2. Token authentication and status check
    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE'
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid.'
        );
    END IF;

    -- 3. Token role check
    IF v_auth.role <> 'PIC' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token ini bukan token PIC.'
        );
    END IF;

    -- 4. Check if token is linked to a campaign
    IF v_auth.linked_campaign_id IS NULL OR TRIM(v_auth.linked_campaign_id) = '' THEN
        RETURN jsonb_build_object(
            'error', 'token_not_linked',
            'message', 'Token PIC ini belum terhubung ke campaign.'
        );
    END IF;

    -- 5. Input validation
    v_clean_bank_name := NULLIF(TRIM(p_bank_name), '');
    IF v_clean_bank_name IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nama bank tidak boleh kosong.'
        );
    END IF;

    v_clean_bank_account := NULLIF(TRIM(p_bank_account), '');
    IF v_clean_bank_account IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor rekening tidak boleh kosong.'
        );
    END IF;

    v_clean_account_holder := NULLIF(TRIM(p_account_holder), '');
    IF v_clean_account_holder IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nama pemilik rekening tidak boleh kosong.'
        );
    END IF;

    IF p_final_gift_amount IS NULL OR p_final_gift_amount <= 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nominal hadiah akhir harus lebih besar dari nol.'
        );
    END IF;

    -- 6. Advisory lock and campaign validation
    PERFORM pg_advisory_xact_lock(hashtext('finalize_campaign:' || v_auth.linked_campaign_id));

    SELECT * INTO v_campaign
    FROM campaigns
    WHERE campaign_id = v_auth.linked_campaign_id
    FOR UPDATE;

    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Campaign tidak ditemukan.'
        );
    END IF;

    IF v_campaign.status = 'FINALIZED' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_already_finalized',
            'message', 'Campaign ini sudah difinalisasi sebelumnya.'
        );
    END IF;

    IF v_campaign.status = 'ARCHIVED' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_archived',
            'message', 'Campaign ini sudah diarsipkan dan tidak bisa difinalisasi.'
        );
    END IF;

    IF v_campaign.status NOT IN ('OPEN', 'CLOSED') THEN
        RETURN jsonb_build_object(
            'error', 'invalid_campaign_status',
            'message', 'Campaign dengan status ' || v_campaign.status || ' tidak dapat difinalisasi.'
        );
    END IF;

    -- 7. Lock pledged donors and compute split statistics
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

    -- Check if there are any pledged donors
    IF v_total_pledged = 0 THEN
        RETURN jsonb_build_object(
            'error', 'no_pledged_donors',
            'message', 'Campaign belum memiliki donatur aktif yang bisa ditagih.'
        );
    END IF;

    -- Custom donations must not exceed the target gift amount
    IF v_custom_total > p_final_gift_amount THEN
        RETURN jsonb_build_object(
            'error', 'custom_amount_exceeds_target',
            'message', 'Total donasi custom melebihi nominal hadiah akhir. Sesuaikan nominal atau donasi custom.'
        );
    END IF;

    v_remaining_amount := p_final_gift_amount - v_custom_total;

    -- Check regular donor split viability
    IF v_regular_count = 0 AND v_remaining_amount > 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_split',
            'message', 'Tidak ada donatur reguler untuk membagi sisa nominal hadiah.'
        );
    END IF;

    -- 8. Fetch rounding configuration from app_settings with campaign fallback
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

    -- 9. Compute split shares and deterministic residual correction
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
        v_delta := p_final_gift_amount - v_assigned_total;

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
            v_delta := p_final_gift_amount - v_assigned_total;
        END IF;
    ELSE
        v_exact_share := 0;
        v_regular_share := 0;
        v_regular_share_before_correction := 0;
        v_assigned_total := v_custom_total;
        v_delta := 0;
        v_delta_donor_id := NULL;
    END IF;

    -- 10. Update custom donors
    UPDATE donors
    SET
        amount_due = custom_amount,
        modified_by = COALESCE(v_auth.alias, 'PIC'),
        modified_at = NOW()
    WHERE campaign_id = v_campaign.campaign_id
      AND donor_status = 'PLEDGED'
      AND custom_amount IS NOT NULL
      AND custom_amount > 0;

    -- 11. Update regular donors with deterministic residual correction
    IF v_regular_count > 0 THEN
        UPDATE donors
        SET
            amount_due = CASE
                WHEN id = v_delta_donor_id THEN v_regular_share + v_delta
                ELSE v_regular_share
            END,
            modified_by = COALESCE(v_auth.alias, 'PIC'),
            modified_at = NOW()
        WHERE campaign_id = v_campaign.campaign_id
          AND donor_status = 'PLEDGED'
          AND (custom_amount IS NULL OR custom_amount <= 0);
    END IF;

    -- 12. Update campaign record
    UPDATE campaigns
    SET
        status = 'FINALIZED',
        finalized_at = NOW(),
        gift_amount = p_final_gift_amount,
        bank_name = v_clean_bank_name,
        bank_account = v_clean_bank_account,
        account_holder = v_clean_account_holder,
        gift_link = COALESCE(NULLIF(TRIM(p_gift_link), ''), gift_link),
        gift_image = COALESCE(NULLIF(TRIM(p_gift_image), ''), gift_image),
        rounding_used = v_enable_rounding,
        round_to = v_round_to::INTEGER,
        modified_by = COALESCE(v_auth.alias, 'PIC'),
        modified_at = NOW()
    WHERE campaign_id = v_campaign.campaign_id
    RETURNING * INTO v_updated_campaign;

    -- 13. Record audit trail
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NULL,
        'pic:' || COALESCE(v_auth.alias, ''),
        'finalize_campaign',
        'campaign',
        v_updated_campaign.campaign_id,
        jsonb_build_object(
            'campaign_id', v_updated_campaign.campaign_id,
            'final_gift_amount', p_final_gift_amount,
            'total_pledged', v_total_pledged,
            'custom_count', v_custom_count,
            'regular_count', v_regular_count,
            'custom_total', v_custom_total,
            'remaining_amount', v_remaining_amount,
            'regular_share_before_correction', v_regular_share_before_correction,
            'rounding_enabled', v_enable_rounding,
            'round_to', v_round_to
        )
    );

    -- 14. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'finalize_campaign',
        'message', 'Campaign berhasil difinalisasi.',
        'campaign', jsonb_build_object(
            'campaign_id', v_updated_campaign.campaign_id,
            'target_name', v_updated_campaign.target_name,
            'status', v_updated_campaign.status,
            'gift_amount', v_updated_campaign.gift_amount,
            'finalized_at', to_char(v_updated_campaign.finalized_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'bank_name', v_updated_campaign.bank_name,
            'account_holder', v_updated_campaign.account_holder,
            'rounding_used', v_updated_campaign.rounding_used,
            'round_to', v_updated_campaign.round_to
        ),
        'split', jsonb_build_object(
            'total_pledged', v_total_pledged,
            'custom_count', v_custom_count,
            'regular_count', v_regular_count,
            'custom_total', v_custom_total,
            'remaining_amount', v_remaining_amount,
            'regular_share', v_regular_share,
            'total_assigned', p_final_gift_amount
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION finalize_campaign(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) IS 'PIC campaign finalization and donor split calculation mutation RPC replacing legacy finalizeCampaign. Locks campaign, updates bank details, computes and balances donor obligations with rounding, updates pledged donors, and logs audit trail.';

GRANT EXECUTE ON FUNCTION finalize_campaign(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION finalize_campaign(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_campaign(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
