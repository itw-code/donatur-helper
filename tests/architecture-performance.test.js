const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function getIndexHtml() {
  return fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
}

function getFileContent(relPath) {
  const fullPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

test('Task 1: CSS files exist and are properly modularized', () => {
  const baseCss = getFileContent('css/base.css');
  const componentsCss = getFileContent('css/components.css');
  const viewsCss = getFileContent('css/views.css');

  assert.ok(baseCss, 'css/base.css must exist');
  assert.ok(componentsCss, 'css/components.css must exist');
  assert.ok(viewsCss, 'css/views.css must exist');

  // Base CSS assertions
  assert.match(baseCss, /:root\s*\{/, 'css/base.css must define :root tokens');
  assert.match(baseCss, /--primary:\s*#047857/, 'css/base.css must contain --primary token');
  assert.match(baseCss, /\.skip-link/, 'css/base.css must contain .skip-link styles');
  assert.match(baseCss, /:focus-visible/, 'css/base.css must contain :focus-visible styles');

  // Components CSS assertions
  assert.match(componentsCss, /\.card\b/, 'css/components.css must define .card');
  assert.match(componentsCss, /\.btn\b/, 'css/components.css must define .btn');
  assert.match(componentsCss, /\.badge\b/, 'css/components.css must define .badge');
  assert.match(componentsCss, /\.modal\b|#toast/, 'css/components.css must define modal or toast');

  // Views CSS assertions
  assert.match(viewsCss, /#view-landing|\.admin-nav-bar|#view-pic-dashboard/, 'css/views.css must define view-specific styles');

  // index.html checks
  const html = getIndexHtml();
  assert.match(html, /<link\s+rel="stylesheet"\s+href="css\/base\.css"/i, 'index.html must link css/base.css');
  assert.match(html, /<link\s+rel="stylesheet"\s+href="css\/components\.css"/i, 'index.html must link css/components.css');
  assert.match(html, /<link\s+rel="stylesheet"\s+href="css\/views\.css"/i, 'index.html must link css/views.css');

  // Ensure monolithic inline <style> block is removed
  const inlineStyleMatches = html.match(/<style[\s\S]*?>([\s\S]*?)<\/style>/gi);
  if (inlineStyleMatches) {
    for (const styleTag of inlineStyleMatches) {
      const lineCount = styleTag.split('\n').length;
      assert.ok(lineCount < 50, `Inline <style> tag too large (${lineCount} lines). Should be extracted to external CSS.`);
    }
  }
});

test('Task 2: JavaScript files exist and are modularized into ES Modules', () => {
  const configJs = getFileContent('js/config.js');
  const stateJs = getFileContent('js/state.js');
  const storageJs = getFileContent('js/storage.js');
  const utilsJs = getFileContent('js/utils.js');
  const apiJs = getFileContent('js/api.js');
  const authJs = getFileContent('js/views/auth.js');
  const donorJs = getFileContent('js/views/donor.js');
  const picJs = getFileContent('js/views/pic.js');
  const adminJs = getFileContent('js/views/admin.js');
  const superadminJs = getFileContent('js/views/superadmin.js');
  const appJs = getFileContent('js/app.js');

  assert.ok(configJs, 'js/config.js must exist');
  assert.ok(stateJs, 'js/state.js must exist');
  assert.ok(storageJs, 'js/storage.js must exist');
  assert.ok(utilsJs, 'js/utils.js must exist');
  assert.ok(apiJs, 'js/api.js must exist');
  assert.ok(authJs, 'js/views/auth.js must exist');
  assert.ok(donorJs, 'js/views/donor.js must exist');
  assert.ok(picJs, 'js/views/pic.js must exist');
  assert.ok(adminJs, 'js/views/admin.js must exist');
  assert.ok(superadminJs, 'js/views/superadmin.js must exist');
  assert.ok(appJs, 'js/app.js must exist');

  // Check exports in utils
  assert.match(utilsJs, /export\s+function\s+escapeHtml\b/, 'utils.js must export escapeHtml');
  assert.match(utilsJs, /export\s+function\s+sanitizeUrl\b/, 'utils.js must export sanitizeUrl');
  assert.match(utilsJs, /export\s+function\s+formatUserErrorMessage\b/, 'utils.js must export formatUserErrorMessage');
  assert.match(utilsJs, /export\s+function\s+showToast\b/, 'utils.js must export showToast');
  assert.match(utilsJs, /export\s+function\s+showInfoModal\b/, 'utils.js must export showInfoModal');

  // Check app.js global bindings & script tag in index.html
  assert.match(appJs, /(window\.\w+\s*=|Object\.assign\(window,\s*globalBindings\))/i, 'app.js must bind UI handlers to window for HTML onclick compatibility');

  const html = getIndexHtml();
  assert.match(html, /<script\s+type="module"\s+src="js\/app\.js"\s*defer>/i, 'index.html must load js/app.js as ES module');

  // Ensure monolithic inline script is removed
  const inlineScriptMatches = html.match(/<script(?![^>]*src=)[\s\S]*?>([\s\S]*?)<\/script>/gi);
  if (inlineScriptMatches) {
    for (const scriptTag of inlineScriptMatches) {
      const lineCount = scriptTag.split('\n').length;
      assert.ok(lineCount < 50, `Inline <script> tag too large (${lineCount} lines). Should be extracted to external JS modules.`);
    }
  }
});

test('Task 3: Responsive and optimized image delivery utilities and layout shift protection', () => {
  const { createBrowserHarness } = require('./test-harness');
  const harness = createBrowserHarness();
  const { renderOptimizedImage } = harness.context;

  assert.strictEqual(typeof renderOptimizedImage, 'function', 'renderOptimizedImage must be a function');

  // Test lazy loading & async decoding defaults
  const normalImg = renderOptimizedImage('https://example.com/receipt.jpg', 'Bukti Transfer Budi', { className: 'proof-preview-img' });
  assert.match(normalImg, /loading="lazy"/, 'Default loading should be lazy');
  assert.match(normalImg, /decoding="async"/, 'Default decoding should be async');
  assert.match(normalImg, /src="https:\/\/example\.com\/receipt\.jpg"/, 'Image source should match');
  assert.match(normalImg, /alt="Bukti Transfer Budi"/, 'Image alt should be escaped');
  assert.match(normalImg, /class="proof-preview-img"/, 'Class should be set');

  // Test custom options (width, height, eager loading for hero)
  const heroImg = renderOptimizedImage('https://example.com/hero.jpg', 'Hero Banner', { loading: 'eager', width: 800, height: 400 });
  assert.match(heroImg, /loading="eager"/, 'Custom loading option honored');
  assert.match(heroImg, /width="800"/, 'Width attribute present');
  assert.match(heroImg, /height="400"/, 'Height attribute present');

  // Test dangerous URL suppression
  const maliciousImg = renderOptimizedImage('javascript:alert(1)', 'Hack');
  assert.strictEqual(maliciousImg, '', 'Dangerous image protocols must return empty string');

  // Verify CSS contains layout shift rules
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'components.css'), 'utf8');
  assert.match(css, /\.img-responsive\s*\{[^}]*max-width:\s*100%/i, 'img-responsive class must set max-width: 100%');
  assert.match(css, /\.proof-preview-img/i, 'proof-preview-img must be styled for layout stability');
  assert.match(css, /\.gift-preview-img/i, 'gift-preview-img must be styled for layout stability');
});

test('Task 4: Caching headers in _headers and netlify.toml provide immutable caching and revalidation', () => {
  const headersPath = path.join(__dirname, '..', '_headers');
  assert.ok(fs.existsSync(headersPath), '_headers must exist at root');
  const headers = fs.readFileSync(headersPath, 'utf8');

  // Verify caching headers for assets and modules
  assert.match(headers, /\/css\/\*\s*Cache-Control:\s*public,\s*max-age=\d+,\s*immutable/i, '_headers must configure immutable cache for css');
  assert.match(headers, /\/js\/\*\s*Cache-Control:\s*public,\s*max-age=\d+,\s*immutable/i, '_headers must configure immutable cache for js modules');
  assert.match(headers, /\/(index\.html)?\s*Cache-Control:\s*public,\s*max-age=0,\s*must-revalidate/i, '_headers must configure revalidation for HTML');

  // Verify security headers remain intact
  assert.match(headers, /X-Content-Type-Options:\s*nosniff/i, '_headers must retain nosniff');
  assert.match(headers, /Content-Security-Policy-Report-Only:/i, '_headers must retain CSP Report-Only');

  // Verify netlify.toml headers
  const netlifyTomlPath = path.join(__dirname, '..', 'netlify.toml');
  assert.ok(fs.existsSync(netlifyTomlPath), 'netlify.toml must exist');
  const netlifyToml = fs.readFileSync(netlifyTomlPath, 'utf8');
  assert.match(netlifyToml, /for\s*=\s*"\/css\/\*"/i, 'netlify.toml must specify /css/* headers');
  assert.match(netlifyToml, /for\s*=\s*"\/js\/\*"/i, 'netlify.toml must specify /js/* headers');
});
