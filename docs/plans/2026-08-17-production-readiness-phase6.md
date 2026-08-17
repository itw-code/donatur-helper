# Authenticated Mobile UX Phase 6 Implementation Plan: Production Readiness, Verification & Release Safety

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement Phase 6 production readiness, verification, and regression prevention for Donatur Helper to verify that Phases 1–5 are stable, establish a repeatable release checklist and runbook, harden error handling, validate performance and security configuration, and reduce the risk of production regressions.

**Architecture:** Continue working with the current modular structure created in Phase 5 (valid HTML5 shell, `css/` stylesheets, `js/` ES modules). Do not introduce new features, redesign UX, or refactor architecture further unless required to fix a verified regression. Preserve all Phase 1–5 improvements (sticky role navigation, member pagination, overdue callouts, PIC queue usability and settled states, donor campaign grouping, Indonesian status semantics, friendly error normalizer, DOM-XSS hardening, SRI integrity, robots indexing, security headers, and ES module modularization). Rely on the lightweight Node.js test runner (`node --test`), structured checklists, and deployment validation.

**Tech Stack:** Vanilla HTML5, CSS3 with semantic tokens, Vanilla JavaScript (ES6+ Modules), Node.js built-in test runner (`node --test`), Cloudflare Pages (`_headers`, `robots.txt`) and Netlify (`netlify.toml`) deployment configuration.

---

### Task 1: Regression Verification Matrix & Production Checklist

**Files:**
- Create: `docs/checklists/production-readiness-checklist.md`
- Create: `tests/production-readiness.test.js`

**Step 1: Write failing test for production readiness checklist structure**
Create `tests/production-readiness.test.js` asserting that:
1. `docs/checklists/production-readiness-checklist.md` exists and contains non-empty Markdown documentation.
2. The checklist contains verification matrix sections for all 5 roles: Landing/Auth, Donor, PIC, Admin, and SuperAdmin.
3. The checklist covers all critical state conditions: empty states, loading states, error states, success states, final/settled states, and overdue campaigns.
4. The checklist covers all target viewports: 360px (small mobile), 390px (standard iOS/Android), keyboard-open forms, and desktop (>= 1024px).
5. All checklist items include clear Pass/Fail criteria and operational notes in Indonesian.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 1: docs/checklists/production-readiness-checklist.md exists and contains comprehensive role-by-role verification matrix', () => {
  const checklistPath = path.resolve('docs/checklists/production-readiness-checklist.md');
  assert.ok(fs.existsSync(checklistPath), 'production-readiness-checklist.md must exist');
  
  const content = fs.readFileSync(checklistPath, 'utf8');
  
  // Role checks
  assert.ok(content.includes('Landing & Autentikasi'), 'Must cover Landing role');
  assert.ok(content.includes('Donor / Member'), 'Must cover Donor role');
  assert.ok(content.includes('PIC (Person in Charge)'), 'Must cover PIC role');
  assert.ok(content.includes('Admin'), 'Must cover Admin role');
  assert.ok(content.includes('SuperAdmin'), 'Must cover SuperAdmin role');
  
  // State checks
  assert.ok(content.includes('Empty State') || content.includes('Status Kosong'), 'Must cover empty states');
  assert.ok(content.includes('Loading State') || content.includes('Status Memuat'), 'Must cover loading states');
  assert.ok(content.includes('Error State') || content.includes('Status Kendala / Error'), 'Must cover error states');
  assert.ok(content.includes('Success State') || content.includes('Status Sukses'), 'Must cover success states');
  assert.ok(content.includes('Final / Settled') || content.includes('Selesai & Final'), 'Must cover settled states');
  assert.ok(content.includes('Overdue') || content.includes('Terlewat Deadline'), 'Must cover overdue states');
  
  // Viewport checks
  assert.ok(content.includes('360px'), 'Must specify 360px viewport checks');
  assert.ok(content.includes('390px'), 'Must specify 390px viewport checks');
  assert.ok(content.includes('Keyboard') || content.includes('Virtual Keyboard'), 'Must specify keyboard-open state checks');
  assert.ok(content.includes('Desktop'), 'Must specify Desktop viewport checks');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/production-readiness.test.js`  
Expected: FAIL due to missing `docs/checklists/production-readiness-checklist.md`.

**Step 3: Implement comprehensive production readiness checklist**
Create `docs/checklists/production-readiness-checklist.md` with full verification matrix tables across all user roles, lifecycle states, viewports, and edge cases.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/production-readiness.test.js`  
Expected: PASS for Task 1 checklist assertions.

