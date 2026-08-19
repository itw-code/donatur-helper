-- ==============================================================================
-- Donatur Helper - Mark Donor Refunded Mutation RPC Migration
-- Migration File: 20260819050000_mark_donor_refunded.sql
-- Description: Creates mark_donor_refunded mutation RPC function for PICs to mark
--              overpaid donor excess amounts as refunded/settled.
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Function: mark_donor_refunded
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_donor_refunded(
    p_token TEXT,
    p_campaign_id TEXT,
    p_whatsapp TEXT
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
    -- 1. Authenticate token using verify_auth_token
    SELECT * INTO v_auth FROM verify_auth_token(p_token);

    IF v_auth.token_id IS NULL 
       OR v_auth.status <> 'ACTIVE'
       OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token PIC tidak valid.'
        );
    END IF;

    IF v_auth.role <> 'PIC' THEN
        RETURN jsonb_build_object(
            'error', 'unauthorized',
            'message', 'Token ini bukan token PIC.'
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

    IF v_auth.linked_campaign_id <> v_clean_campaign_id THEN
        RETURN jsonb_build_object(
            'error', 'forbidden',
            'message', 'Token PIC ini tidak memiliki akses ke campaign yang dituju.'
        );
    END IF;

    v_normalized_whatsapp := normalize_whatsapp(p_whatsapp);
    IF v_normalized_whatsapp IS NULL OR v_normalized_whatsapp = '' THEN
        RETURN jsonb_build_object(
            'error', 'invalid_input',
            'message', 'Nomor WhatsApp donatur tidak valid.'
        );
    END IF;

    -- 3. Lock donor row
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

    -- 4. Check overpayment condition
    IF v_donor.amount_paid <= v_donor.amount_due THEN
        RETURN jsonb_build_object(
            'error', 'not_overpaid',
            'message', 'Donatur tidak memiliki kelebihan pembayaran (nominal bayar tidak melebihi tagihan).'
        );
    END IF;

    -- 5. Update donor record
    UPDATE donors
    SET
        refunded = TRUE,
        modified_by = COALESCE(v_auth.alias, 'PIC'),
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
        'pic:' || COALESCE(v_auth.alias, 'unknown'),
        'mark_donor_refunded',
        'donor',
        v_clean_campaign_id || ':' || v_normalized_whatsapp,
        jsonb_build_object(
            'campaign_id', v_clean_campaign_id,
            'whatsapp', v_normalized_whatsapp,
            'amount_due', v_updated_donor.amount_due,
            'amount_paid', v_updated_donor.amount_paid,
            'excess_refunded', (v_updated_donor.amount_paid - v_updated_donor.amount_due),
            'pic_alias', v_auth.alias
        )
    );

    -- 7. Return sanitized success response
    RETURN jsonb_build_object(
        'success', TRUE,
        'action', 'mark_donor_refunded',
        'message', 'Kelebihan pembayaran donatur berhasil ditandai telah dikembalikan.',
        'donor', jsonb_build_object(
            'id', v_updated_donor.id,
            'campaign_id', v_updated_donor.campaign_id,
            'name', v_updated_donor.name,
            'whatsapp', v_updated_donor.whatsapp,
            'amount_due', v_updated_donor.amount_due,
            'amount_paid', v_updated_donor.amount_paid,
            'refunded', v_updated_donor.refunded
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- Function Documentation & Permissions
-- ------------------------------------------------------------------------------
COMMENT ON FUNCTION mark_donor_refunded(TEXT, TEXT, TEXT) IS 'PIC mutation RPC to mark excess/overpaid donor contributions as refunded.';

GRANT EXECUTE ON FUNCTION mark_donor_refunded(TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION mark_donor_refunded(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_donor_refunded(TEXT, TEXT, TEXT) TO service_role;
