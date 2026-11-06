import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');

/**
 * Every `var(--token)` used anywhere must be DEFINED somewhere.
 *
 * HISTORY: `js/views/donor.js` used `var(--shadow-lg)` on the bulk-join modal, and no stylesheet
 * ever defined `--shadow-lg`. CSS does not error on an undefined custom property — the declaration
 * is simply invalid at computed-value time and the property resolves to its initial value. So the
 * modal silently rendered with NO shadow: a floating panel with hard edges, which reads as a
 * mis-rendered page rather than a dialog. It survived every test and three audits.
 *
 * Found by muse-spark reading tokens.css against the view code.
 *
 * A `var(--x, fallback)` still needs defining: a fallback is a guess, and a guess that silently
 * becomes the real value is how a design system drifts.
 */
function collect(dir, exts) {
  const out = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === '.scratch') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (exts.some(x => e.name.endsWith(x))) out.push(p);
    }
  };
  walk(dir);
  return out;
}

test('every var(--token) reference resolves to a defined custom property', () => {
  const cssFiles = fs.readdirSync(path.join(repo, 'css'))
    .filter(f => f.endsWith('.css'))
    .map(f => path.join(repo, 'css', f));

  // Definitions: any `--name:` inside a rule block, in any stylesheet.
  const defined = new Set();
  for (const f of cssFiles) {
    const css = fs.readFileSync(f, 'utf8');
    for (const m of css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) defined.add(m[1]);
  }

  // Usages: JS/HTML/CSS everywhere.
  const usageFiles = [
    ...cssFiles,
    ...collect(path.join(repo, 'js'), ['.js']),
    path.join(repo, 'index.html'),
  ];

  // Tokens set at runtime by script (not in CSS) are legitimate definitions.
  const runtimeDefined = new Set();
  for (const f of collect(path.join(repo, 'js'), ['.js'])) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/setProperty\(\s*['"](--[a-zA-Z0-9_-]+)['"]/g)) {
      runtimeDefined.add(m[1]);
    }
  }

  const undefinedUses = [];
  for (const f of usageFiles) {
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
      const token = m[1];
      if (defined.has(token) || runtimeDefined.has(token)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      undefinedUses.push(`${path.relative(repo, f)}:${line}  var(${token})`);
    }
  }

  assert.deepEqual(
    undefinedUses,
    [],
    'These custom properties are referenced but never defined. CSS does not throw on an\n'
    + 'undefined var() — the property silently resolves to its initial value, which is how the\n'
    + 'bulk-join modal lost its shadow without a single failing test. Define them in tokens.css\n'
    + '(both theme blocks if the value is theme-dependent).'
  );
});