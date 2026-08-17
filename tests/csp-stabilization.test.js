import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 4: CSP policy is stabilized in headers and migration report is documented', () => {
  const reportPath = path.resolve('docs/reports/csp-stabilization-report.md');
  assert.ok(fs.existsSync(reportPath), 'csp-stabilization-report.md must exist');
  
  const report = fs.readFileSync(reportPath, 'utf8');
  assert.ok(report.includes('Content-Security-Policy-Report-Only'), 'Report must explain Report-Only status');
  assert.ok(report.includes('Google Identity') || report.includes('accounts.google.com'), 'Report must address Google Identity');
  assert.ok(report.includes('Roadmap') || report.includes('Enforced CSP') || report.includes('Migrasi'), 'Report must provide migration roadmap');
  
  const headers = fs.readFileSync(path.resolve('_headers'), 'utf8');
  assert.ok(headers.includes('Content-Security-Policy-Report-Only:'), 'CSP header must be Report-Only');
  assert.ok(headers.includes('https://script.google.com'), 'CSP must permit Google Apps Script backend');
  assert.ok(headers.includes('https://accounts.google.com'), 'CSP must permit Google Identity Services');
  assert.ok(headers.includes('https://cdn.jsdelivr.net'), 'CSP must permit jsdelivr for Flatpickr');
});
