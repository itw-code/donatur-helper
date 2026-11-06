const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function getIndexHtml() {
  return fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
}

test('Admin token generation CTA is placed in Tools section with secondary styling and helper copy', () => {
  const html = getIndexHtml();

  // Placed in #admin-section-tools
  assert.match(html, /id="admin-section-tools"[^>]*class="card admin-section"/);

  // Positioned after members section in Admin dashboard
  const membersIdx = html.indexOf('id="admin-section-members"');
  const toolsIdx = html.indexOf('id="admin-section-tools"');
  assert.ok(membersIdx !== -1 && toolsIdx !== -1, 'both sections should exist');
  assert.ok(membersIdx < toolsIdx, 'tools section should follow members section in DOM');

  // Secondary button styling and explanatory copy
  assert.match(html, /class="btn secondary btn-auto"[^>]*onclick="genPicToken\(\)"/);
  // [B10 · P1-6] The helper sentence was deleted under Q13: the button directly below reads
  // "+ Buat token PIC baru", so the sentence restated the control it sat next to. The CTA and its
  // placement are what this test protects; assert those, not the narration.
  assert.doesNotMatch(html, /Gunakan untuk membuat akses token PIC baru secara manual/,
    'helper copy restating the button label must not return');
  assert.match(html, /btn-generate-pic-token/, 'the CTA itself must remain');
});
