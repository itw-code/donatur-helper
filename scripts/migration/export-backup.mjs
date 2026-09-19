#!/usr/bin/env node

/**
 * scripts/migration/export-backup.mjs
 *
 * Donatur Helper — Offsite Logical Backup Export
 *
 * Reads the entire public schema and the `bukti-transfer` Storage bucket
 * (the Bukti Transfer images) through the Supabase REST API using the
 * secret/service_role key, and writes a self-describing directory:
 *
 *   <out>/manifest.json                  export metadata + row counts
 *   <out>/tables/<table>.json            one JSON array per table
 *   <out>/storage/bukti-transfer/<path>  the raw Storage objects
 *
 * Read-only: this script never writes to Supabase.
 *
 * WARNING — the output contains personal data (Member names, WhatsApp numbers,
 * e-mail addresses, payment proofs). NEVER commit it and NEVER upload it
 * unencrypted. See `.github/workflows/backup-supabase.yml`, which encrypts the
 * archive before it becomes a workflow artifact.
 *
 * Usage:
 *   node scripts/migration/export-backup.mjs                 # writes to ./backup
 *   node scripts/migration/export-backup.mjs --out ./tmp/b   # custom directory
 *
 * Environment (from `.env` locally, or CI secrets):
 *   SUPABASE_URL           required
 *   SUPABASE_SECRET_KEY    required — secret/service_role key, bypasses RLS
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

/** Exported in this order, which is also the order recorded in the manifest. */
const TABLES = [
  'app_settings',
  'members',
  'campaigns',
  'auth_tokens',
  'donors',
  'late_requests',
  'reminder_logs',
  'audit_logs',
];

const BUCKET = 'bukti-transfer';

/** PostgREST caps a single response; page through with explicit ranges. */
const PAGE_SIZE = 1000;

/** Storage `list()` also paged, one folder level at a time. */
const LIST_PAGE_SIZE = 100;

/**
 * @param {string[]} argv
 * @returns {{ out: string }}
 */
function parseArgs(argv) {
  let out = 'backup';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      const value = argv[i + 1];
      if (!value) throw new Error('--out requires a directory argument');
      out = value;
      i += 1;
    }
  }
  return { out: path.resolve(out) };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} table
 * @returns {Promise<object[]>}
 */
async function fetchAllRows(supabase, table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`[${table}] select failed at offset ${from}: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/**
 * Walks every folder level under `prefix` and returns absolute object paths.
 * Supabase Storage reports folders as entries whose `id` is null.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} prefix
 * @param {string[]} acc
 * @returns {Promise<string[]>}
 */
async function listStorageObjects(supabase, prefix, acc = []) {
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset });

    if (error) {
      throw new Error(`[storage] list "${prefix}" failed: ${error.message}`);
    }
    const entries = data ?? [];

    for (const entry of entries) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        await listStorageObjects(supabase, full, acc);
      } else {
        acc.push(full);
      }
    }
    if (entries.length < LIST_PAGE_SIZE) return acc;
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} objectPath
 * @param {string} storageRoot
 * @returns {Promise<number>} bytes written
 */
async function downloadObject(supabase, objectPath, storageRoot) {
  const target = path.resolve(storageRoot, objectPath);
  // Guard against a crafted object name escaping the storage root.
  if (!target.startsWith(storageRoot + path.sep)) {
    throw new Error(`[storage] refusing to write outside storage root: ${objectPath}`);
  }

  const { data, error } = await supabase.storage.from(BUCKET).download(objectPath);
  if (error) {
    throw new Error(`[storage] download "${objectPath}" failed: ${error.message}`);
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return bytes.length;
}

async function main() {
  const { out } = parseArgs(process.argv.slice(2));
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY || '').trim();

  if (!supabaseUrl || !secretKey) {
    console.error(
      '[backup] Missing SUPABASE_URL or SUPABASE_SECRET_KEY.\n' +
        '         Locally: set them in .env. In CI: add them as repository secrets.'
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
  const tablesDir = path.join(out, 'tables');
  const storageRoot = path.join(out, 'storage', BUCKET);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(tablesDir, { recursive: true });

  const tableCounts = {};
  let totalRows = 0;

  for (const table of TABLES) {
    const rows = await fetchAllRows(supabase, table);
    fs.writeFileSync(path.join(tablesDir, `${table}.json`), `${JSON.stringify(rows, null, 2)}\n`);
    tableCounts[table] = rows.length;
    totalRows += rows.length;
    console.log(`[backup] table ${table.padEnd(16)} ${String(rows.length).padStart(6)} rows`);
  }

  const objectPaths = await listStorageObjects(supabase, '');
  let storageBytes = 0;
  for (const objectPath of objectPaths) {
    storageBytes += await downloadObject(supabase, objectPath, storageRoot);
  }
  console.log(
    `[backup] storage ${BUCKET.padEnd(14)} ${String(objectPaths.length).padStart(6)} objects, ${storageBytes} bytes`
  );

  const manifest = {
    exportedAt: new Date().toISOString(),
    // Host only. The key must never reach the manifest or the logs.
    supabaseHost: new URL(supabaseUrl).host,
    schemaSource: 'supabase/migrations/',
    tables: tableCounts,
    totalRows,
    storage: {
      bucket: BUCKET,
      objectCount: objectPaths.length,
      bytes: storageBytes,
      objects: objectPaths.sort(),
    },
  };
  fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `\n[backup] OK — ${totalRows} rows across ${TABLES.length} tables, ` +
      `${objectPaths.length} storage objects (${storageBytes} bytes) -> ${out}`
  );
  console.log(
    '[backup] This output contains personal data. Do not commit it; do not share it unencrypted.'
  );
}

main().catch((error) => {
  console.error(`[backup] FAILED: ${error.message}`);
  process.exit(1);
});
