# Authenticated Mobile UX Phase 4 Implementation Plan: Web Quality, Security & Accessibility Hardening

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement Phase 4 web quality, security, accessibility, and performance hardening for Donatur Helper to establish a valid HTML5 document shell, harden innerHTML and URL handling against DOM-XSS, configure robots.txt and deployment security headers, pin third-party assets with SRI, enhance accessibility contrast/landmarks/skip links, and optimize critical-path performance without regressing Phase 1, Phase 2, or Phase 3 UX/copy improvements.

**Architecture:** Update `index.html`, `netlify_index.html`, `Code.js`, deployment configuration (`_headers`, `robots.txt`, `netlify.toml`), and related JavaScript using vanilla HTML5, CSS3 with semantic tokens, Vanilla JavaScript (ES6+), and the Node.js built-in test runner (`node --test`). Maintain single-file deployment simplicity while adding strict input escaping, URL protocol sanitization, deployment headers, and accessibility landmarks. Preserve all Phase 1 (sticky role navigation, member pagination, overdue callouts), Phase 2 (PIC queue usability, final states, card density, token CTA placement), and Phase 3 (Indonesian status semantics, friendly error normalizer, trust microcopy) behaviors.

**Tech Stack:** Vanilla HTML5, CSS3 with semantic tokens, Vanilla JavaScript (ES6+), Node.js built-in test runner (`node --test`), Cloudflare Pages (`_headers`, `robots.txt`) and Netlify (`netlify.toml`) deployment configuration.

---

### Task 1: Valid HTML5 Document Shell and Semantic Landmarks

**Files:**
- Modify: `index.html:1-15` and `index.html:1740-1755`, `index.html:5700-5705`
- Modify: `netlify_index.html:1-10`
- Modify: `Code.js:119-124`
- Test: `tests/web-quality-security.test.js`

**Step 1: Write failing test for document shell and landmarks**
Create `tests/web-quality-security.test.js` asserting that:
1. `index.html` begins with `<!DOCTYPE html>` and `<html lang="id">`.
2. `<head>` contains `<meta charset="UTF-8">`, `<meta name="viewport" ...>`, and `<title>Donatur Helper — Patungan Hadiah & Donasi Kantor</title>`.
3. `<main id="main-content">` wraps all role views.
4. `netlify_index.html` declares `<html lang="id">` and has a descriptive title.
5. `Code.js` `doGet` sets title to `'Donatur Helper'`.

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: FAIL due to missing `<!DOCTYPE html>`, `<html lang="id">`, `<head>`, `<body>`, and `<main>`.

**Step 3: Implement HTML5 document shell in `index.html`, `netlify_index.html`, and `Code.js`**
- In `index.html`:
  - Wrap top in `<!DOCTYPE html><html lang="id"><head>...` containing charset, viewport, meta description, and title.
  - Open `<body>`, place skip-link and header.
  - Wrap `#view-landing`, `#view-user-login`, `#view-user-dashboard`, `#view-token-login`, `#view-pic-create`, `#view-pic-dashboard`, `#view-admin-dashboard`, and `#view-superadmin-dashboard` inside `<main id="main-content" class="wrap" tabindex="-1">`.
  - Close `</main>`, `</body>`, `</html>` at the bottom of the file.
- In `netlify_index.html`:
  - Update `<html lang="id">` and title to `Verifikasi Akses — Donatur Helper`.
- In `Code.js`:
  - Update `doGet` `.setTitle('Donatur Helper')`.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: PASS for document shell assertions.

**Step 5: Commit**
```bash
git add index.html netlify_index.html Code.js tests/web-quality-security.test.js
git commit -m "fix(html): establish valid html5 document shell, lang, title, and semantic landmarks"
```

---

### Task 2: Harden innerHTML and URL Handling Against DOM-XSS

**Files:**
- Modify: `index.html:2200-2250` (URL sanitization helper `sanitizeUrl`)
- Modify: `index.html:2450-2600` (Auth and profile message interpolation)
- Modify: `index.html:3080-3135` (Donor campaign gift links and proof links)
- Modify: `index.html:4320-4350` (PIC donor proof links and WhatsApp reminder links)
- Modify: `index.html:5350-5420` (Admin / SuperAdmin message elements)
- Test: `tests/web-quality-security.test.js`

