const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveToken } = require('./token-util');

const ROOT_DIR = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');

const RUNTIME_FILES = [
  'index.html',
  'js/views/donor.js',
  'js/views/pic.js',
  'js/views/admin.js',
  'js/views/superadmin.js',
  'js/utils.js'
];

const REQUIRED_SURFACE_CLASSES = [
  'theme-surface-warning',
  'theme-surface-muted',
  'theme-surface-success',
  'theme-surface-modal',
  'theme-surface-blue',
  'theme-info-note',
  'theme-blue-total',
  'theme-status-review',
  'theme-status-unpaid',
  'theme-custom-amount-badge',
  'verification-complete',
  'pic-complete-state',
  'donor-dashboard-attention',
  'pic-progress-track',
  'admin-action-queue',
  'admin-queue-icon'
];

test('Theme migration regression: tokens load before consumer styles', () => {
  const html = read('index.html');
  const stylesheetHrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/gi)]
    .map(match => match[1]);
  const appStylesheets = stylesheetHrefs.filter(href => href.startsWith('css/'));

  assert.deepEqual(
    appStylesheets.slice(0, 4),
    ['css/tokens.css', 'css/base.css', 'css/components.css', 'css/views.css'],
    '[B6 · P1-3] the former Aurora overlay is now a theme block in tokens.css'
  );
});

test('Theme migration regression: runtime markup has no legacy light islands', () => {
  const legacySurfacePattern = /background\s*:\s*(?:white|#(?:fff|ffffff|fffbeb|f1efe8|f4fbf7|f0f7ff|f9f9f9|e6f1fb|fff3cd|faeeda|eff6ff|fff1f2))\b/gi;
  const legacyInkPattern = /color\s*:\s*#(?:0369a1|1e40af|856404|1d4ed8|991b1b)\b/gi;
  const offenders = [];

  for (const file of RUNTIME_FILES) {
    const source = read(file);
    for (const match of source.matchAll(legacySurfacePattern)) {
      offenders.push(`${file}: ${match[0]}`);
    }
    for (const match of source.matchAll(legacyInkPattern)) {
      offenders.push(`${file}: ${match[0]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Runtime-generated surfaces must use semantic theme classes, not legacy light colors:\n${offenders.join('\n')}`
  );
});

test('Theme migration regression: every runtime surface seam has a dark-theme override', () => {
  // [B6 · P1-3] The dark-theme layer is css/theme-dark.css (formerly the theme-aurora.css
  // overlay). tokens.css now holds ONLY primitives and the light/dark role blocks, so a
  // runtime surface seam must be found in theme-dark.css — that is exactly the property this
  // test was written to protect. The earlier version of B6 pointed it at tokens.css, which
  // passed while the dark rules were still unscoped and leaking into light mode.
  const themeCss = read('css/theme-dark.css');
  const combinedCss = read('css/components.css') + '\n' + read('css/views.css') + '\n' + themeCss;

  for (const className of REQUIRED_SURFACE_CLASSES) {
    const selectorPattern = new RegExp(`\\.${className}(?:\\s*,|\\s*\\{)`);
    assert.match(combinedCss, selectorPattern, `${className} must be defined`);
    assert.match(themeCss, selectorPattern, `[B6 · P1-3] ${className} remains in the consolidated theme layer`);
  }

  assert.doesNotMatch(combinedCss, /var\\(--blue-light\\)/, 'Undefined --blue-light tokens must not create transparent/unstyled payment surfaces');
});


test('Theme migration regression: consolidated theme retains contrast seams', () => {
  // [B6 · P1-3] Two different things are asserted here, so two files are read:
  //   - badge SELECTORS must survive in the dark layer (they were moved there with the
  //     aurora overlay), and components.css keeps its light baselines;
  //   - the gold ROLE VALUES are token definitions, which now live in tokens.css.
  const darkCss = read('css/theme-dark.css');
  const tokensCss = read('css/tokens.css');
  const css = darkCss + read('css/components.css');
  for (const pattern of [/\.badge\s*\{/, /\.badge\.green/, /\.badge\.success/, /\.badge\.blue/, /\.badge\.amber/, /\.badge\.red/]) {
    assert.match(css, pattern, `[B6 · P1-3] theme seam ${pattern}`);
  }
  // Gold inverts role in light: it becomes a surface (#f5d347) with dark ink (#26200a),
  // and dark-gold #7a6108 is the only gold that clears AA as text on a light surface.
  // [B6-fix2 · audit #4] Assert the resolved COLOUR, not the hex literal: the gold roles now
  // point at the --gold-* ramp, so the old literal match failed while the colours were unchanged.
  assert.equal(resolveToken(tokensCss, 'accent-ink-on-fill'), '#26200a',
    'gold role must resolve to the dark ink used on gold fills');
  assert.equal(resolveToken(tokensCss, 'accent-soft-ink'), '#7a6108',
    'the only gold that clears AA as text on a light surface');
});
