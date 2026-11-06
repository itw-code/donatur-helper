#!/usr/bin/env node
/**
 * verify-batch.mjs — the gate every worker unit must pass before its output is kept.
 *
 * WHY: three batches failed (B6, B7b, B10) and each time the failure was discoverable in seconds
 * by a mechanical check, but I checked by hand after the worker had already wandered. This makes
 * the check the first thing that runs, not the last.
 *
 * Cheaper than the full suite: runs syntax checks, the token guard, the no-restyle guard and the
 * DOM tests, then prints the counts the next brief must not change.
 *
 * Exit 0 = safe to keep. Exit 1 = revert.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const run = (cmd, args) => {
  try {
    return { ok: true, out: execFileSync(cmd, args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') };
  }
};

let failed = false;
const line = (s) => console.log(s);

// 1. Syntax of every view module. A dead worker once left an unterminated block; this catches it
//    in <1s instead of after 67 cascading test failures.
const views = fs.readdirSync(path.join(repo, 'js', 'views')).filter(f => f.endsWith('.js'));
const bad = [];
for (const f of views) {
  const p = path.join(repo, 'js', 'views', f);
  const tmp = path.join(repo, '.scratch', `syn-${f.replace('.js', '.mjs')}`);
  fs.copyFileSync(p, tmp);
  const r = run('node', ['--check', tmp]);
  fs.unlinkSync(tmp);
  if (!r.ok) bad.push(`${f}: ${(r.out.split('\n').find(l => l.includes('Error')) || 'syntax error').trim()}`);
}
line(bad.length ? `FAIL syntax (${bad.length})` : `ok   syntax (${views.length} view modules)`);
bad.forEach(b => line('       ' + b));
if (bad.length) failed = true;

// 2. Guard tests — the two that encode lessons from the failed batches.
const guards = ['tests/token-references.test.js', 'tests/refactor-no-restyle.test.js'];
for (const g of guards) {
  if (!fs.existsSync(path.join(repo, g))) { line(`skip ${g} (absent)`); continue; }
  const r = run('node', ['--test', g]);
  line(r.ok ? `ok   ${g}` : `FAIL ${g}`);
  if (!r.ok) { failed = true; line(r.out.split('\n').filter(l => l.includes('error:')).slice(0, 4).join('\n')); }
}

// 3. Full suite tail.
const t = run('node', ['--test', ...fs.readdirSync(path.join(repo, 'tests')).filter(f => f.endsWith('.test.js')).map(f => 'tests/' + f), ...(fs.existsSync(path.join(repo, 'tests/dom')) ? fs.readdirSync(path.join(repo, 'tests/dom')).filter(f => f.endsWith('.test.js')).map(f => 'tests/dom/' + f) : [])]);
const counts = (t.out.match(/# (tests|pass|fail) \d+/g) || []).join('  ');
line((t.ok ? 'ok   ' : 'FAIL ') + (counts || 'no counts'));
if (!t.ok) { failed = true; line(t.out.split('\n').filter(l => l.startsWith('not ok')).slice(0, 8).join('\n')); }

// 4. Invariants that must not drift: inline-style counts and testid counts per file.
const base = JSON.parse(fs.readFileSync(path.join(repo, '.scratch', 'invariants.json'), 'utf8'));
const drift = [];
for (const [f, exp] of Object.entries(base)) {
  const p = path.join(repo, f);
  if (!fs.existsSync(p)) { drift.push(`${f} missing`); continue; }
  const s = fs.readFileSync(p, 'utf8');
  const now = { style: s.split('style=').length - 1, testid: s.split('data-testid').length - 1 };
  if (exp.testid !== undefined && now.testid < exp.testid) drift.push(`${f}: testids ${exp.testid} -> ${now.testid} (LOST)`);
  if (exp.style !== undefined && exp.lockStyle && now.style !== exp.style) drift.push(`${f}: inline style ${exp.style} -> ${now.style}`);
}
line(drift.length ? `FAIL invariants` : 'ok   invariants');
drift.forEach(d => line('       ' + d));
if (drift.length) failed = true;

line(failed ? '\nRESULT: REVERT THIS UNIT' : '\nRESULT: KEEP');
process.exit(failed ? 1 : 0);
