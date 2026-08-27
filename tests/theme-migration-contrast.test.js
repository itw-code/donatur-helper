const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('Theme migration regression: the Aurora stylesheet is the final app stylesheet', () => {
  const html = read('index.html');
  const stylesheetHrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/gi)]
    .map(match => match[1]);
  const appStylesheets = stylesheetHrefs.filter(href => href.startsWith('css/'));

  assert.deepEqual(
    appStylesheets.slice(-4),
    ['css/base.css', 'css/components.css', 'css/views.css', 'css/theme-aurora.css'],
    'The theme overlay must load after every base/view stylesheet'
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
  const themeCss = read('css/theme-aurora.css');
  const combinedCss = read('css/components.css') + '\n' + read('css/views.css') + '\n' + themeCss;

  for (const className of REQUIRED_SURFACE_CLASSES) {
    const selectorPattern = new RegExp(`\\.${className}(?:\\s*,|\\s*\\{)`);
    assert.match(combinedCss, selectorPattern, `${className} must be defined`);
    assert.match(themeCss, selectorPattern, `${className} must be overridden by Aurora`);
  }

  assert.doesNotMatch(
    combinedCss,
    /var\(--blue-light\)/,
    'Undefined --blue-light tokens must not create transparent/unstyled payment surfaces'
  );
});
