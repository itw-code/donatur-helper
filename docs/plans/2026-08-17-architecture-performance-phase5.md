# Authenticated Mobile UX Phase 5 Implementation Plan: Architecture & Performance Optimization

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Split the monolithic `index.html` into cacheable, modular assets (CSS and ES Modules) and optimize image delivery to improve LCP/INP, enable browser caching, and make the codebase maintainable, without breaking Phases 1-4.

**Architecture:** Transition from a single-file HTML app to a modular static site structure using native ES Modules (`<script type="module">`). Keep the stack vanilla (no heavy frameworks like React/Vue, and no complex bundlers unless strictly necessary). Preserve all Phase 1 (sticky nav, member pagination, overdue callouts), Phase 2 (PIC queue usability, final states, card density), Phase 3 (Indonesian status semantics, friendly error normalizer, trust microcopy), and Phase 4 (document shell, DOM-XSS hardening, robots.txt, SRI, security headers, skip link) improvements.

**Tech Stack:** Vanilla HTML5, CSS3 with semantic tokens, Vanilla JavaScript (ES6+ Modules), Node.js built-in test runner (`node --test`), Cloudflare Pages (`_headers`) and Netlify (`netlify.toml`) deployment configuration.

---

### Task 1: Extract and Modularize CSS

**Files:**
- Create: `css/base.css`
- Create: `css/components.css`
- Create: `css/views.css`
- Modify: `index.html:19-1778`
- Test: `tests/architecture-performance.test.js`

**Step 1: Write failing test for CSS modularization**
Create `tests/architecture-performance.test.js` asserting that:
1. `css/base.css`, `css/components.css`, and `css/views.css` exist and contain non-empty CSS rules.
2. `css/base.css` contains `:root` CSS variables (`--primary: #047857`, `--radius`, `--space-*`), reset rules, skip-link, and core typography.
3. `css/components.css` contains reusable component styles (buttons, cards, badges, modals, tables, toasts, form controls).
4. `css/views.css` contains role-specific views (`#view-landing`, `#view-user-dashboard`, `#view-pic-dashboard`, `#view-admin-dashboard`, `.admin-nav-bar`, media queries).
5. `index.html` links all three stylesheets in `<head>` via `<link rel="stylesheet" ...>` in correct order and does not contain monolithic `<style>` tags exceeding 50 lines.

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/architecture-performance.test.js`  
Expected: FAIL due to missing `css/` files and inline `<style>` present in `index.html`.

**Step 3: Extract CSS into modular files and update `index.html`**
1. Extract base layout, design tokens, reset, typography, and skip-link styles from `index.html` into `css/base.css`:
   - `:root` variables, `*`, `body`, `:focus-visible`, `.skip-link`, `.wrap`, `.header`, `.brand`, typography.
2. Extract reusable components into `css/components.css`:
   - `.card`, `.btn`, `.badge`, `.status-badge`, `.modal`, `.toast`, `.form-group`, `.input`, `.table`, `.tabs`, `.loading`, `.donor-empty-state`, `.donor-card-settled`, `.admin-load-more`.
3. Extract role-specific view styles and responsive breakpoints into `css/views.css`:
   - `#view-landing`, `#view-user-login`, `#view-token-login`, `#view-user-dashboard`, `#view-pic-create`, `#view-pic-dashboard`, `#view-admin-dashboard`, `#view-superadmin-dashboard`, `.admin-nav-bar`, `.admin-sticky-toolbar`, `@media (max-width: 640px)`.