**Step 1: Write failing test for XSS and URL scheme sanitization**
Add test cases in `tests/web-quality-security.test.js` asserting:
1. `sanitizeUrl` allows valid `https://`, `mailto:`, `tel:`, and safe relative anchors (`#...`), while blocking `javascript:`, `data:text/html`, and invalid protocols (returns `#`).
2. Data-derived proof links (`d.ProofLink`), gift links (`c.GiftLink`), and image URLs (`c.GiftImage`) pass through `sanitizeUrl` before attribute insertion.
3. Message containers (`msgEl`, `prof-msg`, `sa-member-msg`, `admin-new-token`) use `textContent` or `escapeHtml` / `formatUserErrorMessage` rather than raw error concatenation.
4. XSS payloads (`<img src=x onerror=alert(1)>`, `javascript:alert(1)`) are properly neutralized.

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: FAIL on `sanitizeUrl` not defined or unsafe URL handling.

**Step 3: Implement `sanitizeUrl` and replace unsafe `innerHTML` in `index.html`**
- Add `sanitizeUrl`:
  ```javascript
  function sanitizeUrl(rawUrl, fallback = '#') {
    if (!rawUrl || typeof rawUrl !== 'string') return fallback;
    const trimmed = rawUrl.trim();
    if (!trimmed) return fallback;
    if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
    if (/^(?:javascript|data|vbscript):/i.test(trimmed)) return fallback;
    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') {
        return trimmed;
      }
      return fallback;
    } catch (_) {
      if (/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed) || /^tel:\+?[0-9\-\s()]+$/i.test(trimmed)) {
        return trimmed;
      }
      return fallback;
    }
  }
  ```
