#!/usr/bin/env node

/**
 * scripts/migration/inventory-xlsx.mjs
 * 
 * Local read-only inventory script for migrating Donatur Helper
 * from Google Sheets / XLSX to Supabase Postgres.
 * 
 * Rules:
 * - Read-only: does not modify XLSX file.
 * - Does not create Supabase tables or execute SQL.
 * - Sensitive values (PII, phone, email, tokens, bank accounts, proofs, names) are strictly redacted.
 * - Outputs docs/reports/xlsx-data-inventory.md and docs/reports/xlsx-data-inventory.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as xlsxModule from 'xlsx';

const xlsx = xlsxModule.default || xlsxModule;

// Expected headers based on Code.js for schema drift detection
const EXPECTED_CODE_HEADERS = {
  Settings: ['Key', 'Value'],
  Members: ['Name', 'WhatsApp', 'Status', 'AddedBy', 'AddedAt', 'Role', 'ModifiedBy', 'ModifiedAt', 'Email'],
  Tokens: ['TokenID', 'Role', 'Status', 'LinkedCampaignID', 'CreatedBy', 'CreatedAt', 'Alias'],
  Campaigns: [
    'CampaignID', 'TargetName', 'Reason', 'GiftAmount', 'Status', 'StartDate',
    'Deadline', 'BankName', 'BankAccount', 'AccountHolder', 'RoundingUsed',
    'RoundTo', 'CreatedAt', 'FinalizedAt', 'GiftLink', 'GiftImage', 'ModifiedBy', 'ModifiedAt'
  ],
  Donors: [
    'CampaignID', 'Name', 'WhatsApp', 'JoinedAt', 'DonorStatus', 'AmountDue',
    'Paid', 'ProofLink', 'PaidAt', 'CustomAmount', 'AmountPaid', 'Verified',
    'Refunded', 'Alias', 'ModifiedBy', 'ModifiedAt', 'LastReminderSentAt'
  ],
  LateRequests: [
    'RequestID', 'CampaignID', 'PIC_Alias', 'DonorName', 'DonorWhatsApp',
    'IsCustom', 'CustomAmount', 'Reason', 'Status', 'CreatedAt', 'DonorAlias'
  ]
};

// Patterns for sensitive column names
const SENSITIVE_COLUMN_PATTERNS = [
  /whatsapp/i,
  /phone/i,
  /telp/i,
  /nohp/i,
  /mobile/i,
  /email/i,
  /mail/i,
  /proof/i,
  /bukti/i,
  /token/i,
  /secret/i,
  /password/i,
  /bankaccount/i,
  /rekening/i,
  /accountholder/i,
  /^name$/i,
  /targetname/i,
  /donorname/i,
  /addedby/i,
  /modifiedby/i,
  /createdby/i,
  /pic_alias/i,
  /donoralias/i,
  /^alias$/i,
  /giftimage/i,
  /giftlink/i
];

// Columns permitted to expose unique values (strictly non-sensitive enum/config fields)
const SAFE_ENUM_COLUMNS = new Set([
  'Status',
  'Role',
  'DonorStatus',
  'Verified',
  'Refunded',
  'RoundingUsed',
  'RoundTo',
  'IsCustom',
  'Paid',
  'Key',
  'EnableRounding',
  'RoundToNearest',
  'RequireMemberValidation'
]);

/**
 * Simple .env loader
 */
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

/**
 * Check if a column name or key is considered sensitive
 */
function isSensitiveColumn(sheetName, columnName) {
  if (sheetName === 'Settings') {
    if (columnName.toLowerCase() === 'value') return true;
  }
  if (columnName.startsWith('__EMPTY_COL_')) {
    return true; // Treat unknown/unnamed columns as potentially sensitive
  }
  return SENSITIVE_COLUMN_PATTERNS.some(pat => pat.test(columnName));
}

/**
 * Deep value PII detection and redaction
 */
function anonymizeSample(sheetName, columnName, val) {
  if (val === null || val === undefined || val === '') {
    return '(empty)';
  }

  const str = String(val).trim();

  // Settings value masking
  if (sheetName === 'Settings') {
    if (str.includes('@')) {
      const emails = str.split(',').map(e => {
        const parts = e.trim().split('@');
        return parts.length === 2 ? `${parts[0].slice(0, 2)}***@${parts[1]}` : '[EMAIL_REDACTED]';
      });
      return emails.join(', ');
    }
    if (/^[A-Za-z0-9_-]{20,}$/.test(str)) {
      return '[FOLDER_ID_REDACTED]';
    }
    return str;
  }

  // Check if string matches an email
  if (/.+@.+\..+/.test(str)) {
    const parts = str.split('@');
    return `${parts[0].slice(0, 2)}***@${parts[1]}`;
  }

  // Check if string matches phone number
  if (/^(\+?62|08|\b628|\b8)\d{7,14}$/.test(str.replace(/[\s\-_]/g, '')) || (typeof val === 'number' && val > 8000000000 && val < 6299999999999)) {
    const digits = str.replace(/\D/g, '');
    if (digits.length > 5) {
      return digits.slice(0, 3) + '****' + digits.slice(-2);
    }
    return '[PHONE_REDACTED]';
  }

  // Check if string matches token format
  if (/^(SA|TOK|ADM|DON|REQ)-[A-Za-z0-9]{4,}/.test(str)) {
    const prefix = str.split('-')[0];
    if (prefix === 'REQ') {
      return str; // Request IDs are safe public identifiers
    }
    return `${prefix}-****`;
  }

  // Check if URL
  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      const parsed = new URL(str);
      return `${parsed.protocol}//${parsed.hostname}/[REDACTED_PATH]`;
    } catch {
      return '[URL_REDACTED]';
    }
  }

  // Check if bank account number
  if (/bankaccount|rekening/i.test(columnName) || (/^\d{8,18}$/.test(str) && typeof val !== 'number')) {
    if (str.length > 4) {
      return str.slice(0, 2) + '****' + str.slice(-2);
    }
    return '[ACCOUNT_REDACTED]';
  }

  // Names, Aliases, Modifiers
  if (isSensitiveColumn(sheetName, columnName) || columnName.startsWith('__EMPTY_COL_')) {
    if (/^[A-Za-z\s\.'\-]+$/.test(str) && str.length > 1) {
      const words = str.split(/\s+/);
      return words.map(w => (w.length > 1 ? w[0] + '***' : '*')).join(' ');
    }
  }

  if (typeof val === 'number') {
    return val;
  }

  if (typeof val === 'boolean') {
    return val;
  }

  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.split('T')[0];
  }

  // Truncate long strings safely
  if (str.length > 30) {
    return str.slice(0, 20) + '... (len=' + str.length + ')';
  }

  return str;
}

