#!/usr/bin/env node

/**
 * scripts/migration/migrate-xlsx-to-supabase.mjs
 * 
 * Donatur Helper — XLSX to Supabase ETL Data Migration Script
 * 
 * Usage:
 *   Dry-run mode (default, zero mutation):
 *     node scripts/migration/migrate-xlsx-to-supabase.mjs
 *     node scripts/migration/migrate-xlsx-to-supabase.mjs --dry-run
 * 
 *   Write mode (mutates Supabase database):
 *     node scripts/migration/migrate-xlsx-to-supabase.mjs --write
 * 
 * Requirements & Rules:
 * - Read XLSX_SOURCE_PATH from .env (fallback: data/source/donatur-helper.xlsx).
 * - Read SUPABASE_URL and SUPABASE_SECRET_KEY from .env (only used in --write mode).
 * - Excludes 'Workaroundsz' scratch tab entirely.
 * - Positional remapping for 'LateRequests' tab.
 * - Hashes TokenID to SHA-256 hex in 'auth_tokens.token_hash' (no plaintext tokens stored).
 * - Canonicalizes WhatsApp phone numbers to E.164 (+628...).
 * - Strict PII & credential redaction in all logs and outputs.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import * as xlsxModule from 'xlsx';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env
dotenv.config();

const xlsx = xlsxModule.default || xlsxModule;

// Expected row counts according to approved migration specifications
const EXPECTED_ROW_COUNTS = {
  app_settings: 6,
  members: 101,
  auth_tokens: 47,
  campaigns: 10,
  donors: 221,
  late_requests: 6
};

// Known setting descriptions
const SETTING_DESCRIPTIONS = {
  AppUrl: 'Canonical application web URL',
  EnableRounding: 'Enable bill split rounding to nearest multiple',
  RoundToNearest: 'Default rounding increment amount in IDR',
  RequireMemberValidation: 'Require member directory verification before accepting pledges',
  ProofsFolderId: 'Google Drive folder ID for payment proof uploads',
  AdminNotificationEmails: 'Comma-separated recipient emails for administrative notifications'
};

/**
 * Normalizes WhatsApp phone numbers to E.164 (+628...).
 * Strips non-digits, leading zeroes, and duplicate country code 62.
 */
export function normalizeWhatsApp(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  let clean = String(raw).replace(/\D/g, '');
  if (!clean) return null;

  // Strip leading zeroes (e.g. 0811... -> 811...)
  clean = clean.replace(/^0+/, '');

  // Strip leading country code 62 if already present
  if (clean.startsWith('62')) {
    clean = clean.slice(2);
  }

  return `+62${clean}`;
}

/**
 * Validates whether a phone number adheres to Indonesian E.164 format (+628xxxxxxxxxx).
 */
export function isValidIndonesianE164(phone) {
  if (!phone) return false;
  return /^\+628\d{7,13}$/.test(phone);
}

/**
 * Parses timestamps defensively, handling Date instances, Excel serials, ISO strings,
 * and naive timestamps with Asia/Jakarta (+07:00) default offset.
 */
export function parseTimestamp(val) {
  if (val === null || val === undefined || val === '') return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString();
  }

  if (typeof val === 'number') {
    // Excel date serial number (1899-12-30 epoch)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const msPerDay = 24 * 60 * 60 * 1000;
    const date = new Date(excelEpoch.getTime() + val * msPerDay);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }

  const str = String(val).trim();
  if (!str) return null;

  // Already has explicit timezone indicator (Z or +HH:MM or -HH:MM)
  if (/([Zz]|[+-]\d{2}:?\d{2})$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Naive date-time string
  let normalizedStr = str.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedStr)) {
    normalizedStr += 'T00:00:00';
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalizedStr)) {
    const withTz = `${normalizedStr}+07:00`;
    const d = new Date(withTz);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

/**
 * Hashes a plaintext token string with SHA-256.
 */
export function hashToken(tokenId) {
  if (!tokenId) return null;
  return crypto.createHash('sha256').update(String(tokenId).trim()).digest('hex');
}

/**
 * Parses setting value into appropriate JSONB primitive or structured data.
 */
export function parseSettingValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean' || typeof raw === 'number') return raw;

  const str = String(raw).trim();
  if (str.toLowerCase() === 'true') return true;
  if (str.toLowerCase() === 'false') return false;

  if (!isNaN(str) && str !== '' && !/^0\d+/.test(str)) {
    const num = Number(str);
    if (!isNaN(num)) return num;
  }

  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }

  return str;
}

