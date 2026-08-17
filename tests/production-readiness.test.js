import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 1: docs/checklists/production-readiness-checklist.md exists and contains comprehensive role-by-role verification matrix', () => {
  const checklistPath = path.resolve('docs/checklists/production-readiness-checklist.md');
  assert.ok(fs.existsSync(checklistPath), 'production-readiness-checklist.md must exist');
  
  const content = fs.readFileSync(checklistPath, 'utf8');
  
  // Role checks
  assert.ok(content.includes('Landing & Autentikasi'), 'Must cover Landing role');
  assert.ok(content.includes('Donor / Member'), 'Must cover Donor role');
  assert.ok(content.includes('PIC (Person in Charge)'), 'Must cover PIC role');
  assert.ok(content.includes('Admin'), 'Must cover Admin role');
  assert.ok(content.includes('SuperAdmin'), 'Must cover SuperAdmin role');
  
  // State checks
  assert.ok(content.includes('Empty State') || content.includes('Status Kosong'), 'Must cover empty states');
  assert.ok(content.includes('Loading State') || content.includes('Status Memuat'), 'Must cover loading states');
  assert.ok(content.includes('Error State') || content.includes('Status Kendala / Error'), 'Must cover error states');
  assert.ok(content.includes('Success State') || content.includes('Status Sukses'), 'Must cover success states');
  assert.ok(content.includes('Final / Settled') || content.includes('Selesai & Final'), 'Must cover settled states');
  assert.ok(content.includes('Overdue') || content.includes('Terlewat Deadline'), 'Must cover overdue states');
  
  // Viewport checks
  assert.ok(content.includes('360px'), 'Must specify 360px viewport checks');
  assert.ok(content.includes('390px'), 'Must specify 390px viewport checks');
  assert.ok(content.includes('Keyboard') || content.includes('Virtual Keyboard'), 'Must specify keyboard-open state checks');
  assert.ok(content.includes('Desktop'), 'Must specify Desktop viewport checks');
});
