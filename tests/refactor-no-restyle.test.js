import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');

/**
 * Guard against silent restyling during refactors.
 *
 * HISTORY: batch B7b was asked to move inline `style=` attributes into classes and preserve
 * rendering exactly. It changed 39 declarations instead — 13px became 14px (13 times), 11px
 * became 12px (9 times), 4px/6px radii became 8px, and a translucent tint became an opaque
 * surface. All 135 tests stayed green, because nothing asserted the DECLARATIONS.
 *
 * The mechanism is predictable: give a model a token scale and ask it to "use the tokens", and
 * it will snap off-grid values onto that scale. The brief cannot prevent it; this can.
 *
 * This test pins the values that were live at the moment the donor view was still inline-styled,
 * so a future conversion either preserves them or fails here loudly.
 */
const PINNED = [
  // [prop, value, why it is pinned]
  ['font-size', '13px', '13 call sites used 13px; --text-sm is 14px, so "using the token" is a redesign'],
  ['font-size', '11px', '9 call sites used 11px; --text-xs is 12px'],
  ['font-size', '15px', '3 call sites; not on the type scale at all'],
  ['font-size', '24px', '3 call sites; --text-xl is 20px, --text-2xl is 28px'],
  ['border-radius', '4px', '4 call sites; snapping to 8px visibly rounds small chips'],
  ['border-radius', '6px', 'buttons used 6px; --radius is 12px'],
  ['gap', '6px', '6 call sites; --space-2 is 8px'],
  ['min-height', '36px', 'the gift/proof action height; --control-h is 44px'],
  ['min-height', 'unset', 'deliberate resets must not become a value'],
];

test('refactor no-restyle guard: off-grid declaration values are still present', () => {
  const cssFiles = fs.readdirSync(path.join(repo, 'css'))
    .filter(f => f.endsWith('.css'))
    .map(f => fs.readFileSync(path.join(repo, 'css', f), 'utf8'))
    .join('\n');

  const viewFiles = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) viewFiles.push(fs.readFileSync(p, 'utf8'));
    }
  };
  walk(path.join(repo, 'js', 'views'));
  const views = viewFiles.join('\n');

  const haystack = (views + '\n' + cssFiles).replace(/\s+/g, '');

  const missing = PINNED.filter(([prop, value]) => {
    const compact = value.replace(/\s+/g, '');
    return !haystack.includes(`${prop}:${compact}`);
  });

  assert.deepEqual(
    missing.map(([p, v]) => `${p}: ${v}`),
    [],
    'These declaration values vanished. A refactor may move code, not restyle: snapping them '
    + 'onto the token scale changes the design. Keep the literal, or make the change deliberate '
    + 'and reviewed (and update this pin with the measured before/after).'
  );
});

test('refactor no-restyle guard: the parity checker detects a dropped value', () => {
  // Proves the script is not dead code. It builds its own fixture rather than depending on
  // repo state, so it cannot silently pass because a baseline drifted.
  const os = require_('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  const before = path.join(dir, 'before.js');
  const after = path.join(dir, 'after.js');
  fs.writeFileSync(before, `<div style="font-size:13px; border-radius:6px;">x</div>`);
  // the "refactored" version kept the radius but silently promoted 13px to 14px
  fs.writeFileSync(after, `<div style="border-radius:6px;">x</div>`);

  let code = 0, out = '';
  try {
    out = execFileSync('node',
      ['scripts/check-refactor-parity.mjs', '--from-file', before, '--to-file', after],
      { cwd: repo, encoding: 'utf8' });
  } catch (e) {
    code = e.status;
    out = String(e.stdout || '') + String(e.stderr || '');
  }

  assert.equal(code, 1, 'checker must exit non-zero when a declaration value disappears');
  assert.match(out, /FAIL/, 'checker must report the failure');
  assert.match(out, /font-size: 13px/, 'checker must name the exact property and value that vanished');
  assert.ok(!/border-radius: 6px/.test(out), 'values that survived must not be reported');
});