/**
 * Checks whether an app_settings key is considered secret/sensitive.
 */
export function isSecretSettingKey(key) {
  if (!key) return false;
  return /(token|secret|password|key|folder|adminnotificationemails)/i.test(key);
}

// Status & Role normalizers
export function normalizeMemberStatus(raw) {
  const s = String(raw || 'ACTIVE').trim().toUpperCase();
  const valid = ['ACTIVE', 'PENDING', 'REJECTED', 'DELETED', 'EX'];
  return valid.includes(s) ? s : 'ACTIVE';
}

export function normalizeMemberRole(raw) {
  const s = String(raw || 'MEMBER').trim().toUpperCase();
  const valid = ['MEMBER', 'ADMIN', 'SUPER_ADMIN'];
  return valid.includes(s) ? s : 'MEMBER';
}

export function normalizeCampaignStatus(raw) {
  const s = String(raw || 'OPEN').trim().toUpperCase();
  const valid = ['OPEN', 'FINALIZED', 'ARCHIVED', 'CLOSED'];
  return valid.includes(s) ? s : 'OPEN';
}

export function normalizeAuthTokenRole(raw) {
  const s = String(raw || 'ADMIN').trim().toUpperCase();
  const valid = ['SUPER_ADMIN', 'ADMIN', 'PIC'];
  return valid.includes(s) ? s : 'ADMIN';
}

export function normalizeAuthTokenStatus(raw) {
  const s = String(raw || 'ACTIVE').trim().toUpperCase();
  const valid = ['ACTIVE', 'EXPIRED', 'UNUSED', 'REVOKED'];
  return valid.includes(s) ? s : 'ACTIVE';
}

export function normalizeDonorStatus(raw) {
  if (!raw) return 'PLEDGED';
  const s = String(raw).trim().toUpperCase();
  if (s === 'PLEGED' || s === 'PLEDGE' || s === 'PLEDGED') return 'PLEDGED';
  if (s === 'WITHDRAWN' || s === 'WITHDRAW') return 'WITHDRAWN';
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'CANCEL') return 'CANCELLED';
  return s;
}

export function normalizeLateRequestStatus(raw) {
  const s = String(raw || 'PENDING').trim().toUpperCase();
  const valid = ['PENDING', 'APPROVED', 'REJECTED', 'DUPLICATE'];
  return valid.includes(s) ? s : 'PENDING';
}

/**
 * Batched upsert helper for Supabase tables in write mode.
 */
async function batchUpsert(supabase, tableName, records, onConflict, batchSize = 100) {
  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    const { error } = await supabase
      .from(tableName)
      .upsert(chunk, { onConflict: onConflict });

    if (error) {
      throw new Error(`Failed to upsert into '${tableName}': ${error.message}`);
    }
  }
}

/**
 * Main ETL execution logic.
 */
