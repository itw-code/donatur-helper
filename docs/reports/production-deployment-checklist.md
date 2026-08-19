# Donatur Helper — Production Deployment Checklist (Cloudflare Pages)

This checklist provides the deployment runbook, build configuration, environment variable specifications, post-deploy smoke tests, rollback procedures, and security safeguards for deploying **Donatur Helper** to **Cloudflare Pages**.

---

## 1. Build & Project Configuration

| Setting | Value | Notes |
|---|---|---|
| **Project Type** | Static HTML/CSS/JS Application | Zero Node runtime required at serving time |
| **Framework Preset** | None (Custom) | Static export pipeline |
| **Build Command** | `npm run build` | Runs `node scripts/deployment/build-static.cjs` |
| **Build Output Directory** | `dist` | Generated clean output folder |
| **Root Directory** | `/` | Repository root |
| **Node.js Version** | `18.x` or `20.x` | Set via `NODE_VERSION=20` if necessary |

---

## 2. Environment Variables Matrix

Configure these variables in **Cloudflare Pages Dashboard** under **Settings > Environment Variables**.

### A. Required Production Variables

| Variable Name | Required | Default | Description & Scope |
|---|---|---|---|
| `SUPABASE_URL` | **Yes** | *None* | Public HTTPS URL of Supabase project (`https://<project-ref>.supabase.co`). Browser-safe. |
| `SUPABASE_PUBLISHABLE_KEY` | **Yes** | *None* | Public client key (anon key). Safe for browser use under Row Level Security. |

### B. Optional Tuning Variables

| Variable Name | Required | Default | Description & Scope |
|---|---|---|---|
| `DH_BACKEND_MODE` | No | `auto` | Backend routing strategy (`auto`, `supabase`, or `gas`). In `auto` mode, migrated operations route to Supabase RPCs and unmigrated operations fallback to GAS. |
| `DH_ALLOW_GAS_FALLBACK` | No | `true` | Boolean flag (`true` or `false`). When `true`, unmigrated actions gracefully fallback to Google Apps Script. |
| `DH_DEBUG` | No | `false` | Boolean flag (`true` or `false`). When `false`, suppresses debug diagnostics in production console. |
| `DH_GAS_ENDPOINT` | No | `""` | HTTPS endpoint URL of Google Apps Script Web App if GAS fallback is enabled. |

### C. STRICTLY FORBIDDEN VARIABLES (DO NOT CONFIGURE ON PAGES)

> [!CAUTION]
> **NEVER** add the following server-side secrets to Cloudflare Pages environment variables. The frontend build is purely static; all environment variables defined in Pages are baked into the client bundle:
> - `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (Bypasses Row Level Security)
> - `SUPABASE_DB_URL` / Direct Postgres connection strings
> - `GMAIL_USER` / `GMAIL_APP_PASSWORD` (SMTP credentials for transactional emails)
> - Any raw database credentials or master API tokens

---

## 3. Deployment Steps

1. **Push Changes to GitHub**:
   Ensure all changes are pushed to your target branch (`main` or production branch).

2. **Connect Cloudflare Pages**:
   - Go to **Cloudflare Dashboard > Workers & Pages > Create application > Pages > Connect to Git**.
   - Select the `itw-code/donatur-helper` repository.

3. **Configure Build Settings**:
   - **Framework preset**: None
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`

4. **Add Environment Variables**:
   - Add `SUPABASE_URL` (Production Supabase Project URL)
   - Add `SUPABASE_PUBLISHABLE_KEY` (Production Publishable / Anon Key)
   - (Optional) Add `DH_BACKEND_MODE=auto`, `DH_ALLOW_GAS_FALLBACK=true`, `DH_DEBUG=false`

5. **Deploy**:
   - Click **Save and Deploy**.
   - Monitor the build logs to confirm that `build-static.cjs` completes successfully and prints the safe summary.

---

## 4. Post-Deployment Smoke Test Checklist

