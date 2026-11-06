import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const read = p => fs.readFileSync(path.join(repo, p), 'utf8');

/**
 * A control is broken if it is VISIBLE in a state where its precondition cannot be met.
 *
 * HISTORY: the landing page gained a "jadi pengelola" link calling `seamlessBecomePic()`, which
 * requires a `donor_user` session. The landing page is where nobody is logged in, so the link
 * could never work — it showed "Sesi login tidak valid" to every visitor. It shipped to production
 * and the owner found it by clicking it.
 *
 * Every existing test passed, because they asserted that handlers EXIST, never that a handler's
 * preconditions can be met where it is rendered. This file closes that gap for the controls whose
 * visibility is in static markup.
 */
const LANDING = '#view-landing';

test('landing controls do not require a donor session', () => {
  const html = read('index.html');

  // The landing block: everything from the landing view open tag to its close.
  const start = html.indexOf('id="view-landing"');
  assert.ok(start > -1, 'index.html must contain the landing view');
  // crude but sufficient: up to the next view- container
  // Bound by the next view CONTAINER. Searching for `id="view-` alone matches the landing's own
  // data-testid one character later and yields an empty slice — which is how this test first
  // passed on nothing and then failed on nothing.
  const nextView = html.indexOf('<div id="view-', start + 10);
  assert.ok(nextView > start, 'could not bound the landing block');
  const landing = html.slice(start, nextView);
  assert.ok(landing.includes('onclick='), 'landing block must contain its controls');

  // Any handler reachable from the landing that dereferences donor_user is broken by construction:
  // nobody on the landing has a session yet.
  const handlers = [...landing.matchAll(/onclick="([A-Za-z_$][\w$]*)\(/g)].map(m => m[1]);
  assert.ok(handlers.length > 0, 'landing must have interactive controls');

  assert.ok(!handlers.includes('seamlessBecomePic'),
    'the landing must not call seamlessBecomePic() directly: it requires a donor_user session and '
    + 'the landing is shown to logged-out visitors. Use becomePicFromLanding(), which routes to '
    + 'login first.');

  // becomePicFromLanding MUST exist and must be wired to a global binding, or the button is dead.
  const appJs = read('js/app.js');
  assert.match(appJs, /becomePicFromLanding/,
    'becomePicFromLanding must be imported and exposed on window, or the landing link is a no-op');
});

test('becomePicFromLanding handles the logged-out case it exists for', () => {
  const donorJs = read('js/views/donor.js');
  const i = donorJs.indexOf('export function becomePicFromLanding');
  assert.ok(i > -1, 'becomePicFromLanding must exist');

  // Stop at the next top-level export so we do not accidentally assert against a neighbouring
  // function that legitimately contains the invalid-session error.
  const after = donorJs.indexOf('\nexport ', i + 10);
  const body = donorJs.slice(i, after === -1 ? i + 1200 : after);

  // It must READ the session to decide, not blindly call the session-requiring path first.
  assert.match(body, /safeGet\('donor_user'\)/,
    'must check for an existing session before acting');
  // It must have a path for the no-session case that does not show an error dialog.
  assert.match(body, /showView\('user-login'\)/,
    'a logged-out visitor must be sent to login, not shown "Sesi login tidak valid"');
  assert.doesNotMatch(body, /Sesi login tidak valid/,
    'becomePicFromLanding must never show the invalid-session error: that is the bug it exists to fix');
});

test('the become-pic intent is consumed after login on every success path', () => {
  const authJs = read('js/views/auth.js');
  assert.match(authJs, /donatpro\.intent/,
    'auth must read the stored intent');
  const hooks = (authJs.match(/continueBecomePicIntent\(\)/g) || []).length;
  // one definition + one call per login-success path
  assert.ok(hooks >= 3,
    `the intent must be consumed on every login-success path (found ${hooks} occurrences including `
    + 'the definition); otherwise a visitor who came from the landing lands on the dashboard and '
    + 'never reaches PIC creation');
});

test('post-payment CTA cannot render outside the verified state', () => {
  const donorJs = read('js/views/donor.js');
  const i = donorJs.indexOf('cta-become-pic-after-pay');
  assert.ok(i > -1, 'the post-payment CTA must exist');

  // Find the statement containing it and require an explicit c.verified gate on that line.
  const lineStart = donorJs.lastIndexOf('\n', i) + 1;
  const lineEnd = donorJs.indexOf('\n', i);
  const line = donorJs.slice(lineStart, lineEnd);
  assert.match(line, /c\.verified\s*&&/,
    'the CTA must be guarded by c.verified so it never appears while a payment is unpaid or under '
    + 'review — quote: ' + line.trim().slice(0, 120));
});

test('settings cannot be saved before they have loaded', () => {
  const superJs = read('js/views/superadmin.js');
  const html = read('index.html');

  // The button must ship disabled, so a failed load cannot be followed by a destructive write.
  const btn = html.match(/<button[^>]*btn-save-settings[^>]*>/);
  assert.ok(btn, 'save-settings button must exist');
  assert.match(btn[0], /\bdisabled\b/,
    'Save must start disabled: on a failed settings load the card shows an error but the button '
    + 'stayed enabled, and one click wrote RequireMemberValidation=FALSE and blanked the emails.');

  // And the function must refuse at runtime even if the attribute is removed.
  const i = superJs.indexOf('export function saveSettings');
  const body = superJs.slice(i, superJs.indexOf('\nexport ', i + 10));
  assert.match(body, /_settingsLoaded/,
    'saveSettings must check a loaded flag, not trust the DOM');
  assert.match(superJs, /export function markSettingsLoaded/,
    'the renderer must explicitly mark settings as loaded');
});

test('the become-PIC intent mints a token, not just a form', () => {
  const authJs = read('js/views/auth.js');
  const i = authJs.indexOf('function continueBecomePicIntent');
  const body = authJs.slice(i, authJs.indexOf('\nexport ', i));
  assert.match(body, /seamlessBecomePic\(\)/,
    'showing view-pic-create alone leaves currentToken() null, so the submit fails with '
    + '"Token PIC tidak valid." The intent must mint the token first.');
});

test('cancelling login clears the become-PIC intent', () => {
  const authJs = read('js/views/auth.js');
  const i = authJs.indexOf('export function cancelUserLogin');
  const body = authJs.slice(i, i + 400);
  assert.match(body, /removeItem\('donatpro\.intent'\)/,
    'a cancelled intent must not hijack the next ordinary login in the same tab');
});

test('post-payment CTA requires an ACTIVE member, not just a verified payment', () => {
  const donorJs = read('js/views/donor.js');
  const i = donorJs.indexOf('cta-become-pic-after-pay');
  const lineStart = donorJs.lastIndexOf('\n', i) + 1;
  const line = donorJs.slice(lineStart, donorJs.indexOf('\n', i));
  assert.match(donorJs.slice(Math.max(0, i - 900), i), /active/,
    'the CTA must check member status: the RPC refuses ex/alumni, so showing it to them is a '
    + 'control whose precondition cannot be met');
});
