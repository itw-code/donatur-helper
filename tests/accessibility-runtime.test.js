import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 6: Accessibility runtime attributes, landmarks, skip links, and aria states are properly declared', () => {
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  
  // 1. Skip link and main landmark
  assert.ok(indexHtml.includes('<a href="#main-content" class="skip-link">Lewati ke konten utama</a>'), 'Skip link must exist and target main-content');
  assert.ok(indexHtml.includes('<main id="main-content" class="wrap" tabindex="-1">'), 'Main landmark must exist with tabindex="-1"');
  
  // 2. Toast live region
  assert.ok(indexHtml.includes('id="toast"') && indexHtml.includes('role="status"') && indexHtml.includes('aria-live="polite"'), 'Toast must have role="status" and aria-live="polite"');
  
  // 3. Focus-visible and color contrast tokens in css/base.css
  const baseCss = fs.readFileSync(path.resolve('css/base.css'), 'utf8');
  assert.ok(baseCss.includes(':focus-visible'), 'Focus visible styling must be present');
  assert.ok(baseCss.includes('--primary: #047857'), 'WCAG AA high contrast green token must be active');
  assert.ok(baseCss.includes('.skip-link'), 'Skip link styling must be present in base.css');

  // 4. Form inputs have associated labels
  assert.ok(indexHtml.includes('<label>No. WhatsApp</label>'), 'WhatsApp input must have label');
  assert.ok(indexHtml.includes('<label>Nama Lengkap</label>'), 'Name input must have label');
  assert.ok(indexHtml.includes('<label>Token</label>'), 'Token input must have label');
  assert.ok(indexHtml.includes('<label>Nama target (yang resign)</label>'), 'Campaign target input must have label');
  assert.ok(indexHtml.includes('<label>Deadline donasi</label>'), 'Deadline input must have label');

  // 5. Check SVG icons for aria-hidden="true" in utils.js and components
  const utilsJs = fs.readFileSync(path.resolve('js/utils.js'), 'utf8');
  assert.ok(utilsJs.includes('aria-hidden="true"'), 'Status icons must have aria-hidden="true"');
});