**Step 5: Commit**
```bash
rtk git add docs/checklists/production-readiness-checklist.md tests/production-readiness.test.js
rtk git commit -m "docs(checklist): add comprehensive production readiness regression matrix"
```

---

### Task 2: Lighthouse and Performance Budget Enforcement

**Files:**
- Modify: `docs/checklists/production-readiness-checklist.md`
- Create: `tests/performance-budget.test.js`

**Step 1: Write failing test for performance budget rules**
Create `tests/performance-budget.test.js` asserting that:
1. Performance baseline from `docs/reports/web-quality-audit-2026-08-17.md` (Performance: 88, Accessibility: 66, Best Practices: 96, SEO: 73, LCP: 3.1s, CLS: 0) is cataloged with target budgets.
2. The defined budget specifies:
   - Target LCP ≤ 2.5s (good threshold).
   - Target CLS ≤ 0.1.
   - Zero missing assets (404 errors for CSS, JS, fonts, images).
   - Zero critical console errors in production execution.
   - Zero render-blocking CSS `@import` rules in stylesheets.
   - All external scripts (Flatpickr, Google Identity) load with `defer` or `async`.
   - Total uncompressed CSS payload is ≤ 60 KB across all modular stylesheets.
   - Total uncompressed JS payload is ≤ 100 KB across all ES modules.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 2: Performance budgets and baseline thresholds are defined and enforced in assets', () => {
  // Check CSS size budget
  const cssDir = path.resolve('css');
  const cssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
  let totalCssBytes = 0;
  for (const file of cssFiles) {
    const content = fs.readFileSync(path.join(cssDir, file), 'utf8');
    assert.ok(!content.includes('@import'), `File css/${file} must not contain render-blocking @import`);
    totalCssBytes += Buffer.byteLength(content, 'utf8');
  }
  assert.ok(totalCssBytes < 60000, `Total CSS size (${totalCssBytes}B) must be under 60KB budget`);

  // Check JS size budget
  const jsDir = path.resolve('js');
  function getJsFiles(dir) {
    let files = [];
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) files.push(...getJsFiles(full));
      else if (item.endsWith('.js')) files.push(full);
    }
    return files;
  }
  const jsFiles = getJsFiles(jsDir);
  let totalJsBytes = 0;
  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    totalJsBytes += Buffer.byteLength(content, 'utf8');
  }
  assert.ok(totalJsBytes < 100000, `Total JS size (${totalJsBytes}B) must be under 100KB budget`);

  // Verify index.html contains no blocking scripts
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  assert.ok(indexHtml.includes('<script type="module" src="js/app.js" defer></script>'), 'App JS must be deferred module');
  assert.ok(indexHtml.includes('flatpickr.min.js') && indexHtml.includes('defer'), 'Flatpickr must load with defer');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/performance-budget.test.js`  
Expected: FAIL if test file is missing or thresholds violated.

**Step 3: Implement performance budget section and verify assets**
- Add Performance Budget & Lighthouse Target section to `docs/checklists/production-readiness-checklist.md`.
- Verify that `css/base.css`, `css/components.css`, `css/views.css`, and `js/` modules stay within size budgets.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/performance-budget.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add docs/checklists/production-readiness-checklist.md tests/performance-budget.test.js
rtk git commit -m "perf: establish performance budget verification suite and documentation"
```

---

### Task 3: Deployment and Caching Verification

**Files:**
- Modify: `_headers`
- Modify: `netlify.toml`
- Modify: `robots.txt`
- Create: `tests/deployment-caching.test.js`

