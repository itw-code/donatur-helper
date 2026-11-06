const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveToken } = require('./token-util');
const test = require('node:test');

function getIndexHtml() {
  return fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
}


function getCodeJs() {
  return fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8');
}

test('Task 1: index.html has valid HTML5 doctype, lang="id", head, title, body, and main landmark', () => {
  const html = getIndexHtml();

  // 1. Doctype and html lang
  assert.match(html, /^<!DOCTYPE html>/i, 'Must start with <!DOCTYPE html>');
  assert.match(html, /<html\s+lang="id">/i, 'Must have <html lang="id">');

  // 2. Head structure and title
  assert.match(html, /<head>[\s\S]*?<\/head>/i, 'Must have <head>...</head>');
  assert.match(html, /<title>DonatPRO.*<\/title>/i, 'Must have descriptive title in <head>');
  assert.match(html, /<meta\s+charset="UTF-8">/i, 'Must have charset');
  assert.match(html, /<meta\s+name="viewport"/i, 'Must have viewport meta');

  // 3. Body and main landmark
  assert.match(html, /<body>[\s\S]*?<\/body>/i, 'Must have <body>...</body>');
  assert.match(html, /<main id="main-content"[\s\S]*?>[\s\S]*?<\/main>/i, 'Must have <main id="main-content">');
  assert.match(html, /<\/html>\s*$/i, 'Must close with </html>');
});