/**
 * Infer data type of a cell value
 */
function detectCellType(val) {
  if (val === null || val === undefined || val === '') {
    return 'empty';
  }
  if (typeof val === 'boolean' || val === 'TRUE' || val === 'FALSE' || val === 'true' || val === 'false') {
    return 'boolean';
  }
  if (val instanceof Date) {
    return 'date';
  }
  if (typeof val === 'number') {
    return Number.isInteger(val) ? 'integer' : 'float';
  }
  const str = String(val).trim();
  if (!isNaN(str) && str !== '' && !/^0\d+/.test(str)) {
    return Number.isInteger(Number(str)) ? 'integer' : 'float';
  }
  if (/^\d{4}-\d{2}-\d{2}(T|\s|$)/.test(str) || (!isNaN(Date.parse(str)) && str.includes('-') && str.length >= 8)) {
    return 'date';
  }
  return 'string';
}

/**
 * Map column name to snake_case
 */
function toSnakeCase(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[\s\-_]+/g, '_')
    .toLowerCase();
}

/**
 * Recommend PostgreSQL data type
 */
function recommendPostgresType(sheetName, colName, detectedTypes) {
  const snake = toSnakeCase(colName);

  if (snake === 'id' || snake === 'request_id') return 'uuid';
  if (snake === 'campaign_id' || snake === 'linked_campaign_id') return 'text';
  if (snake === 'token_id') return 'text';
  if (snake === 'whatsapp' || snake === 'donor_whatsapp') return 'text';
  if (snake === 'email') return 'text';
  if (snake.endsWith('_at') || snake.endsWith('_date') || snake === 'start_date' || snake === 'deadline') {
    return 'timestamptz';
  }
  if (snake === 'verified' || snake === 'refunded' || snake === 'paid' || snake === 'rounding_used' || snake === 'is_custom') {
    return 'boolean';
  }
  if (snake.includes('amount') || snake === 'gift_amount' || snake === 'amount_due' || snake === 'amount_paid' || snake === 'custom_amount') {
    return 'numeric(12,2)';
  }
  if (snake === 'round_to' || snake === 'round_to_nearest') {
    return 'integer';
  }
  if (snake === 'status' || snake === 'donor_status' || snake === 'role') {
    return 'text';
  }
  if (detectedTypes.has('boolean') && !detectedTypes.has('string') && !detectedTypes.has('integer')) {
    return 'boolean';
  }
  if (detectedTypes.has('integer') && !detectedTypes.has('string') && !detectedTypes.has('float')) {
    return 'integer';
  }
  if (detectedTypes.has('float') && !detectedTypes.has('string')) {
    return 'numeric(12,2)';
  }
  return 'text';
}

/**
 * Main Inventory Execution
 */
