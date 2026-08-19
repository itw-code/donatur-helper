# Super Task Plan: Autonomous Supabase RPC Migration & Adapter Completion

**Generated At**: 2026-08-19  
**Execution Mode**: Single-Flow Autonomous with Strict Quality Gates  
**Status**: IN_PROGRESS  

---

## 1. Execution Overview & Gate Rules

### Quality Gates (Per RPC)
1. **Step A — Author Migration**: File named `supabase/migrations/<timestamp>_<rpc_name>.sql` using `plpgsql`, `SECURITY DEFINER`, `search_path = public`, audit logging, input validation with `normalize_whatsapp` / regex, and row locks where necessary.
2. **Step B — Apply Migration**: Run SQL migration on Supabase database via Supabase MCP `execute_sql`.
3. **Step C — Transactional Smoke Test**:
   - Run a strict, comprehensive transactional smoke test via MCP (`START TRANSACTION; ... ROLLBACK;`).
   - Test covers: Success path, Unauthorized path, Validation failure path, Idempotency/Edge path, Math correctness (where applicable).
   - Zero test data leaked (guaranteed by transactional rollback).
4. **Step D — Verification Gate**:
   - `PASS` → Log to `docs/reports/super-task-execution-log.md` and proceed to next RPC.
   - `FAIL` → Exactly one self-repair attempt. If still failing → HARD HALT.

### Halt Rules
- Gate failure after 1 repair attempt → HARD HALT.
- MCP infrastructure errors (>2) → HARD HALT.
- Wrangler authentication missing / failure → HARD HALT (do not commit/push/deploy).
- Git push rejected → HARD HALT.
- Production build failure → HARD HALT.
- Never print secrets in console, logs, or commit messages.

---

## 2. Ordered Execution Queue

### Group 1: DONOR Flow (4 RPCs)

1. **`update_member_profile`**
   - **Inventory ID**: `mut-donor-update-profile`
   - **Migration File**: `supabase/migrations/20260819010000_update_member_profile.sql`
   - **Signature**: `update_member_profile(p_whatsapp TEXT, p_name TEXT, p_email TEXT DEFAULT NULL) RETURNS JSONB`
   - **Smoke Test Outline**:
     - Insert temporary member with status `ACTIVE`.
     - Test success update of name & email.
     - Test validation failure (empty name, non-existent WhatsApp).
     - Test inactive member rejection.
     - Verify `audit_logs` record.

2. **`join_campaigns_bulk`**
   - **Inventory ID**: `mut-donor-join-bulk`
   - **Migration File**: `supabase/migrations/20260819020000_join_campaigns_bulk.sql`
   - **Signature**: `join_campaigns_bulk(p_campaign_ids TEXT[], p_name TEXT, p_whatsapp TEXT, p_custom_amount NUMERIC DEFAULT NULL, p_alias TEXT DEFAULT NULL) RETURNS JSONB`
   - **Smoke Test Outline**:
     - Insert temporary member and 2 temporary campaigns (1 OPEN, 1 CLOSED).
     - Test bulk join across multiple open campaigns.
     - Test filtering/handling of closed campaigns.
     - Test validation failure (empty campaign list, invalid WhatsApp).
     - Verify donor pledges created and `audit_logs` written.

3. **`submit_combined_payment_proof`**
   - **Inventory ID**: `mut-donor-submit-combined-proof`
   - **Migration File**: `supabase/migrations/20260819030000_submit_combined_payment_proof.sql`
   - **Signature**: `submit_combined_payment_proof(p_campaign_ids TEXT[], p_whatsapp TEXT, p_proof_storage_path TEXT, p_proof_url TEXT DEFAULT NULL) RETURNS JSONB`
   - **Smoke Test Outline**:
     - Insert temporary member, 2 FINALIZED campaigns with identical bank details, and donor pledges.
     - Test submitting single proof for multiple campaigns atomically.
     - Test rejection if campaigns have mismatched bank accounts or are not FINALIZED.
     - Verify all target donor rows updated (`paid=TRUE`, `proof_storage_path`, `paid_at`).
     - Verify `audit_logs` record.

