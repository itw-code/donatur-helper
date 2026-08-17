# Web Quality Audit — Donatur Helper

Date: 2026-08-17  
Method: static repository audit using the checks and thresholds in [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills), including its `web-quality-audit`, `performance`, `accessibility`, `seo`, and `best-practices` guidance.

## Scope and limitations

Audited production-facing files (`index.html`, `netlify_index.html`, `Code.js`, `netlify.toml`, `package.json`) and the mobile prototype. The public deployment `https://don4tpro.pages.dev/` was also tested with Lighthouse mobile emulation. These are lab measurements from one run, not field/CrUX data; authenticated donor/PIC/admin workflows were not exercised.

## Executive summary

The app has a reasonable baseline for responsive HTML (viewport tags are present, production dependency audit is clean, and most form controls have labels), but it is not yet aligned with the toolkit's launch targets. The highest risks are:

1. The main `index.html` is an HTML fragment without doctype, `<html lang>`, `<head>`, `<title>`, or `<body>`, which weakens accessibility, parsing, and SEO guarantees.
2. Third-party CSS/JavaScript is loaded without Subresource Integrity, and no security headers/CSP are defined in repository configuration.
3. Multiple `innerHTML` assignments interpolate error text or application data without consistently escaping it, creating a DOM-XSS risk if upstream values become attacker-controlled.
4. The main document is a large monolith with blocking stylesheet/script dependencies and a Google Fonts `@import`; this is likely to hurt LCP/INP on slower devices.
5. The main document contains a generated image without an `alt` attribute and has no skip link or semantic landmark structure.

## Runtime audit (public URL)

Lighthouse mobile run on 2026-08-17:

| Category | Score |
|---|---:|
| Performance | 88 |
| Accessibility | 66 |
| Best Practices | 96 |
| SEO | 73 |

Measured metrics: FCP 3.1 s, LCP 3.1 s, Speed Index 3.1 s, TBT 0 ms, CLS 0. The 3.1 s LCP is above the toolkit's ≤2.5 s good threshold.

The deployment returns HTTP 200 over HTTPS and includes `x-content-type-options: nosniff` and `referrer-policy: strict-origin-when-cross-origin`. It does not expose CSP or HSTS headers.

## Findings

### High priority

#### [SEO / Best practices] Deployed root is missing doctype, title, main landmark, and language

The public Lighthouse run confirms these are user-visible deployment issues: `doctype`, `document-title`, `landmark-one-main`, and `html-has-lang` all fail. This also triggers quirks mode. Fix the deployed shell, not only source fragments.

#### [SEO] `/robots.txt` is not a valid robots file

Lighthouse reports 4,656 syntax/unknown-directive errors because the deployment is serving the application HTML at the robots URL. Add a real `robots.txt` (or explicitly disallow indexing via deployment routing) and verify `/sitemap.xml` behavior.

#### [Accessibility] Color contrast fails on the primary landing CTA

Lighthouse identifies `div#view-landing div.card button.btn` (“Saya mau donasi”) with a 2.53:1 contrast ratio (`#fff` on `#10b981`), below the WCAG AA 4.5:1 requirement.

**Fix:** darken the green background or use a darker text color, then re-run contrast checks for hover/focus states.

#### [Best practices / Security] External CDN assets lack SRI

`index.html:4-5` loads Flatpickr from jsDelivr without `integrity` and `crossorigin`. The best-practices skill recommends pinning every third-party script and stylesheet so a CDN compromise cannot silently change executable code.

**Fix:** pin an exact Flatpickr version and add SHA-384 SRI (or self-host the assets). Keep the CSS and JavaScript versions aligned.

#### [Best practices / Security] No CSP or response security headers are configured

