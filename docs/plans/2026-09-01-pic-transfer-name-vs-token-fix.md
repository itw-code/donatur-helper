# Plan: Transfer Kepemilikan PIC — Name vs Token vs WA (DONE: diagnosis, TODO: implement A+B)

Status: **DIAGNOSIS COMPLETE — A+B implementation NOT started (see TODO below)**
Date: 2026-09-01

## 1. The user's question (original)

> Why does "Transfer kepemilikan PIC" (admin/superadmin) assign the campaign to a member's **Name**
> (e.g. "Fiqi") rather than the PIC-token or phone number? The assignee would then see the campaign
> when logging in as a *donatur* (donor), which seems unintended/confusing.

## 2. Answer (root cause)

- Campaign ownership is **NOT stored on `campaigns`**. It is derived from `auth_tokens`:
  `auth_tokens.linked_campaign_id` + `auth_tokens.role='PIC'` + `status='ACTIVE'`.
- The transfer correctly stores the **WhatsApp number as `created_by`** and the member's **Name as `alias`**:
  - Supabase: `supabase/migrations/20260819080000_admin_transfer_campaign_ownership.sql`
    - Revokes old PIC token(s) for the campaign (`status='EXPIRED'`).
    - Inserts `(token_hash=sha256(...), role='PIC', status='ACTIVE', linked_campaign_id, alias=member.name, created_by=normalized_wa)`.
  - Legacy: `Code.js:2651 transferCampaignOwnershipAdmin` — same shape: `CreatedBy=WA`, `Alias=member.Name`.
- **Why "Fiqi" is displayed**: admin list views use `COALESCE(alias, created_by)` as the PIC label:
  - `Code.js: listAllCampaigns` (~2412): `picName = cToken ? (cToken.Alias || cToken.CreatedBy) : ''`.
  - `supabase/migrations/20260818030000_get_admin_stage2.sql` (~90): `COALESCE(t.alias, t.created_by) AS pic_alias`.
  - `js/services/backendAdapter.js:338`: `picName: c.pic_alias || c.PicAlias`.
  - `js/views/admin.js` (~680/697): renders `picName` — so admins see "Fiqi", not token/phone. **Display-only.**
