#!/usr/bin/env node
/**
 * check-refactor-parity.mjs — catch "silent restyling" during an inline-style → class refactor.
 *
 * WHY THIS EXISTS
 * B7b was told: "visual output must be IDENTICAL in both themes — this is a refactor."
 * It delivered 94 classes and silently changed 39 declarations:
 *   font-size 13px -> --text-sm (14px)   13 times
 *   font-size 11px -> --text-xs (12px)    9 times
 *   border-radius 4px/6px -> 8px          5 times
 *   background rgba(255,255,255,.04) -> var(--surface)   (translucent tint -> opaque white)
 * Every test passed, because no test asserted the DECLARATIONS — only structure and behaviour.
 * A model told to "use the existing tokens" will snap off-grid values onto the scale. The brief
 * cannot prevent that; a check can.
 *
 * USAGE
 *   node scripts/check-refactor-parity.mjs --ref HEAD
 *       Compare inline style= declarations in the given ref against the classes in css/*.css.
 *       Report every (property, value) pair from the ref that no longer exists anywhere.
 *   node scripts/check-refactor-parity.mjs --ref HEAD --expect-moved --css css/components.css
 *
 * EXIT
 *   0 = every original declaration value still exists
 *   1 = at least one value disappeared (silent restyling)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const refIdx = args.indexOf('--ref');
const ref = refIdx === -1 ? 'HEAD' : args[refIdx + 1];
// Pre-commit use: compare two snapshot files instead of a git ref, because a long-running
// session may have many uncommitted batches and `--ref HEAD` would flag all of their changes.
const fromIdx = args.indexOf('--from-file');
const toIdx = args.indexOf('--to-file');
const fromFile = fromIdx === -1 ? null : args[fromIdx + 1];
const toFiles = toIdx === -1 ? null : [args[toIdx + 1]];
const cssArgIdx = args.indexOf('--css');
const cssFiles = cssArgIdx === -1
  ? fs.readdirSync('css').filter(f => f.endsWith('.css')).map(f => path.join('css', f))
  : [args[cssArgIdx + 1]];

const VIEW_DIR = 'js/views';

// Values that are legitimately theme-dependent and may move to a token, where the token is
// DEFINED to hold the same colour. Anything else must survive verbatim.
const TOKEN_EQUIV = {
  // spacing tokens, by literal
  '0px': ['0', 'var(--space-0)'],
};

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch { return ''; }
}

/** Split a style="..." string into [prop, value] pairs. */
function parseStyle(styleText) {
  const out = [];
  // strip trailing/leading quotes and JS concat noise
  const cleaned = styleText.replace(/\\'/g, "'").replace(/\s+/g, ' ');
  for (const part of cleaned.split(';')) {
    const i = part.indexOf(':');
    if (i === -1) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).trim().toLowerCase().replace(/\s+/g, '');
    if (!prop || !value) continue;
    out.push([prop, value]);
  }
  return out;
}

/** Inline styles currently in the working tree, from every view module. */
function inlineStylesFromWorktree() {
  const pairs = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) {
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/style=\\?["']([^"'\\]{6,})\\?["']/g)) {
          pairs.push(...parseStyle(m[1]));
        }
        for (const m of src.matchAll(/style="([^"]{6,})"/g)) {
          pairs.push(...parseStyle(m[1]));
        }
      }
    }
  };
  if (fs.existsSync(VIEW_DIR)) walk(VIEW_DIR);
  return pairs;
}

/** Inline styles as they were at a git ref. */
function inlineStylesFromRef(ref) {
  const pairs = [];
  const list = sh(`git ls-tree -r --name-only ${ref} -- ${VIEW_DIR}`).split('\n').filter(f => f.endsWith('.js'));
  for (const f of list) {
    const src = sh(`git show ${ref}:${f}`);
    for (const m of src.matchAll(/style=\\?["']([^"'\\]{6,})\\?["']/g)) pairs.push(...parseStyle(m[1]));
  }
  return pairs;
}

/** Inline styles from a saved snapshot of a view module. */
function inlineStylesFromFile(file) {
  const pairs = [];
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/style=\\?["']([^"'\\]{6,})\\?["']/g)) pairs.push(...parseStyle(m[1]));
  return pairs;
}

/** Every (prop, value) declared anywhere in the CSS files. */
function cssDeclarations(files) {
  const set = new Set();
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const css = fs.readFileSync(f, 'utf8');
    for (const m of css.matchAll(/\{([^}]*)\}/g)) {
      for (const part of m[1].split(';')) {
        const i = part.indexOf(':');
        if (i === -1) continue;
        const prop = part.slice(0, i).trim().toLowerCase();
        const value = part.slice(i + 1).trim().toLowerCase()
          .replace(/\s+/g, '').replace(/!important$/, '');
        if (prop && value) set.add(`${prop}|${value}`);
      }
    }
  }
  return set;
}

const WATCHED = new Set([
  'font-size', 'border-radius', 'background', 'background-color', 'color',
  'gap', 'padding', 'margin', 'min-height', 'line-height', 'font-weight',
]);

const before = fromFile ? inlineStylesFromFile(fromFile) : inlineStylesFromRef(ref);
const after = toFiles ? inlineStylesFromFile(toFiles[0]) : inlineStylesFromWorktree();
const css = cssDeclarations(cssFiles);

const count = pairs => {
  const c = new Map();
  for (const [p, v] of pairs) if (WATCHED.has(p)) c.set(`${p}|${v}`, (c.get(`${p}|${v}`) || 0) + 1);
  return c;
};
const beforeC = count(before);
const afterC = count(after);

const missing = [];
for (const [key, n] of beforeC) {
  const [prop, value] = key.split('|');
  const stillInline = afterC.get(key) || 0;
  const inCss = css.has(key) || (TOKEN_EQUIV[value] || []).some(t => css.has(`${prop}|${t}`));
  if (stillInline === 0 && !inCss) missing.push({ prop, value, n });
}

console.log(`ref=${ref}  css=${cssFiles.join(',')}`);
console.log(`inline declarations at ${ref}: ${before.length}   in worktree: ${after.length}`);
console.log(`watched (prop,value) pairs at ${ref}: ${beforeC.size}`);

if (!missing.length) {
  console.log('\nOK — every original declaration value still exists (inline or in CSS).');
  process.exit(0);
}

console.log(`\nFAIL — ${missing.length} declaration values disappeared. This is silent restyling:\n`);
for (const { prop, value, n } of missing.sort((a, b) => b.n - a.n)) {
  console.log(`  ${String(n).padStart(3)}x  ${prop}: ${value}`);
}
console.log('\nA refactor must preserve values verbatim. Either keep them, or change them in a');
console.log('deliberate, reviewed styling change — never as a side effect of moving code.');
process.exit(1);
