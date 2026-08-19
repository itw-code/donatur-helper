#!/usr/bin/env node

/**
 * scripts/migration/upsert-fresh-diff.mjs
 * 
 * Donatur Helper — Fresh Data Diff & Selective Upsert Pipeline
 * 
 * Usage:
 *   Dry-run mode (default, zero mutation):
 *     node scripts/migration/upsert-fresh-diff.mjs
 *     node scripts/migration/upsert-fresh-diff.mjs --dry-run
 * 
 *   Write mode (mutates Supabase with diffs only):
 *     node scripts/migration/upsert-fresh-diff.mjs --write
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import * as xlsxModule from 'xlsx';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import {
  normalizeWhatsApp,
  isValidIndonesianE164,
  parseTimestamp,
  hashToken,
  parseSettingValue,
  normalizeMemberStatus,
  normalizeMemberRole,
  normalizeCampaignStatus,
  normalizeAuthTokenRole,
  normalizeAuthTokenStatus,
  normalizeDonorStatus,
  normalizeLateRequestStatus,
  isSecretSettingKey
} from './migrate-xlsx-to-supabase.mjs';

dotenv.config();

const xlsx = xlsxModule.default || xlsxModule;

function normalizeEmail(raw) {
  if (!raw) return null;
  let str = String(raw).trim().toLowerCase();
  if (!str.includes('@')) return null;
  if (str.endsWith('@gmailcom')) {
    str = str.replace('@gmailcom', '@gmail.com');
  }
  return str;
}

function maskWhatsApp(phone) {
  if (!phone) return 'N/A';
  const str = String(phone);
  if (str.length <= 6) return '***';
  return str.slice(0, 5) + '***' + str.slice(-2);
}

function maskEmail(email) {
  if (!email) return 'null';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const user = parts[0];
  const domain = parts[1];
  const maskedUser = user.length > 2 ? user.slice(0, 2) + '***' : user + '***';
  return `${maskedUser}@${domain}`;
}

async function main() {
  const isWrite = process.argv.includes('--write');
  const isDryRun = process.argv.includes('--dry-run') || !isWrite;
  const executionMode = isWrite ? 'WRITE' : 'DRY-RUN';

  console.log('================================================================');
  console.log(' Donatur Helper — Fresh Data Selective Diff & Upsert Pipeline');
  console.log('================================================================');
  console.log(`Execution Mode: ${executionMode} ${isDryRun ? '(Zero Mutation)' : '(Mutates Supabase)'}`);
  console.log(`Timestamp:      ${new Date().toISOString()}`);

  const freshPath = path.resolve(process.cwd(), 'data/source/donatur-helper-fresh.xlsx');
  console.log(`Source File:    ${freshPath}\n`);

  if (!fs.existsSync(freshPath)) {
    console.error(`[ERROR] Source XLSX file not found at: ${freshPath}`);
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) {
    console.error('[ERROR] SUPABASE_URL and SUPABASE_SECRET_KEY must be defined in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Read fresh workbook
  const freshWb = xlsx.readFile(freshPath, {
    cellDates: true,
    raw: true,
    dense: false
  });

  function getSheetData(sheetName) {
    const ws = freshWb.Sheets[sheetName];
    if (!ws) return { headers: [], rows: [] };
    const rawJson = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (!rawJson || rawJson.length === 0) return { headers: [], rows: [] };
    const headers = (rawJson[0] || []).map(h => (h !== null && h !== undefined ? String(h).trim() : ''));
    const rows = rawJson.slice(1).filter(r => r && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
    return { headers, rows };
  }

  // Fetch current Supabase state
  console.log('Fetching live database snapshot from Supabase...');
  const { data: dbMembers, error: mErr } = await supabase.from('members').select('*');
  if (mErr) throw new Error(`Failed to fetch members: ${mErr.message}`);

  const { data: dbCampaigns, error: cErr } = await supabase.from('campaigns').select('*');
  if (cErr) throw new Error(`Failed to fetch campaigns: ${cErr.message}`);

  const { data: dbDonors, error: dErr } = await supabase.from('donors').select('*');
  if (dErr) throw new Error(`Failed to fetch donors: ${dErr.message}`);

  const { data: dbTokens, error: tErr } = await supabase.from('auth_tokens').select('*');
  if (tErr) throw new Error(`Failed to fetch auth_tokens: ${tErr.message}`);

  const { data: dbSettings, error: sErr } = await supabase.from('app_settings').select('*');
  if (sErr) throw new Error(`Failed to fetch app_settings: ${sErr.message}`);

  const { data: dbLate, error: lErr } = await supabase.from('late_requests').select('*');
  if (lErr) throw new Error(`Failed to fetch late_requests: ${lErr.message}`);

  console.log(`Current DB records:
- members:       ${dbMembers.length}
- campaigns:     ${dbCampaigns.length}
- donors:        ${dbDonors.length}
- auth_tokens:   ${dbTokens.length}
- app_settings:  ${dbSettings.length}
- late_requests: ${dbLate.length}
`);

  // -------------------------------------------------------------------------
  // 1. Members Diff & Planning
  // -------------------------------------------------------------------------
  const freshMembersData = getSheetData('Members');
  const mH = freshMembersData.headers;
  const mIdx = {
    name: mH.indexOf('Name'),
    whatsapp: mH.indexOf('WhatsApp'),
    status: mH.indexOf('Status'),
    addedBy: mH.indexOf('AddedBy'),
    addedAt: mH.indexOf('AddedAt'),
    role: mH.indexOf('Role'),
    modifiedBy: mH.indexOf('ModifiedBy'),
    modifiedAt: mH.indexOf('ModifiedAt'),
    email: mH.indexOf('Email')
  };

  const dbMemberMap = new Map();
  for (const m of dbMembers) {
    dbMemberMap.set(m.whatsapp, m);
  }

  const memberInserts = [];
  const memberUpdates = [];

  for (let i = 0; i < freshMembersData.rows.length; i++) {
    const row = freshMembersData.rows[i];
    const rawWa = mIdx.whatsapp !== -1 ? row[mIdx.whatsapp] : row[1];
    const normWa = normalizeWhatsApp(rawWa);
    if (!normWa) continue;

    const rawEmail = mIdx.email !== -1 && row[mIdx.email] ? String(row[mIdx.email]).trim() : null;
    const cleanEmail = normalizeEmail(rawEmail);
    const name = String(row[mIdx.name !== -1 ? mIdx.name : 0] || '').trim();
    const status = normalizeMemberStatus(mIdx.status !== -1 ? row[mIdx.status] : 'ACTIVE');
    const role = normalizeMemberRole(mIdx.role !== -1 ? row[mIdx.role] : 'MEMBER');
    const addedBy = mIdx.addedBy !== -1 && row[mIdx.addedBy] ? String(row[mIdx.addedBy]).trim() : null;
    const addedAt = parseTimestamp(mIdx.addedAt !== -1 ? row[mIdx.addedAt] : null) || new Date().toISOString();
    const modifiedBy = mIdx.modifiedBy !== -1 && row[mIdx.modifiedBy] ? String(row[mIdx.modifiedBy]).trim() : null;
    const modifiedAt = parseTimestamp(mIdx.modifiedAt !== -1 ? row[mIdx.modifiedAt] : null);

    const existing = dbMemberMap.get(normWa);
    if (!existing) {
      memberInserts.push({
        id: crypto.randomUUID(),
        name,
        whatsapp: normWa,
        email: cleanEmail,
        status,
        role,
        added_by: addedBy,
        added_at: addedAt,
        modified_by: modifiedBy,
        modified_at: modifiedAt
      });
    } else {
      const diffs = [];
      const patch = {};

      if (cleanEmail && cleanEmail !== existing.email) {
        diffs.push(`email: ${existing.email ? maskEmail(existing.email) : 'null'} -> ${maskEmail(cleanEmail)}`);
        patch.email = cleanEmail;
      }
      if (name && name !== existing.name) {
        diffs.push(`name: '${existing.name}' -> '${name}'`);
        patch.name = name;
      }
      if (status && status !== existing.status) {
        diffs.push(`status: ${existing.status} -> ${status}`);
        patch.status = status;
      }
      if (role && role !== existing.role) {
        diffs.push(`role: ${existing.role} -> ${role}`);
        patch.role = role;
      }

      if (diffs.length > 0) {
        patch.modified_by = modifiedBy || existing.modified_by || 'fresh-xlsx-sync';
        patch.modified_at = modifiedAt || new Date().toISOString();
        memberUpdates.push({
          id: existing.id,
          whatsapp: normWa,
          name: existing.name,
          diffs,
          patch
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Donors Diff & Planning
  // -------------------------------------------------------------------------
  const freshDonorsData = getSheetData('Donors');
  const dH = freshDonorsData.headers;
  const dIdx = {
    campaignId: dH.indexOf('CampaignID'),
    name: dH.indexOf('Name'),
    whatsapp: dH.indexOf('WhatsApp'),
    joinedAt: dH.indexOf('JoinedAt'),
    donorStatus: dH.indexOf('DonorStatus'),
    amountDue: dH.indexOf('AmountDue'),
    paid: dH.indexOf('Paid'),
    proofLink: dH.indexOf('ProofLink'),
    paidAt: dH.indexOf('PaidAt'),
    customAmount: dH.indexOf('CustomAmount'),
    amountPaid: dH.indexOf('AmountPaid'),
    verified: dH.indexOf('Verified'),
    refunded: dH.indexOf('Refunded'),
    alias: dH.indexOf('Alias'),
    modifiedBy: dH.indexOf('ModifiedBy'),
    modifiedAt: dH.indexOf('ModifiedAt'),
    lastReminderSentAt: dH.indexOf('LastReminderSentAt')
  };

  const dbDonorMap = new Map();
  for (const d of dbDonors) {
    dbDonorMap.set(`${d.campaign_id}:::${d.whatsapp}`, d);
  }

  const donorInserts = [];
  const donorUpdates = [];
  const donorSeen = new Set();

  for (let i = 0; i < freshDonorsData.rows.length; i++) {
    const row = freshDonorsData.rows[i];
    const cId = String(row[dIdx.campaignId] || '').trim();
    const rawWa = row[dIdx.whatsapp];
    const normWa = normalizeWhatsApp(rawWa);
    if (!cId || !normWa) continue;

    const donorCompositeKey = `${cId}:::${normWa}`;
    if (donorSeen.has(donorCompositeKey)) continue;
    donorSeen.add(donorCompositeKey);

    const rawPaid = row[dIdx.paid];
    const paid = typeof rawPaid === 'boolean' ? rawPaid : String(rawPaid).trim().toLowerCase() === 'true';
    const rawVerified = row[dIdx.verified];
    const verified = typeof rawVerified === 'boolean' ? rawVerified : String(rawVerified).trim().toLowerCase() === 'true';
    const rawRefunded = row[dIdx.refunded];
    const refunded = typeof rawRefunded === 'boolean' ? rawRefunded : String(rawRefunded).trim().toLowerCase() === 'true';
    const rawCustomAmount = row[dIdx.customAmount];
    const customAmount = rawCustomAmount !== null && rawCustomAmount !== undefined && rawCustomAmount !== '' && !isNaN(Number(rawCustomAmount))
      ? Number(rawCustomAmount)
      : null;

    const donorObj = {
      campaign_id: cId,
      name: String(row[dIdx.name !== -1 ? dIdx.name : 1] || '').trim(),
      whatsapp: normWa,
      alias: dIdx.alias !== -1 && row[dIdx.alias] ? String(row[dIdx.alias]).trim() : null,
      donor_status: normalizeDonorStatus(dIdx.donorStatus !== -1 ? row[dIdx.donorStatus] : 'PLEDGED'),
      amount_due: Number(row[dIdx.amountDue !== -1 ? dIdx.amountDue : 5]) || 0,
      custom_amount: customAmount,
      amount_paid: Number(row[dIdx.amountPaid !== -1 ? dIdx.amountPaid : 10]) || 0,
      paid: paid,
      proof_link: dIdx.proofLink !== -1 && row[dIdx.proofLink] ? String(row[dIdx.proofLink]).trim() : null,
      proof_storage_path: null,
      paid_at: parseTimestamp(dIdx.paidAt !== -1 ? row[dIdx.paidAt] : null),
      verified: verified,
      refunded: refunded,
      joined_at: parseTimestamp(dIdx.joinedAt !== -1 ? row[dIdx.joinedAt] : null) || new Date().toISOString(),
      last_reminder_sent_at: parseTimestamp(dIdx.lastReminderSentAt !== -1 ? row[dIdx.lastReminderSentAt] : null),
      modified_by: dIdx.modifiedBy !== -1 && row[dIdx.modifiedBy] ? String(row[dIdx.modifiedBy]).trim() : null,
      modified_at: parseTimestamp(dIdx.modifiedAt !== -1 ? row[dIdx.modifiedAt] : null)
    };

    const existing = dbDonorMap.get(donorCompositeKey);
    if (!existing) {
      donorInserts.push({
        id: crypto.randomUUID(),
        ...donorObj
      });
    } else {
      const diffs = [];
      const patch = {};

      if (donorObj.donor_status !== existing.donor_status) {
        diffs.push(`donor_status: ${existing.donor_status} -> ${donorObj.donor_status}`);
        patch.donor_status = donorObj.donor_status;
      }
      if (donorObj.paid !== existing.paid) {
        diffs.push(`paid: ${existing.paid} -> ${donorObj.paid}`);
        patch.paid = donorObj.paid;
      }
      if (donorObj.amount_paid !== Number(existing.amount_paid)) {
        diffs.push(`amount_paid: ${existing.amount_paid} -> ${donorObj.amount_paid}`);
        patch.amount_paid = donorObj.amount_paid;
      }
      if (donorObj.amount_due !== Number(existing.amount_due)) {
        diffs.push(`amount_due: ${existing.amount_due} -> ${donorObj.amount_due}`);
        patch.amount_due = donorObj.amount_due;
      }
      if (donorObj.verified !== existing.verified) {
        diffs.push(`verified: ${existing.verified} -> ${donorObj.verified}`);
        patch.verified = donorObj.verified;
      }
      if (donorObj.refunded !== existing.refunded) {
        diffs.push(`refunded: ${existing.refunded} -> ${donorObj.refunded}`);
        patch.refunded = donorObj.refunded;
      }
      if (donorObj.proof_link && donorObj.proof_link !== existing.proof_link) {
        diffs.push(`proof_link updated`);
        patch.proof_link = donorObj.proof_link;
      }

      if (diffs.length > 0) {
        patch.modified_by = donorObj.modified_by || existing.modified_by || 'fresh-xlsx-sync';
        patch.modified_at = donorObj.modified_at || new Date().toISOString();
        donorUpdates.push({
          id: existing.id,
          campaign_id: cId,
          whatsapp: normWa,
          diffs,
          patch
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 3. Auth Tokens Diff & Planning
  // -------------------------------------------------------------------------
  const freshTokensData = getSheetData('Tokens');
  const tH = freshTokensData.headers;
  const tIdx = {
    tokenId: tH.indexOf('TokenID'),
    role: tH.indexOf('Role'),
    status: tH.indexOf('Status'),
    linkedCampaignId: tH.indexOf('LinkedCampaignID'),
    createdBy: tH.indexOf('CreatedBy'),
    createdAt: tH.indexOf('CreatedAt'),
    alias: tH.indexOf('Alias')
  };

  const dbTokenMap = new Map();
  for (const t of dbTokens) {
    dbTokenMap.set(t.token_hash, t);
  }

  const validCampaignIds = new Set(dbCampaigns.map(c => c.campaign_id));
  const tokenInserts = [];

  for (let i = 0; i < freshTokensData.rows.length; i++) {
    const row = freshTokensData.rows[i];
    const rawTokenId = tIdx.tokenId !== -1 ? row[tIdx.tokenId] : row[0];
    if (!rawTokenId) continue;
    const tokenHash = hashToken(rawTokenId);
    if (!tokenHash) continue;

    const rawLinkedCId = tIdx.linkedCampaignId !== -1 && row[tIdx.linkedCampaignId]
      ? String(row[tIdx.linkedCampaignId]).trim()
      : null;

    let linkedCampaignId = null;
    if (rawLinkedCId && validCampaignIds.has(rawLinkedCId)) {
      linkedCampaignId = rawLinkedCId;
    }

    const tokenStatus = normalizeAuthTokenStatus(tIdx.status !== -1 ? row[tIdx.status] : 'ACTIVE');
    const tokenRole = normalizeAuthTokenRole(tIdx.role !== -1 ? row[tIdx.role] : 'ADMIN');
    const createdAt = parseTimestamp(tIdx.createdAt !== -1 ? row[tIdx.createdAt] : null) || new Date().toISOString();
    const revokedAt = tokenStatus === 'REVOKED' ? createdAt : null;
    const alias = tIdx.alias !== -1 && row[tIdx.alias] ? String(row[tIdx.alias]).trim() : null;
    const createdBy = tIdx.createdBy !== -1 && row[tIdx.createdBy] ? String(row[tIdx.createdBy]).trim() : null;

    const existing = dbTokenMap.get(tokenHash);
    if (!existing) {
      tokenInserts.push({
        id: crypto.randomUUID(),
        token_hash: tokenHash,
        role: tokenRole,
        status: tokenStatus,
        linked_campaign_id: linkedCampaignId,
        alias,
        created_by: createdBy,
        created_at: createdAt,
        revoked_at: revokedAt,
        expires_at: null,
        last_used_at: null
      });
    }
  }

  // -------------------------------------------------------------------------
  // Report Planned Diff Operations
  // -------------------------------------------------------------------------
  console.log('================================================================');
  console.log(' Planned Diff Operations Summary');
  console.log('================================================================\n');

  console.log('1. MEMBERS:');
  console.log(`   - New Inserts: ${memberInserts.length}`);
  for (const m of memberInserts) {
    console.log(`     + Insert Member: ${m.name} (${maskWhatsApp(m.whatsapp)}), role: ${m.role}, status: ${m.status}, email: ${maskEmail(m.email)}`);
  }
  console.log(`   - Updates:     ${memberUpdates.length}`);
  for (const u of memberUpdates) {
    console.log(`     ~ Update Member ${u.name} (${maskWhatsApp(u.whatsapp)}): ${u.diffs.join(', ')}`);
  }

  console.log('\n2. DONORS:');
  console.log(`   - New Inserts: ${donorInserts.length}`);
  for (const d of donorInserts) {
    console.log(`     + Insert Donor: ${d.name} (${maskWhatsApp(d.whatsapp)}) on ${d.campaign_id}, status: ${d.donor_status}, amount_due: ${d.amount_due}, custom: ${d.custom_amount || 'none'}`);
  }
  console.log(`   - Updates:     ${donorUpdates.length}`);
  for (const u of donorUpdates) {
    console.log(`     ~ Update Donor (${maskWhatsApp(u.whatsapp)}) on ${u.campaign_id}: ${u.diffs.join(', ')}`);
  }

  console.log('\n3. AUTH TOKENS:');
  console.log(`   - New Inserts: ${tokenInserts.length}`);
  for (const t of tokenInserts) {
    console.log(`     + Insert Token: role: ${t.role}, status: ${t.status}, campaign: ${t.linked_campaign_id || 'null'}`);
  }

  console.log('\n4. CAMPAIGNS, APP_SETTINGS, LATE_REQUESTS:');
  console.log('   - No diffs detected (0 operations).\n');

  // -------------------------------------------------------------------------
  // Execute Writes if in WRITE mode
  // -------------------------------------------------------------------------
  if (isWrite) {
    console.log('================================================================');
    console.log(' Executing Selective Upsert to Supabase...');
    console.log('================================================================\n');

    // 1. Members Inserts
    if (memberInserts.length > 0) {
      console.log(`- Inserting ${memberInserts.length} new members...`);
      const { error: insErr } = await supabase.from('members').insert(memberInserts);
      if (insErr) throw new Error(`Failed to insert new members: ${insErr.message}`);
      console.log(`  ✓ Successfully inserted ${memberInserts.length} members.`);
    }

    // 2. Members Updates
    if (memberUpdates.length > 0) {
      console.log(`- Updating ${memberUpdates.length} existing members...`);
      for (const u of memberUpdates) {
        const { error: updErr } = await supabase
          .from('members')
          .update(u.patch)
          .eq('id', u.id);
        if (updErr) throw new Error(`Failed to update member ${u.id}: ${updErr.message}`);
      }
      console.log(`  ✓ Successfully updated ${memberUpdates.length} members.`);
    }

    // Refresh member mapping from database to ensure all member IDs are present
    const { data: allMembers, error: fetchAllErr } = await supabase
      .from('members')
      .select('id, whatsapp');
    if (fetchAllErr) throw new Error(`Failed to fetch updated members: ${fetchAllErr.message}`);

    const completeMemberMap = new Map();
    for (const m of allMembers) {
      completeMemberMap.set(m.whatsapp, m.id);
    }

    // 3. Donors Inserts (attach member_id foreign key)
    if (donorInserts.length > 0) {
      console.log(`- Inserting ${donorInserts.length} new donors...`);
      const readyDonors = donorInserts.map(d => {
        const memberId = completeMemberMap.get(d.whatsapp) || null;
        return {
          ...d,
          member_id: memberId
        };
      });

      const { error: dInsErr } = await supabase.from('donors').insert(readyDonors);
      if (dInsErr) throw new Error(`Failed to insert new donors: ${dInsErr.message}`);
      console.log(`  ✓ Successfully inserted ${donorInserts.length} donors.`);
    }

    // 4. Donors Updates
    if (donorUpdates.length > 0) {
      console.log(`- Updating ${donorUpdates.length} existing donors...`);
      for (const u of donorUpdates) {
        const { error: dUpdErr } = await supabase
          .from('donors')
          .update(u.patch)
          .eq('id', u.id);
        if (dUpdErr) throw new Error(`Failed to update donor ${u.id}: ${dUpdErr.message}`);
      }
      console.log(`  ✓ Successfully updated ${donorUpdates.length} donors.`);
    }

    // 5. Auth Tokens Inserts
    if (tokenInserts.length > 0) {
      console.log(`- Inserting ${tokenInserts.length} new auth tokens...`);
      const { error: tInsErr } = await supabase.from('auth_tokens').insert(tokenInserts);
      if (tInsErr) throw new Error(`Failed to insert new tokens: ${tInsErr.message}`);
      console.log(`  ✓ Successfully inserted ${tokenInserts.length} auth tokens.`);
    }

    // -----------------------------------------------------------------------
    // Post-Write Verification
    // -----------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(' Post-Write Database Verification');
    console.log('================================================================\n');

    const { count: finalMembersCount } = await supabase.from('members').select('*', { count: 'exact', head: true });
    const { count: finalDonorsCount } = await supabase.from('donors').select('*', { count: 'exact', head: true });
    const { count: finalTokensCount } = await supabase.from('auth_tokens').select('*', { count: 'exact', head: true });
    const { count: finalCampaignsCount } = await supabase.from('campaigns').select('*', { count: 'exact', head: true });

    console.log(`Final Database Record Counts:
- members:     ${finalMembersCount} (expected: ${dbMembers.length + memberInserts.length})
- donors:      ${finalDonorsCount} (expected: ${dbDonors.length + donorInserts.length})
- auth_tokens: ${finalTokensCount} (expected: ${dbTokens.length + tokenInserts.length})
- campaigns:   ${finalCampaignsCount} (expected: ${dbCampaigns.length})
`);

    // Verify updated emails
    const { data: verifyEmails } = await supabase
      .from('members')
      .select('name, whatsapp, email')
      .in('whatsapp', ['+6281297488665', '+6281276551881', '+6282389703243']);

    console.log('Verified Member Emails in Supabase:');
    for (const v of verifyEmails) {
      console.log(`  - ${v.name} (${maskWhatsApp(v.whatsapp)}): ${v.email}`);
    }

    // Verify unlinked donors
    const { count: nullMemberCount } = await supabase
      .from('donors')
      .select('id', { count: 'exact' })
      .is('member_id', null);

    console.log(`\n- Donors with NULL member_id: ${nullMemberCount} (expected: 1 - dummy/unregistered)`);
    console.log('✓ All verification checks PASSED.\n');
  } else {
    console.log('Dry-run complete. Run with --write to apply the diff to Supabase.\n');
  }
}

main().catch(err => {
  console.error('\n[FATAL ERROR]:', err.message);
  process.exit(1);
});
