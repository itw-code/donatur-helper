import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const { resolveToken } = require_('./token-util.js');

test('Task 6: Accessibility runtime attributes, landmarks, skip links, and aria states are properly declared', () => {
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  
  // 1. Skip link and main landmark
  // [B7a] Assert the behaviour, not the exact attribute string: adding data-testid to the skip
  // link broke a literal .includes() match even though nothing about its function changed.
  // What matters is that a .skip-link exists, points at #main-content, and that target EXISTS.
  const skipMatch = indexHtml.match(/<a[^>]*class="skip-link"[^>]*>/);
  assert.ok(skipMatch, 'Skip link must exist');
  assert.match(skipMatch[0], /href="#main-content"/, 'Skip link must target #main-content');
  assert.match(indexHtml, /<main[^>]*id="main-content"[^>]*tabindex="-1"/, 'Skip-link target must be a real main landmark with tabindex="-1"');
  assert.ok(indexHtml.includes('<main id="main-content" class="wrap" tabindex="-1">'), 'Main landmark must exist with tabindex="-1"');
  
  // 2. Toast live region
  assert.ok(indexHtml.includes('id="toast"') && indexHtml.includes('role="status"') && indexHtml.includes('aria-live="polite"'), 'Toast must have role="status" and aria-live="polite"');
  
  // 3. Focus-visible and color contrast tokens in css/base.css
  const baseCss = fs.readFileSync(path.resolve('css/base.css'), 'utf8');
  assert.ok(baseCss.includes(':focus-visible'), 'Focus visible styling must be present');
  // [B6 · P1-3] Tokens moved to css/tokens.css. The intent is unchanged: a primary colour
  // that clears WCAG AA as text on the light canvas. Measured #4a653b on #f8fafc = 6.24:1
  // (emerald #047857 on white was 5.48:1), so forest is the stronger choice, not a regression.
  const tokensCss = fs.readFileSync(path.resolve('css/tokens.css'), 'utf8');
  // [B6-fix2 · audit #4] Assert the resolved colour (roles now point at the --forest-* ramp).
  // Measured: #4a653b on #f8fafc = 6.24:1 (emerald #047857 on white was 5.48:1), so forest is
  // the stronger AA choice, not a regression.
  assert.equal(resolveToken(tokensCss, 'primary'), '#4a653b', 'WCAG AA contrast forest token must be active');
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