**Step 1: Write failing test for deployment caching and route indexing**
Create `tests/deployment-caching.test.js` asserting that:
1. `_headers` configures `Cache-Control: public, max-age=0, must-revalidate` for `/` and `/index.html` (immediate revalidation for the shell).
2. `_headers` configures `Cache-Control: public, max-age=31536000, immutable` for `/css/*`, `/js/*`, and `/assets/*`.
3. `netlify.toml` replicates the same caching strategy for redirect and fallback hosts.
4. `robots.txt` permits root `/` and `/robots.txt` while blocking sensitive query token patterns (`/*?token=*`, `/*#c=*`, `/api/`).
5. Security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`) are present on all routes.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 3: Deployment configuration provides correct caching, MIME protection, and robots indexing rules', () => {
  const headers = fs.readFileSync(path.resolve('_headers'), 'utf8');
  
  // HTML revalidation
  assert.ok(headers.includes('/index.html') && headers.includes('must-revalidate'), 'HTML must require revalidation');
  
  // Static asset caching
  assert.ok(headers.includes('/css/*') && headers.includes('immutable'), 'CSS must have immutable cache');
  assert.ok(headers.includes('/js/*') && headers.includes('immutable'), 'JS must have immutable cache');
  
  // Security headers
  assert.ok(headers.includes('X-Content-Type-Options: nosniff'), 'nosniff header must be set');
  assert.ok(headers.includes('X-Frame-Options: SAMEORIGIN'), 'SAMEORIGIN frame header must be set');
  assert.ok(headers.includes('Referrer-Policy: strict-origin-when-cross-origin'), 'Referrer-Policy must be set');
  
  // Robots indexing
  const robots = fs.readFileSync(path.resolve('robots.txt'), 'utf8');
  assert.ok(robots.includes('User-agent: *'), 'Robots must declare wildcard user-agent');
  assert.ok(robots.includes('Allow: /'), 'Robots must allow root');
  assert.ok(robots.includes('Disallow: /*?token=*'), 'Robots must disallow token queries');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/deployment-caching.test.js`  
Expected: FAIL if test file is missing or assertions fail.

**Step 3: Verify and refine `_headers`, `netlify.toml`, and `robots.txt`**
Ensure all headers, paths, and caching policies are consistent between Cloudflare Pages (`_headers`) and Netlify (`netlify.toml`).

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/deployment-caching.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add _headers netlify.toml robots.txt tests/deployment-caching.test.js
rtk git commit -m "chore(deploy): verify deployment caching headers, route policies, and robots indexing"
```

---

### Task 4: Security Header and CSP Stabilization

**Files:**
- Create: `docs/reports/csp-stabilization-report.md`
- Modify: `_headers`
- Modify: `netlify.toml`
- Create: `tests/csp-stabilization.test.js`

**Step 1: Write failing test for CSP policy and stabilization report**
Create `tests/csp-stabilization.test.js` asserting that:
1. `docs/reports/csp-stabilization-report.md` exists and documents the CSP audit findings.
2. The report specifies why `Content-Security-Policy-Report-Only` is currently active (allows Google Identity Services, Google Apps Script CORS/JSONP, and inline `onclick` event attributes while monitoring violations).
3. The report outlines the exact roadmap for transitioning to an Enforced CSP (migrating inline `onclick="..."` HTML attributes to dynamic event listeners in ES modules, removing `unsafe-inline`, and adding strict script nonces or hashes).
4. `_headers` and `netlify.toml` define `Content-Security-Policy-Report-Only` with all necessary origins (`'self'`, `'unsafe-inline'`, `https://cdn.jsdelivr.net`, `https://accounts.google.com`, `https://fonts.googleapis.com`, `https://fonts.gstatic.com`, `https://script.google.com`, `https://script.googleusercontent.com`).

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 4: CSP policy is stabilized in headers and migration report is documented', () => {
  const reportPath = path.resolve('docs/reports/csp-stabilization-report.md');
  assert.ok(fs.existsSync(reportPath), 'csp-stabilization-report.md must exist');
  
  const report = fs.readFileSync(reportPath, 'utf8');
  assert.ok(report.includes('Content-Security-Policy-Report-Only'), 'Report must explain Report-Only status');
  assert.ok(report.includes('Google Identity') || report.includes('accounts.google.com'), 'Report must address Google Identity');
  assert.ok(report.includes('Roadmap') || report.includes('Enforced CSP'), 'Report must provide migration roadmap');
  
  const headers = fs.readFileSync(path.resolve('_headers'), 'utf8');
  assert.ok(headers.includes('Content-Security-Policy-Report-Only:'), 'CSP header must be Report-Only');
  assert.ok(headers.includes('https://script.google.com'), 'CSP must permit Google Apps Script backend');
  assert.ok(headers.includes('https://accounts.google.com'), 'CSP must permit Google Identity Services');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/csp-stabilization.test.js`  
Expected: FAIL due to missing `docs/reports/csp-stabilization-report.md`.

**Step 3: Create CSP stabilization report and verify headers**
- Create `docs/reports/csp-stabilization-report.md` detailing current policy coverage, observed report-only behavior, and the nonce/hash migration path.
- Verify `_headers` and `netlify.toml` contain valid, non-breaking directives.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/csp-stabilization.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add docs/reports/csp-stabilization-report.md _headers netlify.toml tests/csp-stabilization.test.js
rtk git commit -m "security(csp): document csp stabilization analysis and migration roadmap"
```

