#!/usr/bin/env node

/**
 * scripts/migration/analyze-fresh-diff.mjs
 * 
 * Inspects donatur-helper-fresh.xlsx and compares it against live Supabase data
 * as well as data/source/donatur-helper.xlsx.
 */

import fs from 'node:fs';
import path from 'node:path';
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

async function run() {
  const freshPath = path.resolve(process.cwd(), 'data/source/donatur-helper-fresh.xlsx');
  const oldPath = path.resolve(process.cwd(), 'data/source/donatur-helper.xlsx');

  if (!fs.existsSync(freshPath)) {
    console.error(`Fresh file not found at: ${freshPath}`);
    process.exit(1);
  }

  console.log('Loading workbooks...');
  const freshWb = xlsx.readFile(freshPath, { cellDates: true, raw: true });
  const oldWb = fs.existsSync(oldPath) ? xlsx.readFile(oldPath, { cellDates: true, raw: true }) : null;

  console.log(`Fresh sheets: ${freshWb.SheetNames.join(', ')}`);
  if (oldWb) {
    console.log(`Old sheets:   ${oldWb.SheetNames.join(', ')}`);
  }

  // Connect to Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) {
    console.error('SUPABASE_URL or SUPABASE_SECRET_KEY missing in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false }
  });

  // Helper to extract rows from workbook
  function extractSheet(wb, sheetName) {
    const ws = wb.Sheets[sheetName];
    if (!ws) return { headers: [], rows: [] };
    const rawJson = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (!rawJson || rawJson.length === 0) return { headers: [], rows: [] };
    const headers = (rawJson[0] || []).map(h => (h !== null && h !== undefined ? String(h).trim() : ''));
    const rows = rawJson.slice(1).filter(r => r && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
    return { headers, rows };
  }

  console.log('\n======================================================');
  console.log(' 1. SHEET ROW COUNTS COMPARISON');
  console.log('======================================================');
  for (const sheetName of freshWb.SheetNames) {
    if (sheetName.toLowerCase().includes('workaround')) continue;
    const freshData = extractSheet(freshWb, sheetName);
    const oldData = oldWb ? extractSheet(oldWb, sheetName) : { rows: [] };
    console.log(`- [${sheetName}] Old Rows: ${oldData.rows.length} | Fresh Rows: ${freshData.rows.length} (Diff: ${freshData.rows.length - oldData.rows.length})`);
  }

  // Fetch Supabase data for comparison
  console.log('\nFetching current Supabase data...');
  const { data: dbSettings } = await supabase.from('app_settings').select('*');
  const { data: dbMembers } = await supabase.from('members').select('*');
  const { data: dbCampaigns } = await supabase.from('campaigns').select('*');
  const { data: dbTokens } = await supabase.from('auth_tokens').select('*');
  const { data: dbDonors } = await supabase.from('donors').select('*');
  const { data: dbLateRequests } = await supabase.from('late_requests').select('*');

  console.log(`Supabase Live Counts:
- app_settings: ${dbSettings?.length || 0}
- members:      ${dbMembers?.length || 0}
- campaigns:    ${dbCampaigns?.length || 0}
- auth_tokens:  ${dbTokens?.length || 0}
- donors:       ${dbDonors?.length || 0}
- late_requests:${dbLateRequests?.length || 0}
`);

  // -------------------------------------------------------------------------
  // 1. Members Diff
  // -------------------------------------------------------------------------
  console.log('======================================================');
  console.log(' 2. MEMBERS DIFF ANALYSIS');
  console.log('======================================================');
  const freshMembersData = extractSheet(freshWb, 'Members');
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

  const dbMemberMap = new Map(); // normalized whatsapp -> dbMember
  for (const m of (dbMembers || [])) {
    dbMemberMap.set(m.whatsapp, m);
  }

  const newMembers = [];
  const updatedMembers = [];
  const unchangedMembers = [];

  for (let i = 0; i < freshMembersData.rows.length; i++) {
    const row = freshMembersData.rows[i];
    const rawWa = mIdx.whatsapp !== -1 ? row[mIdx.whatsapp] : row[1];
    const normWa = normalizeWhatsApp(rawWa);
    if (!normWa) continue;

    const rawEmail = mIdx.email !== -1 && row[mIdx.email] ? String(row[mIdx.email]).trim().toLowerCase() : null;
    const cleanEmail = rawEmail && rawEmail.includes('@') ? rawEmail : null;
    const name = String(row[mIdx.name !== -1 ? mIdx.name : 0] || '').trim();
    const status = normalizeMemberStatus(mIdx.status !== -1 ? row[mIdx.status] : 'ACTIVE');
    const role = normalizeMemberRole(mIdx.role !== -1 ? row[mIdx.role] : 'MEMBER');
    const addedBy = mIdx.addedBy !== -1 && row[mIdx.addedBy] ? String(row[mIdx.addedBy]).trim() : null;
    const addedAt = parseTimestamp(mIdx.addedAt !== -1 ? row[mIdx.addedAt] : null);
    const modifiedBy = mIdx.modifiedBy !== -1 && row[mIdx.modifiedBy] ? String(row[mIdx.modifiedBy]).trim() : null;
    const modifiedAt = parseTimestamp(mIdx.modifiedAt !== -1 ? row[mIdx.modifiedAt] : null);

    const existing = dbMemberMap.get(normWa);
    if (!existing) {
      newMembers.push({
        id: crypto.randomUUID(),
        name,
        whatsapp: normWa,
        email: cleanEmail,
        status,
        role,
        added_by: addedBy,
        added_at: addedAt || new Date().toISOString(),
        modified_by: modifiedBy,
        modified_at: modifiedAt
      });
    } else {
      // Check for changes
      const diffFields = [];
      if (cleanEmail && existing.email !== cleanEmail) {
        diffFields.push({ field: 'email', old: existing.email, new: cleanEmail });
      }
      if (name && existing.name !== name) {
        diffFields.push({ field: 'name', old: existing.name, new: name });
      }
      if (status && existing.status !== status) {
        diffFields.push({ field: 'status', old: existing.status, new: status });
      }
      if (role && existing.role !== role) {
        diffFields.push({ field: 'role', old: existing.role, new: role });
      }
      
      if (diffFields.length > 0) {
        updatedMembers.push({
          id: existing.id,
          whatsapp: normWa,
          name: name || existing.name,
          diffFields,
          patch: {
            name: name || existing.name,
            email: cleanEmail !== null ? cleanEmail : existing.email,
            status: status || existing.status,
            role: role || existing.role,
            modified_by: modifiedBy || existing.modified_by,
            modified_at: modifiedAt || new Date().toISOString()
          }
        });
      } else {
        unchangedMembers.push(normWa);
      }
    }
  }

  console.log(`New Members to Insert:     ${newMembers.length}`);
  console.log(`Existing Members to Update: ${updatedMembers.length}`);
  console.log(`Unchanged Members:          ${unchangedMembers.length}`);

  if (newMembers.length > 0) {
    console.log('\nSample New Members:');
    newMembers.slice(0, 5).forEach(m => {
      console.log(`  + ${m.name} | ${m.whatsapp.slice(0, 7)}*** | email: ${m.email} | role: ${m.role} | status: ${m.status}`);
    });
  }

  if (updatedMembers.length > 0) {
    console.log('\nUpdated Members breakdown:');
    updatedMembers.forEach(u => {
      console.log(`  ~ ${u.name} (${u.whatsapp.slice(0, 7)}***): ${u.diffFields.map(d => `${d.field}: '${d.old}' -> '${d.new}'`).join(', ')}`);
    });
  }

  // -------------------------------------------------------------------------
  // 2. Campaigns Diff
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(' 3. CAMPAIGNS DIFF ANALYSIS');
  console.log('======================================================');
  const freshCampaignsData = extractSheet(freshWb, 'Campaigns');
  const cH = freshCampaignsData.headers;
  const cIdx = {
    campaignId: cH.indexOf('CampaignID'),
    targetName: cH.indexOf('TargetName'),
    reason: cH.indexOf('Reason'),
    giftAmount: cH.indexOf('GiftAmount'),
    status: cH.indexOf('Status'),
    startDate: cH.indexOf('StartDate'),
    deadline: cH.indexOf('Deadline'),
    bankName: cH.indexOf('BankName'),
    bankAccount: cH.indexOf('BankAccount'),
    accountHolder: cH.indexOf('AccountHolder'),
    roundingUsed: cH.indexOf('RoundingUsed'),
    roundTo: cH.indexOf('RoundTo'),
    giftLink: cH.indexOf('GiftLink'),
    giftImage: cH.indexOf('GiftImage'),
    createdAt: cH.indexOf('CreatedAt'),
    finalizedAt: cH.indexOf('FinalizedAt'),
    modifiedBy: cH.indexOf('ModifiedBy'),
    modifiedAt: cH.indexOf('ModifiedAt')
  };

  const dbCampaignMap = new Map();
  for (const c of (dbCampaigns || [])) {
    dbCampaignMap.set(c.campaign_id, c);
  }

  const newCampaigns = [];
  const updatedCampaigns = [];

  for (const row of freshCampaignsData.rows) {
    const rawCId = cIdx.campaignId !== -1 ? row[cIdx.campaignId] : row[0];
    const cId = rawCId ? String(rawCId).trim() : '';
    if (!cId || !cId.startsWith('C-')) continue;

    const rawRoundingUsed = cIdx.roundingUsed !== -1 ? row[cIdx.roundingUsed] : false;
    const roundingUsed = typeof rawRoundingUsed === 'boolean'
      ? rawRoundingUsed
      : String(rawRoundingUsed).trim().toLowerCase() === 'true';
    const rawRoundTo = cIdx.roundTo !== -1 ? row[cIdx.roundTo] : 500;
    const roundTo = Number.isInteger(Number(rawRoundTo)) && Number(rawRoundTo) > 0 ? Number(rawRoundTo) : 500;

    const rawBankAccount = cIdx.bankAccount !== -1 && row[cIdx.bankAccount] !== null && row[cIdx.bankAccount] !== undefined
      ? String(row[cIdx.bankAccount]).trim()
      : null;

    const campaignObj = {
      campaign_id: cId,
      target_name: String(row[cIdx.targetName !== -1 ? cIdx.targetName : 1] || '').trim(),
      reason: cIdx.reason !== -1 && row[cIdx.reason] ? String(row[cIdx.reason]).trim() : null,
      gift_amount: Number(row[cIdx.giftAmount !== -1 ? cIdx.giftAmount : 3]) || 0,
      status: normalizeCampaignStatus(cIdx.status !== -1 ? row[cIdx.status] : 'OPEN'),
      start_date: parseTimestamp(cIdx.startDate !== -1 ? row[cIdx.startDate] : null),
      deadline: parseTimestamp(cIdx.deadline !== -1 ? row[cIdx.deadline] : null),
      bank_name: cIdx.bankName !== -1 && row[cIdx.bankName] ? String(row[cIdx.bankName]).trim() : null,
      bank_account: rawBankAccount,
      account_holder: cIdx.accountHolder !== -1 && row[cIdx.accountHolder] ? String(row[cIdx.accountHolder]).trim() : null,
      rounding_used: roundingUsed,
      round_to: roundTo,
      gift_link: cIdx.giftLink !== -1 && row[cIdx.giftLink] ? String(row[cIdx.giftLink]).trim() : null,
      gift_image: cIdx.giftImage !== -1 && row[cIdx.giftImage] ? String(row[cIdx.giftImage]).trim() : null,
      created_at: parseTimestamp(cIdx.createdAt !== -1 ? row[cIdx.createdAt] : null) || new Date().toISOString(),
      finalized_at: parseTimestamp(cIdx.finalizedAt !== -1 ? row[cIdx.finalizedAt] : null),
      modified_by: cIdx.modifiedBy !== -1 && row[cIdx.modifiedBy] ? String(row[cIdx.modifiedBy]).trim() : null,
      modified_at: parseTimestamp(cIdx.modifiedAt !== -1 ? row[cIdx.modifiedAt] : null)
    };

    const existing = dbCampaignMap.get(cId);
    if (!existing) {
      newCampaigns.push({
        id: crypto.randomUUID(),
        ...campaignObj
      });
    } else {
      // Check diff
      const diffFields = [];
      if (existing.target_name !== campaignObj.target_name) diffFields.push({ field: 'target_name', old: existing.target_name, new: campaignObj.target_name });
      if (existing.status !== campaignObj.status) diffFields.push({ field: 'status', old: existing.status, new: campaignObj.status });
      if (Number(existing.gift_amount) !== campaignObj.gift_amount) diffFields.push({ field: 'gift_amount', old: existing.gift_amount, new: campaignObj.gift_amount });
      if (existing.bank_account !== campaignObj.bank_account) diffFields.push({ field: 'bank_account', old: existing.bank_account, new: campaignObj.bank_account });
      
      if (diffFields.length > 0) {
        updatedCampaigns.push({
          campaign_id: cId,
          diffFields,
          patch: campaignObj
        });
      }
    }
  }

  console.log(`New Campaigns to Insert:     ${newCampaigns.length}`);
  console.log(`Existing Campaigns to Update: ${updatedCampaigns.length}`);
  if (newCampaigns.length > 0) {
    console.log('New Campaigns:', newCampaigns.map(c => `${c.campaign_id} (${c.target_name})`));
  }
  if (updatedCampaigns.length > 0) {
    console.log('Updated Campaigns:', updatedCampaigns.map(c => `${c.campaign_id}: ${c.diffFields.map(d => `${d.field}: ${d.old} -> ${d.new}`).join(', ')}`));
  }

  // -------------------------------------------------------------------------
  // 3. Donors Diff
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(' 4. DONORS DIFF ANALYSIS');
  console.log('======================================================');
  const freshDonorsData = extractSheet(freshWb, 'Donors');
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
  for (const d of (dbDonors || [])) {
    dbDonorMap.set(`${d.campaign_id}:::${d.whatsapp}`, d);
  }

  const newDonors = [];
  const updatedDonors = [];
  const donorSeen = new Set();

  for (let i = 0; i < freshDonorsData.rows.length; i++) {
    const row = freshDonorsData.rows[i];
    const cId = dIdx.campaignId !== -1 ? String(row[dIdx.campaignId] || '').trim() : '';
    const rawWa = dIdx.whatsapp !== -1 ? row[dIdx.whatsapp] : '';
    const normWa = normalizeWhatsApp(rawWa);
    if (!cId || !normWa) continue;

    const donorCompositeKey = `${cId}:::${normWa}`;
    if (donorSeen.has(donorCompositeKey)) continue;
    donorSeen.add(donorCompositeKey);

    const rawPaid = dIdx.paid !== -1 ? row[dIdx.paid] : false;
    const paid = typeof rawPaid === 'boolean' ? rawPaid : String(rawPaid).trim().toLowerCase() === 'true';

    const rawVerified = dIdx.verified !== -1 ? row[dIdx.verified] : false;
    const verified = typeof rawVerified === 'boolean' ? rawVerified : String(rawVerified).trim().toLowerCase() === 'true';

    const rawRefunded = dIdx.refunded !== -1 ? row[dIdx.refunded] : false;
    const refunded = typeof rawRefunded === 'boolean' ? rawRefunded : String(rawRefunded).trim().toLowerCase() === 'true';

    const rawCustomAmount = dIdx.customAmount !== -1 ? row[dIdx.customAmount] : null;
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
      newDonors.push({
        id: crypto.randomUUID(),
        ...donorObj
      });
    } else {
      const diffFields = [];
      if (existing.paid !== donorObj.paid) diffFields.push({ field: 'paid', old: existing.paid, new: donorObj.paid });
      if (existing.verified !== donorObj.verified) diffFields.push({ field: 'verified', old: existing.verified, new: donorObj.verified });
      if (existing.refunded !== donorObj.refunded) diffFields.push({ field: 'refunded', old: existing.refunded, new: donorObj.refunded });
      if (Number(existing.amount_paid) !== donorObj.amount_paid) diffFields.push({ field: 'amount_paid', old: existing.amount_paid, new: donorObj.amount_paid });
      if (Number(existing.amount_due) !== donorObj.amount_due) diffFields.push({ field: 'amount_due', old: existing.amount_due, new: donorObj.amount_due });
      if (donorObj.proof_link && existing.proof_link !== donorObj.proof_link) diffFields.push({ field: 'proof_link', old: existing.proof_link, new: donorObj.proof_link });
      if (donorObj.donor_status && existing.donor_status !== donorObj.donor_status) diffFields.push({ field: 'donor_status', old: existing.donor_status, new: donorObj.donor_status });

      if (diffFields.length > 0) {
        updatedDonors.push({
          campaign_id: cId,
          whatsapp: normWa,
          diffFields,
          patch: donorObj
        });
      }
    }
  }

  console.log(`New Donors to Insert:     ${newDonors.length}`);
  console.log(`Existing Donors to Update: ${updatedDonors.length}`);
  if (newDonors.length > 0) {
    console.log('\nSample New Donors:');
    newDonors.slice(0, 5).forEach(d => {
      console.log(`  + ${d.name} (${d.whatsapp.slice(0, 7)}***) on ${d.campaign_id} | due: ${d.amount_due} | paid: ${d.paid} (${d.amount_paid})`);
    });
  }
  if (updatedDonors.length > 0) {
    console.log('\nSample Updated Donors:');
    updatedDonors.slice(0, 5).forEach(d => {
      console.log(`  ~ ${d.whatsapp.slice(0, 7)}*** on ${d.campaign_id}: ${d.diffFields.map(df => `${df.field}: ${df.old} -> ${df.new}`).join(', ')}`);
    });
  }

  // -------------------------------------------------------------------------
  // 4. Tokens Diff
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(' 5. AUTH TOKENS DIFF ANALYSIS');
  console.log('======================================================');
  const freshTokensData = extractSheet(freshWb, 'Tokens');
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
  for (const t of (dbTokens || [])) {
    dbTokenMap.set(t.token_hash, t);
  }

  const newTokens = [];
  const updatedTokens = [];

  for (const row of freshTokensData.rows) {
    const rawTokenId = tIdx.tokenId !== -1 ? row[tIdx.tokenId] : row[0];
    if (!rawTokenId) continue;
    const tokenHash = hashToken(rawTokenId);
    if (!tokenHash) continue;

    const rawLinkedCId = tIdx.linkedCampaignId !== -1 && row[tIdx.linkedCampaignId]
      ? String(row[tIdx.linkedCampaignId]).trim()
      : null;

    const tokenStatus = normalizeAuthTokenStatus(tIdx.status !== -1 ? row[tIdx.status] : 'ACTIVE');
    const tokenRole = normalizeAuthTokenRole(tIdx.role !== -1 ? row[tIdx.role] : 'ADMIN');
    const createdAt = parseTimestamp(tIdx.createdAt !== -1 ? row[tIdx.createdAt] : null) || new Date().toISOString();
    const revokedAt = tokenStatus === 'REVOKED' ? createdAt : null;
    const alias = tIdx.alias !== -1 && row[tIdx.alias] ? String(row[tIdx.alias]).trim() : null;
    const createdBy = tIdx.createdBy !== -1 && row[tIdx.createdBy] ? String(row[tIdx.createdBy]).trim() : null;

    const tokenObj = {
      token_hash: tokenHash,
      role: tokenRole,
      status: tokenStatus,
      linked_campaign_id: rawLinkedCId,
      alias,
      created_by: createdBy,
      created_at: createdAt,
      revoked_at: revokedAt
    };

    const existing = dbTokenMap.get(tokenHash);
    if (!existing) {
      newTokens.push({
        id: crypto.randomUUID(),
        ...tokenObj
      });
    } else {
      const diffFields = [];
      if (existing.status !== tokenObj.status) diffFields.push({ field: 'status', old: existing.status, new: tokenObj.status });
      if (existing.role !== tokenObj.role) diffFields.push({ field: 'role', old: existing.role, new: tokenObj.role });
      if (existing.linked_campaign_id !== tokenObj.linked_campaign_id) diffFields.push({ field: 'linked_campaign_id', old: existing.linked_campaign_id, new: tokenObj.linked_campaign_id });

      if (diffFields.length > 0) {
        updatedTokens.push({
          token_hash: tokenHash.slice(0, 8) + '...',
          diffFields,
          patch: tokenObj
        });
      }
    }
  }

  console.log(`New Auth Tokens to Insert:     ${newTokens.length}`);
  console.log(`Existing Auth Tokens to Update: ${updatedTokens.length}`);

  // -------------------------------------------------------------------------
  // 5. Late Requests Diff
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(' 6. LATE REQUESTS DIFF ANALYSIS');
  console.log('======================================================');
  const freshLateData = extractSheet(freshWb, 'LateRequests');
  const dbLateMap = new Map();
  for (const lr of (dbLateRequests || [])) {
    dbLateMap.set(lr.request_id, lr);
  }

  const newLateRequests = [];
  const updatedLateRequests = [];

  for (const col of freshLateData.rows) {
    const reqId = col[0] !== null && col[0] !== undefined ? String(col[0]).trim() : '';
    if (!reqId || !reqId.startsWith('REQ-')) continue;

    const cId = col[1] !== null && col[1] !== undefined ? String(col[1]).trim() : '';
    const picAlias = col[2] !== null && col[2] !== undefined ? String(col[2]).trim() : null;
    const donorName = col[3] !== null && col[3] !== undefined ? String(col[3]).trim() : '';
    const rawDonorWa = col[4];
    const normDonorWa = normalizeWhatsApp(rawDonorWa);
    const rawIsCustom = col[5];
    const isCustom = typeof rawIsCustom === 'boolean' ? rawIsCustom : String(rawIsCustom).trim().toLowerCase() === 'true';
    const rawCustomAmount = col[6];
    const customAmount = rawCustomAmount !== null && rawCustomAmount !== undefined && rawCustomAmount !== '' && !isNaN(Number(rawCustomAmount))
      ? Number(rawCustomAmount)
      : null;
    const reason = col[7] !== null && col[7] !== undefined ? String(col[7]).trim() : null;
    const status = normalizeLateRequestStatus(col[8]);
    const createdAt = parseTimestamp(col[9]) || new Date().toISOString();

    const lateObj = {
      request_id: reqId,
      campaign_id: cId,
      donor_name: donorName,
      donor_whatsapp: normDonorWa,
      donor_alias: null,
      pic_alias: picAlias,
      is_custom: isCustom,
      custom_amount: customAmount,
      reason,
      status,
      created_at: createdAt
    };

    const existing = dbLateMap.get(reqId);
    if (!existing) {
      newLateRequests.push({
        id: crypto.randomUUID(),
        ...lateObj
      });
    } else {
      const diffFields = [];
      if (existing.status !== lateObj.status) diffFields.push({ field: 'status', old: existing.status, new: lateObj.status });
      if (diffFields.length > 0) {
        updatedLateRequests.push({
          request_id: reqId,
          diffFields,
          patch: lateObj
        });
      }
    }
  }

  console.log(`New Late Requests to Insert:     ${newLateRequests.length}`);
  console.log(`Existing Late Requests to Update: ${updatedLateRequests.length}`);

  // -------------------------------------------------------------------------
  // 6. Settings Diff
  // -------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(' 7. APP SETTINGS DIFF ANALYSIS');
  console.log('======================================================');
  const freshSettingsData = extractSheet(freshWb, 'Settings');
  const dbSettingsMap = new Map();
  for (const s of (dbSettings || [])) {
    dbSettingsMap.set(s.key, s);
  }

  const newSettings = [];
  const updatedSettings = [];

  for (const row of freshSettingsData.rows) {
    const rawKey = row[0] !== null && row[0] !== undefined ? String(row[0]).trim() : '';
    if (!rawKey) continue;
    const parsedVal = parseSettingValue(row[1]);
    const existing = dbSettingsMap.get(rawKey);

    if (!existing) {
      newSettings.push({
        key: rawKey,
        value: parsedVal,
        description: null,
        is_secret: isSecretSettingKey(rawKey),
        updated_at: new Date().toISOString()
      });
    } else {
      // Compare values
      const existingValStr = JSON.stringify(existing.value);
      const newValStr = JSON.stringify(parsedVal);
      if (existingValStr !== newValStr) {
        updatedSettings.push({
          key: rawKey,
          oldValue: existing.value,
          newValue: parsedVal
        });
      }
    }
  }

  console.log(`New Settings to Insert:     ${newSettings.length}`);
  console.log(`Existing Settings to Update: ${updatedSettings.length}`);
  if (updatedSettings.length > 0) {
    console.log('Updated Settings:', updatedSettings.map(s => `${s.key}: ${isSecretSettingKey(s.key) ? '***' : JSON.stringify(s.oldValue)} -> ${isSecretSettingKey(s.key) ? '***' : JSON.stringify(s.newValue)}`));
  }

  console.log('\n======================================================');
  console.log(' SUMMARY OF ALL DIFFS');
  console.log('======================================================');
  console.log(`- members:       ${newMembers.length} new inserts, ${updatedMembers.length} updates`);
  console.log(`- campaigns:     ${newCampaigns.length} new inserts, ${updatedCampaigns.length} updates`);
  console.log(`- donors:        ${newDonors.length} new inserts, ${updatedDonors.length} updates`);
  console.log(`- auth_tokens:   ${newTokens.length} new inserts, ${updatedTokens.length} updates`);
  console.log(`- late_requests: ${newLateRequests.length} new inserts, ${updatedLateRequests.length} updates`);
  console.log(`- app_settings:  ${newSettings.length} new inserts, ${updatedSettings.length} updates`);
}

run().catch(err => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
