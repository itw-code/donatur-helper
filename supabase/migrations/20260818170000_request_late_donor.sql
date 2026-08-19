-- ==============================================================================
-- Donatur Helper - Request Late Donor Mutation RPC Migration
-- Migration File: 20260818170000_request_late_donor.sql
-- Description: Creates request_late_donor mutation RPC function for PIC, Admin,
--              or SuperAdmin to submit late pledge requests for finalized campaigns,
--              replacing legacy Google Apps Script requestLateDonor action.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: request_late_donor
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION request_late_donor(
    p_token TEXT,
    p_donor_name TEXT,
    p_donor_whatsapp TEXT,
    p_reason TEXT,
    p_is_custom BOOLEAN DEFAULT FALSE,
    p_custom_amount NUMERIC DEFAULT NULL,
    p_donor_alias TEXT DEFAULT NULL,
    p_campaign_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth RECORD;
    v_target_campaign_id TEXT;
    v_campaign RECORD;
    v_normalized_whatsapp TEXT;
    v_donor RECORD;
    v_is_custom BOOLEAN;
    v_custom_amount NUMERIC;
    v_donor_name TEXT;
    v_donor_alias TEXT;
    v_clean_reason TEXT;
    v_pic_alias TEXT;
    v_request_id TEXT;
    v_generated_id TEXT;
    v_id_exists BOOLEAN;
    v_attempt INTEGER;
    v_inserted_request RECORD;
BEGIN
    -- 1. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE'
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token tidak valid.'
        );
    END IF;

    -- 2. Role validation: Allow PIC, ADMIN, or SUPER_ADMIN
    IF v_auth.role NOT IN ('PIC', 'ADMIN', 'SUPER_ADMIN') THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token ini tidak memiliki akses untuk mengajukan donatur terlambat.'
        );
    END IF;

    -- 3. Campaign resolution
    IF v_auth.role = 'PIC' THEN
        IF v_auth.linked_campaign_id IS NULL OR TRIM(v_auth.linked_campaign_id) = '' THEN
            RETURN jsonb_build_object(
                'error', 'token_campaign_mismatch',
                'message', 'Token PIC tidak memiliki akses ke campaign ini.'
            );
        END IF;

        IF p_campaign_id IS NOT NULL 
           AND TRIM(p_campaign_id) <> '' 
           AND TRIM(p_campaign_id) <> v_auth.linked_campaign_id THEN
            RETURN jsonb_build_object(
                'error', 'token_campaign_mismatch',
                'message', 'Token PIC tidak memiliki akses ke campaign ini.'
            );
        END IF;

        v_target_campaign_id := v_auth.linked_campaign_id;
    ELSE -- ADMIN or SUPER_ADMIN
        IF p_campaign_id IS NULL OR TRIM(p_campaign_id) = '' THEN
            RETURN jsonb_build_object(
                'error', 'invalid_input',
                'message', 'Campaign tujuan tidak valid.'
            );
        END IF;

        v_target_campaign_id := TRIM(p_campaign_id);
    END IF;

    -- 4. Campaign validation: Lock campaign row
    SELECT * INTO v_campaign
    FROM campaigns
    WHERE campaign_id = v_target_campaign_id
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
            'message', 'Permintaan donatur terlambat hanya bisa diajukan setelah campaign difinalisasi.'
        );
    END IF;

    -- 5. Donor WhatsApp validation and normalization
    v_normalized_whatsapp := normalize_whatsapp(p_donor_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp donatur tidak valid.'
        );
    END IF;

    IF v_normalized_whatsapp !~ '^\+628\d{7,13}$' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp donatur tidak valid. Gunakan nomor HP Indonesia, contoh: 0812xxxxxxx.'
        );
    END IF;

    -- 6. Donor name and reason validation
    v_donor_name := TRIM(COALESCE(p_donor_name, ''));
    IF v_donor_name = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nama donatur tidak boleh kosong.'
        );
    END IF;

    v_clean_reason := TRIM(COALESCE(p_reason, ''));
    IF v_clean_reason = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Alasan permintaan donatur terlambat tidak boleh kosong.'
        );
    END IF;

    -- 7. Custom amount validation
    v_is_custom := COALESCE(p_is_custom, FALSE);
    IF v_is_custom THEN
        IF p_custom_amount IS NULL OR p_custom_amount <= 0 THEN
            RETURN jsonb_build_object(
                'error', 'invalid_input',
                'message', 'Nominal donasi custom harus lebih besar dari nol.'
            );
        END IF;
        v_custom_amount := p_custom_amount;
    ELSE
        v_custom_amount := NULL;
    END IF;

    -- 8. Existing donor validation in donors table
    SELECT * INTO v_donor
    FROM donors
    WHERE campaign_id = v_target_campaign_id
      AND whatsapp = v_normalized_whatsapp;

    IF v_donor.id IS NOT NULL THEN
        IF v_donor.donor_status = 'PLEDGED' THEN
            RETURN jsonb_build_object(
                'error', 'donor_already_pledged',
                'message', 'Nomor WhatsApp ini sudah terdaftar sebagai donatur aktif di campaign ini.'
            );
        ELSIF v_donor.donor_status IN ('WITHDRAWN', 'CANCELLED') THEN
            RETURN jsonb_build_object(
                'error', 'donor_inactive',
                'message', 'Nomor WhatsApp ini memiliki riwayat keikutsertaan yang tidak aktif di campaign ini. Silakan hubungi admin.'
            );
        END IF;
    END IF;

    -- 9. Duplicate request validation in late_requests table
    IF EXISTS (
        SELECT 1
        FROM late_requests
        WHERE campaign_id = v_target_campaign_id
          AND donor_whatsapp = v_normalized_whatsapp
          AND status = 'PENDING'
    ) THEN
        RETURN jsonb_build_object(
            'error', 'duplicate_pending_request',
            'message', 'Permintaan untuk nomor WhatsApp ini masih menunggu persetujuan admin.'
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM late_requests
        WHERE campaign_id = v_target_campaign_id
          AND donor_whatsapp = v_normalized_whatsapp
          AND status = 'APPROVED'
    ) THEN
        RETURN jsonb_build_object(
            'error', 'request_already_approved',
            'message', 'Permintaan untuk nomor WhatsApp ini sudah disetujui sebelumnya.'
        );
    END IF;

    -- 10. Generate unique request_id: REQ-XXXXXXXX (4 hex bytes)
    v_request_id := NULL;
    FOR v_attempt IN 1..5 LOOP
        v_generated_id := 'REQ-' || UPPER(encode(extensions.gen_random_bytes(4), 'hex'));

        SELECT EXISTS (
            SELECT 1 FROM late_requests WHERE request_id = v_generated_id
        ) INTO v_id_exists;

        IF NOT v_id_exists THEN
            v_request_id := v_generated_id;
            EXIT;
        END IF;
    END LOOP;

    IF v_request_id IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'internal_error',
            'message', 'Gagal membuat ID permintaan donatur terlambat. Silakan coba lagi.'
        );
    END IF;

    -- 11. Prepare donor alias and PIC alias
    v_donor_alias := NULLIF(TRIM(p_donor_alias), '');
    v_pic_alias := COALESCE(NULLIF(TRIM(v_auth.alias), ''), v_auth.role);

    -- 12. Insert late request record
    INSERT INTO late_requests (
        request_id,
        campaign_id,
        donor_name,
        donor_whatsapp,
        donor_alias,
        pic_alias,
        is_custom,
        custom_amount,
        reason,
        status,
        created_at
    ) VALUES (
        v_request_id,
        v_target_campaign_id,
        v_donor_name,
        v_normalized_whatsapp,
        v_donor_alias,
        v_pic_alias,
        v_is_custom,
        v_custom_amount,
        v_clean_reason,
        'PENDING',
        NOW()
    )
    RETURNING * INTO v_inserted_request;

    -- 13. Audit logging
    INSERT INTO audit_logs (
        actor_member_id,
        actor_description,
        action,
        entity_type,
        entity_id,
        metadata
    ) VALUES (
        NULL,
        v_auth.role || ':' || COALESCE(NULLIF(TRIM(v_auth.alias), ''), 'unknown'),
        'request_late_donor',
        'late_request',
        v_request_id,
        jsonb_build_object(
            'campaign_id', v_target_campaign_id,
            'donor_whatsapp', v_normalized_whatsapp,
            'is_custom', v_is_custom,
            'custom_amount', v_custom_amount,
            'request_status', 'PENDING'
        )
    );

    -- 14. Success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'request_late_donor',
        'message', 'Permintaan donatur terlambat berhasil diajukan dan menunggu persetujuan admin.',
        'late_request', jsonb_build_object(
            'request_id', v_inserted_request.request_id,
            'campaign_id', v_inserted_request.campaign_id,
            'donor_name', v_inserted_request.donor_name,
            'donor_alias', v_inserted_request.donor_alias,
            'is_custom', v_inserted_request.is_custom,
            'custom_amount', v_inserted_request.custom_amount,
            'status', v_inserted_request.status,
            'created_at', to_char(v_inserted_request.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION request_late_donor(TEXT, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT) IS 'Late donor request mutation RPC replacing legacy Google Apps Script requestLateDonor action. Allows PICs, Admins, and SuperAdmins to submit late pledge requests for finalized campaigns awaiting review.';

GRANT EXECUTE ON FUNCTION request_late_donor(TEXT, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION request_late_donor(TEXT, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION request_late_donor(TEXT, TEXT, TEXT, TEXT, BOOLEAN, NUMERIC, TEXT, TEXT) TO service_role;