4. **`delete_draft_pic_token`**
   - **Inventory ID**: `mut-donor-delete-draft`
   - **Migration File**: `supabase/migrations/20260819040000_delete_draft_pic_token.sql`
   - **Signature**: `delete_draft_pic_token(p_pic_token TEXT) RETURNS JSONB`
   - **Smoke Test Outline**:
     - Insert temporary unused draft PIC token (`linked_campaign_id IS NULL`, status `UNUSED`).
     - Test successful draft token deletion.
     - Test rejection if token is linked to an existing campaign.
     - Verify token removed from `auth_tokens` and audit log entry created.

---

### Group 2: PIC Flow (1 RPC)

5. **`mark_donor_refunded`**
   - **Inventory ID**: `mut-pic-mark-refunded`
   - **Migration File**: `supabase/migrations/20260819050000_mark_donor_refunded.sql`
   - **Signature**: `mark_donor_refunded(p_token TEXT, p_campaign_id TEXT, p_whatsapp TEXT) RETURNS JSONB`
   - **Smoke Test Outline**:
     - Insert temporary PIC token, campaign, and donor with overpayment (`amount_paid > amount_due`).
     - Test successful refund marking (`refunded=TRUE`).
     - Test unauthorized caller (wrong token or non-owner PIC).
     - Test validation failure when donor has not overpaid (`amount_paid <= amount_due`).
     - Verify `audit_logs` entry.

---

### Group 3: ADMIN Flow (9 RPCs)

6. **`admin_bulk_update_member_status`**
   - **Inventory ID**: `mut-admin-bulk-update-member-status`
   - **Migration File**: `supabase/migrations/20260819060000_admin_bulk_update_member_status.sql`
   - **Signature**: `admin_bulk_update_member_status(p_token TEXT, p_updates JSONB) RETURNS JSONB`
   - **Smoke Test Outline**:
     - Insert temporary ADMIN token and 2 PENDING members.
     - Test batch status update (`[{"whatsapp": "...", "status": "ACTIVE"}, ...]`).
     - Test unauthorized token (PIC token rejected).
     - Test invalid status validation.
     - Verify `audit_logs` and updated member statuses.

7. **`admin_generate_pic_token`**
   - **Inventory ID**: `mut-admin-generate-pic-token`
   - **Migration File**: `supabase/migrations/20260819070000_admin_generate_pic_token.sql`
   - **Signature**: `admin_generate_pic_token(p_token TEXT) RETURNS JSONB`
   - **Smoke Test Outline**:
     - Insert temporary ADMIN token.
     - Test generating new unlinked PIC token (`role='PIC'`, `status='UNUSED'`).
     - Test unauthorized caller.
     - Verify plaintext token returned, SHA-256 hash stored in `auth_tokens`, and audit logged.

8. **`admin_transfer_campaign_ownership`**
   - **Inventory ID**: `mut-admin-transfer-ownership`
   - **Migration File**: `supabase/migrations/20260819080000_admin_transfer_campaign_ownership.sql`
   - **Signature**: `admin_transfer_campaign_ownership(p_token TEXT, p_campaign_id TEXT, p_target_whatsapp TEXT) RETURNS JSONB`
   - **Smoke Test Outline**:
     - Insert temporary ADMIN token, campaign, old PIC token, and active target member.
     - Test transfer: expire old PIC token(s), issue new PIC token for target member.
     - Test validation failure (target member does not exist or is not ACTIVE).
     - Test unauthorized caller.
     - Verify audit trail.

9. **`admin_recalculate_campaign`**
   - **Inventory ID**: `mut-admin-recalculate-campaign`
   - **Migration File**: `supabase/migrations/20260819090000_admin_recalculate_campaign.sql`
   - **Signature**: `admin_recalculate_campaign(p_token TEXT, p_campaign_id TEXT) RETURNS JSONB`
   - **Smoke Test Outline**:
     - Insert temporary ADMIN token, FINALIZED campaign with custom & regular donors.
     - Test recalculation with rounding rules and deterministic residual correction.
     - Assert `SUM(amount_due) = gift_amount` exactly.
     - Test unauthorized caller.
     - Verify `audit_logs`.

