import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 7: Release runbook exists and contains full pre-deploy, deploy, smoke test, and emergency procedures', () => {
  const runbookPath = path.resolve('docs/runbooks/release-runbook.md');
  assert.ok(fs.existsSync(runbookPath), 'release-runbook.md must exist');
  
  const content = fs.readFileSync(runbookPath, 'utf8');
  assert.ok(content.includes('Pre-Deploy') || content.includes('Pemeriksaan Pra-Rilis'), 'Must contain pre-deploy section');
  assert.ok(content.includes('Deploy') || content.includes('Langkah Rilis'), 'Must contain deploy steps');
  assert.ok(content.includes('Smoke Test') || content.includes('Uji Asap Pasca-Rilis'), 'Must contain smoke test section');
  assert.ok(content.includes('Emergency') || content.includes('Penanganan Insiden'), 'Must contain emergency procedures');
  assert.ok(content.includes('Cloudflare Pages'), 'Must mention Cloudflare Pages deployment');
  assert.ok(content.includes('Google Apps Script') || content.includes('Code.js'), 'Must mention Apps Script backend');
});

test('Task 8: Rollback plan exists and contains deployment rollback, git revert, communication, and data safety instructions', () => {
  const rollbackPath = path.resolve('docs/runbooks/rollback-plan.md');
  assert.ok(fs.existsSync(rollbackPath), 'rollback-plan.md must exist');
  
  const content = fs.readFileSync(rollbackPath, 'utf8');
  assert.ok(content.includes('Kriteria Rollback') || content.includes('Rollback Trigger'), 'Must specify rollback triggers');
  assert.ok(content.includes('Cloudflare Pages'), 'Must explain Cloudflare Pages instant rollback');
  assert.ok(content.includes('Google Apps Script') || content.includes('Code.js'), 'Must cover backend script rollback');
  assert.ok(content.includes('Komunikasi') || content.includes('Template Pesan'), 'Must provide user communication templates');
  assert.ok(content.includes('Integritas Data') || content.includes('Data Safety'), 'Must detail data safety rules');
  assert.ok(content.includes('git revert') || content.includes('Git'), 'Must detail git rollback command');
});