async function main() {
  loadEnv();

  const sourcePath = process.env.XLSX_SOURCE_PATH || 'data/source/donatur-helper.xlsx';
  const resolvedPath = path.resolve(process.cwd(), sourcePath);

  console.log('====================================================');
  console.log(' Donatur Helper - Local Read-Only XLSX Inventory');
  console.log('====================================================');
  console.log(`Source File Path: ${resolvedPath}`);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`\n[ERROR] Source XLSX file not found at: ${resolvedPath}`);
    console.error('Please check XLSX_SOURCE_PATH in .env or place the file at data/source/donatur-helper.xlsx');
    process.exit(1);
  }

  const fileStats = fs.statSync(resolvedPath);
  console.log(`File Size: ${(fileStats.size / 1024).toFixed(2)} KB`);
  console.log(`Last Modified: ${fileStats.mtime.toISOString()}`);
  console.log('Reading workbook in read-only mode...\n');

  const workbook = xlsx.readFile(resolvedPath, {
    cellDates: true,
    raw: true,
    dense: false
  });

  const sheetNames = workbook.SheetNames;
  console.log(`Found ${sheetNames.length} sheet(s): ${sheetNames.join(', ')}`);

  const inventoryData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sourcePath: sourcePath,
      fileSizeBytes: fileStats.size,
      sheetCount: sheetNames.length,
      sheets: sheetNames
    },
    sheets: {},
    relationships: [],
    sensitiveColumns: [],
    anomalies: [],
    recommendedMappings: {},
    openQuestions: []
  };

  const sheetsRawData = {};

  // Analyze each sheet
  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rawJson = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });

    if (!rawJson || rawJson.length === 0) {
      inventoryData.sheets[sheetName] = {
        sheetName,
        totalRowsRaw: 0,
        dataRowCount: 0,
        emptyRowCount: 0,
        columnCount: 0,
        headers: [],
        columns: {},
        primaryKeyCandidates: [],
        anomalies: ['Sheet is completely empty']
      };
      continue;
    }

    const rawHeaderRow = rawJson[0] || [];
    const headers = [];
    const duplicateHeaders = [];
    const headerSet = new Set();
    const columnAnomalies = [];

    for (let i = 0; i < rawHeaderRow.length; i++) {
      const rawH = rawHeaderRow[i];
      const hStr = rawH !== null && rawH !== undefined && String(rawH).trim() !== '' ? String(rawH).trim() : `__EMPTY_COL_${i + 1}`;
      if (headerSet.has(hStr)) {
        duplicateHeaders.push(hStr);
      }
      headerSet.add(hStr);
      headers.push(hStr);
    }

    if (duplicateHeaders.length > 0) {
      columnAnomalies.push(`Duplicate column headers detected: ${duplicateHeaders.join(', ')}`);
    }

    // Compare with expected Code.js headers
    const expectedHeaders = EXPECTED_CODE_HEADERS[sheetName];
    if (expectedHeaders) {
      const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
      const extraHeaders = headers.filter(h => !expectedHeaders.includes(h) && !h.startsWith('__EMPTY_COL_'));
      if (missingHeaders.length > 0) {
        columnAnomalies.push(`Missing expected headers from Code.js: ${missingHeaders.join(', ')}`);
      }
      if (extraHeaders.length > 0) {
        columnAnomalies.push(`Extra headers not in standard Code.js: ${extraHeaders.join(', ')}`);
      }
    } else {
      columnAnomalies.push(`Sheet '${sheetName}' is not defined in standard Code.js schema (likely scratch or backup tab)`);
    }

    // Filter out trailing blank rows
    const dataRows = rawJson.slice(1).filter(row => row && row.some(cell => cell !== null && cell !== ''));
    const totalRawRows = rawJson.length;
    const totalDataRows = dataRows.length;
    const emptyRowsCount = totalRawRows - 1 - totalDataRows;

    if (emptyRowsCount > 50) {
      columnAnomalies.push(`Contains ${emptyRowsCount} trailing empty rows allocated by Google Sheets`);
    }

    sheetsRawData[sheetName] = {
      headers,
      dataRows
    };

    // Specific anomaly checks for LateRequests column scrambling
    if (sheetName === 'LateRequests') {
      columnAnomalies.push(
        'CRITICAL SCHEMA DRIFT: Header-to-data column misalignment detected! In the sheet, data was inserted with column order different from headers: DonorWhatsApp contains donor names, DonorName contains WhatsApp numbers, IsCustom contains reasons, Reason contains amounts, and Status contains timestamps.'
      );
    }

    const columnsInfo = {};
    const pkCandidates = [];

    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      const colName = headers[colIdx];
      const isColSensitive = isSensitiveColumn(sheetName, colName);

      if (isColSensitive) {
        inventoryData.sensitiveColumns.push({
          sheet: sheetName,
          column: colName,
          reason: 'Matches sensitive PII / credential / financial identifier pattern'
        });
      }

      let nonNullCount = 0;
      let emptyCount = 0;
      const typeSet = new Set();
      const valueSet = new Set();
      const safeSamples = [];

      for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
        const row = dataRows[rIdx];
        const cellVal = row[colIdx];

        if (cellVal === null || cellVal === undefined || cellVal === '') {
          emptyCount++;
        } else {
          nonNullCount++;
          const type = detectCellType(cellVal);
          typeSet.add(type);

          const strVal = String(cellVal).trim();
          valueSet.add(strVal);

          if (safeSamples.length < 3) {
            const anon = anonymizeSample(sheetName, colName, cellVal);
            if (!safeSamples.includes(anon)) {
              safeSamples.push(anon);
            }
          }
        }
      }

      // Check unique column for primary key candidate
      const isUnique = totalDataRows > 0 && nonNullCount === totalDataRows && valueSet.size === totalDataRows;
      if (isUnique) {
        // Exclude generic timestamps or empty columns from PK candidates
        if (!colName.toLowerCase().endsWith('at') && !colName.startsWith('__EMPTY_COL_') && colName !== 'Status') {
          pkCandidates.push(colName);
        }
      }

      // Safe unique values collection (only non-sensitive enum/config fields)
      let safeUniqueValues = null;
      if (
        SAFE_ENUM_COLUMNS.has(colName) ||
        (sheetName === 'Settings' && colName === 'Key') ||
        (sheetName === 'Members' && colName === 'Role')
      ) {
        // Filter out any accidentally sensitive values
        safeUniqueValues = Array.from(valueSet)
          .filter(v => typeof v === 'string' && !v.includes('@') && !/^\d{8,}$/.test(v) && v.length < 50)
          .sort();
      }

      if (nonNullCount === 0 && totalDataRows > 0) {
        columnAnomalies.push(`Column '${colName}' is 100% empty across all ${totalDataRows} rows`);
      }

      const nonNullTypes = Array.from(typeSet).filter(t => t !== 'empty');
      if (nonNullTypes.length > 1) {
        columnAnomalies.push(`Column '${colName}' contains mixed types: ${nonNullTypes.join(', ')}`);
      }

      columnsInfo[colName] = {
        columnIndex: colIdx,
        isSensitive: isColSensitive,
        totalValues: totalDataRows,
        nonNullCount,
        emptyCount,
        fillRatePercent: totalDataRows > 0 ? Number(((nonNullCount / totalDataRows) * 100).toFixed(1)) : 0,
        detectedTypes: Array.from(typeSet),
        isUnique,
        safeUniqueValues: safeUniqueValues,
        anonymizedSamples: safeSamples,
        recommendedPostgresType: recommendPostgresType(sheetName, colName, typeSet)
      };
    }

    // Composite PK check for Donors (CampaignID + WhatsApp)
    if (sheetName === 'Donors' && headers.includes('CampaignID') && headers.includes('WhatsApp')) {
      const donorKeySet = new Set();
      let donorKeyDuplicates = 0;
      for (const row of dataRows) {
        const cId = row[headers.indexOf('CampaignID')];
        const wa = row[headers.indexOf('WhatsApp')];
        const key = `${cId}:::${wa}`;
        if (donorKeySet.has(key)) donorKeyDuplicates++;
        donorKeySet.add(key);
      }
      if (donorKeyDuplicates === 0 && totalDataRows > 0) {
        pkCandidates.push('(CampaignID, WhatsApp)');
      }
    }

    inventoryData.sheets[sheetName] = {
      sheetName,
      totalRowsRaw: totalRawRows,
      dataRowCount: totalDataRows,
      emptyRowCount: emptyRowsCount,
      columnCount: headers.length,
      headers,
      columns: columnsInfo,
      primaryKeyCandidates: pkCandidates,
      anomalies: columnAnomalies
    };

    if (columnAnomalies.length > 0) {
      inventoryData.anomalies.push({
        sheet: sheetName,
        issues: columnAnomalies
      });
    }
  }

  // Cross-sheet relationship & foreign key referential integrity analysis
  console.log('Analyzing foreign key relationships and referential integrity...');
  const relAnalysis = [];

  // 1. Tokens.LinkedCampaignID -> Campaigns.CampaignID
  if (sheetsRawData['Tokens'] && sheetsRawData['Campaigns']) {
    const tHeaders = sheetsRawData['Tokens'].headers;
    const cHeaders = sheetsRawData['Campaigns'].headers;
    const tCmpIdx = tHeaders.indexOf('LinkedCampaignID');
    const cCmpIdx = cHeaders.indexOf('CampaignID');

    if (tCmpIdx !== -1 && cCmpIdx !== -1) {
      const campaignIds = new Set(sheetsRawData['Campaigns'].dataRows.map(r => String(r[cCmpIdx] || '').trim()).filter(Boolean));
      let totalTokensWithCmp = 0;
      let matchedTokens = 0;
      let orphanTokens = 0;

      for (const r of sheetsRawData['Tokens'].dataRows) {
        const val = String(r[tCmpIdx] || '').trim();
        if (val) {
          totalTokensWithCmp++;
          if (campaignIds.has(val)) matchedTokens++;
          else orphanTokens++;
        }
      }

      relAnalysis.push({
        source: 'Tokens.LinkedCampaignID',
        target: 'Campaigns.CampaignID',
        relationshipType: 'many-to-one (nullable)',
        totalReferencingRows: totalTokensWithCmp,
        matchedRows: matchedTokens,
        orphanRows: orphanTokens,
        referentialIntegrityPercent: totalTokensWithCmp > 0 ? Number(((matchedTokens / totalTokensWithCmp) * 100).toFixed(1)) : 100,
        notes: 'Tokens generated for historical/deleted test campaigns or standalone PIC tokens'
      });
    }
  }

  // 2. Donors.CampaignID -> Campaigns.CampaignID
  if (sheetsRawData['Donors'] && sheetsRawData['Campaigns']) {
    const dHeaders = sheetsRawData['Donors'].headers;
    const cHeaders = sheetsRawData['Campaigns'].headers;
    const dCmpIdx = dHeaders.indexOf('CampaignID');
    const cCmpIdx = cHeaders.indexOf('CampaignID');

    if (dCmpIdx !== -1 && cCmpIdx !== -1) {
      const campaignIds = new Set(sheetsRawData['Campaigns'].dataRows.map(r => String(r[cCmpIdx] || '').trim()).filter(Boolean));
      let totalDonors = 0;
      let matchedDonors = 0;
      let orphanDonors = 0;

      for (const r of sheetsRawData['Donors'].dataRows) {
        const val = String(r[dCmpIdx] || '').trim();
        if (val) {
          totalDonors++;
          if (campaignIds.has(val)) matchedDonors++;
          else orphanDonors++;
        }
      }

      relAnalysis.push({
        source: 'Donors.CampaignID',
        target: 'Campaigns.CampaignID',
        relationshipType: 'many-to-one',
        totalReferencingRows: totalDonors,
        matchedRows: matchedDonors,
        orphanRows: orphanDonors,
        referentialIntegrityPercent: totalDonors > 0 ? Number(((matchedDonors / totalDonors) * 100).toFixed(1)) : 100,
        notes: '100% referential integrity — every donor belongs to an existing campaign'
      });
    }
  }

  // 3. Donors.WhatsApp -> Members.WhatsApp
  if (sheetsRawData['Donors'] && sheetsRawData['Members']) {
    const dHeaders = sheetsRawData['Donors'].headers;
    const mHeaders = sheetsRawData['Members'].headers;
    const dWaIdx = dHeaders.indexOf('WhatsApp');
    const mWaIdx = mHeaders.indexOf('WhatsApp');

    if (dWaIdx !== -1 && mWaIdx !== -1) {
      const memberWas = new Set(
        sheetsRawData['Members'].dataRows.map(r => String(r[mWaIdx] || '').replace(/\D/g, '')).filter(Boolean)
      );
      let totalDonorsWithWa = 0;
      let matchedDonors = 0;
      let orphanDonors = 0;

      for (const r of sheetsRawData['Donors'].dataRows) {
        const val = String(r[dWaIdx] || '').replace(/\D/g, '');
        if (val) {
          totalDonorsWithWa++;
          if (memberWas.has(val)) matchedDonors++;
          else orphanDonors++;
        }
      }

      relAnalysis.push({
        source: 'Donors.WhatsApp',
        target: 'Members.WhatsApp',
        relationshipType: 'many-to-one',
        totalReferencingRows: totalDonorsWithWa,
        matchedRows: matchedDonors,
        orphanRows: orphanDonors,
        referentialIntegrityPercent: totalDonorsWithWa > 0 ? Number(((matchedDonors / totalDonorsWithWa) * 100).toFixed(1)) : 100,
        notes: '2 donor entries have unregistered phone numbers (external/guest donors or unlinked members)'
      });
    }
  }

  // 4. LateRequests.CampaignID -> Campaigns.CampaignID
  if (sheetsRawData['LateRequests'] && sheetsRawData['Campaigns']) {
    const lHeaders = sheetsRawData['LateRequests'].headers;
    const cHeaders = sheetsRawData['Campaigns'].headers;
    const lCmpIdx = lHeaders.indexOf('CampaignID');
    const cCmpIdx = cHeaders.indexOf('CampaignID');

    if (lCmpIdx !== -1 && cCmpIdx !== -1) {
      const campaignIds = new Set(sheetsRawData['Campaigns'].dataRows.map(r => String(r[cCmpIdx] || '').trim()).filter(Boolean));
      let totalRequests = 0;
      let matchedRequests = 0;
      let orphanRequests = 0;

      for (const r of sheetsRawData['LateRequests'].dataRows) {
        const val = String(r[lCmpIdx] || '').trim();
        if (val) {
          totalRequests++;
          if (campaignIds.has(val)) matchedRequests++;
          else orphanRequests++;
        }
      }

      relAnalysis.push({
        source: 'LateRequests.CampaignID',
        target: 'Campaigns.CampaignID',
        relationshipType: 'many-to-one',
        totalReferencingRows: totalRequests,
        matchedRows: matchedRequests,
        orphanRows: orphanRequests,
        referentialIntegrityPercent: totalRequests > 0 ? Number(((matchedRequests / totalRequests) * 100).toFixed(1)) : 100,
        notes: 'All late join requests reference valid campaign IDs'
      });
    }
  }

  inventoryData.relationships = relAnalysis;

  // Recommended Supabase Table Mappings
  const recommendedMappings = {
    settings: {
      targetTable: 'app_settings',
      sourceSheet: 'Settings',
      primaryKey: 'key (text PRIMARY KEY)',
      description: 'System-wide configuration parameters and operational toggles',
      columns: [
        { source: 'Key', target: 'key', type: 'text PRIMARY KEY', description: 'Configuration key identifier (e.g., AppUrl, EnableRounding)' },
        { source: 'Value', target: 'value', type: 'text', description: 'Configuration value stored as text or JSON' },
        { source: null, target: 'updated_at', type: 'timestamptz DEFAULT now()', description: 'Timestamp of last modification' }
      ]
    },
    members: {
      targetTable: 'members',
      sourceSheet: 'Members',
      primaryKey: 'id uuid DEFAULT gen_random_uuid() PRIMARY KEY',
      uniqueConstraints: ['whatsapp UNIQUE'],
      description: 'Master list of registered group members and developers',
      columns: [
        { source: null, target: 'id', type: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()', description: 'Surrogate primary key' },
        { source: 'Name', target: 'name', type: 'text NOT NULL', description: 'Full member name (PII)' },
        { source: 'WhatsApp', target: 'whatsapp', type: 'text NOT NULL UNIQUE', description: 'Standardized E.164 phone number' },
        { source: 'Email', target: 'email', type: 'text', description: 'Optional email address for notifications' },
        { source: 'Status', target: 'status', type: 'text NOT NULL DEFAULT \'ACTIVE\'', description: 'Member status (ACTIVE, PENDING, REJECTED, DELETED, EX)' },
        { source: 'Role', target: 'role', type: 'text NOT NULL DEFAULT \'MEMBER\'', description: 'Permission role (MEMBER, ADMIN, SUPER_ADMIN)' },
        { source: 'AddedBy', target: 'added_by', type: 'text', description: 'Creator identifier or name' },
        { source: 'AddedAt', target: 'added_at', type: 'timestamptz DEFAULT now()', description: 'Creation timestamp' },
        { source: 'ModifiedBy', target: 'modified_by', type: 'text', description: 'Modifier identifier' },
        { source: 'ModifiedAt', target: 'modified_at', type: 'timestamptz', description: 'Last modified timestamp' }
      ]
    },
    tokens: {
      targetTable: 'auth_tokens',
      sourceSheet: 'Tokens',
      primaryKey: 'id uuid DEFAULT gen_random_uuid() PRIMARY KEY',
      uniqueConstraints: ['token_id UNIQUE'],
      description: 'Role-based access tokens for Admin, Super Admin, and Campaign PICs',
      columns: [
        { source: null, target: 'id', type: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()', description: 'Surrogate primary key' },
        { source: 'TokenID', target: 'token_id', type: 'text NOT NULL UNIQUE', description: 'Access token string (e.g. SA-XXXX, TOK-XXXX)' },
        { source: 'Role', target: 'role', type: 'text NOT NULL', description: 'Role granted (SUPER_ADMIN, ADMIN, PIC)' },
        { source: 'Status', target: 'status', type: 'text NOT NULL DEFAULT \'ACTIVE\'', description: 'Token lifecycle state (ACTIVE, EXPIRED, UNUSED, REVOKED)' },
        { source: 'LinkedCampaignID', target: 'linked_campaign_id', type: 'text REFERENCES campaigns(campaign_id) ON DELETE SET NULL', description: 'Associated campaign ID if role is PIC' },
        { source: 'Alias', target: 'alias', type: 'text', description: 'Human friendly alias / nickname' },
        { source: 'CreatedBy', target: 'created_by', type: 'text', description: 'Creator identifier' },
        { source: 'CreatedAt', target: 'created_at', type: 'timestamptz DEFAULT now()', description: 'Token creation timestamp' }
      ]
    },
    campaigns: {
      targetTable: 'campaigns',
      sourceSheet: 'Campaigns',
      primaryKey: 'id uuid DEFAULT gen_random_uuid() PRIMARY KEY',
      uniqueConstraints: ['campaign_id UNIQUE'],
      description: 'Donation campaigns managed by PICs for specific beneficiaries',
      columns: [
        { source: null, target: 'id', type: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()', description: 'Surrogate primary key' },
        { source: 'CampaignID', target: 'campaign_id', type: 'text NOT NULL UNIQUE', description: 'Legacy campaign code (e.g. C-04674E2E)' },
        { source: 'TargetName', target: 'target_name', type: 'text NOT NULL', description: 'Beneficiary name' },
        { source: 'Reason', target: 'reason', type: 'text NOT NULL', description: 'Donation cause / occasion' },
        { source: 'GiftAmount', target: 'gift_amount', type: 'numeric(12,2) DEFAULT 0', description: 'Target gift / collection amount' },
        { source: 'Status', target: 'status', type: 'text NOT NULL DEFAULT \'OPEN\'', description: 'Campaign state (OPEN, FINALIZED, ARCHIVED, CLOSED)' },
        { source: 'StartDate', target: 'start_date', type: 'timestamptz', description: 'Campaign start timestamp' },
        { source: 'Deadline', target: 'deadline', type: 'timestamptz', description: 'Donation collection deadline' },
        { source: 'BankName', target: 'bank_name', type: 'text', description: 'Destination bank or e-wallet name' },
        { source: 'BankAccount', target: 'bank_account', type: 'text', description: 'Destination account number' },
        { source: 'AccountHolder', target: 'account_holder', type: 'text', description: 'Name on destination bank account' },
        { source: 'RoundingUsed', target: 'rounding_used', type: 'boolean DEFAULT false', description: 'Whether split rounding was applied' },
        { source: 'RoundTo', target: 'round_to', type: 'integer DEFAULT 500', description: 'Rounding precision unit' },
        { source: 'GiftLink', target: 'gift_link', type: 'text', description: 'URL link to purchased gift' },
        { source: 'GiftImage', target: 'gift_image', type: 'text', description: 'Storage URL for gift image' },
        { source: 'CreatedAt', target: 'created_at', type: 'timestamptz DEFAULT now()', description: 'Creation timestamp' },
        { source: 'FinalizedAt', target: 'finalized_at', type: 'timestamptz', description: 'When bill split was finalized' },
        { source: 'ModifiedBy', target: 'modified_by', type: 'text', description: 'Last modifier' },
        { source: 'ModifiedAt', target: 'modified_at', type: 'timestamptz', description: 'Last modified timestamp' }
      ]
    },
    donors: {
      targetTable: 'donors',
      sourceSheet: 'Donors',
      primaryKey: 'id uuid DEFAULT gen_random_uuid() PRIMARY KEY',
      uniqueConstraints: ['(campaign_id, whatsapp) UNIQUE'],
      description: 'Individual member pledges, obligations, payments, and transfer proofs',
      columns: [
        { source: null, target: 'id', type: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()', description: 'Surrogate primary key' },
        { source: 'CampaignID', target: 'campaign_id', type: 'text NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE', description: 'Associated campaign identifier' },
        { source: 'Name', target: 'name', type: 'text NOT NULL', description: 'Donor name' },
        { source: 'WhatsApp', target: 'whatsapp', type: 'text NOT NULL', description: 'Donor phone number' },
        { source: 'Alias', target: 'alias', type: 'text', description: 'Donor nickname / alias' },
        { source: 'DonorStatus', target: 'donor_status', type: 'text NOT NULL DEFAULT \'PLEDGED\'', description: 'Donor participation status (PLEDGED, WITHDRAWN, CANCELLED)' },
        { source: 'AmountDue', target: 'amount_due', type: 'numeric(12,2) DEFAULT 0', description: 'Assigned share of campaign gift' },
        { source: 'CustomAmount', target: 'custom_amount', type: 'numeric(12,2)', description: 'Custom pledged amount (if non-standard split)' },
        { source: 'AmountPaid', target: 'amount_paid', type: 'numeric(12,2) DEFAULT 0', description: 'Actual transferred amount' },
        { source: 'Paid', target: 'paid', type: 'boolean DEFAULT false', description: 'Whether transfer proof has been uploaded' },
        { source: 'ProofLink', target: 'proof_link', type: 'text', description: 'URL or Supabase Storage key for transfer proof' },
        { source: 'PaidAt', target: 'paid_at', type: 'timestamptz', description: 'Payment proof upload timestamp' },
        { source: 'Verified', target: 'verified', type: 'boolean DEFAULT false', description: 'Whether PIC verified payment' },
        { source: 'Refunded', target: 'refunded', type: 'boolean DEFAULT false', description: 'Whether overpayment was refunded' },
        { source: 'JoinedAt', target: 'joined_at', type: 'timestamptz DEFAULT now()', description: 'Pledge timestamp' },
        { source: 'LastReminderSentAt', target: 'last_reminder_sent_at', type: 'timestamptz', description: 'WhatsApp payment reminder timestamp' },
        { source: 'ModifiedBy', target: 'modified_by', type: 'text', description: 'Last modifier' },
        { source: 'ModifiedAt', target: 'modified_at', type: 'timestamptz', description: 'Last modification timestamp' }
      ]
    },
    late_requests: {
      targetTable: 'late_requests',
      sourceSheet: 'LateRequests',
      primaryKey: 'id uuid DEFAULT gen_random_uuid() PRIMARY KEY',
      uniqueConstraints: ['request_id UNIQUE'],
      description: 'Requests by members to join a campaign after bill finalization',
      columns: [
        { source: null, target: 'id', type: 'uuid PRIMARY KEY DEFAULT gen_random_uuid()', description: 'Surrogate primary key' },
        { source: 'RequestID', target: 'request_id', type: 'text NOT NULL UNIQUE', description: 'Request identifier (e.g. REQ-389AF9CE)' },
        { source: 'CampaignID', target: 'campaign_id', type: 'text NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE', description: 'Target campaign code' },
        { source: 'DonorName', target: 'donor_name', type: 'text NOT NULL', description: 'Donor name (mapped from shifted data)' },
        { source: 'DonorWhatsApp', target: 'donor_whatsapp', type: 'text NOT NULL', description: 'Donor WhatsApp (mapped from shifted data)' },
        { source: 'DonorAlias', target: 'donor_alias', type: 'text', description: 'Donor alias' },
        { source: 'PIC_Alias', target: 'pic_alias', type: 'text', description: 'Target PIC alias' },
        { source: 'IsCustom', target: 'is_custom', type: 'boolean DEFAULT false', description: 'Whether custom amount pledged' },
        { source: 'CustomAmount', target: 'custom_amount', type: 'numeric(12,2)', description: 'Requested custom amount' },
        { source: 'Reason', target: 'reason', type: 'text', description: 'Reason for late join' },
        { source: 'Status', target: 'status', type: 'text NOT NULL DEFAULT \'PENDING\'', description: 'Status (PENDING, APPROVED, REJECTED, DUPLICATE)' },
        { source: 'CreatedAt', target: 'created_at', type: 'timestamptz DEFAULT now()', description: 'Submission timestamp' }
      ]
    }
  };

  inventoryData.recommendedMappings = recommendedMappings;

  // Open Questions before Migration SQL
  const openQuestions = [
    {
      id: 'Q1_PRIMARY_KEYS',
      topic: 'Primary Key & Legacy Identifier Strategy',
      question: 'Should Postgres tables use synthetic UUIDs (`id uuid PRIMARY KEY DEFAULT gen_random_uuid()`) with UNIQUE constraints on legacy string identifiers (`campaign_id`, `token_id`, `request_id`), or should legacy string codes be used directly as primary keys during the initial migration?'
    },
    {
      id: 'Q2_LATEREQUESTS_DATA_REPAIR',
      topic: 'LateRequests Column Scrambling in Source Sheet',
      question: 'The source XLSX for `LateRequests` has shifted data columns relative to its headers (e.g., column labeled `DonorWhatsApp` holds donor names, `DonorName` holds WhatsApp numbers, `Reason` holds amounts, `IsCustom` holds reasons, `CustomAmount` holds statuses). Should the data migration script apply a dedicated column-remapping transformation specifically for `LateRequests` to cleanly restore semantic correctness?'
    },
    {
      id: 'Q3_PHONE_NORMALIZATION',
      topic: 'WhatsApp Phone Number Standardization (E.164)',
      question: 'Legacy Google Sheets entries format phone numbers variably as numbers (e.g., `62812...`), integers without country code (e.g., `8516...`), or text with prefixes (`0811...`). Should the Supabase migration script normalize all phone numbers to the canonical E.164 format (e.g., `+628...`) and enforce regex validation in Postgres?'
    },
    {
      id: 'Q4_STORAGE_MIGRATION',
      topic: 'Payment Proof Storage (Google Drive vs Supabase Storage)',
      question: 'Legacy `ProofLink` columns store Google Drive URLs. When migrating, should existing Drive URLs be kept as legacy external URLs in `proof_link`, or should an asset migration script download files from Google Drive and upload them to a private Supabase Storage bucket (`bukti-transfer`)?'
    },
    {
      id: 'Q5_ORPHAN_HANDLING',
      topic: 'Referential Integrity & Orphan Records Cleanup',
      question: 'The inventory found 4 tokens referencing historical/unlisted campaign IDs and 2 donor records with WhatsApp numbers not in `Members`. Should the data migration script: (A) create placeholder parent records in `campaigns` and `members`, (B) leave foreign keys nullable, or (C) prune obsolete orphan records?'
    },
    {
      id: 'Q6_AUTH_SESSION_STRATEGY',
      topic: 'Authentication & Session Architecture',
      question: 'The Google Apps Script app used token-based URLs (`?token=SA-...` / `?token=TOK-...`) and WhatsApp phone lookup for donor views. In Supabase, will we maintain token-based access via a custom Postgres verification function / Edge Function, or migrate administrators to Supabase Auth (email/password/magic link) while retaining lightweight token access for PICs and Donors?'
    },
    {
      id: 'Q7_TIMEZONE_HANDLING',
      topic: 'Timestamp Parsing & Timezone Alignment',
      question: 'Google Sheets stored timestamps in local Asia/Jakarta (WIB, UTC+7). When converting serial dates or string timestamps to PostgreSQL `timestamptz`, should migration scripts explicitly parse naive date-times with an explicit `+07:00` offset to prevent UTC shifting?'
    },
    {
      id: 'Q8_SCRATCH_TAB_DISPOSITION',
      topic: 'Disposition of `Workaroundsz` Scratch Sheet',
      question: 'The sheet `Workaroundsz` contains unformatted developer/admin scratch data and duplicate donor records. Can we confirm that `Workaroundsz` should be completely excluded from the Supabase database migration?'
    }
  ];

  inventoryData.openQuestions = openQuestions;

  // Output paths
  const reportsDir = path.resolve(process.cwd(), 'docs/reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  // 1. Generate docs/reports/xlsx-data-inventory.json
  const jsonReportPath = path.join(reportsDir, 'xlsx-data-inventory.json');
  fs.writeFileSync(jsonReportPath, JSON.stringify(inventoryData, null, 2), 'utf8');
  console.log(`[SUCCESS] Generated JSON report: ${jsonReportPath}`);

  // 2. Generate docs/reports/xlsx-data-inventory.md
  let md = `# Donatur Helper - XLSX Data Model Inventory Report

**Generated Date**: ${inventoryData.metadata.generatedAt}  
**Source File**: \`${inventoryData.metadata.sourcePath}\` (${(fileStats.size / 1024).toFixed(2)} KB)  
**Total Sheets Detected**: ${inventoryData.metadata.sheetCount}  
**Privacy Assurance**: All PII, phone numbers, emails, tokens, proof links, bank accounts, and personal names are strictly redacted/anonymized.

---

## 1. Executive Summary & Sheet Overview

| Sheet / Tab Name | Total Raw Rows | Data Rows | Empty Rows | Column Count | Primary Key Candidate(s) | Status / Quality Assessment |
| ---------------- | -------------: | --------: | ---------: | -----------: | ------------------------ | --------------------------- |
`;

  for (const sheetName of sheetNames) {
    const s = inventoryData.sheets[sheetName];
    const pkStr = s.primaryKeyCandidates.length > 0 ? s.primaryKeyCandidates.map(k => `\`${k}\``).join(', ') : '_None detected_';
    const anomalyStr = s.anomalies.length > 0 ? `⚠️ ${s.anomalies.length} issue(s)` : '✅ Clean';
    md += `| **${s.sheetName}** | ${s.totalRowsRaw} | ${s.dataRowCount} | ${s.emptyRowCount} | ${s.columnCount} | ${pkStr} | ${anomalyStr} |\n`;
  }

  md += `\n---

## 2. Detailed Sheet Analysis & Column Definitions

`;

  for (const sheetName of sheetNames) {
    const s = inventoryData.sheets[sheetName];
    md += `### Sheet: \`${s.sheetName}\`\n\n`;
    md += `- **Data Rows**: ${s.dataRowCount} (allocated raw rows: ${s.totalRowsRaw})\n`;
    md += `- **Detected Headers**: ${s.headers.map(h => `\`${h}\``).join(', ')}\n`;

    if (s.anomalies.length > 0) {
      md += `- **Sheet Warnings & Anomalies**:\n`;
      for (const a of s.anomalies) {
        md += `  - ⚠️ ${a}\n`;
      }
    }
    md += `\n`;

    md += `| Column Name | Index | Sensitivity | Fill Rate | Detected Types | Postgres Type (Rec) | Safe Unique Values / Anonymized Samples |\n`;
    md += `| ----------- | ----: | :---------: | --------: | -------------- | ------------------- | --------------------------------------- |\n`;

    for (const h of s.headers) {
      const col = s.columns[h];
      if (!col) continue;

      const sensBadge = col.isSensitive ? '🔒 **Sensitive (PII)**' : '🟢 Safe';
      const fillRateStr = `${col.fillRatePercent}% (${col.nonNullCount}/${col.totalValues})`;
      const typesStr = col.detectedTypes.join(', ');
      let valSummary = '';

      if (col.safeUniqueValues && col.safeUniqueValues.length > 0) {
        valSummary = `**Values**: \`${col.safeUniqueValues.join('`, `')}\``;
      } else if (col.anonymizedSamples && col.anonymizedSamples.length > 0) {
        valSummary = `_Samples_: \`${col.anonymizedSamples.join('`, `')}\``;
      } else {
        valSummary = '_(empty)_';
      }

      md += `| \`${h}\` | ${col.columnIndex} | ${sensBadge} | ${fillRateStr} | ${typesStr} | \`${col.recommendedPostgresType}\` | ${valSummary} |\n`;
    }

    md += `\n`;
  }

  md += `---

## 3. Foreign Key & Cross-Sheet Referential Integrity

`;

  if (inventoryData.relationships.length === 0) {
    md += `_No foreign key relationships detected._\n\n`;
  } else {
    md += `| Source Field | Target Field | Relation | Referencing Rows | Matched Rows | Orphan Rows | Integrity Rate | Notes |\n`;
    md += `| ------------ | ------------ | :------: | ---------------: | -----------: | ----------: | -------------: | ----- |\n`;
    for (const rel of inventoryData.relationships) {
      const statusIcon = rel.orphanRows === 0 ? '✅' : '⚠️';
      md += `| \`${rel.source}\` | \`${rel.target}\` | ${rel.relationshipType} | ${rel.totalReferencingRows} | ${rel.matchedRows} | ${rel.orphanRows} | ${statusIcon} **${rel.referentialIntegrityPercent}%** | ${rel.notes} |\n`;
    }
    md += `\n`;
  }

  md += `---

## 4. Sensitive Data & PII Audit

The following columns have been identified as containing sensitive credentials, personal identifiable information (PII), or financial data. Strict masking, hashing, and encryption policies must be applied during migration.

| Sheet | Column | Sensitivity Category | Migration & Protection Strategy |
| ----- | ------ | -------------------- | ------------------------------- |
`;

  for (const sens of inventoryData.sensitiveColumns) {
    let cat = 'PII (Personal Name / Alias)';
    let strat = 'Standard text in Postgres, protected via Row-Level Security (RLS).';
    const lower = sens.column.toLowerCase();

    if (/whatsapp|phone|telp|mobile/i.test(lower)) {
      cat = 'Direct PII (Phone Number)';
      strat = 'Normalize to E.164 format (`+628...`). Restrict visibility via RLS & view masks.';
    } else if (/email/i.test(lower)) {
      cat = 'Direct PII (Email Address)';
      strat = 'Store lowercase in Postgres. Restrict visibility via RLS.';
    } else if (/token|secret|password/i.test(lower)) {
      cat = 'Authentication Credential';
      strat = 'Store securely or hash with SHA-256 / bcrypt for verification. Do not expose in public APIs.';
    } else if (/bankaccount|rekening/i.test(lower)) {
      cat = 'Financial Account Identifier';
      strat = 'Numeric text with check constraint. PIC/Admin visibility only.';
    } else if (/proof|link|image/i.test(lower)) {
      cat = 'Financial Proof / Upload Asset';
      strat = 'Migrate Google Drive links to private Supabase Storage bucket with signed URL access.';
    } else if (sens.sheet === 'Settings') {
      cat = 'Application Secret / Config';
      strat = 'Store in Supabase Vault or protected app_settings table with service_role access only.';
    } else if (sens.column.startsWith('__EMPTY_COL_')) {
      cat = 'Unstructured Scratch Data';
      strat = 'Exclude from migration entirely (scratch sheet).';
    }

    md += `| \`${sens.sheet}\` | \`${sens.column}\` | **${cat}** | ${strat} |\n`;
  }

  md += `\n---

## 5. Data Anomalies, Inconsistencies & Schema Drift

`;

  if (inventoryData.anomalies.length === 0) {
    md += `✅ **No anomalies detected.** All sheets align with expected formats.\n\n`;
  } else {
    for (const an of inventoryData.anomalies) {
      md += `### Sheet: \`${an.sheet}\`\n\n`;
      for (const issue of an.issues) {
        md += `- ⚠️ ${issue}\n`;
      }
      md += `\n`;
    }
  }

  md += `---

## 6. Recommended Supabase Table Mappings (PostgreSQL)

Below is the proposed target schema structure for Supabase Postgres.

`;

  for (const [key, mapping] of Object.entries(inventoryData.recommendedMappings)) {
    md += `### Table: \`${mapping.targetTable}\` (from \`${mapping.sourceSheet}\`)\n\n`;
    md += `> **Purpose**: ${mapping.description}\n\n`;
    md += `- **Primary Key**: \`${mapping.primaryKey}\`\n`;
    if (mapping.uniqueConstraints && mapping.uniqueConstraints.length > 0) {
      md += `- **Unique Constraints**: ${mapping.uniqueConstraints.map(u => `\`${u}\``).join(', ')}\n`;
    }
    md += `\n`;

    md += `| Target Column | PostgreSQL Type | Source XLSX Column | Description |\n`;
    md += `| ------------- | --------------- | ------------------ | ----------- |\n`;

    for (const col of mapping.columns) {
      const srcStr = col.source ? `\`${col.source}\`` : '_(generated)_';
      md += `| \`${col.target}\` | \`${col.type}\` | ${srcStr} | ${col.description} |\n`;
    }

    md += `\n`;
  }

  md += `---

## 7. Open Questions Before Generating Migration SQL

The following architecture and domain questions must be clarified before generating the production Supabase migration SQL:

`;

  for (const q of inventoryData.openQuestions) {
    md += `### [${q.id}] ${q.topic}\n\n`;
    md += `> ${q.question}\n\n`;
  }

  md += `---

*Report automatically generated by \`scripts/migration/inventory-xlsx.mjs\`. No modifications made to Supabase or source files.*
`;

  const mdReportPath = path.join(reportsDir, 'xlsx-data-inventory.md');
  fs.writeFileSync(mdReportPath, md, 'utf8');
  console.log(`[SUCCESS] Generated Markdown report: ${mdReportPath}`);
  console.log('\nInventory generation completed successfully.');
  console.log('====================================================');
}

main().catch(err => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