10. **`admin_update_gift_amount`**
    - **Inventory ID**: `mut-admin-update-gift-amount`
    - **Migration File**: `supabase/migrations/20260819100000_admin_update_gift_amount.sql`
    - **Signature**: `admin_update_gift_amount(p_token TEXT, p_campaign_id TEXT, p_new_amount NUMERIC) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary ADMIN token, FINALIZED campaign, custom donor (100k) and 2 regular donors.
      - Update gift amount from 300k to 500k.
      - Assert math recalculation runs and `SUM(amount_due) = 500000` exactly.
      - Test invalid amount (<= 0 or < custom donations total).
      - Test OPEN campaign update (updates `gift_amount` without donor split recalculation).
      - Verify `audit_logs`.

11. **`admin_delete_donor`**
    - **Inventory ID**: `mut-admin-delete-donor`
    - **Migration File**: `supabase/migrations/20260819110000_admin_delete_donor.sql`
    - **Signature**: `admin_delete_donor(p_token TEXT, p_campaign_id TEXT, p_donor_whatsapp TEXT) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary ADMIN token, FINALIZED campaign with 3 donors.
      - Delete one regular donor.
      - Assert donor deleted and remaining donors rebalanced such that `SUM(amount_due) = gift_amount`.
      - Test unauthorized caller.
      - Verify `audit_logs`.

12. **`admin_toggle_paid_status`**
    - **Inventory ID**: `mut-admin-toggle-paid`
    - **Migration File**: `supabase/migrations/20260819120000_admin_toggle_paid_status.sql`
    - **Signature**: `admin_toggle_paid_status(p_token TEXT, p_campaign_id TEXT, p_donor_whatsapp TEXT, p_is_paid BOOLEAN) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary ADMIN token, campaign, and unpaid donor.
      - Toggle to paid (`p_is_paid=TRUE` -> `paid=TRUE`, `verified=TRUE`, `amount_paid=amount_due`).
      - Toggle to unpaid (`p_is_paid=FALSE` -> `paid=FALSE`, `verified=FALSE`).
      - Test unauthorized caller.
      - Verify `audit_logs`.

13. **`admin_update_donor_paid_amount`**
    - **Inventory ID**: `mut-admin-update-donor-amount`
    - **Migration File**: `supabase/migrations/20260819130000_admin_update_donor_paid_amount.sql`
    - **Signature**: `admin_update_donor_paid_amount(p_token TEXT, p_campaign_id TEXT, p_whatsapp TEXT, p_amount NUMERIC) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary ADMIN token, campaign, and donor.
      - Update paid amount to custom value.
      - Assert `amount_paid` and `custom_amount` updated.
      - Test negative amount rejection.
      - Verify `audit_logs`.

14. **`admin_set_campaign_status`**
    - **Inventory ID**: `mut-admin-set-campaign-status`
    - **Migration File**: `supabase/migrations/20260819140000_admin_set_campaign_status.sql`
    - **Signature**: `admin_set_campaign_status(p_token TEXT, p_campaign_id TEXT, p_new_status TEXT) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary ADMIN token and campaign.
      - Update status to `ARCHIVED`, `CLOSED`, `OPEN`.
      - Test invalid status rejection.
      - Test unauthorized caller.
      - Verify `audit_logs`.

---

### Group 4: SUPERADMIN Flow (9 RPCs)

15. **`superadmin_generate_admin_token`**
    - **Inventory ID**: `mut-superadmin-generate-admin-token`
    - **Migration File**: `supabase/migrations/20260819150000_superadmin_generate_admin_token.sql`
    - **Signature**: `superadmin_generate_admin_token(p_token TEXT, p_alias TEXT) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary SUPER_ADMIN token.
      - Generate new Admin token with alias.
      - Assert plaintext token returned, hash in `auth_tokens` with `role='ADMIN'`.
      - Test unauthorized caller (regular ADMIN cannot generate ADMIN token).
      - Verify `audit_logs`.

