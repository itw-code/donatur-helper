-- ==============================================================================
-- Donatur Helper - Fix PIC Draft Token Dashboard & Plaintext Token Persistence
-- Migration File: 20261102120000_fix_pic_draft_token_dashboard_and_persistence.sql
-- Description:
--   1. Fixes get_pic_dashboard(p_token, p_page, p_page_size) so newly minted
--      unlinked draft PIC tokens (role = 'PIC', status = 'UNUSED',
--      linked_campaign_id IS NULL) return a valid unlinked response
--      (campaign: null, summary: null, donors: []) without mutating status to
--      'ACTIVE', allowing the frontend loadPicDashboard() flow to route to
--      #view-pic-create instead of failing with 'Token PIC tidak valid atau
--      tidak terhubung ke campaign.'
--   2. Guards against orphaned active tokens (status = 'ACTIVE' with
--      linked_campaign_id IS NULL), matching legacy GAS getCampaignForPic.
--   3. Updates generate_seamless_pic_token and admin_generate_pic_token to
--      persist the generated plaintext token in auth_tokens.token (consistent
--      with admin_transfer_campaign_ownership in 20260901120000), so members
--      can re-enter their PIC dashboard from the donor dashboard.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Function: get_pic_dashboard
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
    --    - If token expires_at is not null and is in the past, return unauthorized.
    IF v_auth.token_id IS NULL 
       OR v_auth.role <> 'PIC'
       OR v_auth.status NOT IN ('ACTIVE', 'UNUSED')
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid atau tidak terhubung ke campaign.'
        );
    END IF;

    -- 2b. Unlinked token handling (mirrors legacy Code.js getCampaignForPic):
    --     - If status is ACTIVE but linked_campaign_id is missing, reject as orphaned.
    --     - If status is UNUSED and linked_campaign_id is missing, return campaign: null
    --       WITHOUT promoting status to ACTIVE so the frontend opens #view-pic-create.
    IF v_auth.linked_campaign_id IS NULL OR TRIM(v_auth.linked_campaign_id) = '' THEN
        IF v_auth.status = 'ACTIVE' THEN
            RETURN jsonb_build_object(
                'error', 'orphaned_token',
                'message', 'Token ini tercatat sudah aktif tapi kehilangan link ke Campaign. Silakan hubungi Admin untuk mengecek database.'
            );
        END IF;

        v_page := GREATEST(COALESCE(p_page, 1), 1);
        v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);

        RETURN jsonb_build_object(
            'token', jsonb_build_object(
                'alias', v_auth.alias,
                'role', v_auth.role,
                'status', v_auth.status,
                'linked_campaign_id', NULL
            ),
            'campaign', NULL,
            'summary', NULL,
            'donors', '[]'::jsonb,
            'pagination', jsonb_build_object(
                'page', v_page,
                'page_size', v_page_size,
                'total_count', 0,
                'total_pages', 0
            )
        );
    END IF;

    -- 3. If linked token status is UNUSED, update it to ACTIVE during this call
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

COMMENT ON FUNCTION get_pic_dashboard(TEXT, INTEGER, INTEGER) IS 'Aggregated RPC function for the PIC dashboard. Returns token metadata, campaign information (or null for unlinked UNUSED draft tokens), summary progress metrics, and a prioritized paginated donor queue.';