- Wrap all `c.GiftLink`, `c.GiftImage`, `c.proofLink`, and `d.ProofLink` in `sanitizeUrl(...)` before inserting into `<a href="...">`.
- Replace unsafe message assignments (e.g. `msgEl.innerHTML = '<span class="error">' + (e.message || e) + '</span>'`) with `msgEl.textContent = formatUserErrorMessage(e)` or safe `escapeHtml`.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
git add index.html tests/web-quality-security.test.js
git commit -m "security: sanitize url schemes and harden dynamic innerHTML interpolations against dom-xss"
```

---

### Task 3: Real robots.txt and Search Indexing Policy

**Files:**
- Create: `robots.txt`
- Modify: `index.html:1-25`
- Test: `tests/web-quality-security.test.js`

**Step 1: Write failing test for robots.txt and indexing policy**
Add test in `tests/web-quality-security.test.js` checking:
1. `robots.txt` exists at root, specifies `User-agent: *`, allows `/`, and disallows token parameters and private query hashes (`/*?token=*`, `/*#c=*`).
2. `index.html` declares `<meta name="robots" content="index, follow">` for public landing.

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: FAIL due to missing `robots.txt`.

**Step 3: Create `robots.txt` and add meta robots to `index.html`**
- Create `robots.txt`:
  ```txt
  # robots.txt for Donatur Helper (https://don4tpro.pages.dev)
  User-agent: *
  Allow: /
  Allow: /robots.txt
  Disallow: /*?token=*
  Disallow: /*#c=*
  Disallow: /api/
  ```
- In `index.html` `<head>`, add `<meta name="robots" content="index, follow">`.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
git add robots.txt index.html tests/web-quality-security.test.js
git commit -m "feat(seo): add valid robots.txt and search indexing policy"
```

---

### Task 4: Third-Party Asset Integrity (SRI) for Flatpickr

**Files:**
- Modify: `index.html:4-6`
- Test: `tests/web-quality-security.test.js`

**Step 1: Write failing test for Flatpickr version pinning and SRI attributes**
Add test in `tests/web-quality-security.test.js` checking:
1. Flatpickr stylesheet is pinned to `4.6.13` with `integrity="sha384-RkASv+6KfBMW9eknReJIJ6b3UnjKOKC5bOUaNgIY778NFbQ8MtWq9Lr/khUgqtTt"` and `crossorigin="anonymous"`.
2. Flatpickr script is pinned to `4.6.13` with `integrity="sha384-5JqMv4L/Xa0hfvtF06qboNdhvuYXUku9ZrhZh3bSk8VXF0A/RuSLHpLsSV9Zqhl6"`, `crossorigin="anonymous"`, and `defer`.

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: FAIL due to unpinned/missing SRI attributes.

**Step 3: Update Flatpickr assets in `index.html`**
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.css" integrity="sha384-RkASv+6KfBMW9eknReJIJ6b3UnjKOKC5bOUaNgIY778NFbQ8MtWq9Lr/khUgqtTt" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js" integrity="sha384-5JqMv4L/Xa0hfvtF06qboNdhvuYXUku9ZrhZh3bSk8VXF0A/RuSLHpLsSV9Zqhl6" crossorigin="anonymous" defer></script>
```

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
git add index.html tests/web-quality-security.test.js
git commit -m "security: pin flatpickr to v4.6.13 with sri integrity and defer script loading"
```

---

### Task 5: Security Headers & CSP Deployment Strategy

**Files:**
- Create: `_headers`
- Modify: `netlify.toml`
- Test: `tests/web-quality-security.test.js`

**Step 1: Write failing test for deployment security headers**
Add test in `tests/web-quality-security.test.js` asserting:
1. `_headers` file exists for Cloudflare Pages with `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: ...`, and `Content-Security-Policy-Report-Only`.
2. CSP Report-Only policy permits necessary origins (`'self'`, `'unsafe-inline'`, `https://cdn.jsdelivr.net`, `https://accounts.google.com`, `https://fonts.googleapis.com`, `https://fonts.gstatic.com`, `https://script.google.com`).
3. `netlify.toml` includes matching response headers.

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: FAIL due to missing `_headers`.

**Step 3: Create `_headers` and update `netlify.toml`**
- Create `_headers`:
  ```
  /*
    X-Content-Type-Options: nosniff
    X-Frame-Options: SAMEORIGIN
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: camera=(), microphone=(), geolocation=()
    Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://accounts.google.com; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self';
  ```
- Update `netlify.toml` to declare identical response headers for the Netlify redirect host.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
git add _headers netlify.toml tests/web-quality-security.test.js
git commit -m "security: add cloudflare pages _headers and report-only csp configuration"
```

---

### Task 6: Accessibility Hardening: Contrast, Skip Link & ARIA Live Regions

**Files:**
- Modify: `index.html:10-40` (CSS tokens for primary green contrast)
- Modify: `index.html:1740-1760` (Skip link & landmark header)
- Modify: `index.html:2150-2250` (Toasts & modal live regions `role="status"` / `role="alert"`)
- Test: `tests/web-quality-security.test.js`

**Step 1: Write failing test for accessibility improvements**
Add test in `tests/web-quality-security.test.js` checking:
1. Primary color `--primary: #047857` has a WCAG AA contrast ratio > 4.5:1 (specifically 5.82:1) against `#ffffff`.
2. Skip link `<a href="#main-content" class="skip-link">Lewati ke konten utama</a>` is present as the first child in `<body>`.
3. Toast container has `role="status"` and `aria-live="polite"`.
4. Focus visible style `:focus-visible` is defined with high visibility outline.
5. All dynamic images have `alt` attributes.

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: FAIL on contrast token, skip link, or live region checks.

**Step 3: Implement accessibility updates in `index.html`**
- Darken `--primary` to `#047857` and `--primary-hover` to `#065f46` (exceeds 4.5:1 WCAG AA contrast ratio for white text).
- Add skip link at the top of `<body>`:
  ```html
  <a href="#main-content" class="skip-link">Lewati ke konten utama</a>
  ```
- Add skip-link CSS styling and `:focus-visible` styling:
  ```css
  .skip-link {
    position: absolute;
    top: -100px;
    left: 16px;
    background: #0f172a;
    color: #ffffff;
    padding: 12px 16px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    z-index: 10000;
    text-decoration: none;
    box-shadow: var(--shadow-md);
    transition: top 0.2s ease;
  }
  .skip-link:focus {
    top: 16px;
    outline: 3px solid var(--blue);
  }
  :focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
  ```
- Ensure dynamic notifications use `role="status"` / `role="alert"` and `aria-live="polite"`.
- Ensure any `<img>` tag created has descriptive `alt` or `alt=""`.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
git add index.html tests/web-quality-security.test.js
git commit -m "a11y: harden landing contrast to wcag aa, add skip link, and wire aria live regions"
```

---

### Task 7: Performance Optimization: Font Links, Preconnect & Clean Logger

**Files:**
- Modify: `index.html:1-25` (Font `<link>` tags and preconnect)
- Modify: `index.html:2200-2220` (Controlled logger)
- Test: `tests/web-quality-security.test.js`

**Step 1: Write failing test for performance critical path**
Add test in `tests/web-quality-security.test.js` asserting:
1. Google Fonts is loaded via `<link>` in `<head>` with `preconnect` to `https://fonts.googleapis.com` and `https://fonts.gstatic.com`.
2. No `@import url('https://fonts.googleapis.com...')` exists inside `<style>`.
3. Preconnect link to `https://cdn.jsdelivr.net` is present.
4. No unhandled `console.log` statements in production workflows.

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: FAIL due to `@import` present in `<style>` and missing `<link>` tags.

**Step 3: Implement font links, preconnect, and clean logging in `index.html`**
- In `<head>` of `index.html`:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
  ```
- Remove `@import url('https://fonts.googleapis.com...');` from `<style>`.
- Replace noisy debug `console.log` statements in production paths with a guarded debug logger (`if (window._DH_DEBUG) console.log(...)`).

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/web-quality-security.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
git add index.html tests/web-quality-security.test.js
git commit -m "perf: replace font @import with preconnected link tags and clean production logging"
```

---

### Task 8: Full Test Suite Regression Verification & Manual Checklist

**Files:**
- Test: `tests/*.test.js` (Run all 15 test files)

**Step 1: Run complete unit test suite**
Run: `rtk node --test`  
Expected: All 30+ tests across Phase 1, Phase 2, Phase 3, and Phase 4 pass with 0 failures.

**Step 2: Execute manual verification checklist**
Verify across 360px and 390px viewports:
- [ ] **Document Shell & SEO**: Inspect page source; confirm `<!DOCTYPE html>`, `<html lang="id">`, `<head>`, `<title>`, `<meta name="robots">`, and `<main id="main-content">`.
- [ ] **Skip Link**: Press `Tab` on page load; confirm visible "Lewati ke konten utama" banner jumps focus to `#main-content`.
- [ ] **Contrast**: Check landing page "Saya mau donasi" button (dark emerald `#047857` with `#ffffff` text, contrast 5.82:1).
- [ ] **Flatpickr**: Open create campaign date picker; verify modal opens, sets min/max dates, and formats `YYYY-MM-DD`.
- [ ] **XSS Sanitization**: Test malicious URL in proof link or name; confirm harmless `#` fallback or sanitized output.
- [ ] **Donor View**: Verify donor empty states, campaign grouping ("Bisa Diikuti", "Sudah Diikuti", "Selesai"), and combined payment.
- [ ] **PIC View**: Verify PIC action priorities, settled donor cards, and copy buttons.
- [ ] **Admin View**: Verify sticky navigation bar, summary scope labels, member pagination (20 items with "Muat lebih banyak"), and overdue callouts.
- [ ] **SuperAdmin View**: Verify sticky navigation bar, admin token generation, and clean settings save.

**Step 3: Commit final plan verification**
```bash
git add docs/plans/2026-08-17-web-quality-security-phase4.md
git commit -m "docs(plan): complete phase 4 web quality and security hardening implementation plan"
```

---

### Verification and Delivery Gate
1. Run all unit tests:
   `rtk node --test`
2. Validate document structure and security headers in local test harness.
3. Validate responsiveness and keyboard navigation on 360px and 390px mobile viewports.
4. Update `docs/plans/task.md` with task-by-task execution records.
5. Report evidence and claim completion.
