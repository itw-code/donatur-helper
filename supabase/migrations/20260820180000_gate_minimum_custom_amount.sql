-- ==============================================================================
-- Donatur Helper - Gate Minimum Custom Amount Mutation RPC Migration
-- Migration File: 20260820180000_gate_minimum_custom_amount.sql
-- Description:
--   Enforces a minimum threshold of Rp 50.000 for custom amounts in join_campaign
--   and join_campaigns_bulk to ensure fairness and consistency in gift splits.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Function: join_campaign (Updated with Rp 50.000 minimum threshold)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_campaign(
    p_campaign_id TEXT,
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
    v_clean_campaign_id TEXT;
    v_normalized_whatsapp TEXT;
    v_clean_name TEXT;
    v_clean_alias TEXT;
    v_member RECORD;
    v_member_id UUID;
    v_campaign RECORD;
    v_donor RECORD;
    v_is_update BOOLEAN;
BEGIN
    -- 1. Normalize WhatsApp number
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);

    -- 2. Validate normalized WhatsApp number
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid. Silakan periksa kembali nomor Anda.'
        );
    END IF;

    -- 3. Validate Campaign ID
    v_clean_campaign_id := TRIM(p_campaign_id);
    IF p_campaign_id IS NULL OR v_clean_campaign_id = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Campaign tidak valid.'
        );
    END IF;

    -- 4. Validate custom amount if provided (Must be >= Rp 50.000 if positive)
    IF p_custom_amount IS NOT NULL AND p_custom_amount < 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nominal donasi harus lebih besar dari nol.'
        );
    END IF;

    IF p_custom_amount IS NOT NULL AND p_custom_amount > 0 AND p_custom_amount < 50000 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_custom_amount',
            'message', 'Nominal khusus minimal Rp 50.000. Silakan masukkan minimal Rp 50.000 atau kosongkan untuk patungan rata.'
        );
    END IF;

    IF p_custom_amount = 0 THEN
        p_custom_amount := NULL;
    END IF;

    -- 5. Prepare clean name and alias
    v_clean_name := NULLIF(TRIM(p_name), '');
    v_clean_alias := NULLIF(TRIM(p_alias), '');

    -- 6. Lookup and validate member
    SELECT * INTO v_member
    FROM members
    WHERE whatsapp = v_normalized_whatsapp;

    IF v_member.id IS NOT NULL THEN
        -- Member found: check if status is DELETED or REJECTED
        IF v_member.status IN ('DELETED', 'REJECTED') THEN
            RETURN jsonb_build_object(
                'error', 'member_inactive',
                'message', 'Akun member Anda tidak aktif. Silakan hubungi admin.'
            );
        END IF;
        v_member_id := v_member.id;
        IF v_clean_name IS NULL THEN
            v_clean_name := v_member.name;
        END IF;
    ELSE
        -- Auto-register new member with PENDING status
        IF v_clean_name IS NULL THEN
            RETURN jsonb_build_object(
                'error', 'invalid_input',
                'message', 'Nama lengkap wajib diisi untuk pendaftaran donatur baru.'
            );
        END IF;

        INSERT INTO members (name, whatsapp, status, role, added_by, added_at)
        VALUES (v_clean_name, v_normalized_whatsapp, 'PENDING', 'DONOR', 'donor_self_join', NOW())
        RETURNING id INTO v_member_id;
    END IF;

    -- 7. Validate and lock campaign
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

    IF v_campaign.status <> 'OPEN' THEN
        RETURN jsonb_build_object(
            'error', 'campaign_closed',
            'message', 'Pendaftaran campaign ini sudah ditutup.'
        );
    END IF;

    -- 8. Check existing pledge
    SELECT * INTO v_donor
    FROM donors
    WHERE campaign_id = v_clean_campaign_id
      AND whatsapp = v_normalized_whatsapp
    FOR UPDATE;

    IF v_donor.id IS NOT NULL THEN
        -- Re-joining or updating existing record
        v_is_update := TRUE;
        UPDATE donors
        SET
            name = COALESCE(v_clean_name, name),
            alias = v_clean_alias,
            donor_status = 'PLEDGED',
            custom_amount = p_custom_amount,
            amount_due = COALESCE(p_custom_amount, 0),
            modified_by = 'donor',
            modified_at = NOW()
        WHERE id = v_donor.id
        RETURNING * INTO v_donor;
    ELSE
        -- New pledge
        v_is_update := FALSE;
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
            v_clean_campaign_id,
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
            NOW(),
            'donor',
            NOW()
        )
        RETURNING * INTO v_donor;
    END IF;

    -- 9. Insert audit log
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_member_id,
        'donor',
        'join_campaign',
        'donor',
        v_clean_campaign_id || ':' || v_normalized_whatsapp,
        jsonb_build_object(
            'campaign_id', v_clean_campaign_id,
            'custom_amount', p_custom_amount,
            'alias', v_clean_alias,
            'reactivated', v_is_update
        )
    );

    -- 10. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'join_campaign',
        'message', 'Berhasil bergabung dalam campaign.',
        'campaign_id', v_clean_campaign_id,
        'donor', jsonb_build_object(
            'id', v_donor.id,
            'name', v_donor.name,
            'alias', v_donor.alias,
            'whatsapp', v_donor.whatsapp,
            'donor_status', v_donor.donor_status,
            'amount_due', v_donor.amount_due,
            'custom_amount', v_donor.custom_amount,
            'paid', v_donor.paid,
            'verified', v_donor.verified
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION join_campaign(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION join_campaign(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION join_campaign(TEXT, TEXT, TEXT, NUMERIC, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 2. Function: join_campaigns_bulk (Updated with Rp 50.000 minimum threshold)
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

    -- 3. Validate custom amount if provided (Must be >= Rp 50.000)
    IF p_custom_amount IS NOT NULL AND p_custom_amount < 0 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nominal donasi harus lebih besar dari nol.'
        );
    END IF;

    IF p_custom_amount IS NOT NULL AND p_custom_amount > 0 AND p_custom_amount < 50000 THEN
        RETURN jsonb_build_object(
            'error', 'invalid_custom_amount',
            'message', 'Nominal khusus minimal Rp 50.000 per campaign.'
        );
    END IF;

    IF p_custom_amount = 0 THEN
        p_custom_amount := NULL;
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
                'error', 'member_inactive',
                'message', 'Akun member Anda tidak aktif.'
            );
        END IF;
        v_member_id := v_member.id;
        IF v_clean_name IS NULL THEN
            v_clean_name := v_member.name;
        END IF;
    ELSE
        IF v_clean_name IS NULL THEN
            RETURN jsonb_build_object(
                'error', 'invalid_input',
                'message', 'Nama lengkap wajib diisi untuk pendaftaran donatur baru.'
            );
        END IF;

        INSERT INTO members (name, whatsapp, status, role, added_by, added_at)
        VALUES (v_clean_name, v_normalized_whatsapp, 'PENDING', 'DONOR', 'donor_bulk_join', NOW())
        RETURNING id INTO v_member_id;
    END IF;

    -- 5. Iterate over campaigns
    FOREACH v_cid IN ARRAY p_campaign_ids LOOP
        SELECT * INTO v_campaign
        FROM campaigns
        WHERE campaign_id = TRIM(v_cid)
        FOR UPDATE;

        IF v_campaign.id IS NOT NULL AND v_campaign.status = 'OPEN' THEN
            -- Check existing donor record
            SELECT EXISTS (
                SELECT 1 FROM donors
                WHERE campaign_id = v_campaign.campaign_id
                  AND whatsapp = v_normalized_whatsapp
            ) INTO v_is_reactivated;

            IF v_is_reactivated THEN
                UPDATE donors
                SET
                    name = COALESCE(v_clean_name, name),
                    alias = v_clean_alias,
                    donor_status = 'PLEDGED',
                    custom_amount = p_custom_amount,
                    amount_due = COALESCE(p_custom_amount, 0),
                    modified_by = 'donor_bulk',
                    modified_at = NOW()
                WHERE campaign_id = v_campaign.campaign_id
                  AND whatsapp = v_normalized_whatsapp;
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
                    NOW(),
                    'donor_bulk',
                    NOW()
                );
            END IF;

            v_joined_ids := array_append(v_joined_ids, v_campaign.campaign_id);
        ELSE
            v_skipped_ids := array_append(v_skipped_ids, TRIM(v_cid));
        END IF;
    END LOOP;

    -- 6. Insert audit log
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_member_id,
        'donor',
        'join_campaigns_bulk',
        'donor',
        v_normalized_whatsapp,
        jsonb_build_object(
            'joined_campaign_ids', v_joined_ids,
            'skipped_campaign_ids', v_skipped_ids,
            'custom_amount', p_custom_amount,
            'alias', v_clean_alias
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'join_campaigns_bulk',
        'message', 'Berhasil bergabung ke ' || cardinality(v_joined_ids)::TEXT || ' campaign.',
        'joined_campaign_ids', v_joined_ids,
        'skipped_campaign_ids', v_skipped_ids
    );
END;
$$;

GRANT EXECUTE ON FUNCTION join_campaigns_bulk(TEXT[], TEXT, TEXT, NUMERIC, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION join_campaigns_bulk(TEXT[], TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION join_campaigns_bulk(TEXT[], TEXT, TEXT, NUMERIC, TEXT) TO service_role;