Execute these tests immediately after deployment to verify end-to-end functionality:

### A. General & Security Smoke Test
- [ ] Open deployment URL (e.g. `https://donatur-helper.pages.dev`).
- [ ] Open Browser DevTools Console:
  - Verify zero uncaught JavaScript exceptions.
  - Verify no secret keys or database connection strings appear in logs.
  - Verify `window.__DH_ENV__` exists with valid `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
- [ ] Verify HTTP Security Headers in Network tab:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy-Report-Only` (or enforced CSP)

### B. Donor Role Smoke Test
- [ ] **Login Flow**:
  - Enter WhatsApp number and verify donor login.
  - If new user, test registration with Name + WhatsApp.
- [ ] **Dashboard Loading**:
  - Confirm active campaigns load quickly via `get_donor_dashboard` RPC.
  - Verify campaign cards display title, target, collected funds, and deadline.
- [ ] **Campaign Participation**:
  - Click "Ikut Patungan" on an open campaign.
  - Verify bank transfer details display properly.
  - Test payment proof upload to Supabase Storage (`bukti-transfer` bucket).
  - Verify optimistic UI updates and success toast.

### C. PIC (Person in Charge) Role Smoke Test
- [ ] **PIC Login**:
  - Enter valid PIC token to access PIC Workspace.
- [ ] **Campaign Management**:
  - Verify list of campaigns managed by PIC loads.
  - Test "Buat Campaign Baru" and confirm campaign creation.
  - Test payment proof verification ("Verifikasi Pembayaran" / "Verifikasi Semua").
  - Test closing/reopening campaign list if applicable.

### D. Admin & SuperAdmin Smoke Test
- [ ] **Admin Console**:
  - Enter Admin token and verify Stage 1 summary metrics load via `get_admin_dashboard_stage1`.
  - Verify pending member approvals queue and approve/reject actions.
  - Verify campaign list pagination and filtering.
- [ ] **SuperAdmin Console**:
  - Enter SuperAdmin token and verify SuperAdmin dashboard.
  - Check system settings panel: verify secret values are properly masked (`***`).

---

## 5. Rollback Procedures

### Instant Cloudflare Pages Rollback
If any critical regression occurs during production rollout:
1. Navigate to **Cloudflare Dashboard > Workers & Pages > Donatur Helper > Deployments**.
2. Scroll to the list of past deployments and identify the last known good deployment.
3. Click the **`...` (Options)** button next to the target deployment and select **Rollback to this deployment**.
4. Cloudflare Pages will instantly route 100% of incoming edge traffic to the previous deployment build within seconds.

### Environment Variable Rollback
1. Navigate to **Settings > Environment Variables**.
2. Correct or revert any misconfigured values.
3. Go to **Deployments** and click **Retry deployment** on the latest commit.

### Database / RPC Rollback
If a database schema change or RPC is causing failures:
1. Use the Supabase migration rollback scripts or apply an emergency hotfix migration SQL via Supabase Dashboard / CLI.
2. If `ALLOW_GAS_FALLBACK=true` is enabled, set `DH_BACKEND_MODE=gas` in Cloudflare Pages to immediately divert mutations to legacy Google Apps Script while debugging database RPCs.

---

## 6. Security Safeguards & Reminders

1. **Row Level Security (RLS)**:
   All tables (`campaigns`, `members`, `donations`, `settings`, `tokens`) must have RLS active. Public users only read approved data; mutations require valid token authentication.

2. **Storage Bucket Security**:
   The `bukti-transfer` bucket allows public image uploads only with strict MIME type checking and randomized UUID filenames.

3. **Zero Secrets in Frontend Bundle**:
   Never check in `.env`, `.env.local`, or `js/config/env.local.js` to version control. The static build script ensures `env.local.js` is generated only during build execution.

4. **Monitoring & Logs**:
   Check Supabase Dashboard (Database > Logs > API / Edge Functions) and Cloudflare Analytics for 4xx/5xx spikes after release.