GRANT EXECUTE ON FUNCTION get_pic_dashboard(TEXT, INTEGER, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION get_pic_dashboard(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pic_dashboard(TEXT, INTEGER, INTEGER) TO service_role;

-- ------------------------------------------------------------------------------
-- 2. Function: generate_seamless_pic_token (persist plaintext token in auth_tokens.token)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_seamless_pic_token(
    p_whatsapp TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_normalized_whatsapp TEXT;
    v_member RECORD;
    v_plaintext_token TEXT;
    v_token_hash TEXT;
    v_expires_at TIMESTAMPTZ;
    v_new_token RECORD;
    v_token_exists BOOLEAN;
    v_attempt INTEGER;
BEGIN
    -- 1. Normalize WhatsApp number
    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);

    -- 2. Input validation: WhatsApp number presence
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid. Silakan periksa kembali nomor Anda.'
        );
    END IF;

    -- 3. Input validation: Indonesian mobile phone format (^\+628\d{7,13}$)
    IF v_normalized_whatsapp !~ '^\+628\d{7,13}$' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp tidak valid. Gunakan nomor HP Indonesia, contoh: 0812xxxxxxx.'
        );
    END IF;

    -- 4. Concurrency control: Transaction-scoped advisory lock keyed by WhatsApp
    PERFORM pg_advisory_xact_lock(hashtext('generate_seamless_pic_token:' || v_normalized_whatsapp));

    -- 5. Member validation: Row locking and status checks
    SELECT * INTO v_member
    FROM members
    WHERE whatsapp = v_normalized_whatsapp
    FOR UPDATE;

    IF v_member.id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'not_found',
            'message', 'Nomor WhatsApp ini belum terdaftar sebagai member.'
        );
    END IF;

    IF v_member.status = 'PENDING' THEN
        RETURN jsonb_build_object(
            'error', 'member_pending',
            'message', 'Pendaftaran Anda masih menunggu persetujuan admin.'
        );
    END IF;

    IF v_member.status IN ('REJECTED', 'DELETED') THEN
        RETURN jsonb_build_object(
            'error', 'member_not_active',
            'message', 'Akun Anda tidak aktif. Silakan hubungi admin untuk bantuan lebih lanjut.'
        );
    END IF;

    IF v_member.status = 'EX' THEN
        RETURN jsonb_build_object(
            'error', 'member_alumni',
            'message', 'Alumni tidak dapat membuat campaign baru.'
        );
    END IF;

    IF v_member.status <> 'ACTIVE' THEN
        RETURN jsonb_build_object(
            'error', 'member_not_active',
            'message', 'Akun Anda tidak aktif. Silakan hubungi admin untuk bantuan lebih lanjut.'
        );
    END IF;

    -- 6. Draft token cleanup: Expire previous unused draft PIC tokens for this member
    UPDATE auth_tokens
    SET status = 'EXPIRED',
        revoked_at = NOW()
    WHERE role = 'PIC'
      AND status = 'UNUSED'
      AND linked_campaign_id IS NULL
      AND created_by = v_normalized_whatsapp;

    -- 7. Token generation: PIC-XXXXXXXX (uppercase 8-char hex from 4 random bytes)
    FOR v_attempt IN 1..5 LOOP
        v_plaintext_token := 'PIC-' || UPPER(encode(extensions.gen_random_bytes(4), 'hex'));
        v_token_hash := encode(extensions.digest(v_plaintext_token, 'sha256'), 'hex');

        SELECT EXISTS (
            SELECT 1 FROM auth_tokens WHERE token_hash = v_token_hash
        ) INTO v_token_exists;

        IF NOT v_token_exists THEN
            EXIT;
        END IF;

        IF v_attempt = 5 THEN
            RETURN jsonb_build_object(
                'error', 'token_generation_failed',
                'message', 'Gagal membuat token PIC. Silakan coba lagi.'
            );
        END IF;
    END LOOP;

    -- 8. Token insertion: Insert hashed + plaintext token with 30-day validity
    v_expires_at := NOW() + INTERVAL '30 days';

    INSERT INTO auth_tokens (
        token,
        token_hash,
        role,
        status,
        linked_campaign_id,
        alias,
        created_by,
        created_at,
        expires_at,
        revoked_at,
        last_used_at
    ) VALUES (
        v_plaintext_token,
        v_token_hash,
        'PIC',
        'UNUSED',
        NULL,
        v_member.name,
        v_normalized_whatsapp,
        NOW(),
        v_expires_at,
        NULL,
        NULL
    )
    RETURNING * INTO v_new_token;

    -- 9. Audit logging: Record action without plaintext token or token hash
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        v_member.id,
        'donor',
        'generate_seamless_pic_token',
        'auth_token',
        v_normalized_whatsapp,
        jsonb_build_object(
            'member_status', v_member.status,
            'token_role', 'PIC',
            'expires_in_days', 30
        )
    );

    -- 10. Success response: Return plaintext token
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'generate_seamless_pic_token',
        'message', 'Token PIC berhasil dibuat. Simpan token ini baik-baik.',
        'token', v_plaintext_token,
        'role', v_new_token.role,
        'status', v_new_token.status,
        'alias', v_new_token.alias,
        'expires_at', to_char(v_new_token.expires_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
END;
$$;

COMMENT ON FUNCTION generate_seamless_pic_token(TEXT) IS 'Donor-to-PIC seamless token generation mutation RPC replacing legacy generateSeamlessPicToken. Persists plaintext token in auth_tokens.token for seamless PIC dashboard re-entry.';

GRANT EXECUTE ON FUNCTION generate_seamless_pic_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION generate_seamless_pic_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_seamless_pic_token(TEXT) TO service_role;