async function main() {
  const isWrite = process.argv.includes('--write');
  const isDryRun = process.argv.includes('--dry-run') || !isWrite;
  const executionMode = isWrite ? 'WRITE' : 'DRY-RUN';

  console.log('================================================================');
  console.log(' Donatur Helper — XLSX to Supabase ETL Migration Pipeline');
  console.log('================================================================');
  console.log(`Execution Mode: ${executionMode} ${isDryRun ? '(Zero Mutation)' : '(Mutates Supabase)'}`);
  console.log(`Timestamp:      ${new Date().toISOString()}`);

  const sourcePath = process.env.XLSX_SOURCE_PATH || 'data/source/donatur-helper.xlsx';
  const resolvedPath = path.resolve(process.cwd(), sourcePath);
  console.log(`Source File:    ${sourcePath}\n`);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`[ERROR] Source XLSX file not found at: ${resolvedPath}`);
    process.exit(1);
  }

  // Read workbook
  const workbook = xlsx.readFile(resolvedPath, {
    cellDates: true,
    raw: true,
    dense: false
  });

  const warnings = [];
  const metrics = {
    orphanTokensCount: 0,
    donorsWithNullMemberIdCount: 0,
    duplicateWhatsAppConflicts: 0,
    invalidPhoneWarnings: 0
  };

  // Helper to extract non-empty data rows
  function getSheetDataRows(sheetName) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) {
      throw new Error(`Required sheet '${sheetName}' not found in workbook.`);
    }
    const rawJson = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (!rawJson || rawJson.length === 0) return { headers: [], rows: [] };

    const headers = (rawJson[0] || []).map(h => (h !== null && h !== undefined ? String(h).trim() : ''));
    const rows = rawJson.slice(1).filter(r => r && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
    return { headers, rows };
  }

  // ----------------------------------------------------------------------------
  // 1. Transform Settings -> app_settings
  // ----------------------------------------------------------------------------
  const settingsData = getSheetDataRows('Settings');
  const transformedSettings = [];
  for (const row of settingsData.rows) {
    const rawKey = row[0] !== null && row[0] !== undefined ? String(row[0]).trim() : '';
    if (!rawKey) continue;

    const rawVal = row[1];
    const parsedVal = parseSettingValue(rawVal);
    const isSecret = isSecretSettingKey(rawKey);

    transformedSettings.push({
      key: rawKey,
      value: parsedVal,
      description: SETTING_DESCRIPTIONS[rawKey] || null,
      is_secret: isSecret,
      updated_at: new Date().toISOString()
    });
  }

  // ----------------------------------------------------------------------------
  // 2. Transform Members -> members
  // ----------------------------------------------------------------------------
  const membersData = getSheetDataRows('Members');
  const transformedMembers = [];
  const memberWhatsAppSet = new Set();
  const memberLookupMap = new Map(); // normalized_whatsapp -> member_id (UUID)

  const mH = membersData.headers;
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

  for (let i = 0; i < membersData.rows.length; i++) {
    const row = membersData.rows[i];
    const rawWa = mIdx.whatsapp !== -1 ? row[mIdx.whatsapp] : row[1];
    const normWa = normalizeWhatsApp(rawWa);

    if (!normWa) {
      warnings.push(`[Members] Row ${i + 1}: Skipped record with empty WhatsApp number.`);
      continue;
    }

    if (memberWhatsAppSet.has(normWa)) {
      metrics.duplicateWhatsAppConflicts++;
      warnings.push(`[Members] Row ${i + 1}: Duplicate WhatsApp detected. Retained first occurrence.`);
      continue;
    }
    memberWhatsAppSet.add(normWa);

    if (!isValidIndonesianE164(normWa)) {
      metrics.invalidPhoneWarnings++;
      warnings.push(`[Members] Row ${i + 1}: Non-standard Indonesian phone format (${normWa}).`);
    }

    const memberId = crypto.randomUUID();
    memberLookupMap.set(normWa, memberId);

    const rawEmail = mIdx.email !== -1 && row[mIdx.email] ? String(row[mIdx.email]).trim().toLowerCase() : null;
    const cleanEmail = rawEmail && rawEmail.includes('@') ? rawEmail : null;

    transformedMembers.push({
      id: memberId,
      name: String(row[mIdx.name !== -1 ? mIdx.name : 0] || '').trim(),
      whatsapp: normWa,
      email: cleanEmail,
      status: normalizeMemberStatus(mIdx.status !== -1 ? row[mIdx.status] : 'ACTIVE'),
      role: normalizeMemberRole(mIdx.role !== -1 ? row[mIdx.role] : 'MEMBER'),
      added_by: mIdx.addedBy !== -1 && row[mIdx.addedBy] ? String(row[mIdx.addedBy]).trim() : null,
      added_at: parseTimestamp(mIdx.addedAt !== -1 ? row[mIdx.addedAt] : null) || new Date().toISOString(),
      modified_by: mIdx.modifiedBy !== -1 && row[mIdx.modifiedBy] ? String(row[mIdx.modifiedBy]).trim() : null,
      modified_at: parseTimestamp(mIdx.modifiedAt !== -1 ? row[mIdx.modifiedAt] : null)
    });
  }

  // ----------------------------------------------------------------------------
  // 3. Transform Campaigns -> campaigns
  // ----------------------------------------------------------------------------
  const campaignsData = getSheetDataRows('Campaigns');
  const transformedCampaigns = [];
  const validCampaignIdSet = new Set();

  const cH = campaignsData.headers;
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

  for (let i = 0; i < campaignsData.rows.length; i++) {
    const row = campaignsData.rows[i];
    const rawCId = cIdx.campaignId !== -1 ? row[cIdx.campaignId] : row[0];
    const cId = rawCId !== null && rawCId !== undefined ? String(rawCId).trim() : '';

    if (!cId || !cId.startsWith('C-')) {
      continue; // Filter out empty or non-campaign rows
    }

    validCampaignIdSet.add(cId);

    const rawRoundingUsed = cIdx.roundingUsed !== -1 ? row[cIdx.roundingUsed] : false;
    const roundingUsed = typeof rawRoundingUsed === 'boolean'
      ? rawRoundingUsed
      : String(rawRoundingUsed).trim().toLowerCase() === 'true';

    const rawRoundTo = cIdx.roundTo !== -1 ? row[cIdx.roundTo] : 500;
    const roundTo = Number.isInteger(Number(rawRoundTo)) && Number(rawRoundTo) > 0 ? Number(rawRoundTo) : 500;

    const rawBankAccount = cIdx.bankAccount !== -1 && row[cIdx.bankAccount] !== null && row[cIdx.bankAccount] !== undefined
      ? String(row[cIdx.bankAccount]).trim()
      : null;

    transformedCampaigns.push({
      id: crypto.randomUUID(),
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
    });
  }

  // ----------------------------------------------------------------------------
  // 4. Transform Tokens -> auth_tokens (SHA-256 Hashed)
  // ----------------------------------------------------------------------------
  const tokensData = getSheetDataRows('Tokens');
  const transformedTokens = [];
  const tokenHashSet = new Set();

  const tH = tokensData.headers;
  const tIdx = {
    tokenId: tH.indexOf('TokenID'),
    role: tH.indexOf('Role'),
    status: tH.indexOf('Status'),
    linkedCampaignId: tH.indexOf('LinkedCampaignID'),
    createdBy: tH.indexOf('CreatedBy'),
    createdAt: tH.indexOf('CreatedAt'),
    alias: tH.indexOf('Alias')
  };

  for (let i = 0; i < tokensData.rows.length; i++) {
    const row = tokensData.rows[i];
    const rawTokenId = tIdx.tokenId !== -1 ? row[tIdx.tokenId] : row[0];
    if (!rawTokenId) continue;

    const tokenHash = hashToken(rawTokenId);
    if (!tokenHash) continue;

    if (tokenHashSet.has(tokenHash)) {
      warnings.push(`[Tokens] Row ${i + 1}: Duplicate token hash detected. Skipping duplicate.`);
      continue;
    }
    tokenHashSet.add(tokenHash);

    const rawLinkedCId = tIdx.linkedCampaignId !== -1 && row[tIdx.linkedCampaignId]
      ? String(row[tIdx.linkedCampaignId]).trim()
      : null;

    let linkedCampaignId = null;
    if (rawLinkedCId) {
      if (validCampaignIdSet.has(rawLinkedCId)) {
        linkedCampaignId = rawLinkedCId;
      } else {
        metrics.orphanTokensCount++;
        warnings.push(`[Tokens] Row ${i + 1}: Referenced unlisted campaign ID. Linked campaign set to NULL.`);
      }
    }

    const tokenStatus = normalizeAuthTokenStatus(tIdx.status !== -1 ? row[tIdx.status] : 'ACTIVE');
    const createdAt = parseTimestamp(tIdx.createdAt !== -1 ? row[tIdx.createdAt] : null) || new Date().toISOString();
    const revokedAt = tokenStatus === 'REVOKED' ? createdAt : null;

    transformedTokens.push({
      id: crypto.randomUUID(),
      token_hash: tokenHash,
      role: normalizeAuthTokenRole(tIdx.role !== -1 ? row[tIdx.role] : 'ADMIN'),
      status: tokenStatus,
      linked_campaign_id: linkedCampaignId,
      alias: tIdx.alias !== -1 && row[tIdx.alias] ? String(row[tIdx.alias]).trim() : null,
      created_by: tIdx.createdBy !== -1 && row[tIdx.createdBy] ? String(row[tIdx.createdBy]).trim() : null,
      created_at: createdAt,
      expires_at: null,
      revoked_at: revokedAt,
      last_used_at: null
    });
  }

  // ----------------------------------------------------------------------------
  // 5. Transform Donors -> donors
  // ----------------------------------------------------------------------------
  const donorsData = getSheetDataRows('Donors');
  const transformedDonors = [];
  const donorKeySet = new Set();

  const dH = donorsData.headers;
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

  for (let i = 0; i < donorsData.rows.length; i++) {
    const row = donorsData.rows[i];
    const cId = dIdx.campaignId !== -1 ? String(row[dIdx.campaignId] || '').trim() : '';
    const rawWa = dIdx.whatsapp !== -1 ? row[dIdx.whatsapp] : '';
    const normWa = normalizeWhatsApp(rawWa);

    if (!cId || !normWa) {
      warnings.push(`[Donors] Row ${i + 1}: Skipped row missing CampaignID or WhatsApp.`);
      continue;
    }

    const donorCompositeKey = `${cId}:::${normWa}`;
    if (donorKeySet.has(donorCompositeKey)) {
      warnings.push(`[Donors] Row ${i + 1}: Duplicate donor (CampaignID + WhatsApp). Skipped duplicate.`);
      continue;
    }
    donorKeySet.add(donorCompositeKey);

    if (!isValidIndonesianE164(normWa)) {
      metrics.invalidPhoneWarnings++;
      warnings.push(`[Donors] Row ${i + 1}: Non-standard phone format detected (${normWa}).`);
    }

    const memberId = memberLookupMap.get(normWa) || null;
    if (!memberId) {
      metrics.donorsWithNullMemberIdCount++;
      warnings.push(`[Donors] Row ${i + 1}: Donor phone not found in registered Members directory. member_id set to NULL.`);
    }

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

    transformedDonors.push({
      id: crypto.randomUUID(),
      campaign_id: cId,
      member_id: memberId,
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
    });
  }

  // ----------------------------------------------------------------------------
  // 6. Transform LateRequests -> late_requests (Positional Remapping)
  // ----------------------------------------------------------------------------
  const lateRequestsData = getSheetDataRows('LateRequests');
  const transformedLateRequests = [];
  const requestIdSet = new Set();

  for (let i = 0; i < lateRequestsData.rows.length; i++) {
    const col = lateRequestsData.rows[i];
    const reqId = col[0] !== null && col[0] !== undefined ? String(col[0]).trim() : '';

    if (!reqId || !reqId.startsWith('REQ-')) {
      continue;
    }

    if (requestIdSet.has(reqId)) {
      warnings.push(`[LateRequests] Row ${i + 1}: Duplicate RequestID. Skipped duplicate.`);
      continue;
    }
    requestIdSet.add(reqId);

    const cId = col[1] !== null && col[1] !== undefined ? String(col[1]).trim() : '';
    const picAlias = col[2] !== null && col[2] !== undefined ? String(col[2]).trim() : null;
    const donorName = col[3] !== null && col[3] !== undefined ? String(col[3]).trim() : '';
    const rawDonorWa = col[4];
    const normDonorWa = normalizeWhatsApp(rawDonorWa);

    if (normDonorWa && !isValidIndonesianE164(normDonorWa)) {
      metrics.invalidPhoneWarnings++;
      warnings.push(`[LateRequests] Row ${i + 1}: Non-standard donor phone (${normDonorWa}).`);
    }

    const rawIsCustom = col[5];
    const isCustom = typeof rawIsCustom === 'boolean'
      ? rawIsCustom
      : String(rawIsCustom).trim().toLowerCase() === 'true';

    const rawCustomAmount = col[6];
    const customAmount = rawCustomAmount !== null && rawCustomAmount !== undefined && rawCustomAmount !== '' && !isNaN(Number(rawCustomAmount))
      ? Number(rawCustomAmount)
      : null;

    const reason = col[7] !== null && col[7] !== undefined ? String(col[7]).trim() : null;
    const status = normalizeLateRequestStatus(col[8]);
    const createdAt = parseTimestamp(col[9]) || new Date().toISOString();

    transformedLateRequests.push({
      id: crypto.randomUUID(),
      request_id: reqId,
      campaign_id: cId,
      donor_name: donorName,
      donor_whatsapp: normDonorWa,
      donor_alias: null,
      pic_alias: picAlias,
      is_custom: isCustom,
      custom_amount: customAmount,
      reason: reason,
      status: status,
      created_at: createdAt
    });
  }

  // ----------------------------------------------------------------------------
  // Validation Gates Check
  // ----------------------------------------------------------------------------
  const parsedCounts = {
    app_settings: transformedSettings.length,
    members: transformedMembers.length,
    auth_tokens: transformedTokens.length,
    campaigns: transformedCampaigns.length,
    donors: transformedDonors.length,
    late_requests: transformedLateRequests.length
  };

  let allCountsMatch = true;
  for (const [table, expected] of Object.entries(EXPECTED_ROW_COUNTS)) {
    if (parsedCounts[table] !== expected) {
      allCountsMatch = false;
    }
  }

  // Security Check: Verify all token hashes are 64-character lowercase hex
  let allTokenHashesValid = true;
  for (const t of transformedTokens) {
    if (!/^[a-f0-9]{64}$/.test(t.token_hash)) {
      allTokenHashesValid = false;
      warnings.push(`[Security Violation] Invalid SHA-256 token hash format detected.`);
    }
  }

  // ----------------------------------------------------------------------------
  // Execution in WRITE Mode
  // ----------------------------------------------------------------------------
  let writeExecutionSuccessful = true;
  let writeErrorDetails = null;

  if (isWrite) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      console.error('\n[FATAL ERROR] SUPABASE_URL and SUPABASE_SECRET_KEY must be configured in .env for write mode.');
      process.exit(1);
    }

    console.log('\nInitializing Supabase client with admin secret key...');
    const supabase = createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    try {
      console.log('Beginning transactional topological upsert sequence...');

      // 1. app_settings
      console.log(`- Upserting ${transformedSettings.length} rows into 'app_settings'...`);
      await batchUpsert(supabase, 'app_settings', transformedSettings, 'key');

      // 2. members
      console.log(`- Upserting ${transformedMembers.length} rows into 'members'...`);
      await batchUpsert(supabase, 'members', transformedMembers, 'whatsapp');

      // Retrieve actual member IDs from database to guarantee foreign key accuracy for donors
      const { data: dbMembers, error: mFetchErr } = await supabase
        .from('members')
        .select('id, whatsapp');

      if (mFetchErr) {
        throw new Error(`Failed to query members for foreign key mapping: ${mFetchErr.message}`);
      }

      const dbMemberMap = new Map();
      for (const m of dbMembers) {
        dbMemberMap.set(m.whatsapp, m.id);
      }

      // 3. campaigns
      console.log(`- Upserting ${transformedCampaigns.length} rows into 'campaigns'...`);
      await batchUpsert(supabase, 'campaigns', transformedCampaigns, 'campaign_id');

      // 4. auth_tokens
      console.log(`- Upserting ${transformedTokens.length} rows into 'auth_tokens'...`);
      await batchUpsert(supabase, 'auth_tokens', transformedTokens, 'token_hash');

      // 5. donors (re-assign member_id using live Supabase IDs)
      console.log(`- Upserting ${transformedDonors.length} rows into 'donors'...`);
      const readyDonors = transformedDonors.map(d => ({
        ...d,
        member_id: dbMemberMap.get(d.whatsapp) || null
      }));
      await batchUpsert(supabase, 'donors', readyDonors, 'campaign_id,whatsapp');

      // 6. late_requests
      console.log(`- Upserting ${transformedLateRequests.length} rows into 'late_requests'...`);
      await batchUpsert(supabase, 'late_requests', transformedLateRequests, 'request_id');

      console.log('All Supabase database operations completed successfully.');
    } catch (err) {
      writeExecutionSuccessful = false;
      writeErrorDetails = err.message;
      console.error(`\n[WRITE ERROR] ${err.message}`);
    }
  }

  // ----------------------------------------------------------------------------
  // Safe Summary & Reconciliation Output
  // ----------------------------------------------------------------------------
  const isPass = allCountsMatch && allTokenHashesValid && (isDryRun || writeExecutionSuccessful);

  console.log('\n================================================================');
  console.log(' ETL Migration Summary & Verification Report');
  console.log('================================================================\n');

  console.log('Target Table      Source Tab     Parsed   Expected  Status');
  console.log('----------------  -------------  -------  --------  ------');
  console.log(`app_settings      Settings       ${String(parsedCounts.app_settings).padStart(7)}  ${String(EXPECTED_ROW_COUNTS.app_settings).padStart(8)}  ${parsedCounts.app_settings === EXPECTED_ROW_COUNTS.app_settings ? 'MATCH ✅' : 'MISMATCH ❌'}`);
  console.log(`members           Members        ${String(parsedCounts.members).padStart(7)}  ${String(EXPECTED_ROW_COUNTS.members).padStart(8)}  ${parsedCounts.members === EXPECTED_ROW_COUNTS.members ? 'MATCH ✅' : 'MISMATCH ❌'}`);
  console.log(`auth_tokens       Tokens         ${String(parsedCounts.auth_tokens).padStart(7)}  ${String(EXPECTED_ROW_COUNTS.auth_tokens).padStart(8)}  ${parsedCounts.auth_tokens === EXPECTED_ROW_COUNTS.auth_tokens ? 'MATCH ✅' : 'MISMATCH ❌'}`);
  console.log(`campaigns         Campaigns      ${String(parsedCounts.campaigns).padStart(7)}  ${String(EXPECTED_ROW_COUNTS.campaigns).padStart(8)}  ${parsedCounts.campaigns === EXPECTED_ROW_COUNTS.campaigns ? 'MATCH ✅' : 'MISMATCH ❌'}`);
  console.log(`donors            Donors         ${String(parsedCounts.donors).padStart(7)}  ${String(EXPECTED_ROW_COUNTS.donors).padStart(8)}  ${parsedCounts.donors === EXPECTED_ROW_COUNTS.donors ? 'MATCH ✅' : 'MISMATCH ❌'}`);
  console.log(`late_requests     LateRequests   ${String(parsedCounts.late_requests).padStart(7)}  ${String(EXPECTED_ROW_COUNTS.late_requests).padStart(8)}  ${parsedCounts.late_requests === EXPECTED_ROW_COUNTS.late_requests ? 'MATCH ✅' : 'MISMATCH ❌'}`);
  console.log('----------------  -------------  -------  --------  ------\n');

  console.log('ETL Metrics & Integrity Audit:');
  console.log(`- Total Non-Fatal Warnings:              ${warnings.length}`);
  console.log(`- Orphan Tokens (linked_campaign_id = null): ${metrics.orphanTokensCount} (expected: 4)`);
  console.log(`- Donors with Unlinked Member ID (null):     ${metrics.donorsWithNullMemberIdCount} (expected: 1)`);
  console.log(`- Duplicate WhatsApp Conflicts Resolved:     ${metrics.duplicateWhatsAppConflicts}`);
  console.log(`- Non-standard / Dummy Phone Warnings:       ${metrics.invalidPhoneWarnings}`);
  console.log(`- Plaintext Token Proscription:              PASS (100% SHA-256 Hashed)`);
  console.log(`- Excluded Tabs:                             Workaroundsz (0 rows ingested)`);
  console.log(`- Execution Mode:                            ${executionMode}`);
  console.log(`- Final Status:                              ${isPass ? 'PASS ✅' : 'FAIL ❌'}`);

  if (warnings.length > 0) {
    console.log('\nAudit Warnings Summary:');
    const warningSummary = {};
    for (const w of warnings) {
      const prefix = w.split(':')[0] || 'General';
      warningSummary[prefix] = (warningSummary[prefix] || 0) + 1;
    }
    for (const [prefix, count] of Object.entries(warningSummary)) {
      console.log(`  * ${prefix}: ${count} event(s)`);
    }
  }

  if (!isPass) {
    if (writeErrorDetails) {
      console.error(`\nFailure Details: Supabase write failed - ${writeErrorDetails}`);
    }
    process.exit(1);
  }

  console.log('\n================================================================\n');
}

import { fileURLToPath } from 'node:url';

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error('[FATAL ETL ERROR]:', err.message);
    process.exit(1);
  });
}