---

### Task 5: Error Handling and User-Safe Failure States Hardening

**Files:**
- Modify: `js/utils.js`
- Modify: `js/api.js`
- Create: `tests/error-handling-safety.test.js`

**Step 1: Write failing test for error handling and user-safe failure normalization**
Create `tests/error-handling-safety.test.js` testing 10+ error categories:
1. Network disconnection (`Failed to fetch`, `NetworkError`) -> Returns calm Indonesian message: `"Koneksi terputus. Periksa jaringan internet Anda dan coba lagi."`
2. Request timeout (`AbortError`, `timeout`) -> Returns: `"Waktu permintaan habis. Silakan coba beberapa saat lagi."`
3. Expired/invalid session (`Unauthorized`, `invalid token`) -> Returns: `"Sesi akses Anda telah berakhir. Silakan masuk kembali."`
4. Invalid phone number format -> Returns clear Indonesian guidance.
5. Empty campaign target or Rp0 target on finalize -> Returns actionable instruction.
6. File upload exceeding size limit (>2MB) -> Returns friendly file size limit warning.
7. Database / script server error (raw Google Apps Script error strings or stack traces) -> Sanitizes to: `"Terjadi kendala saat memproses permintaan. Silakan coba lagi."` without exposing stack traces, line numbers, or internal variables.
8. Unregistered / unapproved member status -> Returns informative approval status guidance.
9. Invalid JSON server response -> Returns friendly communication error instead of raw parser exception.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatUserErrorMessage, escapeHtml } from '../js/utils.js';