`netlify.toml` only redirects traffic and defines no `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, or frame-ancestors policy. The app also relies heavily on inline scripts/styles, so a CSP would require a nonce/hash migration rather than a permissive `unsafe-inline` policy.

**Fix:** configure headers at the actual Cloudflare Pages deployment (the redirect target), then introduce a report-only CSP, remove inline execution incrementally, and enforce HSTS after HTTPS is verified.

#### [Best practices / Security] Unescaped values are inserted into `innerHTML`

Examples include `index.html:2475`, `index.html:5320`, and `index.html:5487`, where `e.message`/`e` is concatenated into HTML without `escapeHtml`. `index.html:3700` inserts a data-derived image URL into both `href` and `src`; it is escaped for HTML syntax but is not scheme-validated. Any attacker-controlled API error or stored field could become executable markup or a `javascript:`/dangerous URL.

**Fix:** use `textContent` for messages; when markup is required, apply `escapeHtml` to every interpolated value and allow-list URL schemes (`https:` and approved relative URLs) before assigning `href`/`src`. Add regression tests for `<img onerror=...>` and `javascript:` payloads.

#### [Accessibility / SEO] Main document lacks required document metadata and landmarks

`index.html:1-5` starts with `<meta>` elements and has no doctype, `<html lang="...">`, `<head>`, `<body>`, or `<title>`. It also has no `<main>`, `<nav>`, `<header>`, or `<footer>` landmark in the production document. `netlify_index.html:2` has `<html>` without `lang`.

**Fix:** make the served document a complete HTML5 document, set `lang="id"`, add a unique descriptive title, and wrap primary content in semantic landmarks. If Apps Script injects the fragment into a shell, verify the deployed shell—not only the fragment—contains these elements.

### Medium priority

#### [Accessibility] Generated image has no alternative text

`index.html:3700` creates an `<img>` without `alt`. The toolkit requires meaningful alternative text for informative images and `alt=""` for decorative images.

**Fix:** derive a concise descriptive alt from the campaign/gift name, or use an empty alt when the image is purely decorative.

#### [Accessibility] No skip link and no explicit live-region strategy for major updates

The production HTML has no skip-link text and no semantic main landmark. Although five `aria-live` occurrences exist, many loading/error states are rendered by replacing `innerHTML`, so screen-reader announcements should be verified for each async workflow.

**Fix:** add a keyboard-visible “Lewati ke konten utama” link, landmark targets, and a consistent `role="status"`/`role="alert"` pattern for async state changes.

#### [Performance] Render-blocking external resources and CSS `@import`

`index.html:4-8` loads external Flatpickr CSS, a parser-blocking Flatpickr script, and Google Fonts through CSS `@import`. These add connection and render-blocking work before the app can paint.

**Fix:** self-host or preconnect to required origins, load the script with `defer`, replace `@import` with a `<link>` (or self-host a subset font with `font-display: swap`), and preload only the true LCP asset.

The runtime run estimates 1,610 ms of render-blocking savings across Flatpickr JS/CSS and Google Fonts. It also estimates 31 KiB of unused JavaScript and 6 KiB of avoidable unminified inline JavaScript.

#### [Performance] Large monolithic page and inline JavaScript

`index.html` is approximately 224 KB before transfer compression and contains extensive inline application logic. This increases parse/compile time and makes cache reuse difficult, which can degrade INP on mobile.

**Fix:** split stable CSS/JavaScript into cacheable assets, defer non-critical modules, and lazy-load role-specific dashboards or heavy dialogs.

#### [Best practices] Production console logging remains

`index.html` and `Code.js` contain multiple `console.log`/`console.error` calls. The toolkit calls for a clean production console and centralized error handling.

**Fix:** remove debug logs from production paths or route structured errors to a controlled logger with user-safe messages.

#### [SEO] No canonical, robots, sitemap, or structured data evidence

No `rel="canonical"`, robots/sitemap configuration, or JSON-LD structured data was found in the production HTML/config. This may be acceptable for an authenticated app, but the public access/verification surface should explicitly declare whether it is indexable.

**Fix:** mark private app routes `noindex` where appropriate; for public landing content, add canonical metadata, a robots policy, sitemap, and relevant JSON-LD.

### Low priority

#### [Performance] Image delivery is not responsive or prioritized

The generated image uses inline sizing only (`index.html:3700`) and does not provide `srcset`, `sizes`, explicit intrinsic dimensions, `loading`, or `decoding` hints.

**Fix:** provide responsive variants, width/height (or a stable aspect-ratio box), `loading="lazy"` for below-fold images, and `decoding="async"`. Use `fetchpriority="high"` only for the actual LCP image.

## Positive checks

- `index.html` and `netlify_index.html` include responsive viewport metadata.
- `index.html` declares UTF-8 near the top of the document.
- Forms have 55 inputs and 61 labels in the main document, indicating broad label coverage (association still needs runtime verification).
- `npm audit --omit=dev` reported 0 production vulnerabilities.
- No `document.write`, synchronous XHR, or `http://` URLs were found in the production files scanned.
- Focus-visible styling and ARIA attributes are present in the main document, though coverage and behavior should be verified with keyboard and screen-reader testing.

## Recommended order of work

1. Harden HTML insertion and URL validation; add XSS regression tests.
2. Define headers/CSP at the real Cloudflare Pages deployment and add SRI or self-host CDN assets.
3. Fix the document shell (`doctype`, `lang`, title, landmarks, skip link) and image alt text.
4. Reduce critical-path work (defer Flatpickr, remove font `@import`, split the monolith, optimize images).
5. Re-run Lighthouse mobile and desktop after fixes; use the recorded baseline (88/66/96/73, LCP 3.1 s, CLS 0) to confirm improvement.

## Suggested verification commands

```text
npm audit --omit=dev
npx lighthouse <deployed-url> --preset=mobile --view
npx html-validate index.html netlify_index.html
```
