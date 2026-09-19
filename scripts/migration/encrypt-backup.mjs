#!/usr/bin/env node

/**
 * scripts/migration/encrypt-backup.mjs
 *
 * Donatur Helper — Encrypt a backup directory into a single opaque file.
 *
 * The backup contains personal data (Member names, WhatsApp numbers, e-mail
 * addresses, Bukti Transfer images). `.github/workflows/backup-supabase.yml`
 * uploads the result as a workflow artifact, and workflow artifacts of a public
 * repository are downloadable by anyone. Encryption is therefore mandatory, not
 * optional.
 *
 * Format (all integers big-endian):
 *
 *   "DHBAK1\0\0"          8   magic + format version
 *   salt                 16   scrypt salt
 *   iv                   12   AES-256-GCM nonce
 *   ciphertext            n   AES-256-GCM over the container below
 *   authTag              16   AES-256-GCM authentication tag
 *
 *   container (plaintext):
 *     repeated:  pathLen(4) path(utf8) dataLen(8) data(bytes)
 *     terminator: pathLen == 0
 *
 * GCM is authenticated, so a truncated or tampered artifact fails to decrypt
 * loudly instead of restoring silently corrupt data.
 *
 * Usage:
 *   node scripts/migration/encrypt-backup.mjs --in backup --out backup.dhbak
 *   BACKUP_PASSPHRASE=... node scripts/migration/encrypt-backup.mjs --in backup --out backup.dhbak
 *
 * The passphrase is read from an environment variable, never from argv, so it
 * cannot leak through the process list or shell history.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const MAGIC = Buffer.from('DHBAK1\0\0', 'latin1');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

/** scrypt cost. 128 * N * r = ~33 MiB, comfortably inside CI memory. */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 32768 * 8 * 2 };

/**
 * @param {string[]} argv
 * @returns {{ in: string, out: string, passEnv: string }}
 */
function parseArgs(argv) {
  const opts = { in: '', out: '', passEnv: 'BACKUP_PASSPHRASE' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--in') opts.in = argv[++i] ?? '';
    else if (flag === '--out') opts.out = argv[++i] ?? '';
    else if (flag === '--pass-env') opts.passEnv = argv[++i] ?? '';
  }
  if (!opts.in || !opts.out) {
    throw new Error('Usage: encrypt-backup.mjs --in <dir> --out <file> [--pass-env NAME]');
  }
  return opts;
}

/**
 * Deterministic walk: sorted, so the same tree always encrypts identically
 * before the random salt and IV are applied.
 *
 * @param {string} root
 * @param {string} [dir]
 * @returns {string[]} relative POSIX paths
 */
function walk(root, dir = '') {
  const abs = path.join(root, dir);
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(root, rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/**
 * @param {string} root
 * @param {string[]} files
 * @returns {Buffer}
 */
function buildContainer(root, files) {
  const parts = [];
  for (const rel of files) {
    const name = Buffer.from(rel, 'utf8');
    const data = fs.readFileSync(path.join(root, rel));
    const len = Buffer.alloc(4);
    len.writeUInt32BE(name.length, 0);
    const size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(data.length), 0);
    parts.push(len, name, size, data);
  }
  parts.push(Buffer.alloc(4)); // terminator: pathLen == 0
  return Buffer.concat(parts);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const passphrase = process.env[opts.passEnv] || '';

  if (!passphrase) {
    console.error(
      `[encrypt] Missing passphrase in $${opts.passEnv}.\n` +
        '          Store the same value in your password manager: without it the\n' +
        '          backup cannot be restored.'
    );
    process.exit(1);
  }
  if (!fs.existsSync(opts.in)) {
    console.error(`[encrypt] Input directory not found: ${opts.in}`);
    process.exit(1);
  }

  const files = walk(opts.in);
  if (files.length === 0) {
    console.error(`[encrypt] Refusing to encrypt an empty directory: ${opts.in}`);
    process.exit(1);
  }

  const plaintext = buildContainer(opts.in, files);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = crypto.scryptSync(passphrase, salt, KEY_BYTES, SCRYPT);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const outPath = path.resolve(opts.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([MAGIC, salt, iv, ciphertext, tag]));

  const bytes = fs.statSync(outPath).size;
  console.log(
    `[encrypt] OK — ${files.length} files, ${plaintext.length} bytes plaintext -> ` +
      `${bytes} bytes encrypted (${outPath})`
  );
  console.log(`[encrypt] Passphrase source: $${opts.passEnv}. Keep it safe — it is not stored here.`);
}

main().catch((error) => {
  console.error(`[encrypt] FAILED: ${error.message}`);
  process.exit(1);
});