test('Task 5: formatUserErrorMessage sanitizes all technical exceptions into calm, user-safe Indonesian copy', () => {
  // Network failures
  assert.equal(formatUserErrorMessage(new Error('Failed to fetch')), 'Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.');
  assert.equal(formatUserErrorMessage('TypeError: NetworkError when attempting to fetch resource.'), 'Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.');
  
  // Timeouts
  assert.equal(formatUserErrorMessage(new Error('The user aborted a request.')), 'Waktu permintaan habis. Silakan coba beberapa saat lagi.');
  assert.equal(formatUserErrorMessage('timeout exceeded'), 'Waktu permintaan habis. Silakan coba beberapa saat lagi.');
  
  // Auth issues
  assert.equal(formatUserErrorMessage(new Error('Unauthorized token')), 'Sesi akses Anda telah berakhir. Silakan masuk kembali.');
  
  // Technical stack traces must be sanitized
  const rawStack = 'Error: Cannot read properties of undefined (reading "id") at doPost (Code.js:145)';
  const sanitized = formatUserErrorMessage(rawStack);
  assert.ok(!sanitized.includes('doPost'), 'Must not expose internal function names');
  assert.ok(!sanitized.includes('Code.js'), 'Must not expose backend source filenames');
  
  // Empty / null errors
  assert.equal(formatUserErrorMessage(null), 'Terjadi kendala saat memproses permintaan. Silakan coba lagi.');
  assert.equal(formatUserErrorMessage(undefined), 'Terjadi kendala saat memproses permintaan. Silakan coba lagi.');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/error-handling-safety.test.js`  
Expected: FAIL on stack trace filtering or missing test file.

**Step 3: Implement hardened error normalization in `js/utils.js` and `js/api.js`**
Enhance `formatUserErrorMessage` in `js/utils.js`:
```javascript
export function formatUserErrorMessage(err) {
  if (!err) return 'Terjadi kendala saat memproses permintaan. Silakan coba lagi.';
  const msg = typeof err === 'string' ? err : (err.message || String(err));
  
  if (/network|fetch|failed to fetch/i.test(msg)) {
    return 'Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.';
  }
  if (/timeout|abort/i.test(msg)) {
    return 'Waktu permintaan habis. Silakan coba beberapa saat lagi.';
  }
  if (/unauthorized|token/i.test(msg)) {
    return 'Sesi akses Anda telah berakhir. Silakan masuk kembali.';
  }
  if (/cannot read properties|undefined|referenceerror|typeerror|syntaxerror|null is not an object|at doPost|at doGet|Code\.js/i.test(msg)) {
    return 'Terjadi kendala saat memproses data. Silakan muat ulang halaman atau coba lagi.';
  }
  
  return escapeHtml(msg);
}
```

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/error-handling-safety.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add js/utils.js js/api.js tests/error-handling-safety.test.js
rtk git commit -m "fix(errors): harden error normalizer against raw stack traces and refine indonesian messages"
```

---

### Task 6: Accessibility Runtime Verification

**Files:**
- Modify: `index.html`
- Modify: `css/base.css`
- Modify: `css/components.css`
- Create: `tests/accessibility-runtime.test.js`

**Step 1: Write failing test for accessibility runtime requirements**
Create `tests/accessibility-runtime.test.js` asserting that:
1. Skip link `<a href="#main-content" class="skip-link">Lewati ke konten utama</a>` is the first interactive element in `<body>` and links to `#main-content`.
2. `#main-content` landmark has `tabindex="-1"` allowing programmatically directed focus without tab-stop disruption.
3. High-visibility `:focus-visible` styles are declared with minimum 2px outline and 2px offset.
4. Toast container has `role="status"` and `aria-live="polite"`.
5. Form error displays have `role="alert"` or are associated with their corresponding form controls.
6. All decorative SVG icons and status helpers include `aria-hidden="true"`.
7. Color tokens satisfy WCAG AA contrast (primary green `#047857` provides 5.82:1 against `#ffffff`).
8. Interactive buttons have discernible accessible text names or `aria-label`.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 6: Accessibility runtime attributes, landmarks, skip links, and aria states are properly declared', () => {
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  
  // Skip link and landmark
  assert.ok(indexHtml.includes('<a href="#main-content" class="skip-link">Lewati ke konten utama</a>'), 'Skip link must exist');
  assert.ok(indexHtml.includes('<main id="main-content" class="wrap" tabindex="-1">'), 'Main landmark must exist with tabindex -1');
  
  // Toast live region
  assert.ok(indexHtml.includes('id="toast"') && indexHtml.includes('role="status"') && indexHtml.includes('aria-live="polite"'), 'Toast must have role status and aria-live polite');
  
  // Check base.css focus styles
  const baseCss = fs.readFileSync(path.resolve('css/base.css'), 'utf8');
  assert.ok(baseCss.includes(':focus-visible'), 'Focus visible styling must be present');
  assert.ok(baseCss.includes('--primary: #047857'), 'WCAG AA high contrast green token must be active');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/accessibility-runtime.test.js`  
Expected: FAIL if test file is missing or checks fail.

**Step 3: Verify and refine accessibility markup in HTML and CSS**
Ensure all modals, form controls, and icons adhere to runtime accessibility requirements without regressing existing Phase 1–5 UX.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/accessibility-runtime.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add index.html css/base.css css/components.css tests/accessibility-runtime.test.js
rtk git commit -m "a11y: verify runtime accessibility landmarks, focus visibility, and aria associations"
```

---

### Task 7: Production Release Runbook

**Files:**
- Create: `docs/runbooks/release-runbook.md`
- Create: `tests/runbook-verification.test.js`

**Step 1: Write failing test for release runbook structure**
Create `tests/runbook-verification.test.js` asserting that:
1. `docs/runbooks/release-runbook.md` exists and contains non-empty documentation.
2. The runbook includes:
   - **Pre-Deploy Checks**: Automated test execution (`rtk node --test`), Git clean state verification, asset budget verification, and security header validation.
   - **Deployment Procedures**: Exact deployment commands for Cloudflare Pages (Git push or `npx wrangler pages deploy`) and Netlify redirect host.
   - **Post-Deploy Smoke Test Checklist**: Step-by-step verification on staging/production for Landing, Donor login, PIC deep-dive, Admin dashboard, and SuperAdmin tools.
   - **Emergency Issue Handling & Escalation**: Incident severity classification (P0, P1, P2), on-call communication channels, and fast-triage procedures.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 7: Release runbook exists and contains full pre-deploy, deploy, smoke test, and emergency procedures', () => {
  const runbookPath = path.resolve('docs/runbooks/release-runbook.md');
  assert.ok(fs.existsSync(runbookPath), 'release-runbook.md must exist');
  
  const content = fs.readFileSync(runbookPath, 'utf8');
  assert.ok(content.includes('Pre-Deploy') || content.includes('Pemeriksaan Pra-Rilis'), 'Must contain pre-deploy section');
  assert.ok(content.includes('Deploy') || content.includes('Langkah Rilis'), 'Must contain deploy steps');
  assert.ok(content.includes('Smoke Test') || content.includes('Uji Asap Pasca-Rilis'), 'Must contain smoke test section');
  assert.ok(content.includes('Emergency') || content.includes('Penanganan Insiden'), 'Must contain emergency procedures');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/runbook-verification.test.js`  
Expected: FAIL due to missing `docs/runbooks/release-runbook.md`.

**Step 3: Create `docs/runbooks/release-runbook.md`**
Author a comprehensive release runbook with actionable steps, commands, and verification criteria for production releases.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/runbook-verification.test.js`  
Expected: PASS for Task 7 runbook assertions.

**Step 5: Commit**
```bash
rtk git add docs/runbooks/release-runbook.md tests/runbook-verification.test.js
rtk git commit -m "docs(runbook): create production release runbook and deployment smoke checklist"
```

---

### Task 8: Rollback Plan and Production Recovery Strategy

**Files:**
- Create: `docs/runbooks/rollback-plan.md`
- Modify: `tests/runbook-verification.test.js`

**Step 1: Write failing test for rollback plan structure**
Update `tests/runbook-verification.test.js` asserting that:
1. `docs/runbooks/rollback-plan.md` exists.
2. The rollback plan includes:
   - **Rollback Triggers**: Clear criteria for declaring a rollback (e.g. login failures, donation calculation regressions, data corruption, critical UI lockups).
   - **Cloudflare Pages Instant Rollback**: Step-by-step instructions to roll back via Cloudflare Dashboard or Wrangler CLI to the previous stable deployment ID in under 60 seconds.
   - **Git Version Revert**: Procedures for identifying the previous stable tag/commit and applying `git revert`.
   - **Google Apps Script Version Rollback**: Steps to revert `Code.js` via Apps Script version management without losing Google Sheets data.
   - **Donor & PIC Communication Protocol**: Pre-drafted Indonesian notification templates for informing users during downtime or recovery.
   - **Data Safety & Integrity Guarantees**: Specific checks ensuring Google Sheets donation records, transfer proofs, and token mappings remain safe and unaltered.

```javascript
test('Task 8: Rollback plan exists and contains deployment rollback, git revert, communication, and data safety instructions', () => {
  const rollbackPath = path.resolve('docs/runbooks/rollback-plan.md');
  assert.ok(fs.existsSync(rollbackPath), 'rollback-plan.md must exist');
  
  const content = fs.readFileSync(rollbackPath, 'utf8');
  assert.ok(content.includes('Kriteria Rollback') || content.includes('Rollback Trigger'), 'Must specify rollback triggers');
  assert.ok(content.includes('Cloudflare Pages'), 'Must explain Cloudflare Pages instant rollback');
  assert.ok(content.includes('Google Apps Script') || content.includes('Code.js'), 'Must cover backend script rollback');
  assert.ok(content.includes('Komunikasi') || content.includes('Template Pesan'), 'Must provide user communication templates');
  assert.ok(content.includes('Integritas Data') || content.includes('Data Safety'), 'Must detail data safety rules');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/runbook-verification.test.js`  
Expected: FAIL due to missing `docs/runbooks/rollback-plan.md`.

**Step 3: Create `docs/runbooks/rollback-plan.md`**
Author a complete, battle-tested rollback plan with step-by-step commands, dashboard workflows, communication templates in Indonesian, and database preservation guarantees.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/runbook-verification.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add docs/runbooks/rollback-plan.md tests/runbook-verification.test.js
rtk git commit -m "docs(runbook): create emergency rollback plan and data recovery procedures"
```

---

### Task 9: Full Test Suite Regression Verification & Delivery Gate

**Files:**
- Test: `tests/*.test.js` (all test files)
- Modify: `docs/plans/2026-08-17-production-readiness-phase6.md`

**Step 1: Execute full test suite**
Run all unit tests across Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, and Phase 6:
```bash
rtk node --test
```
Expected: All 20+ test files (50+ individual tests) pass with 0 failures and 0 warnings.

**Step 2: Execute manual regression verification**
Verify in browser across 360px and 390px mobile viewports as well as desktop:
- [ ] **Landing View**: Verify contrast on primary green CTA ("Saya mau donasi"), WhatsApp login privacy notice, and token login option.
- [ ] **Donor View**: Verify empty state with reassuring copy and next-step CTA ("Lihat campaign yang masih terbuka"), campaign grouping ("Bisa Diikuti", "Sudah Diikuti", "Selesai / Riwayat"), and profile edit modal.
- [ ] **PIC View**: Verify campaign status clarity (Open: 1 primary CTA; Closed: finalize CTA; Final: queue settled state), compact donor queue grouping, and one-click WhatsApp reminder recap copy button.
- [ ] **Admin View**: Verify sticky role navigation bar (`#admin-section-summary`, `#admin-section-campaigns`, `#admin-section-members`, `#admin-section-tools`), summary scope metrics, mobile campaign card density, overdue campaign callout with absolute date, member pagination (20 cards per batch + "Muat lebih banyak"), and secondary token generator placement.
- [ ] **SuperAdmin View**: Verify admin token creation, system settings save, and database maintenance data sweep.
- [ ] **Accessibility & Keyboard**: Verify skip link ("Lewati ke konten utama"), visible focus indicator, and modal keyboard trapping.
- [ ] **Security & Headers**: Verify `_headers` and `netlify.toml` security headers and report-only CSP.
- [ ] **Error Handling**: Verify simulated offline network and bad inputs trigger calm, non-technical Indonesian messages.

**Step 3: Commit final plan verification**
```bash
rtk git add docs/plans/2026-08-17-production-readiness-phase6.md
rtk git commit -m "docs(plan): complete phase 6 production readiness and verification implementation plan"
```

---

### Verification and Delivery Gate
1. Run all unit tests:
   `rtk node --test`
2. Confirm 100% pass rate across all test files.
3. Confirm creation of `docs/checklists/production-readiness-checklist.md`, `docs/runbooks/release-runbook.md`, `docs/runbooks/rollback-plan.md`, and `docs/reports/csp-stabilization-report.md`.
4. Validate responsive behavior on 360px and 390px mobile viewports.
5. Update `<project-root>/docs/plans/task.md` with task-by-task execution records.
6. Report evidence and claim completion.
