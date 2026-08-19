# Incident Report: Donor Join Session Invalid Bug

- **Date**: 2026-08-20
- **Status**: ROOT CAUSE CONFIRMED
- **Impact**: Donors in production (https://don4tpro.pages.dev) can successfully log in via WhatsApp and view their dashboard, but clicking "Ikut donasi" (or other donor actions such as withdraw, proof upload, and become PIC) fails immediately with the modal alert: *"Sesi login tidak valid. Silakan login kembali."*
- **Scope**: Supabase-only mode (`BACKEND_MODE=supabase`, `ALLOW_GAS_FALLBACK=false`, `DEBUG=false`).

---

## 1. Executive Summary & Ranked Hypotheses

| Rank | Hypothesis | Likelihood | Verification Status | File / Line Evidence |
|---|---|---|---|---|
| **#1 (CONFIRMED)** | **Frontend Session Storage Omission**: `checkDonorWhatsApp` and `registerUser` responses normalized in `backendAdapter.js` do not attach the user's raw phone number (`whatsapp: wa`) to the root session object. `auth.js` saves this incomplete object to `safeSet('donor_user', ...)`. All mutation handlers in `donor.js` require `user.whatsapp`. | **100%** | **CONFIRMED** | [`js/services/backendAdapter.js:567-576`](file:///C:/Users/oneda/Projects/Donatur%20Helper/js/services/backendAdapter.js#L567-L576), [`js/views/auth.js:69`](file:///C:/Users/oneda/Projects/Donatur%20Helper/js/views/auth.js#L69), [`js/views/donor.js:618-622`](file:///C:/Users/oneda/Projects/Donatur%20Helper/js/views/donor.js#L618-L622) |
| **#2 (CONFIRMED)** | **RPC Argument Normalization Mismatches**: Several Supabase RPC calls in `backendAdapter.js` pass invalid parameter names or extra undeclared parameters (`p_is_custom` in `join_campaign`, `p_public_url` in `submit_payment_proof`, `p_storage_path`/`p_public_url` in `submit_combined_payment_proof`, extra params in `generate_seamless_pic_token`), which would cause PostgREST schema mismatch errors once the session check passed. | **100%** | **CONFIRMED** | [`js/services/backendAdapter.js:770-777`](file:///C:/Users/oneda/Projects/Donatur%20Helper/js/services/backendAdapter.js#L770-L777), [`supabase/migrations/20260818070000_join_campaign.sql:14-20`](file:///C:/Users/oneda/Projects/Donatur%20Helper/supabase/migrations/20260818070000_join_campaign.sql#L14-L20) |
| **#3 (DISPROVEN)** | **Database-Level RLS / Trigger Rejection**: Supabase RPC fails at execution time on PostgreSQL level due to security definer or missing permissions. | **0%** | **DISPROVEN** | Code analysis shows the frontend aborts synchronously at `donor.js:620` *before* sending any network request. |
| **#4 (DISPROVEN)** | **Production Bundle Drift**: Cloudflare Pages is serving stale assets or mismatched environment configuration. | **0%** | **DISPROVEN** | Public asset hash comparison confirmed 100% hash parity with local build, and live `env.local.js` has `BACKEND_MODE="supabase"`, `ALLOW_GAS_FALLBACK=false`, `DEBUG=false`. |

---

## 2. Trigger Condition & Exact Frontend Location

The alert string **`"Sesi login tidak valid. Silakan login kembali."`** is defined and triggered across 6 distinct action handlers in [`js/views/donor.js`](file:///C:/Users/oneda/Projects/Donatur%20Helper/js/views/donor.js):

```javascript
const user = JSON.parse(safeGet('donor_user') || 'null');
if (!user || !user.whatsapp) {
  showInfoModal('Sesi login tidak valid. Silakan login kembali.', 'Peringatan');
  return;
}
```

### Affected Handlers in `js/views/donor.js`

1. **Line 121 (`seamlessBecomePic`)**: Fails when donor clicks `+ Buat Campaign Baru (Jadi PIC)`.
2. **Line 405 (`submitBulkJoin`)**: Fails when donor submits bulk join.
3. **Line 620 (`joinCampaign`)**: Fails when donor clicks `Ikut donasi` on a single campaign card.
4. **Line 684 (`withdraw`)**: Fails when donor attempts to cancel / withdraw from an open campaign.
5. **Line 717 (`submitProof`)**: Fails when donor attempts to upload payment proof.
6. **Line 784 (`submitCombinedProof`)**: Fails when donor attempts to upload combined payment proof.
7. **Line 47 (`saveProfile`)**: Reads `user.whatsapp` (undefined) leading to invalid profile updates.

---

## 3. Session Contract End-to-End Trace & Write-vs-Read Matrix

### Write Flow: `js/views/auth.js`

1. User enters WhatsApp phone number `wa` in login form and clicks "Lanjut".
2. `auth.js:56` dispatches `call('checkDonorWhatsApp', wa)`.
3. `backendAdapter.js:549-576` executes `client.rpc('get_donor_dashboard', { p_whatsapp: wa })`.
4. PostgreSQL RPC `get_donor_dashboard` returns:
   ```json
   {
     "identity": {
       "name": "Budi",
       "alias": "Budi",
       "whatsapp_masked": "+6281****122",
       "member_status": "ACTIVE",
       "is_registered_member": true
     },
     "summary": { ... },
     "joined_campaigns": [ ... ],
     "open_campaigns": [ ... ],
     "my_late_requests": [ ... ],
     "server_time": "..."
   }
   ```
5. `backendAdapter.js` normalizes this response:
   ```javascript
   const id = (data && data.identity) || {};
   const status = String(id.member_status || (data && data.status) || '').toLowerCase();
   return {
     exists: Boolean(id.is_registered_member || id.name || data.exists),
     name: id.name || data.name || '',
     alias: id.alias || data.alias || '',
     status: status || 'unregistered',
     verified: status === 'active',
     pending: status === 'pending',
     ...data
   };
   ```
   **CRITICAL DEFECT**: `wa` (or normalized whatsapp) was omitted from the root object.
6. `auth.js:69` executes `safeSet('donor_user', JSON.stringify(res))`.
7. `localStorage.getItem('donor_user')` contains `name`, `status`, `verified`, `identity`, `summary`, etc., but `user.whatsapp === undefined`.
8. `loadUserDashboard()` runs successfully because it only inspects `user.name`, `user.status`, and `user.verified`.
9. `refreshCampaignList()` runs `call('listActiveCampaigns', user.whatsapp)` with `undefined`, which defaults to empty string and triggers unnecessary RPC errors or fallbacks.

### Write-vs-Read Matrix

| Field | Written by `auth.js` on WhatsApp Login? | Written by `auth.js` on Register? | Read by `donor.js:loadUserDashboard` | Read by `donor.js:joinCampaign` | Read by `donor.js:withdraw` | Read by `donor.js:submitProof` | Read by `donor.js:submitCombinedProof` | Read by `donor.js:seamlessBecomePic` | Read by `donor.js:saveProfile` | Match Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `whatsapp` | ❌ **No (undefined)** | ❌ **No (undefined)** | N/A | ✅ Reads `user.whatsapp` | ✅ Reads `user.whatsapp` | ✅ Reads `user.whatsapp` | ✅ Reads `user.whatsapp` | ✅ Reads `user.whatsapp` | ✅ Reads `user.whatsapp` | 🚨 **BROKEN** |
| `whatsapp_masked` | ⚠️ In `identity.whatsapp_masked` only | ⚠️ As `maskedWhatsapp` only | N/A | N/A | N/A | N/A | N/A | N/A | N/A | ⚠️ Inconsistent |
| `name` | ✅ Yes | ✅ Yes | ✅ Reads `user.name` | ✅ Reads `user.name` | N/A | N/A | N/A | N/A | ✅ Reads `user.name` | ✅ Matches |
| `status` | ✅ Yes (`'active'`) | ✅ Yes | ✅ Reads `user.status` | N/A | N/A | N/A | N/A | N/A | N/A | ✅ Matches |
| `verified` | ✅ Yes (`true`) | ❌ No | ✅ Reads `user.verified`| N/A | N/A | N/A | N/A | N/A | N/A | ✅ Matches |
| `alias` | ✅ Yes | ❌ No | N/A | N/A | N/A | N/A | N/A | N/A | N/A | ✅ Matches |
| `email` | ⚠️ In `identity.email` (if any) | ❌ No | ✅ Reads `user.email` | N/A | N/A | N/A | N/A | N/A | N/A | ⚠️ Inconsistent |

---

## 4. Backend Adapter RPC Signature & Parameter Mapping Audit

Comparison of `backendAdapter.js` calls against Supabase SQL migrations:

| Action | `backendAdapter.js` Passed Arguments | SQL Migration RPC Signature | Discrepancy Found | Impact |
|---|---|---|---|---|
| `joinCampaign` | `{ p_campaign_id, p_name, p_whatsapp, p_is_custom, p_custom_amount, p_alias }` | `join_campaign(p_campaign_id TEXT, p_name TEXT, p_whatsapp TEXT, p_custom_amount NUMERIC, p_alias TEXT)` | `p_is_custom` is **NOT** a parameter in the SQL function | PostgREST function lookup fails (`PGRST202: Could not find the function join_campaign with parameter p_is_custom`) |
| `joinCampaignsBulk` | `{ p_campaign_ids, p_name, p_whatsapp, p_custom_amount, p_alias }` | `join_campaigns_bulk(p_campaign_ids TEXT[], p_name TEXT, p_whatsapp TEXT, p_custom_amount NUMERIC, p_alias TEXT)` | None | ✅ Exact Match |
| `withdrawCampaign` | `{ p_campaign_id, p_whatsapp }` | `withdraw_campaign(p_campaign_id TEXT, p_whatsapp TEXT)` | None | ✅ Exact Match |
| `submitPaymentProof` | `{ p_campaign_id, p_whatsapp, p_storage_path, p_public_url }` | `submit_payment_proof(p_campaign_id TEXT, p_whatsapp TEXT, p_storage_path TEXT, p_proof_url TEXT)` | SQL expects `p_proof_url`, adapter sent `p_public_url` | PostgREST parameter mismatch error |
| `submitCombinedPaymentProof` | `{ p_campaign_ids, p_whatsapp, p_storage_path, p_public_url }` | `submit_combined_payment_proof(p_campaign_ids TEXT[], p_whatsapp TEXT, p_proof_storage_path TEXT, p_proof_url TEXT)` | SQL expects `p_proof_storage_path` and `p_proof_url`, adapter sent `p_storage_path` and `p_public_url` | PostgREST parameter mismatch error |
| `updateMemberProfile` | `{ p_whatsapp, p_name, p_email }` | `update_member_profile(p_whatsapp TEXT, p_name TEXT, p_email TEXT)` | None | ✅ Exact Match |
| `generateSeamlessPicToken`| `{ p_whatsapp, p_target_name, p_reason, p_gift_amount, p_start_date, p_deadline }` | `generate_seamless_pic_token(p_whatsapp TEXT)` | SQL only takes `p_whatsapp`, adapter sent 5 extra campaign fields | PostgREST function lookup fails (`PGRST202`) |
| `deleteDraftPicToken` | `{ p_pic_token }` | `delete_draft_pic_token(p_pic_token TEXT)` | None | ✅ Exact Match |

---

## 5. Production Bundle Parity Verification

Live check against `https://don4tpro.pages.dev`:

1. **Environment Configuration (`/js/config/env.local.js`)**:
   - `BACKEND_MODE`: `"supabase"`
   - `ALLOW_GAS_FALLBACK`: `false`
   - `DEBUG`: `false`
2. **Asset SHA256 Hashes**:
   - `js/app.js`: `b4d19a30` (Local === Production)
   - `js/views/auth.js`: `95fe9a31` (Local === Production)
   - `js/views/donor.js`: `4b5d9e17` (Local === Production)
   - `js/views/pic.js`: `1ac00f7b` (Local === Production)
   - `js/views/admin.js`: `96b58020` (Local === Production)
   - `js/views/superadmin.js`: `ecaa8b63` (Local === Production)
   - `js/services/backendAdapter.js`: `093ba8d3` (Local === Production)

**Verdict**: Production bundle is completely synchronized with the repository. The bug is purely due to code logic in session serialization and adapter argument normalization.

---

## 6. Prescribed Fix Action Plan

1. **Adapter Session Normalization (`js/services/backendAdapter.js`)**:
   - In `checkDonorWhatsApp`: attach `whatsapp: wa`, `whatsapp_masked: id.whatsapp_masked || ''`, and `email: id.email || ''` to the returned user object.
   - In `registerUser`: attach `whatsapp: wa`, `whatsapp_masked: member.whatsapp_masked || ''`, and `email: email || ''` to the returned user object.
2. **Auth Session Storage (`js/views/auth.js`)**:
   - Ensure `userLogin` and `registerUser` write the complete contract: `{ whatsapp, whatsapp_masked, name, alias, email, status, verified, pending, identity, ... }` to `donor_user`.
3. **Adapter RPC Arguments Normalization (`js/services/backendAdapter.js`)**:
   - `joinCampaign`: pass `{ p_campaign_id, p_name, p_whatsapp, p_custom_amount, p_alias }` (remove `p_is_custom`).
   - `submitPaymentProof`: pass `{ p_campaign_id, p_whatsapp, p_storage_path, p_proof_url: publicUrl || null }`.
   - `submitCombinedPaymentProof`: pass `{ p_campaign_ids, p_whatsapp, p_proof_storage_path: storagePath || null, p_proof_url: publicUrl || null }`.
   - `generateSeamlessPicToken`: pass `{ p_whatsapp: wa }`.
4. **Permanent Contract Regression Script**:
   - Create `scripts/tests/session-contract.check.cjs` to statically audit session write-vs-read consistency across all views (`donor.js`, `pic.js`, `admin.js`, `superadmin.js`, `auth.js`) and fail on any mismatches.
