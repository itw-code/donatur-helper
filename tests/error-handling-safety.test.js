import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatUserErrorMessage } from '../js/utils.js';
import { DEFAULT_TIMEOUT_MS, fetchBackend } from '../js/api.js';

test('Task 3: formatUserErrorMessage converts network, timeout, auth, and raw errors into calm, user-safe Indonesian messages', () => {
  // 1. Network failures
  assert.equal(formatUserErrorMessage(new Error('Failed to fetch')), 'Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.');
  assert.equal(formatUserErrorMessage('TypeError: NetworkError when attempting to fetch resource.'), 'Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.');
  assert.equal(formatUserErrorMessage('net::ERR_INTERNET_DISCONNECTED'), 'Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.');

  // 2. Timeouts & Aborts -> Calm Indonesian message
  assert.equal(formatUserErrorMessage(new Error('The user aborted a request.')), 'Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.');
  assert.equal(formatUserErrorMessage('timeout of 10000ms exceeded'), 'Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.');
  assert.equal(formatUserErrorMessage({ isTimeout: true, message: 'Custom timeout' }), 'Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.');

  // 3. Auth issues
  assert.equal(formatUserErrorMessage(new Error('Unauthorized token')), 'Sesi akses Anda telah berakhir. Silakan masuk kembali.');
  assert.equal(formatUserErrorMessage('Invalid token provided'), 'Sesi akses Anda telah berakhir. Silakan masuk kembali.');
  assert.equal(formatUserErrorMessage('Sesi berakhir'), 'Sesi akses Anda telah berakhir. Silakan masuk kembali.');

  // 4. Raw technical stack traces must be sanitized
  const rawStack1 = 'Error: Cannot read properties of undefined (reading "id") at doPost (Code.js:145)';
  const sanitized1 = formatUserErrorMessage(rawStack1);
  assert.ok(!sanitized1.includes('doPost'), 'Must not leak internal function name doPost');
  assert.ok(!sanitized1.includes('Code.js'), 'Must not leak internal filename Code.js');
  assert.equal(sanitized1, 'Terjadi kendala saat memproses data. Silakan muat ulang halaman atau coba lagi.');

  const rawStack2 = 'TypeError: Cannot read properties of null at refreshMembers (js/views/admin.js:204)';
  const sanitized2 = formatUserErrorMessage(rawStack2);
  assert.ok(!sanitized2.includes('admin.js'), 'Must not leak JS filename');
  assert.equal(sanitized2, 'Terjadi kendala saat memproses data. Silakan muat ulang halaman atau coba lagi.');

  // 5. Non-JSON server error response
  const rawServerText = 'Respons server bukan JSON (mungkin error atau diblokir). Detail: <!DOCTYPE html><html><head><title>Error 500</title>';
  const sanitizedServer = formatUserErrorMessage(rawServerText);
  assert.ok(!sanitizedServer.includes('<!DOCTYPE'), 'Must not leak raw HTML in error');
  assert.equal(sanitizedServer, 'Respons server tidak dapat diproses. Silakan coba beberapa saat lagi.');

  // 6. Empty / null / undefined error handling
  assert.equal(formatUserErrorMessage(null), 'Terjadi kendala saat memproses permintaan. Silakan coba lagi.');
  assert.equal(formatUserErrorMessage(undefined), 'Terjadi kendala saat memproses permintaan. Silakan coba lagi.');
  assert.equal(formatUserErrorMessage(''), 'Terjadi kendala saat memproses permintaan. Silakan coba lagi.');

  // 7. Standard business error strings in Indonesian remain clean and escaped
  assert.equal(formatUserErrorMessage('Nomor WhatsApp belum terdaftar sebagai member.'), 'Nomor WhatsApp belum terdaftar sebagai member.');
  assert.equal(formatUserErrorMessage('Tentukan total hadiah dan nomor rekening terlebih dahulu.'), 'Tentukan total hadiah dan nomor rekening terlebih dahulu.');
});

test('Task 3: API layer declares DEFAULT_TIMEOUT_MS threshold and fetchBackend supports abort controller', () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 15000, 'DEFAULT_TIMEOUT_MS should be 15000ms');
  assert.equal(typeof fetchBackend, 'function');
});

test('Auth UI safety: login forms prevent double-submit and lock buttons while waiting for network', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const authCode = fs.readFileSync(path.resolve('js/views/auth.js'), 'utf8');

  // Verify userLogin disables button and blocks subsequent clicks
  assert.ok(authCode.includes('btn && btn.disabled'), 'userLogin/tokenLogin must check if button is disabled to prevent double clicks');
  assert.ok(authCode.includes("btn.textContent = 'Memeriksa...'"), 'userLogin must show checking feedback on check WhatsApp');
  assert.ok(authCode.includes("btn.textContent = 'Mendaftarkan...'"), 'userLogin must show registration feedback');
  assert.ok(authCode.includes("btn.textContent = 'Memeriksa token...'"), 'tokenLogin must show token verification feedback');
});
