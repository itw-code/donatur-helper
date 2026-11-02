# Incident Report: Active Member PIC Draft Token Rejected on Campaign Creation

- **Date**: 2026-11-02
- **Status**: RESOLVED & DEPLOYED (`98001bb` on `https://don4tpro.pages.dev`)
- **Symptom**: When a verified active member clicks **+ Buat Campaign Baru (Jadi PIC)** on the Donor Dashboard (`#view-user-dashboard`), the UI displays a modal titled **Kendala Sistem** with message:
  > *"Token PIC tidak valid atau tidak terhubung ke campaign."*
  and fails to transition to the campaign creation form (`#view-pic-create`).

---

## 1. Invariants & State Machine

A PIC token row in `public.auth_tokens` progresses through two distinct states during campaign creation:

1. **Draft State $S_0$** (`generate_seamless_pic_token` / `admin_generate_pic_token`):
   $$S_0 = (\text{role} = \texttt{'PIC'},\; \text{status} = \texttt{'UNUSED'},\; \text{linked\_campaign\_id} = \texttt{NULL})$$
   - No `campaigns` record exists yet.
   - `generate_seamless_pic_token` expires any previous `UNUSED` unlinked draft tokens for the same `created_by` WhatsApp number (`WHERE role = 'PIC' AND status = 'UNUSED' AND linked_campaign_id IS NULL`).
2. **Linked Active State $S_1$** (`create_campaign_for_pic`):
   $$S_1 = (\text{role} = \texttt{'PIC'},\; \text{status} = \texttt{'ACTIVE'},\; \text{linked\_campaign\_id} = \texttt{'C-XXXXXXXX'})$$
   - `create_campaign_for_pic` requires `linked_campaign_id IS NULL` on entry, inserts the new `campaigns` row, and atomically updates `auth_tokens` to `status = 'ACTIVE'` and `linked_campaign_id = v_campaign.campaign_id`.

### Critical Invariant
Calling `getCampaignForPic` / `get_pic_dashboard(p_token)` on a token in Draft State $S_0$:
1. **MUST** return `{ campaign: null, donors: [], summary: null }` (without `error`) so `loadPicDashboard()` (`js/views/pic.js:135-137`) executes `showView('pic-create')`.
2. **MUST NOT** promote `auth_tokens.status` from `'UNUSED'` to `'ACTIVE'`. Prematurely setting `status = 'ACTIVE'` while `linked_campaign_id IS NULL` creates an orphaned active token (rejected by `Code.js:488` and skipped by `generate_seamless_pic_token` draft cleanup).

---

## 2. Root Cause Trace

1. `seamlessBecomePic()` (`js/views/donor.js:242-255`) calls `generateSeamlessPicToken`, saves `auth_token` and `auth_role = 'PIC'` to `localStorage`, opens the `'Sukses'` modal (`showInfoModal('Token PIC Anda: PIC-XXXX...', 'Sukses')`), and immediately calls `loadPicDashboard()`.
2. `loadPicDashboard()` (`js/views/pic.js:134`) calls `call('getCampaignForPic', token, 1, 100)`.
3. `getCampaignForPic` (`js/services/backendAdapter.js`) calls `client.rpc('get_pic_dashboard', { p_token: token, p_page: page, p_page_size: pageSize })`.
4. In `supabase/migrations/20260818040000_get_pic_dashboard.sql:51-60`, the authorization guard included `OR v_auth.linked_campaign_id IS NULL`:
   ```sql
   IF v_auth.token_id IS NULL 
      OR v_auth.role <> 'PIC'
      OR v_auth.linked_campaign_id IS NULL -- <-- Rejected every newly minted draft token
      OR v_auth.status NOT IN ('ACTIVE', 'UNUSED')
      OR (v_auth.expires_at IS NOT NULL AND v_auth.expires_at < NOW()) THEN
       RETURN jsonb_build_object(
           'error', 'unauthorized',
           'message', 'Token PIC tidak valid atau tidak terhubung ke campaign.'
       );
   END IF;
   ```
5. `backendAdapter.js` threw `new Error(data.message)`, which `pic.js` caught via `.catch(e => showInfoModal(formatUserErrorMessage(e), 'Error'))`.
6. `showInfoModal(..., 'Error')` (`js/utils.js:84`) mapped `'Error'` to `'Kendala Sistem'` and overwrote the `'Sukses'` modal in-place, leaving the user on `#view-user-dashboard`.
7. Because `auth_token` and `auth_role = 'PIC'` remained in `localStorage`, any subsequent page refresh (`js/app.js:466`) re-invoked `loadPicDashboard()` and repeated the error modal.

---

## 3. Resolution & Architecture Reference

| Layer | File | Change |
| :--- | :--- | :--- |
| **PostgreSQL Migration** | `supabase/migrations/20261102120000_fix_pic_draft_token_dashboard_and_persistence.sql` | 1. Updates `get_pic_dashboard` to handle `linked_campaign_id IS NULL`: returns `{ campaign: null, summary: null, donors: [] }` when `status = 'UNUSED'` (without promoting to `'ACTIVE'`), and returns `error: 'orphaned_token'` when `status = 'ACTIVE'`.<br>2. Updates `generate_seamless_pic_token` to persist `v_plaintext_token` in `auth_tokens.token` on insert (matching `admin_transfer_campaign_ownership` in `20260901120000`). |
| **Backend Adapter Fallback** | `js/services/backendAdapter.js` (`case 'getCampaignForPic':`) | When `get_pic_dashboard` returns `data.error === 'unauthorized'`, queries `verify_auth_token(p_token)`: if the token is a valid, non-expired `PIC` token with `linked_campaign_id IS NULL` and `status = 'UNUSED'`, returns `{ campaign: null, donors: [], summary: null }`. Also deduplicates donor normalization into `_normalizeDonorRow(d)`. |
| **Stale Token Recovery** | `js/views/pic.js` (`loadPicDashboard`) | On error in `loadPicDashboard()`, purges stale `auth_token` and `auth_role` from `localStorage` and falls back to `loadUserDashboard()` (if `donor_user` is present) or `showView('landing')`. |
| **Regression Tests** | `tests/donor-supabase-rewire.test.js`, `scripts/tests/session-contract.check.cjs` | Tests `seamlessBecomePic` when `get_pic_dashboard` returns `unauthorized` on an unlinked `UNUSED` token; verifies `#custom-info-title` stays `'Sukses'` and `#view-pic-create` is displayed. Static check added in Section 6 of `session-contract.check.cjs`. |

---

## 4. Operational Notes for Future Agents

- **Frontend Resilience**: `js/services/backendAdapter.js` handles unlinked `UNUSED` draft tokens even if `20261102120000_fix_pic_draft_token_dashboard_and_persistence.sql` has not yet been executed in the Supabase SQL Editor, because `verify_auth_token(p_token)` is already deployed and does not mutate `auth_tokens.status`.
- **Applying the SQL Migration to Remote Supabase**: When a valid Supabase Personal Access Token (`sbp_...`) or Supabase Dashboard SQL Editor session is available, execute `supabase/migrations/20261102120000_fix_pic_draft_token_dashboard_and_persistence.sql` so `get_pic_dashboard` handles draft tokens in a single RPC round-trip without needing the second `verify_auth_token` call.
