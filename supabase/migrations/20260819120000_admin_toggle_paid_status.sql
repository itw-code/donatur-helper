-- ==============================================================================
-- Donatur Helper - Admin Toggle Paid Status Mutation RPC Migration
-- Migration File: 20260819120000_admin_toggle_paid_status.sql
-- Description: Creates admin_toggle_paid_status mutation RPC function for Admins
--              to manually mark a donor as paid/verified or reset to unpaid.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: admin_toggle_paid_status
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

    -- 3. Lock and validate donor
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

    -- 4. Update donor record
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

    -- 5. Insert audit log
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

    -- 6. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'admin_toggle_paid_status',
        'message', CASE 
            WHEN p_is_paid THEN 'Donatur berhasil ditandai telah lunas dan terverifikasi.'
            ELSE 'Status pembayaran donatur berhasil direset ke belum lunas.'
        END,
        'donor', jsonb_build_object(
            'id', v_updated_donor.id,
            'campaign_id', v_updated_donor.campaign_id,
            'name', v_updated_donor.name,
            'whatsapp', v_updated_donor.whatsapp,
            'amount_due', v_updated_donor.amount_due,
            'amount_paid', v_updated_donor.amount_paid,
            'paid', v_updated_donor.paid,
            'verified', v_updated_donor.verified
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION admin_toggle_paid_status(TEXT, TEXT, TEXT, BOOLEAN) IS 'Admin mutation RPC to manually toggle a donor payment and verification status.';

GRANT EXECUTE ON FUNCTION admin_toggle_paid_status(TEXT, TEXT, TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION admin_toggle_paid_status(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_toggle_paid_status(TEXT, TEXT, TEXT, BOOLEAN) TO service_role;
