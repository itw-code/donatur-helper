import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createBrowserHarness } from './test-harness.js';

test('Session Lifecycle: getValidatedDonorSession returns user if whatsapp is present', () => {
  const harness = createBrowserHarness();
  const { getValidatedDonorSession } = harness.context;

  const mockUser = {
    whatsapp: '08123456789',
    name: 'Budi Test',
    status: 'active'
  };
  harness.context.localStorage.setItem('donor_user', JSON.stringify(mockUser));

  const valid = getValidatedDonorSession();
  assert.ok(valid, 'Valid user session should be returned');
  assert.strictEqual(valid.whatsapp, '08123456789');
  assert.strictEqual(valid.name, 'Budi Test');
});

test('Session Lifecycle: getValidatedDonorSession purges corrupted or outdated session without whatsapp', () => {
  const harness = createBrowserHarness();
  const { getValidatedDonorSession } = harness.context;

  const corruptedUser = {
    name: 'Budi Without Phone',
    status: 'active'
    // Missing whatsapp
  };
  harness.context.localStorage.setItem('donor_user', JSON.stringify(corruptedUser));

  const result = getValidatedDonorSession();
  assert.strictEqual(result, null, 'Corrupted session must be rejected as null');
  assert.strictEqual(harness.context.localStorage.getItem('donor_user'), null, 'Corrupted session must be purged from storage');
});

test('Session Lifecycle: getValidatedTokenSession validates valid PIC, Admin, and SuperAdmin roles', () => {
  const harness = createBrowserHarness();
  const { getValidatedTokenSession } = harness.context;

  // PIC
  harness.context.localStorage.setItem('auth_token', 'PIC-TEST-123');
  harness.context.localStorage.setItem('auth_role', 'PIC');
  const picSession = getValidatedTokenSession();
  assert.ok(picSession, 'PIC session must be valid');
  assert.strictEqual(picSession.token, 'PIC-TEST-123');
  assert.strictEqual(picSession.role, 'PIC');

  // Admin
  harness.context.localStorage.setItem('auth_token', 'ADM-TEST-456');
  harness.context.localStorage.setItem('auth_role', 'Admin');
  const adminSession = getValidatedTokenSession();
  assert.ok(adminSession, 'Admin session must be valid');
  assert.strictEqual(adminSession.token, 'ADM-TEST-456');
  assert.strictEqual(adminSession.role, 'Admin');

  // SuperAdmin
  harness.context.localStorage.setItem('auth_token', 'SA-TEST-789');
  harness.context.localStorage.setItem('auth_role', 'SuperAdmin');
  const saSession = getValidatedTokenSession();
  assert.ok(saSession, 'SuperAdmin session must be valid');
  assert.strictEqual(saSession.token, 'SA-TEST-789');
  assert.strictEqual(saSession.role, 'SuperAdmin');

  // Invalid role
  harness.context.localStorage.setItem('auth_token', 'INVALID-123');
  harness.context.localStorage.setItem('auth_role', 'HackerRole');
  assert.strictEqual(getValidatedTokenSession(), null, 'Invalid role must be rejected');
  assert.strictEqual(harness.context.localStorage.getItem('auth_token'), null, 'Invalid token must be purged');
});

test('Session Lifecycle: clearAllSessions removes all auth keys', () => {
  const harness = createBrowserHarness();
  const { clearAllSessions } = harness.context;

  harness.context.localStorage.setItem('donor_user', '{"name":"A"}');
  harness.context.localStorage.setItem('auth_token', 'TOK-123');
  harness.context.localStorage.setItem('auth_role', 'Admin');
  harness.context.localStorage.setItem('auth_alias', 'Admin1');
  harness.context.localStorage.setItem('deep_dive_return_token', 'TOK-RET');
  harness.context.localStorage.setItem('deep_dive_return_role', 'PIC');

  clearAllSessions();

  assert.strictEqual(harness.context.localStorage.getItem('donor_user'), null);
  assert.strictEqual(harness.context.localStorage.getItem('auth_token'), null);
  assert.strictEqual(harness.context.localStorage.getItem('auth_role'), null);
  assert.strictEqual(harness.context.localStorage.getItem('auth_alias'), null);
  assert.strictEqual(harness.context.localStorage.getItem('deep_dive_return_token'), null);
  assert.strictEqual(harness.context.localStorage.getItem('deep_dive_return_role'), null);
});

test('Version & Deployment: build generates version.json with version, buildTime, and commit', () => {
  const versionJsonPath = path.resolve('version.json');
  assert.ok(fs.existsSync(versionJsonPath), 'version.json must exist');
  const data = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
  assert.ok(data.version, 'version.json must contain version');
  assert.ok(data.buildTime, 'version.json must contain buildTime');
  assert.ok(data.commit, 'version.json must contain commit hash');
});

test('UI: showUpdateBanner creates update banner in DOM', () => {
  const harness = createBrowserHarness();
  const { showUpdateBanner } = harness.context;

  showUpdateBanner({ version: '1.2.0' });
  const banner = harness.context.document.getElementById('app-update-banner');
  assert.ok(banner, 'Update banner must be mounted into DOM');
  assert.ok(banner.innerHTML.includes('Pembaruan'), 'Banner text must inform user about update');
});