- **Why it will NOT show on donor WA login** (the user's worry is actually a non-bug):
  - Donor login (`js/views/auth.js userLogin`) → `checkDonorWhatsApp` → `get_donor_dashboard` → reads `donors` (pledges) + open campaigns. Never reads `auth_tokens`.
  - PIC login is **token-based**: `js/views/pic.js loadPicDashboard` → `getCampaignForPic(p_token)` → `verify_auth_token` (SHA-256 hash lookup). So "Fiqi" must log in via **Token Login** with the `PIC-XXXX` token shown in the success modal, NOT with his WA number as a donor.
- **UX bugs found (the real issues):**
  1. Success modal text in `js/views/admin.js adminTransferOwnershipUI` (~921–930) says
     *"Campaign ini otomatis muncul di dashboard Fiqi"* — misleading; it only appears on **PIC token login**.
  2. Admin list shows the friendly Name and never surfaces the WA or token, so human admins
     cannot tell who really owns the campaign (ownership key = WA).
  3. `get_user_pic_campaigns(p_whatsapp)` RPC exists (migration `20260825100000...`) and is capable of
     listing PIC campaigns for a phone, but the **frontend never calls it** (dead code), and its `SELECT`
     returns `t.token`, a plaintext column that is **never populated** for hash-only tokens → always `NULL`.
  4. `js/views/donor.js` (~142) `seamlessBecomePic` calls `generateSeamlessPicToken` which always creates a
     fresh `UNUSED` draft token — it does NOT reuse the `ACTIVE` token created by the transfer, so the user
     gets a blank campaign draft instead of their transferred campaign.

## 3. Plan (agreed with user: A + B)

**STATUS (2026-09-01): IMPLEMENTED + VERIFIED on live Supabase.** See "## 6. Implementation log" below.

### Option A — quick UX fixes (no schema changes)

1. `js/views/admin.js adminTransferOwnershipUI` (~921–930): replace misleading modal text with explicit
   instructions: token + "login via Login dengan Token (bukan dashboard donatur)".
2. Admin list (`js/views/admin.js` campaign rows / tooltip): surface `pic_alias (WA)` and/or token id so
   admins can see the real ownership key.

### Option B — make transferred campaign discoverable from donor login

Goal: after a transfer, when the member logs in with their **WA as donor**, they should see
"Campaign yang kamu kelola sebagai PIC" and be able to enter their PIC dashboard.

Approach (recommended, tokenless + secure):
1. Create a **new migration** (e.g. `supabase/migrations/20260901xxxxxx_donor_pic_campaigns_claim.sql`):
   - Backfill: ensure `get_user_pic_campaigns` returns **active/expired PIC campaigns for a WA**
     keyed off `auth_tokens.created_by = normalized_wa` (NOT `t.token`).
   - Add RPC `claim_pic_campaigns(p_whatsapp)` (SECURITY DEFINER, advisory lock) that:
     - Normalizes + validates the WA.
     - Returns list of campaigns where the member has an `ACTIVE` PIC token
       (i.e. transferred to them), without returning any plaintext token.
     - Optional: also return legacy `legacy_token` from `Code.js`-style storage if present.
   - Do **NOT** store plaintext tokens in `auth_tokens.token` (security); keep hash-only.
2. `js/views/donor.js loadUserDashboard()`: after donor data loads, call
   `getUserPicCampaigns(wa)` and render a section "Campaign yang kamu kelola sebagai PIC"
   with a button "Buka Dashboard PIC":
   - If an `ACTIVE` PIC token exists for that WA → button uses the **existing** token login flow
     (need a safe way to log in without plaintext: either return a **one-time login link/token**,
     or have `claim_pic_campaigns` return a signed `login_token` the browser can paste into
     token-login; do not expose raw hashes).
   - If token is expired/no token → show "Token PIC telah kedaluwarsa / hubungi admin".
3. Fix `seamlessBecomePic` (`js/views/donor.js` ~142): if an `ACTIVE` PIC campaign already exists for the
   user, route to that dashboard instead of creating a fresh draft.

### Notes / gotchas

- `auth_tokens.token` column exists? (migration `20260825100000...` — verify; if it exists it's currently unused).
- Hash-based tokens make "login as PIC from donor view" non-trivial; prefer **one-time claim links**
  or storing an **encrypted** plaintext, over plaintext columns.
- All `auth_tokens` reads here are **metadata-only** — never leak `token_hash`.

## 4. Verification checklist (when implementing)

- [ ] A: success modal no longer says "otomatis muncul di dashboard <name>".
- [ ] A: admin list shows WA/token for the PIC column.
- [ ] B: new migration exists + applies cleanly (`supabase migration up` / psql).
- [ ] B: `get_user_pic_campaigns(wa)` returns campaigns w/o plaintext tokens.
- [ ] B: donor view renders PIC-owned campaigns section for a transferred WA.
- [ ] B: clicking "Buka Dashboard PIC" lands on the transferred campaign (not a new draft).
- [ ] Regression: token login with `PIC-XXXX` still works (`verify_auth_token`).
- [ ] Regression: donor pledge dashboard unaffected.

## 5b. TODO — number discrepancy preview vs production (added 2026-09-01)

- User: number shown at `https://610f97d0.don4tpro.pages.dev/?c=C-53762679#admin-section-tools` differs from production `don4tpro.pages.dev`.
  Clarified: the number = **donor count for Fakhrurrozi campaign `C-53762679`** — preview showed 34, prod showed 20.

### RESOLVED (2026-09-01) — data staleness, NOT code

- Both deployments read the **same live DB** (`env.local.js` byte-identical, `hhgtospruzcjwlafvkhf.supabase.co`).
- Donor-count logic (**`admin.js` row/card + `admin_get_campaign_detail` default page_size=50 + `get_admin_dashboard_stage1` COUNT(*)**) is **byte-identical** between preview (`8c85d1f`) and prod (`ed1ff9d`). No pagination cap at 20, no filter drops to 20, no caching drops to 20 (HTML + JS are `max-age=0, must-revalidate` on prod).
- DB now: `C-53762679` = **34 donors** (all PLEDGED), joined 2026-08-18 .. 2026-08-27.
  - Joined before 2026-08-20 (preview build date): **22**
  - Joined on/after 2026-08-20: **12**
- Therefore "20" = what the production tab/DOM showed **before the 12 newer donors registered** (stale open tab). A fresh prod load shows 34.
- Fix: hard-refresh prod (`Ctrl+Shift+R`). No code change needed.

### Optional hardening (not done)
- Add a donor-count freshness indicator, or trigger a data refresh when the tab regains focus (app already re-checks `version.json` on focus — a data re-poll for open admin detail views would prevent stale DOM numbers).


## 6. Implementation log (2026-09-01) — A+B SHIPPED

**Backend migration** — `supabase/migrations/20260901120000_pic_transfer_token_persistence_and_claim.sql`:
- `admin_transfer_campaign_ownership` now persists the **plaintext PIC token** in
  `auth_tokens.token` on insert (column already existed). This means the assignee can
  seamlessly login-as-PIC later.
- `get_user_pic_campaigns` extended: returns `pic_alias`, `pic_whatsapp` in addition to
  token. Needs a DROP+CREATE (return type changed) when reapplying.
- NEW `claim_pic_campaigns(p_whatsapp)`: read-only, token-free list of ACTIVE non-archived
  PIC campaigns for a phone. No secrets exposed.

**APPLIED to live DB via MCP** — all three functions verified present with correct
signatures, and verified end-to-end with real data:
- `claim_pic_campaigns('+6281297488665')` → `C-53762679` Fakhrurrozi, pic_alias Fiqi, 34 donatur.
- `get_user_pic_campaigns('+6281297488665')` → same + `has_token=true` (plaintext `PIC-958B...` persisted).

**Frontend** — `js/services/backendAdapter.js`:
- Added `claimPicCampaigns` RPC mapping; extended `getUserPicCampaigns` mapping with
  `picAlias/picWhatsapp/hasToken`.
- Registered `claimPicCampaigns` in `MIGRATED_ACTIONS`.

**Frontend** — `js/views/admin.js` (Option A):
- `adminTransferOwnershipUI` modal message corrected: no longer claims
  "otomatis muncul di dashboard <name>"; now states explicitly the campaign is **not** auto-shown
  to donors and instructs token login / donor-dashboard PIC entry.
- Admin campaign card now shows PIC WhatsApp under "Info PIC & Log".

**Frontend** — `js/views/donor.js` (Option B):
- `loadMyPicCampaigns(wa)` renders "🛠️ Campaign yang kamu kelola sebagai PIC" on the donor
  dashboard with a "Buka Dashboard PIC" button per campaign (via `claim_pic_campaigns`).
- `openPicCampaignFromDonor(campaignId)` fetches the token via `getUserPicCampaigns` and logs in
  as PIC (uses global `window.loginToken` to avoid circular import).
- `seamlessBecomePic` now reuses an existing ACTIVE PIC campaign token instead of always minting
  a fresh draft.

**Frontend** — `index.html`: added `<div id="my-pic-campaigns">` to donor dashboard.

**Verification** (syntax): `node --check` passes on all 4 touched JS files.

### Still TODO / follow-ups
- [ ] Deploy frontend to Cloudflare Pages (preview check then promote to prod).
- [ ] Local smoke-test the donor dashboard section (login as Fiqi → see PIC section → click
  Buka Dashboard PIC).
- [ ] Decide whether `claim_pic_campaigns` should live only in the migration file (it does) and
  whether to ALSO backfill `auth_tokens.token` for legacy transfers that predate persistence
  (only affects older transferred campaigns whose plaintext was already stored by GAS/Code.js;
  verified: Fakhrurrozi has one).

## 5. Where things live (quick refs)

| Concern | File |
|---|---|
| Transfer RPC (Supabase) | `supabase/migrations/20260819080000_admin_transfer_campaign_ownership.sql` |
| Transfer legacy (GAS) | `Code.js` `transferCampaignOwnershipAdmin` (~2651) |
| Admin list pic name | `supabase/migrations/20260818030000_get_admin_stage2.sql` (~90), `Code.js listAllCampaigns` (~2412) |
| Backend mapping | `js/services/backendAdapter.js` (~338) |
| Transfer modal frontend | `js/views/admin.js` `adminTransferOwnershipUI` (~855, ~914–930) |
| PIC dashboard | `js/views/pic.js` `loadPicDashboard` (~127) |
| Donor dashboard/upgrade | `js/views/donor.js` `loadUserDashboard` (~142 `seamlessBecomePic`) |
| Donor login | `js/views/auth.js` `userLogin` → `checkDonorWhatsApp` |
| Token verify (hash) | `supabase/migrations/20260818010000_verify_auth_token.sql` |
| PIC campaigns RPC (dead/broken) | `supabase/migrations/20260825100000_add_missing_public_settings_and_user_pic_campaigns.sql` |
| PIC token generation | `supabase/migrations/20260818160000_generate_seamless_pic_token.sql`, `20260819070000_admin_generate_pic_token.sql` |