4. Update `index.html` `<head>`:
   ```html
   <!-- Application Stylesheets -->
   <link rel="stylesheet" href="css/base.css">
   <link rel="stylesheet" href="css/components.css">
   <link rel="stylesheet" href="css/views.css">
   ```
   Remove the inline `<style>` block (lines 19-1778).

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/architecture-performance.test.js`  
Expected: PASS for Task 1 CSS assertions.

**Step 5: Commit**
```bash
git add css/base.css css/components.css css/views.css index.html tests/architecture-performance.test.js
git commit -m "refactor(css): extract inline styles into modular css files"
```

---

### Task 2: Extract and Modularize JavaScript into ES Modules

**Files:**
- Create: `js/config.js`
- Create: `js/state.js`
- Create: `js/storage.js`
- Create: `js/utils.js`
- Create: `js/api.js`
- Create: `js/views/auth.js`
- Create: `js/views/donor.js`
- Create: `js/views/pic.js`
- Create: `js/views/admin.js`
- Create: `js/views/superadmin.js`
- Create: `js/app.js`
- Modify: `index.html:2222-5766`
- Test: `tests/architecture-performance.test.js`

**Step 1: Write failing test for JavaScript ES Modules**
Add test cases in `tests/architecture-performance.test.js` checking that:
1. `js/config.js`, `js/state.js`, `js/storage.js`, `js/utils.js`, `js/api.js`, `js/views/*.js`, and `js/app.js` exist.
2. `index.html` loads `<script type="module" src="js/app.js" defer></script>` and contains no large inline `<script>` tags.
3. `js/utils.js` exports core utilities (`escapeHtml`, `sanitizeUrl`, `formatUserErrorMessage`, `formatRupiah`, `formatCompactDate`, `showToast`, `showInfoModal`, `showConfirmModal`, `closeConfirmModal`).
4. `js/app.js` exposes global handlers to `window` (e.g. `switchTab`, `showInfoModal`, `logoutToken`, `copyUnpaidReminderRecap`, etc.) to maintain 100% compatibility with HTML `onclick` and event handlers.
5. All security checks from Phase 4 (`sanitizeUrl` filtering, `textContent` error rendering) remain present in the module code.

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/architecture-performance.test.js`  
Expected: FAIL due to missing `js/` module files and inline script still present in `index.html`.

**Step 3: Implement modular ES Modules structure**
1. **`js/config.js`**:
   - Export `SCRIPT_URL` and debug flags (`window._DH_DEBUG`).
2. **`js/storage.js`**:
   - Export `safeGet`, `safeSet`, `safeRemove` for localStorage wrapping.
3. **`js/state.js`**:
   - Export application state variables: `targetCampaignId`, `adminActionQueueState`, `_adminMembersPagination`, `_saMembersPagination`, `_cachedMembers`, etc.
4. **`js/utils.js`**:
   - Export `escapeHtml`, `sanitizeUrl`, `formatUserErrorMessage`, `formatRupiah`, `formatCompactDate`, `renderOptimizedImage`, `showToast`, `showInfoModal`, `showConfirmModal`, `closeConfirmModal`, and clipboard helpers.
5. **`js/api.js`**:
   - Export `call(action, payload)` and `fetchJsonp(url)` with timeout protection and standard error normalizer.
6. **`js/views/auth.js`**:
   - Export authentication and route helpers: `switchTab`, `checkPhoneLogin`, `verifyOtp`, `loginWithToken`, `logoutToken`, `showLandingView`.
7. **`js/views/donor.js`**:
   - Export donor dashboard logic: `loadUserDashboard`, `refreshCampaignList`, `renderCampaignCard`, `openMassJoinModal`, `saveProofOfTransfer`, `openProfileModal`, `saveUserProfile`.
8. **`js/views/pic.js`**:
   - Export PIC dashboard logic: `loadPicDashboard`, `renderPicDashboard`, `renderDonorTable`, `getPicDonorQueueState`, `getPicDonorQueueLabel`, `copyUnpaidReminderRecap`, `finalizeCampaign`, `reopenCampaign`, `deleteDraftCampaign`.
9. **`js/views/admin.js`**:
   - Export Admin dashboard logic: `loadAdminDashboard`, `renderAdminSummary`, `renderAdminCampaignViews`, `renderAdminCampaignDeadline`, `refreshMembers`, `filterMembers`, `renderMembersView`, `loadMoreAdminMembers`, `generatePicToken`, `generateAdminToken`, `recalculateDonorSplit`, `sweepArchivedData`.
10. **`js/views/superadmin.js`**:
    - Export SuperAdmin dashboard logic: `loadSuperAdminDashboard`, `renderSuperAdminView`, `saveSystemSettings`, `renderAdminTokenList`.
11. **`js/app.js`**:
    - Import modules, bind global UI handlers to `window` for HTML attribute compatibility, wire initial routing (`targetCampaignId` from `#c=` or `?c=`), and initialize Flatpickr on `DOMContentLoaded`.
12. **`index.html`**:
    - Replace the inline script with `<script type="module" src="js/app.js" defer></script>`.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/architecture-performance.test.js`  
Expected: PASS for Task 2 module assertions.

**Step 5: Commit**
```bash
git add js/ index.html tests/architecture-performance.test.js
git commit -m "refactor(js): modularize application logic into native es modules"
```

---

### Task 3: Responsive and Optimized Image Delivery

**Files:**
- Modify: `css/components.css`
- Modify: `js/utils.js`
- Modify: `js/views/donor.js`
- Modify: `js/views/pic.js`
- Modify: `index.html`
- Test: `tests/architecture-performance.test.js`

**Step 1: Write failing test for image optimization**
Add test in `tests/architecture-performance.test.js` asserting:
1. `renderOptimizedImage` utility in `js/utils.js` outputs `<img>` with `loading="lazy"`, `decoding="async"`, descriptive `alt`, and `sanitizeUrl` validation.
2. Responsive image CSS classes (`.img-responsive`, `.proof-preview-img`, `.gift-preview-img`) are defined with aspect-ratio protection (`aspect-ratio: auto`, `max-width: 100%`, `height: auto`, `object-fit: cover`) to eliminate Cumulative Layout Shift (CLS).
3. Critical hero/logo images (if any) use `fetchpriority="high"` while thumbnail and modal images default to `loading="lazy"`.

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/architecture-performance.test.js`  
Expected: FAIL due to missing `renderOptimizedImage` and image layout rules.

**Step 3: Implement image optimization and CSS rules**
1. In `js/utils.js`, create `renderOptimizedImage`:
   ```javascript
   export function renderOptimizedImage(src, alt = '', options = {}) {
     const safeSrc = sanitizeUrl(src);
     if (!safeSrc || safeSrc === '#') return '';
     const className = options.className ? ` class="${escapeHtml(options.className)}"` : ' class="img-responsive"';
     const loading = options.priority ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" decoding="async"';
     const widthAttr = options.width ? ` width="${options.width}"` : '';
     const heightAttr = options.height ? ` height="${options.height}"` : '';
     const safeAlt = escapeHtml(alt || 'Gambar bukti transfer atau campaign');
     return `<img src="${escapeHtml(safeSrc)}" alt="${safeAlt}"${className} ${loading}${widthAttr}${heightAttr} onerror="this.style.display='none'">`;
   }
   ```
2. In `css/components.css`, add responsive image and aspect-ratio styling:
   ```css
   .img-responsive {
     max-width: 100%;
     height: auto;
     display: block;
   }
   .proof-preview-img, .gift-preview-img {
     max-width: 100%;
     height: auto;
     aspect-ratio: 16 / 9;
     object-fit: contain;
     border-radius: var(--radius);
     background: var(--bg);
     border: 1px solid var(--border);
   }
   ```
3. Update `js/views/donor.js` and `js/views/pic.js` to render screenshots, receipts, and proofs using `renderOptimizedImage`.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/architecture-performance.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
git add css/components.css js/utils.js js/views/donor.js js/views/pic.js tests/architecture-performance.test.js
git commit -m "perf(images): add responsive image helper, lazy loading, and cls aspect-ratio prevention"
```

---

### Task 4: Caching Strategy and Deployment Configuration

**Files:**
- Modify: `_headers`
- Modify: `netlify.toml`
- Test: `tests/architecture-performance.test.js`

**Step 1: Write failing test for caching headers**
Add test in `tests/architecture-performance.test.js` checking:
1. `_headers` defines long-term immutable caching (`Cache-Control: public, max-age=31536000, immutable`) for `/css/*`, `/js/*`, and `/assets/*`.
2. `_headers` specifies revalidation (`Cache-Control: public, max-age=0, must-revalidate` or `no-cache`) for `/` and `/index.html`.
3. `_headers` maintains all Phase 4 security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy-Report-Only`).
4. `netlify.toml` mirrors the static asset and HTML caching rules.

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/architecture-performance.test.js`  
Expected: FAIL due to missing caching rules in `_headers` and `netlify.toml`.

**Step 3: Update `_headers` and `netlify.toml`**
1. Update `_headers` (Cloudflare Pages):
   ```
   # Long-term immutable caching for versioned static assets
   /css/*
     Cache-Control: public, max-age=31536000, immutable
   /js/*
     Cache-Control: public, max-age=31536000, immutable
   /assets/*
     Cache-Control: public, max-age=31536000, immutable

   # Immediate revalidation for HTML documents and root shell
   /
     Cache-Control: public, max-age=0, must-revalidate
     X-Content-Type-Options: nosniff
     X-Frame-Options: SAMEORIGIN
     Referrer-Policy: strict-origin-when-cross-origin
     Permissions-Policy: camera=(), microphone=(), geolocation=()
     Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://accounts.google.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self';

   /index.html
     Cache-Control: public, max-age=0, must-revalidate
     X-Content-Type-Options: nosniff
     X-Frame-Options: SAMEORIGIN
     Referrer-Policy: strict-origin-when-cross-origin
     Permissions-Policy: camera=(), microphone=(), geolocation=()
     Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://accounts.google.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self';
   ```
2. Update `netlify.toml` to include matching `[[headers]]` entries for `/css/*`, `/js/*`, and `/*`.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/architecture-performance.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
git add _headers netlify.toml tests/architecture-performance.test.js
git commit -m "perf(headers): configure immutable static asset caching and html revalidation policy"
```

---

### Task 5: Test Runner Adaptation & Full Test Harness Compatibility

**Files:**
- Create: `tests/test-harness.js`
- Modify: `tests/*.test.js` (update 15 existing test files to use shared module-loading harness)
- Test: `tests/*.test.js`

**Step 1: Create shared test harness `tests/test-harness.js`**
Create a unified test harness that:
1. Simulates the browser DOM environment (`document`, `window`, `localStorage`, `DOMParser`, `elements`).
2. Reads and evaluates the modular JS files (`js/config.js`, `js/state.js`, `js/storage.js`, `js/utils.js`, `js/api.js`, `js/views/*.js`, `js/app.js`) inside Node VM or as a combined virtual bundle.
3. Exposes a clean `createBrowserEnvironment(initialState)` function providing sandbox context to existing tests.

**Step 2: Update existing test files to use the harness**
Refactor the VM script loading in:
- `tests/admin-campaign-density.test.js`
- `tests/admin-mobile-ux.test.js`
- `tests/admin-tools-cta.test.js`
- `tests/copy-trust-quality.test.js`
- `tests/donor-campaign-grouping.test.js`
- `tests/donor-empty-state.test.js`
- `tests/donor-open-dashboard.test.js`
- `tests/language-icon-consistency.test.js`
- `tests/pic-action-priority.test.js`
- `tests/pic-action-queue.test.js`
- `tests/pic-final-state.test.js`
- `tests/pic-queue-usability.test.js`
- `tests/status-semantics.test.js`
- `tests/trust-microcopy.test.js`
- `tests/web-quality-security.test.js`

**Step 3: Run all unit tests**
Run: `rtk node --test`  
Expected: All 16 test suites (40+ individual tests) pass with 0 failures.

**Step 4: Commit**
```bash
git add tests/test-harness.js tests/*.test.js
git commit -m "test: adapt test suite harness to evaluate modular es modules"
```

---

### Task 6: Full Regression Verification & Manual Quality Checklist

**Files:**
- Modify: `docs/plans/2026-08-17-architecture-performance-phase5.md`
- Test: `tests/*.test.js`

**Step 1: Run complete test suite**
Run: `rtk node --test`  
Expected: All tests pass with 0 failures across Phase 1, Phase 2, Phase 3, Phase 4, and Phase 5.

**Step 2: Execute manual verification checklist**
Verify in browser across 360px and 390px mobile viewports:
- [ ] **Document Structure**: Confirm `index.html` loads `<link rel="stylesheet" href="css/...">` and `<script type="module" src="js/app.js" defer></script>`.
- [ ] **Network & Caching**: Open Network tab; verify `css/*.css`, `js/*.js` return `Cache-Control: public, max-age=31536000, immutable` and `index.html` returns `max-age=0, must-revalidate`.
- [ ] **Accessibility & Skip Link**: Press `Tab` on load; confirm skip-link is visible and functional.
- [ ] **Color Contrast**: Verify primary emerald CTA contrast meets WCAG AA (5.82:1).
- [ ] **Donor Flow**:
  - Open donor view, check empty states, campaign grouping ("Bisa Diikuti", "Sudah Diikuti", "Selesai"), mass join modal, profile edit modal.
- [ ] **PIC Flow**:
  - Open PIC campaign view, verify action priorities, action queues, settled cards, WhatsApp reminder recap copy button.
- [ ] **Admin & SuperAdmin Flow**:
  - Open Admin dashboard, verify sticky navigation, summary metrics, member pagination ("Muat lebih banyak" for >20 items), overdue callout display, token generator modal.
- [ ] **Date Picker & SRI**:
  - Verify Flatpickr date picker initializes properly on date inputs with integrity intact.
- [ ] **Performance & CLS**:
  - Verify no layout shifts from image loading; verify initial load feels instant on mobile.

**Step 3: Commit plan verification**
```bash
git add docs/plans/2026-08-17-architecture-performance-phase5.md
git commit -m "docs(plan): complete phase 5 architecture and performance implementation plan"
```

---

### Verification and Delivery Gate
1. Run all unit tests:
   `rtk node --test`
2. Confirm 100% test pass rate across all 16 test files.
3. Validate CSS and ES Module file structure and import integrity.
4. Verify responsive behavior and layout stability on 360px and 390px mobile viewports.
5. Update `<project-root>/docs/plans/task.md` with task-by-task execution records.
6. Report evidence and claim completion.
