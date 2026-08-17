import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 2: docs/reports/admin-performance-bottleneck-diagnosis.md documents evidence-based analysis of 8 performance vectors', () => {
  const diagPath = path.resolve('docs/reports/admin-performance-bottleneck-diagnosis.md');
  assert.ok(fs.existsSync(diagPath), 'admin-performance-bottleneck-diagnosis.md must exist');
  
  const content = fs.readFileSync(diagPath, 'utf8');
  assert.ok(content.includes('Latensi') || content.includes('Network'), 'Must analyze network latency');
  assert.ok(content.includes('Google Apps Script') || content.includes('Backend'), 'Must analyze backend processing');
  assert.ok(content.includes('Volume Data') || content.includes('Jumlah Data') || content.includes('Record Count'), 'Must analyze record counts');
  assert.ok(content.includes('DOM') || content.includes('Render DOM'), 'Must analyze DOM rendering');
  assert.ok(content.includes('Duplikat') || content.includes('Duplicate Request'), 'Must analyze duplicate requests');
  assert.ok(content.includes('Paginasi') || content.includes('Lazy Loading'), 'Must analyze lazy loading and pagination');
  assert.ok(content.includes('Timeout') || content.includes('Batas Waktu'), 'Must analyze request timeouts');
  assert.ok(content.includes('Rencana Aksi') || content.includes('Rekomendasi'), 'Must provide actionable recommendations');
});
