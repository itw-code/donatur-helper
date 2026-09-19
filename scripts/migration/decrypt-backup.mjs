#!/usr/bin/env node

/**
 * scripts/migration/decrypt-backup.mjs
 *
 * Donatur Helper — Restore a backup produced by encrypt-backup.mjs.
 *
 * Usage:
 *   BACKUP_PASSPHRASE=... node scripts/migration/decrypt-backup.mjs --in backup.dhbak --out restored/
 *
 * Exits non-zero if the passphrase is wrong or the file is truncated/tampered:
 * AES-256-GCM authentication makes both cases fail loudly rather than producing
 * a silently corrupt restore.
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
const HEADER_BYTES = MAGIC.length + SALT_BYTES + IV_BYTES;

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
    throw new Error('Usage: decrypt-backup.mjs --in <file> --out <dir> [--pass-env NAME]');
  }
  return opts;
}

/**
 * @param {Buffer} buf
 * @param {string} root
 * @returns {number} files written
 */
function unpack(buf, root) {
  let pos = 0;
  let count = 0;

  for (;;) {
    if (pos + 4 > buf.length) throw new Error('container truncated while reading a path length');
    const pathLen = buf.readUInt32BE(pos);
    pos += 4;
    if (pathLen === 0) break;

    if (pos + pathLen > buf.length) throw new Error('container truncated while reading a path');
    const rel = buf.subarray(pos, pos + pathLen).toString('utf8');
    pos += pathLen;

    if (pos + 8 > buf.length) throw new Error('container truncated while reading a data length');
    const dataLen = Number(buf.readBigUInt64BE(pos));
    pos += 8;

    if (pos + dataLen > buf.length) throw new Error(`container truncated inside "${rel}"`);
    const data = buf.subarray(pos, pos + dataLen);
    pos += dataLen;

    const target = path.resolve(root, rel);
    // A malicious archive must not be able to write outside the output root.
    if (!target.startsWith(root + path.sep)) {
      throw new Error(`refusing to write outside output root: ${rel}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    count += 1;
  }
  return count;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const passphrase = process.env[opts.passEnv] || '';

  if (!passphrase) {
    console.error(`[decrypt] Missing passphrase in $${opts.passEnv}.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(opts.in));
  if (raw.length < HEADER_BYTES + TAG_BYTES) {
    console.error('[decrypt] File is too small to be a backup.');
    process.exit(1);
  }
  if (!raw.subarray(0, MAGIC.length).equals(MAGIC)) {
    console.error('[decrypt] Bad magic bytes — not a Donatur Helper backup file.');
    process.exit(1);
  }

  const salt = raw.subarray(MAGIC.length, MAGIC.length + SALT_BYTES);
  const iv = raw.subarray(MAGIC.length + SALT_BYTES, HEADER_BYTES);
  const tag = raw.subarray(raw.length - TAG_BYTES);
  const ciphertext = raw.subarray(HEADER_BYTES, raw.length - TAG_BYTES);

  const key = crypto.scryptSync(passphrase, salt, KEY_BYTES, SCRYPT);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    console.error('[decrypt] Authentication failed — wrong passphrase, or the file is truncated/tampered.');
    process.exit(1);
  }

  const outRoot = path.resolve(opts.out);
  fs.mkdirSync(outRoot, { recursive: true });
  const count = unpack(plaintext, outRoot);

  console.log(`[decrypt] OK — restored ${count} files into ${outRoot}`);
  console.log('[decrypt] Next: apply supabase/migrations/, then load tables/ and re-upload storage/.');
}

main().catch((error) => {
  console.error(`[decrypt] FAILED: ${error.message}`);
  process.exit(1);
});