test('Task 1: Code.js doGet sets title to Donatur Helper', () => {
  const code = getCodeJs();
  assert.match(code, /\.setTitle\(['"]Donatur Helper['"]\)/, 'Code.js doGet must set title to Donatur Helper');
  assert.doesNotMatch(code, /\.setTitle\(['"]Donation Helper['"]\)/, 'Code.js doGet must not use Donation Helper');
});

const vm = require('node:vm');
const { getAppScript } = require('./test-harness');

function extractInlineScript() {
  return getAppScript();
}

function createVmScope() {
  const elements = new Map();
  const makeEl = id => ({
    id,
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    style: {},
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    appendChild() {},
    setAttribute() {},
    getAttribute() { return null; }
  });

  const context = {
    console,
    document: {
      title: 'Donatur Helper',
      body: { appendChild() {} },
      addEventListener() {},
      createElement: makeEl,
      getElementById: id => {
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
      },
      querySelectorAll: () => []
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { origin: 'https://don4tpro.pages.dev', hash: '', search: '' },
    window: { location: { origin: 'https://don4tpro.pages.dev', hash: '', search: '' } },
    URLSearchParams,
    URL,
    setTimeout,
    clearTimeout
  };
  context.window.window = context.window;

  vm.runInNewContext(extractInlineScript(), context, { filename: 'bundle.js' });
  return context;
}

test('Task 2: sanitizeUrl helper allows safe schemes and blocks dangerous protocols', () => {
  const scope = createVmScope();
  assert.strictEqual(typeof scope.sanitizeUrl, 'function', 'sanitizeUrl must be defined');

  // Safe URLs
  assert.strictEqual(scope.sanitizeUrl('https://example.com/proof.jpg'), 'https://example.com/proof.jpg');
  assert.strictEqual(scope.sanitizeUrl('https://drive.google.com/file/d/123/view'), 'https://drive.google.com/file/d/123/view');
  assert.strictEqual(scope.sanitizeUrl('#admin-summary'), '#admin-summary');
  assert.strictEqual(scope.sanitizeUrl('/terms'), '/terms');
  assert.strictEqual(scope.sanitizeUrl('mailto:admin@example.com'), 'mailto:admin@example.com');
  assert.strictEqual(scope.sanitizeUrl('tel:+628123456789'), 'tel:+628123456789');

  // Dangerous URLs -> Must fallback to '#'
  assert.strictEqual(scope.sanitizeUrl('javascript:alert(1)'), '#');
  assert.strictEqual(scope.sanitizeUrl('javascript:/*--></title></style></textarea></script></xmp><svg/onload=alert(1)>'), '#');
  assert.strictEqual(scope.sanitizeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), '#');
  assert.strictEqual(scope.sanitizeUrl('vbscript:msgbox(1)'), '#');
  assert.strictEqual(scope.sanitizeUrl('   JAVASCRIPT:alert(document.cookie)  '), '#');
  assert.strictEqual(scope.sanitizeUrl(null), '#');
  assert.strictEqual(scope.sanitizeUrl(''), '#');
});

test('Task 2: index.html and JS modules wrap dynamic links and images with sanitizeUrl and do not concatenate raw error objects into innerHTML', () => {
  const code = getIndexHtml() + getAppScript();

  // Check proof and gift links use sanitizeUrl
  // [B7a] The donor render blocks were extracted into pure functions with a view-model
  // argument, so the local alias is no longer literally `c`. The property being protected is
  // unchanged and still asserted: a user-supplied proof/gift URL must reach an href only
  // through sanitizeUrl(). Match any identifier, not one variable name.
  assert.match(code, /sanitizeUrl\(\s*[A-Za-z_$][\w$]*\.ProofLink\s*\)/, 'ProofLink must pass through sanitizeUrl');
  assert.match(code, /sanitizeUrl\(\s*(?:[A-Za-z_$][\w$]*\.)?giftLink\s*\)/,
    'GiftLink must pass through sanitizeUrl');
  assert.match(code, /sanitizeUrl\(\s*(?:[A-Za-z_$][\w$]*\.)?giftImage\s*\)/,
    'GiftImage must pass through sanitizeUrl');

  // Check that raw e.message or e is not inserted without escapeHtml or formatUserErrorMessage
  assert.doesNotMatch(code, /innerHTML\s*=\s*['"][^'"]*['"]\s*\+\s*\(?e\.message\s*\|\|\s*e\)?\s*\+\s*['"]/, 'Raw e.message || e must not be concatenated directly into innerHTML');
});

test('Task 3: robots.txt exists at root and index.html has meta robots policy', () => {
  const robotsPath = path.join(__dirname, '..', 'robots.txt');
  assert.ok(fs.existsSync(robotsPath), 'robots.txt must exist at project root');
  const robots = fs.readFileSync(robotsPath, 'utf8');

  assert.match(robots, /User-agent:\s*\*/i, 'robots.txt must declare User-agent: *');
  assert.match(robots, /Allow:\s*\//i, 'robots.txt must allow root');
  assert.match(robots, /Disallow:\s*\/\*\?token=\*/i, 'robots.txt must disallow token queries');
  assert.match(robots, /Disallow:\s*\/\*#c=\*/i, 'robots.txt must disallow campaign hashes');

  const html = getIndexHtml();
  assert.match(html, /<meta\s+name="robots"\s+content="index,\s*follow">/i, 'index.html must declare meta robots policy');
});

test('Task 4: Flatpickr is absent; date inputs are native per ADR-0018', () => {
  const html = getIndexHtml();

  // [B3 · P1-5] This test previously pinned flatpickr 4.6.13 with SRI + defer. Flatpickr was
  // removed because ADR-0018 commits to the browser's native mobile date control, and the
  // init passed disableMobile:"true", which rewrote <input type="date"> to type="text" and
  // forced a desktop calendar onto phones. The invariant flips from "pinned" to "absent".
  // Absence must be asserted against tags, not prose: the explanatory comment in <head>
  // mentions flatpickr by name.
  assert.doesNotMatch(html, /<script[^>]+flatpickr|flatpickr[^>]*\.min\.(?:js|css)"/i,
    'Flatpickr must not be loaded as a script or stylesheet');

  // The replacement must keep native date inputs and give them real bounds.
  // [B7a] Match the attribute relationship, not one exact attribute order — adding
  // data-testid is allowed and must not look like "we stopped using native date inputs".
  assert.match(html, /<input[^>]*id="pc-start"[^>]*type="date"/, 'Date inputs must stay native');
  assert.match(html, /<input[^>]*id="pc-deadline"[^>]*type="date"/, 'Date inputs must stay native');
});

test('Task 5: _headers and netlify.toml define security headers and report-only CSP', () => {
  const headersPath = path.join(__dirname, '..', '_headers');
  assert.ok(fs.existsSync(headersPath), '_headers must exist at project root for Cloudflare Pages');
  const headersContent = fs.readFileSync(headersPath, 'utf8');

  assert.match(headersContent, /X-Content-Type-Options:\s*nosniff/i);
  assert.match(headersContent, /X-Frame-Options:\s*SAMEORIGIN/i);
  assert.match(headersContent, /Referrer-Policy:\s*strict-origin-when-cross-origin/i);
  assert.match(headersContent, /Permissions-Policy:\s*camera=\(\),\s*microphone=\(\),\s*geolocation=\(\)/i);
  assert.match(headersContent, /Content-Security-Policy-Report-Only:\s*default-src/i);
  assert.match(headersContent, /cdn\.jsdelivr\.net/i);
  assert.match(headersContent, /accounts\.google\.com/i);
  assert.match(headersContent, /script\.google\.com/i);

  const netlifyPath = path.join(__dirname, '..', 'netlify.toml');
  assert.ok(fs.existsSync(netlifyPath), 'netlify.toml must exist');
  const netlifyContent = fs.readFileSync(netlifyPath, 'utf8');
  assert.match(netlifyContent, /\[\[headers\]\]/i);
  assert.match(netlifyContent, /X-Content-Type-Options\s*=\s*"nosniff"/i);
});

function calculateLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1, hex2) {
  const parseHex = hex => {
    hex = hex.replace('#', '');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  };
  const lum1 = calculateLuminance(...parseHex(hex1));
  const lum2 = calculateLuminance(...parseHex(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

test('Task 6: Accessibility hardening: primary color contrast >= 4.5:1, skip-link, focus-visible, and live regions', () => {
  const html = getIndexHtml();
  const baseCssPath = path.join(__dirname, '..', 'css', 'base.css');
  const baseCss = fs.existsSync(baseCssPath) ? fs.readFileSync(baseCssPath, 'utf8') : '';
  // [B6 · P1-3] Include the token layer: colours moved out of base.css so that themes can
  // own them. Concatenating it keeps this test measuring the same thing — the primary colour
  // actually in force — instead of pinning a file path.
  const tokensCssPath = path.join(__dirname, '..', 'css', 'tokens.css');
  const tokensCss = fs.existsSync(tokensCssPath) ? fs.readFileSync(tokensCssPath, 'utf8') : '';
  const allStyles = html + '\n' + tokensCss + '\n' + baseCss;

  // 1. Primary color contrast
  // [B6-fix2 · audit #4] --primary may be a var() indirection into the --forest-* ramp, so
  // resolve the chain instead of requiring a literal hex at the declaration site.
  const primaryHex = resolveToken(tokensCss, 'primary') || (allStyles.match(/--primary:\s*(#[0-9a-fA-F]{6})/) || [])[1];
  assert.ok(primaryHex, '--primary variable must resolve to a concrete colour');
  const ratio = contrastRatio(primaryHex, '#ffffff');
  assert.ok(ratio >= 4.5, `Contrast ratio for ${primaryHex} on white must be >= 4.5 (was ${ratio.toFixed(2)})`);

  // 2. Skip link presence and style
  // [B7a] Behaviour, not literal markup: the link must exist, target #main-content and carry
  // its label. Attribute order/additional attributes are not part of the contract.
  const skipAnchor = html.match(/<a[^>]*class="skip-link"[^>]*>([^<]*)<\/a>/);
  assert.ok(skipAnchor, 'Must have a .skip-link anchor');
  assert.match(skipAnchor[0], /href="#main-content"/, 'Must have skip-link to #main-content');
  assert.match(skipAnchor[1], /Lewati ke konten utama/, 'Skip link must keep its Indonesian label');
  assert.match(allStyles, /\.skip-link\s*\{[\s\S]*?position:\s*absolute;/, 'Must define .skip-link styles');
  assert.match(allStyles, /\.skip-link:focus\s*\{[\s\S]*?top:\s*16px;/, 'Must define .skip-link:focus styles');

  // 3. Focus visible style
  assert.match(allStyles, /:focus-visible\s*\{[\s\S]*?outline:/, 'Must define :focus-visible styles');

  // 4. Live regions
  assert.match(html, /<div id="toast"\s+role="status"\s+aria-live="polite">/, 'Toast must have role="status" and aria-live="polite"');
});

test('Task 7: Performance critical path: Google Fonts link tags, preconnect origins, and no @import', () => {
  const html = getIndexHtml();

  // 1. Preconnect tags
  assert.match(html, /<link\s+rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com">/, 'Must preconnect to fonts.googleapis.com');
  assert.match(html, /<link\s+rel="preconnect"\s+href="https:\/\/fonts\.gstatic\.com"\s+crossorigin>/, 'Must preconnect to fonts.gstatic.com with crossorigin');
  assert.match(html, /<link\s+rel="preconnect"\s+href="https:\/\/cdn\.jsdelivr\.net">/, 'Must preconnect to cdn.jsdelivr.net');

  // 2. Font stylesheet link.
  // [B0 · P1-8] Changed from Inter to Plus Jakarta Sans: Inter was declared in base.css
  // but overridden by theme-aurora's body rule, so it downloaded without being used.
  // Fraunces was likewise downloaded and referenced by zero elements. Both removed to
  // load exactly one family.
  assert.match(html, /<link\s+rel="stylesheet"\s+href="https:\/\/fonts\.googleapis\.com\/css2\?family=Plus\+Jakarta\+Sans:wght@200\.\.800&display=swap">/, 'Must load exactly one font family via <link>');

  // 2b. [B0 · P1-8] No second family may come back through a separate request.
  const fontLinks = [...html.matchAll(/href="https:\/\/fonts\.googleapis\.com\/css2\?([^"]+)"/g)];
  assert.equal(fontLinks.length, 1, 'Exactly one Google Fonts stylesheet request is allowed');
  assert.doesNotMatch(fontLinks[0][1], /Inter|Fraunces/, 'Inter and Fraunces must not be requested');

  // 3. No @import inside <style>
  assert.doesNotMatch(html, /@import\s+url\(['"]https:\/\/fonts\.googleapis\.com/, 'Must not use @import for fonts inside <style>');
});






