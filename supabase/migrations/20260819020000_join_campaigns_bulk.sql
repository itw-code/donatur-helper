-- ==============================================================================
-- Donatur Helper - Join Campaigns Bulk Mutation RPC Migration
-- Migration File: 20260819020000_join_campaigns_bulk.sql
-- Description: Creates join_campaigns_bulk mutation RPC function for donors to
--              atomically join multiple open campaigns in a single transaction.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: join_campaigns_bulk
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_campaigns_bulk(
    p_campaign_ids TEXT[],
    p_name TEXT,
    p_whatsapp TEXT,
    p_custom_amount NUMERIC DEFAULT NULL,
    p_alias TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_normalized_whatsapp TEXT;
    v_clean_name TEXT;
    v_clean_alias TEXT;
    v_member RECORD;
    v_member_id UUID;
    v_cid TEXT;
    v_campaign RECORD;
    v_joined_ids TEXT[] := ARRAY[]::TEXT[];
    v_skipped_ids TEXT[] := ARRAY[]::TEXT[];
    v_is_reactivated BOOLEAN;
BEGIN
    -- 1. Normalize and validate WhatsApp
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid.'
        );
    END IF;

    -- 2. Validate Campaign IDs array
    IF p_campaign_ids IS NULL OR cardinality(p_campaign_ids) = 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Daftar campaign tidak boleh kosong.'
        );
    END IF;

    -- 3. Validate custom amount if provided
    IF p_custom_amount IS NOT NULL AND p_custom_amount <= 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nominal donasi harus lebih besar dari nol.'
        );
    END IF;

    v_clean_name := NULLIF(TRIM(p_name), '');
    v_clean_alias := NULLIF(TRIM(p_alias), '');

    -- 4. Lookup member
    SELECT * INTO v_member
    FROM members
    WHERE whatsapp = v_normalized_whatsapp;

    IF v_member.id IS NOT NULL THEN
        IF v_member.status IN ('DELETED', 'REJECTED') THEN
            RETURN jsonb_build_object(
                'error', 'member_not_active',
                'message', 'Akun Anda tidak aktif. Silakan hubungi admin.'
            );
        END IF;
        v_member_id := v_member.id;
        IF v_clean_name IS NULL THEN
            v_clean_name := v_member.name;
        END IF;
    ELSE
        v_member_id := NULL;
        IF v_clean_name IS NULL THEN
            RETURN jsonb_build_object(
                'error', 'invalid_input',
                'message', 'Nama tidak boleh kosong.'
            );
        END IF;
    END IF;

    -- 5. Iterate through each campaign and join if OPEN
    FOREACH v_cid IN ARRAY p_campaign_ids
    LOOP
        v_cid := TRIM(v_cid);
        IF v_cid IS NULL OR v_cid = '' THEN
            CONTINUE;
        END IF;

        -- Lock campaign row
        SELECT * INTO v_campaign
        FROM campaigns
        WHERE campaign_id = v_cid
        FOR UPDATE;

        IF v_campaign.id IS NULL OR v_campaign.status <> 'OPEN' THEN
            v_skipped_ids := array_append(v_skipped_ids, v_cid);
            CONTINUE;
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM donors
            WHERE campaign_id = v_campaign.campaign_id AND whatsapp = v_normalized_whatsapp
        ) INTO v_is_reactivated;

        -- Upsert donor pledge
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
            joined_at
        ) VALUES (
            v_campaign.campaign_id,
            v_member_id,
            v_clean_name,
            v_normalized_whatsapp,
            v_clean_alias,
            'PLEDGED',
            COALESCE(p_custom_amount, 0),
            p_custom_amount,
            0,
            FALSE,
            FALSE,
            FALSE,
            NOW()
        )
        ON CONFLICT (campaign_id, whatsapp) DO UPDATE
        SET
            name = EXCLUDED.name,
            alias = EXCLUDED.alias,
            custom_amount = EXCLUDED.custom_amount,
            amount_due = COALESCE(EXCLUDED.custom_amount, 0),
            donor_status = 'PLEDGED',
            member_id = COALESCE(EXCLUDED.member_id, donors.member_id),
            modified_at = NOW();

        v_joined_ids := array_append(v_joined_ids, v_campaign.campaign_id);
    END LOOP;

    IF cardinality(v_joined_ids) = 0 THEN
        RETURN jsonb_build_object(
            'error', 'no_campaigns_joined',
            'message', 'Tidak ada campaign berstatus terbuka yang dapat diikuti.',
            'skipped_campaigns', v_skipped_ids
        );
    END IF;

    -- 6. Record audit log
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_member_id,
        'donor:' || v_normalized_whatsapp,
        'join_campaigns_bulk',
        'donor',
        v_normalized_whatsapp,
        jsonb_build_object(
            'whatsapp', v_normalized_whatsapp,
            'joined_campaigns', v_joined_ids,
            'skipped_campaigns', v_skipped_ids,
            'custom_amount', p_custom_amount,
            'alias', v_clean_alias
        )
    );

    -- 7. Return success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'join_campaigns_bulk',
        'message', 'Berhasil bergabung ke ' || cardinality(v_joined_ids)::TEXT || ' campaign.',
        'joined_count', cardinality(v_joined_ids),
        'joined_campaigns', v_joined_ids,
        'skipped_campaigns', v_skipped_ids
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION join_campaigns_bulk(TEXT[], TEXT, TEXT, NUMERIC, TEXT) IS 'Pledges a donor to multiple open campaigns atomically in a single transaction.';

GRANT EXECUTE ON FUNCTION join_campaigns_bulk(TEXT[], TEXT, TEXT, NUMERIC, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION join_campaigns_bulk(TEXT[], TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION join_campaigns_bulk(TEXT[], TEXT, TEXT, NUMERIC, TEXT) TO service_role;
