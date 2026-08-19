-- ==============================================================================
-- Donatur Helper - Initial PostgreSQL Schema Migration
-- Migration File: 20260818000000_initial_schema.sql
-- Description: Creates core tables, constraints, indexes, and RLS policies
-- System: Supabase PostgreSQL
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Required PostgreSQL Extensions
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. Table: app_settings
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    is_secret BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE app_settings IS 'Global system configuration, feature toggles, and runtime parameters.';

-- ------------------------------------------------------------------------------
-- 3. Table: members
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    whatsapp TEXT NOT NULL UNIQUE,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CONSTRAINT chk_members_status CHECK (status IN ('ACTIVE', 'PENDING', 'REJECTED', 'DELETED', 'EX')),
    role TEXT NOT NULL DEFAULT 'MEMBER' CONSTRAINT chk_members_role CHECK (role IN ('MEMBER', 'ADMIN', 'SUPER_ADMIN')),
    added_by TEXT,
    added_at TIMESTAMPTZ,
    modified_by TEXT,
    modified_at TIMESTAMPTZ
);

COMMENT ON TABLE members IS 'Master directory of registered members, administrators, and contact details.';

CREATE INDEX IF NOT EXISTS idx_members_whatsapp ON members(whatsapp);
CREATE INDEX IF NOT EXISTS idx_members_role ON members(role);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- ------------------------------------------------------------------------------
-- 4. Table: campaigns
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id TEXT NOT NULL UNIQUE,
    target_name TEXT NOT NULL,
    reason TEXT,
    gift_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OPEN' CONSTRAINT chk_campaigns_status CHECK (status IN ('OPEN', 'FINALIZED', 'ARCHIVED', 'CLOSED')),
    start_date TIMESTAMPTZ,
    deadline TIMESTAMPTZ,
    bank_name TEXT,
    bank_account TEXT,
    account_holder TEXT,
    rounding_used BOOLEAN NOT NULL DEFAULT FALSE,
    round_to INTEGER NOT NULL DEFAULT 500,
    gift_link TEXT,
    gift_image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalized_at TIMESTAMPTZ,
    modified_by TEXT,
    modified_at TIMESTAMPTZ
);

COMMENT ON TABLE campaigns IS 'Donation campaigns, gift targets, bank accounts, deadlines, and lifecycle states.';

CREATE INDEX IF NOT EXISTS idx_campaigns_campaign_id ON campaigns(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_deadline ON campaigns(deadline);

-- ------------------------------------------------------------------------------
-- 5. Table: auth_tokens
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CONSTRAINT chk_auth_tokens_role CHECK (role IN ('SUPER_ADMIN', 'ADMIN', 'PIC')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CONSTRAINT chk_auth_tokens_status CHECK (status IN ('ACTIVE', 'EXPIRED', 'UNUSED', 'REVOKED')),
    linked_campaign_id TEXT REFERENCES campaigns(campaign_id) ON DELETE SET NULL,
    alias TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
);

COMMENT ON TABLE auth_tokens IS 'Hashed access tokens and role scopes for Super Admins, Admins, and Campaign PICs.';

CREATE INDEX IF NOT EXISTS idx_auth_tokens_token_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_linked_campaign_id ON auth_tokens(linked_campaign_id);

-- ------------------------------------------------------------------------------
-- 6. Table: donors
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id TEXT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    alias TEXT,
    donor_status TEXT NOT NULL DEFAULT 'PLEDGED' CONSTRAINT chk_donors_donor_status CHECK (donor_status IN ('PLEDGED', 'WITHDRAWN', 'CANCELLED')),
    amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
    custom_amount NUMERIC(12,2),
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
    paid BOOLEAN NOT NULL DEFAULT FALSE,
    proof_link TEXT,
    proof_storage_path TEXT,
    paid_at TIMESTAMPTZ,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    refunded BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_reminder_sent_at TIMESTAMPTZ,
    modified_by TEXT,
    modified_at TIMESTAMPTZ,
    CONSTRAINT uq_donors_campaign_whatsapp UNIQUE (campaign_id, whatsapp)
);

COMMENT ON TABLE donors IS 'Individual campaign pledges, obligations, payment proof references, and verifications.';

CREATE INDEX IF NOT EXISTS idx_donors_campaign_id ON donors(campaign_id);
CREATE INDEX IF NOT EXISTS idx_donors_whatsapp ON donors(whatsapp);
CREATE INDEX IF NOT EXISTS idx_donors_member_id ON donors(member_id);
CREATE INDEX IF NOT EXISTS idx_donors_paid ON donors(paid);
CREATE INDEX IF NOT EXISTS idx_donors_verified ON donors(verified);

-- ------------------------------------------------------------------------------
-- 7. Table: late_requests
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS late_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id TEXT NOT NULL UNIQUE,
    campaign_id TEXT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
    donor_name TEXT NOT NULL,
    donor_whatsapp TEXT NOT NULL,
    donor_alias TEXT,
    pic_alias TEXT,
    is_custom BOOLEAN NOT NULL DEFAULT FALSE,
    custom_amount NUMERIC(12,2),
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CONSTRAINT chk_late_requests_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'DUPLICATE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE late_requests IS 'Post-finalization pledge requests submitted by members awaiting PIC review.';

CREATE INDEX IF NOT EXISTS idx_late_requests_campaign_id ON late_requests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_late_requests_status ON late_requests(status);

-- ------------------------------------------------------------------------------
-- 8. Table: reminder_logs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminder_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id TEXT REFERENCES campaigns(campaign_id) ON DELETE SET NULL,
    donor_id UUID REFERENCES donors(id) ON DELETE SET NULL,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT 'resend',
    recipient_email TEXT,
    recipient_masked TEXT,
    status TEXT NOT NULL,
    idempotency_key TEXT UNIQUE,
    resend_message_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE reminder_logs IS 'Audit log of payment reminders and transactional notifications dispatched via Resend or messaging channels.';

CREATE INDEX IF NOT EXISTS idx_reminder_logs_campaign_id ON reminder_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_donor_id ON reminder_logs(donor_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_status ON reminder_logs(status);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_created_at ON reminder_logs(created_at);

-- ------------------------------------------------------------------------------
-- 9. Table: audit_logs
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    actor_description TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'System and administrative audit trails for compliance, trace logs, and mutation history.';

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ------------------------------------------------------------------------------
-- 10. Enable Row Level Security (RLS) on All Tables
-- ------------------------------------------------------------------------------
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