16. **`superadmin_revoke_admin_token`**
    - **Inventory ID**: `mut-superadmin-revoke-admin-token`
    - **Migration File**: `supabase/migrations/20260819160000_superadmin_revoke_admin_token.sql`
    - **Signature**: `superadmin_revoke_admin_token(p_token TEXT, p_token_id UUID) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary SUPER_ADMIN token and target ADMIN token.
      - Revoke target token (`status='REVOKED'`, `revoked_at=NOW()`).
      - Prevent revoking own active token or root SuperAdmin token.
      - Verify `audit_logs`.

17. **`superadmin_reactivate_admin_token`**
    - **Inventory ID**: `mut-superadmin-reactivate-admin-token`
    - **Migration File**: `supabase/migrations/20260819170000_superadmin_reactivate_admin_token.sql`
    - **Signature**: `superadmin_reactivate_admin_token(p_token TEXT, p_token_id UUID) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary SUPER_ADMIN token and revoked ADMIN token.
      - Reactivate token (`status='ACTIVE'`, `revoked_at=NULL`).
      - Test unauthorized caller.
      - Verify `audit_logs`.

18. **`superadmin_delete_admin_token`**
    - **Inventory ID**: `mut-superadmin-delete-admin-token`
    - **Migration File**: `supabase/migrations/20260819180000_superadmin_delete_admin_token.sql`
    - **Signature**: `superadmin_delete_admin_token(p_token TEXT, p_token_id UUID) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary SUPER_ADMIN token and target ADMIN token.
      - Hard delete token from `auth_tokens`.
      - Prevent self-deletion.
      - Verify `audit_logs`.

19. **`superadmin_assign_member_role`**
    - **Inventory ID**: `mut-superadmin-assign-member-role`
    - **Migration File**: `supabase/migrations/20260819190000_superadmin_assign_member_role.sql`
    - **Signature**: `superadmin_assign_member_role(p_token TEXT, p_whatsapp TEXT, p_new_role TEXT) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary SUPER_ADMIN token and MEMBER record.
      - Promote to `ADMIN` or demote to `MEMBER`.
      - Test role validation (`MEMBER`, `ADMIN`, `SUPER_ADMIN`).
      - Verify `members.role` updated and audit log entry created.

20. **`superadmin_add_member`**
    - **Inventory ID**: `mut-superadmin-add-member`
    - **Migration File**: `supabase/migrations/20260819200000_superadmin_add_member.sql`
    - **Signature**: `superadmin_add_member(p_token TEXT, p_name TEXT, p_whatsapp TEXT, p_status TEXT DEFAULT 'ACTIVE', p_email TEXT DEFAULT NULL) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary SUPER_ADMIN token.
      - Add new member directly with specified status.
      - Test duplicate WhatsApp validation.
      - Verify member row inserted and audit log written.

21. **`superadmin_remove_member`**
    - **Inventory ID**: `mut-superadmin-remove-member`
    - **Migration File**: `supabase/migrations/20260819210000_superadmin_remove_member.sql`
    - **Signature**: `superadmin_remove_member(p_token TEXT, p_whatsapp TEXT) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary SUPER_ADMIN token and active member.
      - Soft delete member (`status='DELETED'`).
      - Test non-existent member handling.
      - Verify `audit_logs`.

22. **`superadmin_delete_campaign`**
    - **Inventory ID**: `mut-superadmin-delete-campaign`
    - **Migration File**: `supabase/migrations/20260819220000_superadmin_delete_campaign.sql`
    - **Signature**: `superadmin_delete_campaign(p_token TEXT, p_campaign_id TEXT) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary SUPER_ADMIN token, campaign, donors, and late requests.
      - Delete campaign cascading to donors and late requests, expiring linked tokens.
      - Test unauthorized caller.
      - Verify `audit_logs`.

23. **`superadmin_update_settings`**
    - **Inventory ID**: `mut-superadmin-update-settings`
    - **Migration File**: `supabase/migrations/20260819230000_superadmin_update_settings.sql`
    - **Signature**: `superadmin_update_settings(p_token TEXT, p_settings JSONB) RETURNS JSONB`
    - **Smoke Test Outline**:
      - Insert temporary SUPER_ADMIN token.
      - Upsert key-value settings (`EnableRounding`, `RoundToNearest`, etc.).
      - Test JSON object validation.
      - Verify `app_settings` updated and audit log created.

---

### Deferred Items by Policy
- **`superadmin_sweep_archived_data`** (`mut-superadmin-sweep-archived-data`): Optional maintenance action. Cold archive partition table not yet provisioned; low risk of performance degradation at current dataset size. Keep migration in progress notice / GAS fallback in adapter.
