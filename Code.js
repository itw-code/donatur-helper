/**
 * DONATION HELPER - backend (Code.gs)
 *
 * This script must be bound to a Google Sheet (Extensions > Apps Script).
 * Run setup() once from the Apps Script editor before deploying.
 *
 * Sheets used (auto-created by setup()):
 *  - Settings : Key | Value
 *  - Members  : Name | WhatsApp | Status | AddedBy | AddedAt | Role
 *  - Tokens   : TokenID | Role | Status | LinkedCampaignID | CreatedBy | CreatedAt
 *  - Campaigns: CampaignID | TargetName | Reason | GiftAmount | Status | StartDate |
 *               Deadline | BankName | BankAccount | AccountHolder | RoundingUsed |
 *               RoundTo | CreatedAt | FinalizedAt
 *  - Donors   : CampaignID | Name | WhatsApp | JoinedAt | DonorStatus | AmountDue |
 *               Paid | ProofLink | PaidAt | CustomAmount | AmountPaid | Verified | Refunded
 */

const SHEETS = {
  SETTINGS: 'Settings',
  MEMBERS: 'Members',
  TOKENS: 'Tokens',
  CAMPAIGNS: 'Campaigns',
  DONORS: 'Donors',
  LATE_REQUESTS: 'LateRequests'
};

const HEADERS = {
  Settings: ['Key', 'Value'],
  Members: ['Name', 'WhatsApp', 'Status', 'AddedBy', 'AddedAt', 'Role', 'ModifiedBy', 'ModifiedAt'],
  Tokens: ['TokenID', 'Role', 'Status', 'LinkedCampaignID', 'CreatedBy', 'CreatedAt', 'Alias'],
  Campaigns: ['CampaignID', 'TargetName', 'Reason', 'GiftAmount', 'Status', 'StartDate',
    'Deadline', 'BankName', 'BankAccount', 'AccountHolder', 'RoundingUsed',
    'RoundTo', 'CreatedAt', 'FinalizedAt', 'GiftLink', 'GiftImage', 'ModifiedBy', 'ModifiedAt'],
  Donors: ['CampaignID', 'Name', 'WhatsApp', 'JoinedAt', 'DonorStatus', 'AmountDue',
    'Paid', 'ProofLink', 'PaidAt', 'CustomAmount', 'AmountPaid', 'Verified', 'Refunded', 'Alias', 'ModifiedBy', 'ModifiedAt'],
  LateRequests: ['RequestID', 'CampaignID', 'PIC_Alias', 'DonorName', 'DonorWhatsApp', 'IsCustom', 'CustomAmount', 'Reason', 'Status', 'CreatedAt', 'DonorAlias']
};

const DEFAULT_SETTINGS = {
  EnableRounding: 'FALSE',
  RoundToNearest: '500',
  RequireMemberValidation: 'FALSE',
  ProofsFolderId: ''
};

// ====================== SETUP ======================

/**
 * Run this ONCE manually from the Apps Script editor (select "setup" and click Run).
 * Creates all sheets, default settings, a Drive folder for payment proofs, and a
 * Super Admin token. The token is written to the execution log (View > Logs / Executions).
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    
    const expectedHeaders = HEADERS[name];
    if (sh.getLastRow() === 0) {
      sh.appendRow(expectedHeaders);
      sh.setFrozenRows(1);
    } else {
      const existingHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
      expectedHeaders.forEach(header => {
        if (existingHeaders.indexOf(header) === -1) {
          sh.getRange(1, sh.getLastColumn() + 1).setValue(header);
        }
      });
    }
  });

  const settingsSheet = ss.getSheetByName(SHEETS.SETTINGS);
  const existingKeys = settingsSheet.getDataRange().getValues().slice(1).map(r => r[0]);
  Object.keys(DEFAULT_SETTINGS).forEach(key => {
    if (existingKeys.indexOf(key) === -1) {
      settingsSheet.appendRow([key, DEFAULT_SETTINGS[key]]);
    }
  });

  if (!getSetting('ProofsFolderId')) {
    const folder = DriveApp.createFolder('Donation Proofs - ' + ss.getName());
    setSetting('ProofsFolderId', folder.getId());
    Logger.log('Created proofs folder: ' + folder.getUrl());
  }

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SUPER_ADMIN_TOKEN')) {
    const token = 'SA-' + Utilities.getUuid().split('-')[0].toUpperCase();
    props.setProperty('SUPER_ADMIN_TOKEN', token);
  }

  Logger.log('Setup complete.');
  Logger.log('SUPER ADMIN TOKEN: ' + props.getProperty('SUPER_ADMIN_TOKEN'));
  Logger.log('Keep this token private. Use it to log in as Super Admin in the web app.');
}

/**
 * Optional helper: run from the editor to print the current Super Admin token
 * (e.g. after rotation) without re-running the whole setup.
 */
function showSuperAdminToken() {
  Logger.log('SUPER ADMIN TOKEN: ' + PropertiesService.getScriptProperties().getProperty('SUPER_ADMIN_TOKEN'));
}

/**
 * Optional: rotate (regenerate) the Super Admin token. Run manually from the editor.
 */
function rotateSuperAdminToken() {
  const token = 'SA-' + Utilities.getUuid().split('-')[0].toUpperCase();
  PropertiesService.getScriptProperties().setProperty('SUPER_ADMIN_TOKEN', token);
  Logger.log('NEW SUPER ADMIN TOKEN: ' + token);
}

// ====================== WEB APP ENTRY ======================

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Donation Helper')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ====================== GENERIC HELPERS ======================

function sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function headerIndex_(sheetName, header) {
  const sh = sheet_(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  // Trim both sides to make it bulletproof against manual sheet edits
  return headers.findIndex(h => String(h).trim() === String(header).trim());
}

/** Returns all data rows as objects, each carrying its 1-based sheet row in _row. */
function getRows_(sheetName) {
  const sh = sheet_(sheetName);
  const range = sh.getDataRange();
  const data = range.getValues();
  if (data.length < 2) return [];

  const startRow = range.getRow(); // Accurately grabs the physical starting row
  const headers = data[0].map(h => String(h).trim());
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const obj = { _row: startRow + i }; // Bulletproof physical row mapping
    headers.forEach((h, idx) => obj[h] = data[i][idx]);
    rows.push(obj);
  }
  return rows;
}

function stripRow_(obj) {
  const copy = Object.assign({}, obj);
  delete copy._row;

  // BUG FIX: google.script.run silently converts objects containing Dates to NULL.
  // We must sanitize all Date objects into Strings before sending them to the frontend.
  Object.keys(copy).forEach(key => {
    if (copy[key] instanceof Date) {
      if (key === 'Deadline' || key === 'StartDate') {
        // Keep UI clean: Format deadlines as YYYY-MM-DD
        copy[key] = copy[key].toISOString().split('T')[0];
      } else {
        // Keep precise time for CreatedAt / FinalizedAt for sorting
        copy[key] = copy[key].toISOString();
      }
    }
  });

  return copy;
}

function getSetting(key) {
  const rows = getRows_(SHEETS.SETTINGS);
  const row = rows.find(r => r.Key === key);
  return row ? row.Value : null;
}

function setSetting(key, value) {
  const sh = sheet_(SHEETS.SETTINGS);
  const rows = getRows_(SHEETS.SETTINGS);
  const row = rows.find(r => r.Key === key);
  if (row) {
    sh.getRange(row._row, 2).setValue(value);
  } else {
    sh.appendRow([key, value]);
  }
}

function normalizePhone_(phone) {
  let p = String(phone || '').replace(/[^0-9]/g, '');
  if (p.indexOf('0') === 0) p = '62' + p.slice(1);
  else if (p.indexOf('62') !== 0 && p.indexOf('8') === 0) p = '62' + p;
  return p;
}

function formatNumber_(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

function deleteRowsWhere_(sheetName, field, value) {
  const sh = sheet_(sheetName);
  const col = headerIndex_(sheetName, field);
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][col] === value) sh.deleteRow(i + 1);
  }
}

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

// ====================== AUTH ======================

function checkSuperAdmin_(token) {
  token = String(token || '').replace(/\s+/g, '').toUpperCase();
  const real = String(PropertiesService.getScriptProperties().getProperty('SUPER_ADMIN_TOKEN') || '').replace(/\s+/g, '').toUpperCase();
  return !!token && token === real;
}

function findToken_(token, role) {
  const clean = String(token || '').replace(/\s+/g, '').toUpperCase();
  return getRows_(SHEETS.TOKENS).find(t =>
    String(t.TokenID || '').replace(/\s+/g, '').toUpperCase() === clean &&
    String(t.Role || '').trim() === role
  );
}

function checkAdmin_(token) {
  if (checkSuperAdmin_(token)) return true;
  const t = findToken_(token, 'Admin');
  return !!t && t.Status === 'Active';
}

/**
 * Used by the landing page to figure out which dashboard to show for a given token.
 */
function loginWithToken(token) {
  // 1. Strip absolutely all whitespace (including hidden characters) and force uppercase
  token = String(token || '').replace(/\s+/g, '').toUpperCase();

  if (checkSuperAdmin_(token)) return { role: 'SuperAdmin', alias: 'SuperAdmin' };

  const allTokens = getRows_(SHEETS.TOKENS);

  // 2. Search the database with the same strict cleaning
  const match = allTokens.find(t => {
    const rowToken = String(t.TokenID || '').replace(/\s+/g, '').toUpperCase();
    return rowToken === token;
  });

  if (!match) {
    throw new Error('DEBUG: Token [' + token + '] sama sekali tidak ditemukan di Google Sheet.');
  }

  const role = String(match.Role || '').trim().toLowerCase();
  const status = String(match.Status || '').trim().toLowerCase();
  const alias = match.Alias ? String(match.Alias).trim() : '';

  if (role === 'admin') {
    if (status === 'active') return { role: 'Admin', alias: alias };
    throw new Error('DEBUG: Token Admin ditemukan, tapi statusnya tercatat sebagai [' + status + '].');
  }

  if (role === 'pic') {
    if (status !== 'expired') return { role: 'PIC', alias: alias };
    throw new Error('DEBUG: Token PIC ditemukan, tapi statusnya sudah Expired.');
  }

  throw new Error('DEBUG: Token ditemukan, tapi Role tidak dikenali [' + role + '].');
}

// ====================== TOKEN MANAGEMENT ======================


function generatePicToken(callerToken) {
  if (!checkAdmin_(callerToken)) throw new Error('Not authorized');
  const id = 'PIC-' + Utilities.getUuid().split('-')[0].toUpperCase();
  sheet_(SHEETS.TOKENS).appendRow([id, 'PIC', 'Unused', '', callerToken, new Date()]);
  return id;
}

function revokeToken(callerToken, tokenId) {
  if (!checkAdmin_(callerToken)) throw new Error('Not authorized');
  const tok = getRows_(SHEETS.TOKENS).find(t => t.TokenID === tokenId);
  if (!tok) throw new Error('Token not found');
  sheet_(SHEETS.TOKENS).getRange(tok._row, headerIndex_(SHEETS.TOKENS, 'Status') + 1).setValue('Expired');
  return true;
}

function listTokens(callerToken) {
  if (!checkAdmin_(callerToken)) throw new Error('Not authorized');
  return getRows_(SHEETS.TOKENS).map(stripRow_);
}

// ====================== CAMPAIGN COMPUTATION ======================

/**
 * Splits `total` among `n` donors.
 * - If rounding disabled: integer division, remainder distributed (first donors pay +1)
 *   so the sum always equals `total` exactly.
 * - If rounding enabled: every donor pays ceil((total/n)/roundTo)*roundTo. This may
 *   collect slightly more than `total` (the small overage acts as a buffer/fees).
 */
function computeAmounts_(total, n, enableRounding, roundTo) {
  total = Number(total);
  n = Number(n);
  if (n <= 0) return [];

  if (enableRounding) {
    const per = Math.ceil((total / n) / roundTo) * roundTo;
    return new Array(n).fill(per);
  }

  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(i < remainder ? base + 1 : base);
  return arr;
}

function getPublicSettings() {
  return {
    enableRounding: String(getSetting('EnableRounding')).toUpperCase() === 'TRUE',
    roundTo: Number(getSetting('RoundToNearest')) || 500
  };
}

// ====================== PIC FUNCTIONS ======================

function createCampaign(picToken, data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const tok = findToken_(picToken, 'PIC');
    if (!tok) throw new Error('Token PIC tidak valid.');
    if (tok.Status === 'Expired') throw new Error('Token PIC sudah tidak aktif.');
    if (tok.Status === 'Active' && tok.LinkedCampaignID) {
      throw new Error('Token ini sudah dipakai untuk campaign ' + tok.LinkedCampaignID + '.');
    }

    if (!data.targetName || !data.deadline) {
      throw new Error('Nama target dan deadline wajib diisi.');
    }

    const id = 'C-' + Utilities.getUuid().split('-')[0].toUpperCase();
    const now = new Date();
    const finalAmount = Number(data.giftAmount) || 0;

    // 1. Write the new campaign to the database
    sheet_(SHEETS.CAMPAIGNS).appendRow([
      id, String(data.targetName), String(data.reason || ''), finalAmount, 'Open',
      String(data.startDate || ''), String(data.deadline), '', '', '', '', '', now, '', '', '', '', ''
    ]);

    // 2. BULLETPROOF TOKEN UPDATE: Link the campaign ID to the PIC token
    const tSheet = sheet_(SHEETS.TOKENS);

    // Grab the headers to dynamically find the correct columns
    const headers = tSheet.getRange(1, 1, 1, tSheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
    const statusCol = headers.indexOf('Status') + 1;
    const linkCol = headers.indexOf('LinkedCampaignID') + 1;

    // Use Google's native text finder to locate the exact row containing the Token ID
    const cell = tSheet.createTextFinder(tok.TokenID).matchEntireCell(true).findNext();

    if (cell) {
      const physicalRow = cell.getRow();
      // Safely update the exact row and columns without offset errors
      tSheet.getRange(physicalRow, statusCol).setValue('Active');
      tSheet.getRange(physicalRow, linkCol).setValue(id);
    } else {
      throw new Error('Gagal mengupdate Token: TokenID tidak ditemukan secara fisik di database.');
    }

    SpreadsheetApp.flush();

    // 3. Return the sanitized data to the frontend
    return {
      campaign: {
        CampaignID: id,
        TargetName: String(data.targetName),
        Reason: String(data.reason || ''),
        GiftAmount: finalAmount,
        Status: 'Open',
        StartDate: String(data.startDate || ''),
        Deadline: String(data.deadline),
        BankName: '',
        BankAccount: '',
        AccountHolder: '',
        RoundingUsed: '',
        RoundTo: '',
        CreatedAt: now.toISOString(),
        FinalizedAt: ''
      },
      donors: []
    };

  } finally {
    lock.releaseLock();
  }
}

function getCampaignDetail_(campaignId) {
  // 1. Aggressively clean the ID we are looking for
  campaignId = String(campaignId || '').trim();

  // 2. Aggressively clean the ID in the database while searching
  const campaign = getRows_(SHEETS.CAMPAIGNS).find(c => String(c.CampaignID || '').trim() === campaignId);

  if (!campaign) return null; // If it still fails, it genuinely doesn't exist

  // 3. Clean the IDs when pulling the donor list
  const donors = getRows_(SHEETS.DONORS)
    .filter(d => String(d.CampaignID || '').trim() === campaignId && String(d.DonorStatus || '').trim() === 'Pledged')
    .map(stripRow_);

  return { campaign: stripRow_(campaign), donors: donors };
}

function getCampaignForPic(picToken) {
  const tok = findToken_(picToken, 'PIC');
  if (!tok) throw new Error('Token PIC tidak valid.');

  const status = String(tok.Status || '').trim().toLowerCase();
  if (status === 'expired') throw new Error('Token PIC sudah tidak aktif.');

  const linkedId = String(tok.LinkedCampaignID || '').trim();

  // If the token has no Linked Campaign ID...
  if (!linkedId) {
    // PREVENT DUPLICATES: If they are already active, block the create form!
    if (status === 'active') {
      throw new Error('Token ini tercatat sudah aktif tapi kehilangan link ke Campaign. Silakan hubungi Admin untuk mengecek database.');
    }
    // Genuinely new token, safe to show the create form
    return null;
  }

  // If we have an ID, we MUST find it.
  const detail = getCampaignDetail_(linkedId);
  if (!detail) {
    throw new Error('Campaign dengan ID [' + linkedId + '] tidak ditemukan di database.');
  }

  return detail;
}

function setCampaignField_(campaignId, field, value) {
  const sh = sheet_(SHEETS.CAMPAIGNS);
  const col = headerIndex_(SHEETS.CAMPAIGNS, field) + 1;
  const idCol = headerIndex_(SHEETS.CAMPAIGNS, 'CampaignID');
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === campaignId) { sh.getRange(i + 1, col).setValue(value); return; }
  }
}

function closeCampaignList(picToken) {
  const tok = requirePicCampaign_(picToken);
  const detail = getCampaignDetail_(tok.LinkedCampaignID);
  if (detail.campaign.Status !== 'Open') throw new Error('Campaign sedang tidak dalam status Open.');
  setCampaignField_(tok.LinkedCampaignID, 'Status', 'Closed');
  return getCampaignDetail_(tok.LinkedCampaignID);
}

function reopenCampaignList(picToken) {
  const tok = requirePicCampaign_(picToken);
  const detail = getCampaignDetail_(tok.LinkedCampaignID);
  if (detail.campaign.Status !== 'Closed') throw new Error('Campaign sedang tidak dalam status Closed.');
  setCampaignField_(tok.LinkedCampaignID, 'Status', 'Open');
  return getCampaignDetail_(tok.LinkedCampaignID);
}

function requirePicCampaign_(picToken) {
  const tok = findToken_(picToken, 'PIC');
  if (!tok) throw new Error('Token PIC tidak valid.');
  if (!tok.LinkedCampaignID) throw new Error('Token ini belum punya campaign.');
  return tok;
}

function finalizeCampaign(picToken, bankInfo, finalGiftAmount, fileData) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const tok = requirePicCampaign_(picToken);
    const detail = getCampaignDetail_(tok.LinkedCampaignID);
    const campaign = detail.campaign;
    const donors = detail.donors;

    if (campaign.Status === 'Finalized' || campaign.Status === 'Archived') {
      throw new Error('Campaign sudah difinalisasi sebelumnya.');
    }
    if (donors.length === 0) throw new Error('Belum ada yang join, tidak bisa difinalisasi.');
    if (!bankInfo.bankName || !bankInfo.bankAccount || !bankInfo.accountHolder) {
      throw new Error('Info rekening bank wajib diisi.');
    }

    // NEW: Ensure the PIC input a valid amount before dividing
    finalGiftAmount = Number(finalGiftAmount);
    if (!finalGiftAmount || finalGiftAmount <= 0) {
      throw new Error('Total nilai hadiah akhir wajib diisi sebelum finalisasi.');
    }

    const enableRounding = String(getSetting('EnableRounding')).toUpperCase() === 'TRUE';
    const roundTo = Number(getSetting('RoundToNearest')) || 500;

    // Compute the split using the NEW final amount
    const donorSheet = sheet_(SHEETS.DONORS);
    const amtCol = headerIndex_(SHEETS.DONORS, 'AmountDue') + 1;
    const allDonorRows = getRows_(SHEETS.DONORS).filter(d => d.CampaignID === campaign.CampaignID && d.DonorStatus === 'Pledged');

    let customSum = 0;
    let regularCount = 0;

    allDonorRows.forEach(d => {
      let customVal = Number(d.CustomAmount) || 0;
      if (customVal > 0) {
        customSum += customVal;
      } else {
        regularCount++;
      }
    });

    let remainingGoal = finalGiftAmount - customSum;
    if (remainingGoal < 0) remainingGoal = 0;

    const regularAmounts = computeAmounts_(remainingGoal, regularCount, enableRounding, roundTo);

    let regularIdx = 0;
    const finalAmounts = [];
    allDonorRows.forEach(d => {
      let customVal = Number(d.CustomAmount) || 0;
      if (customVal > 0) {
        finalAmounts.push(customVal);
      } else {
        finalAmounts.push(regularAmounts[regularIdx]);
        regularIdx++;
      }
    });

    allDonorRows.forEach((d, idx) => donorSheet.getRange(d._row, amtCol).setValue(finalAmounts[idx]));

    let imageUrl = '';
    if (fileData) {
      const folderId = getSetting('ProofsFolderId');
      if (!folderId) throw new Error('Folder penyimpanan belum disetup oleh Super Admin.');
      const folder = DriveApp.getFolderById(folderId);
      const blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.type, 'Price_' + campaign.CampaignID + '_' + fileData.name);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      imageUrl = file.getUrl();
    }

    setCampaignField_(campaign.CampaignID, 'Status', 'Finalized');
    setCampaignField_(campaign.CampaignID, 'GiftAmount', finalGiftAmount); // Update the master record
    setCampaignField_(campaign.CampaignID, 'BankName', bankInfo.bankName);
    setCampaignField_(campaign.CampaignID, 'BankAccount', bankInfo.bankAccount);
    setCampaignField_(campaign.CampaignID, 'AccountHolder', bankInfo.accountHolder);
    setCampaignField_(campaign.CampaignID, 'RoundingUsed', enableRounding);
    setCampaignField_(campaign.CampaignID, 'RoundTo', roundTo);
    setCampaignField_(campaign.CampaignID, 'FinalizedAt', new Date());
    setCampaignField_(campaign.CampaignID, 'GiftLink', bankInfo.giftLink || '');
    if (imageUrl) setCampaignField_(campaign.CampaignID, 'GiftImage', imageUrl);

    return getCampaignDetail_(campaign.CampaignID);
  } finally {
    lock.releaseLock();
  }
}

function updateGiftProof(picToken, link, fileData) {
  const tok = requirePicCampaign_(picToken);
  const campaignId = tok.LinkedCampaignID;
  const detail = getCampaignDetail_(campaignId);
  if (detail.campaign.Status !== 'Finalized') throw new Error('Hanya bisa diupload jika campaign sudah Finalized.');

  if (link !== undefined && link !== null) {
    setCampaignField_(campaignId, 'GiftLink', link);
  }

  if (fileData) {
    const folderId = getSetting('ProofsFolderId');
    if (!folderId) throw new Error('Folder penyimpanan belum disetup oleh Super Admin.');
    const folder = DriveApp.getFolderById(folderId);
    const blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.type, 'Gift_' + campaignId + '_' + fileData.name);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    setCampaignField_(campaignId, 'GiftImage', file.getUrl());
  }

  return true;
}

function archiveCampaign(picToken) {
  const tok = requirePicCampaign_(picToken);
  setCampaignField_(tok.LinkedCampaignID, 'Status', 'Archived');
  sheet_(SHEETS.TOKENS).getRange(tok._row, headerIndex_(SHEETS.TOKENS, 'Status') + 1).setValue('Expired');
  return true;
}

/**
 * Returns a ready-to-copy bulk reminder message for the WhatsApp group, plus
 * per-person wa.me deep links for unpaid donors only.
 */
function getReminderInfo(picToken) {
  const tok = requirePicCampaign_(picToken);
  const detail = getCampaignDetail_(tok.LinkedCampaignID);
  const campaign = detail.campaign;
  if (campaign.Status !== 'Finalized') throw new Error('Campaign belum difinalisasi.');

  const unpaid = detail.donors.filter(d => String(d.Paid).toUpperCase() !== 'TRUE');
  const names = unpaid.map(d => d.Name);

  const bulkLines = [
    `Halo semua, reminder donasi untuk "${campaign.TargetName}".`,
    `Yang belum konfirmasi transfer (${unpaid.length} orang):`,
    names.length ? '- ' + names.join('\n- ') : '(semua sudah konfirmasi, terima kasih!)',
    '',
    `Silakan transfer sesuai nominal masing-masing ke:`,
    `${campaign.BankName} ${campaign.BankAccount} a.n. ${campaign.AccountHolder}`,
    `Lalu submit bukti transfer lewat web ini ya. Terima kasih!`
  ];

  const personal = unpaid.map(d => ({
    name: d.Name,
    whatsapp: d.WhatsApp,
    amount: d.AmountDue,
    waLink: 'https://wa.me/' + normalizePhone_(d.WhatsApp) + '?text=' + encodeURIComponent(
      `Hi ${d.Name}, reminder ya untuk donasi "${campaign.TargetName}". ` +
      `Mohon transfer Rp${formatNumber_(d.AmountDue)} ke ${campaign.BankName} ${campaign.BankAccount} ` +
      `a.n. ${campaign.AccountHolder}, lalu konfirmasi di web. Makasih!`
    )
  }));

  return { bulkMessage: bulkLines.join('\n'), personal: personal, unpaidCount: unpaid.length, totalDonors: detail.donors.length };
}

// ====================== USER FUNCTIONS ======================

function checkDonorWhatsApp(whatsapp) {
  whatsapp = normalizePhone_(whatsapp);
  if (!whatsapp) throw new Error('Nomor WhatsApp wajib diisi.');
  
  const members = getRows_(SHEETS.MEMBERS);
  const existingMember = members.find(m => normalizePhone_(m.WhatsApp) === whatsapp);
  
  const requireValidation = String(getSetting('RequireMemberValidation')).toUpperCase() === 'TRUE';
  
  if (existingMember) {
    if (requireValidation) {
      const currentStatus = String(existingMember.Status).toLowerCase();
      if (currentStatus === 'pending') {
        return { exists: true, pending: true, message: 'Pendaftaran Anda sedang diproses. Mohon tunggu persetujuan Admin agar dapat masuk.' };
      }
      if (currentStatus !== 'active' && currentStatus !== 'ex') {
        throw new Error('Akun Anda tidak aktif. Hubungi Admin.');
      }
    }
    // Successfully verified / logged in
    return { exists: true, name: existingMember.Name, whatsapp: whatsapp, verified: true, status: existingMember.Status };
  }
  
  return { exists: false };
}

function registerUser(name, whatsapp, empStatus = 'active') {
  // 1. Concurrency Control: Locks the script to prevent database collisions
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    name = String(name || '').trim();
    whatsapp = normalizePhone_(whatsapp);

    // Guardrail: Ensure fields are not blank
    if (!name || !whatsapp) throw new Error('Nama dan No. WhatsApp wajib diisi.');

    const requireValidation = String(getSetting('RequireMemberValidation')).toUpperCase() === 'TRUE';
    const members = getRows_(SHEETS.MEMBERS);
    const existingMember = members.find(m => normalizePhone_(m.WhatsApp) === whatsapp);

    // 2. Validation Logic
    if (requireValidation) {
      if (existingMember) {
        const currentStatus = String(existingMember.Status).toLowerCase();
        // Check if they are already pending
        if (currentStatus === 'pending') {
          return { pending: true, message: 'Pendaftaran Anda sedang diproses. Mohon tunggu persetujuan Admin agar dapat masuk.' };
        }
        // Check if they are active
        if (currentStatus !== 'active' && currentStatus !== 'ex') {
          throw new Error('Akun Anda tidak aktif. Hubungi Admin.');
        }
        // Successfully verified
        return { name: existingMember.Name, whatsapp: whatsapp, verified: true, status: currentStatus };

      } else {
        // 3. Self-Registration Logic
        if (!empStatus) {
          throw new Error('Pendaftaran baru: Harap pilih Status Karyawan Anda.');
        }

        // If they are not in the database, append them as 'Pending'
        sheet_(SHEETS.MEMBERS).appendRow([name, whatsapp, 'Pending', 'Self-Registered - ' + empStatus, new Date()]);

        // We return a pending object so the frontend can show a clean UI modal
        return { pending: true, message: 'Pendaftaran berhasil dikirim! Mohon tunggu persetujuan dari Admin sebelum Anda bisa masuk.' };
      }
    }

    // 4. Fallback: If validation is turned off in Settings, let anyone in
    return { name: name, whatsapp: whatsapp, verified: false };

  } finally {
    // Release the script lock so other users can register
    lock.releaseLock();
  }
}

function listActiveCampaigns(whatsapp) {
  whatsapp = normalizePhone_(whatsapp);

  // Added c.CampaignID to filter out any accidental blank rows at the bottom of the sheet
  const campaigns = getRows_(SHEETS.CAMPAIGNS).filter(c => String(c.Status) !== 'Archived' && c.CampaignID);
  const donors = getRows_(SHEETS.DONORS).filter(d => d.CampaignID);

  const list = campaigns.map(c => {
    const pledged = donors.filter(d => d.CampaignID === c.CampaignID && d.DonorStatus === 'Pledged');
    const mine = pledged.find(d => normalizePhone_(d.WhatsApp) === whatsapp);

    const result = {
      campaignId: String(c.CampaignID),
      targetName: String(c.TargetName),
      reason: String(c.Reason || ''),
      giftAmount: Number(c.GiftAmount) || 0,
      status: String(c.Status),

      // BULLETPROOF: If Sheets auto-converted to a Date, force it back to a safe String
      startDate: c.StartDate instanceof Date ? c.StartDate.toISOString().split('T')[0] : String(c.StartDate || ''),
      deadline: c.Deadline instanceof Date ? c.Deadline.toISOString().split('T')[0] : String(c.Deadline || ''),
      createdAt: c.CreatedAt instanceof Date ? c.CreatedAt.getTime() : 0,

      donorCount: pledged.length,
      joined: !!mine
    };

    if (String(c.Status) === 'Finalized') {
      result.GiftLink = String(c.GiftLink || '');
      result.GiftImage = String(c.GiftImage || '');
      if (mine) {
        result.amountDue = Number(mine.AmountDue) || 0;
        result.bankName = String(c.BankName || '');
        result.bankAccount = String(c.BankAccount || '');
        result.accountHolder = String(c.AccountHolder || '');
        result.paid = String(mine.Paid).toUpperCase() === 'TRUE';
        result.proofLink = String(mine.ProofLink || '');
      }
    }
    return result;
  });

  // Sort safely using the numeric createdAt timestamp
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

function joinCampaign(campaignId, name, whatsapp, customAmount, alias) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    whatsapp = normalizePhone_(whatsapp);
    const campaign = getRows_(SHEETS.CAMPAIGNS).find(c => c.CampaignID === campaignId);
    if (!campaign) throw new Error('Campaign tidak ditemukan.');
    if (campaign.Status !== 'Open') throw new Error('Pendaftaran untuk campaign ini sudah ditutup.');

    const donors = getRows_(SHEETS.DONORS);
    const existing = donors.find(d => d.CampaignID === campaignId && normalizePhone_(d.WhatsApp) === whatsapp);
    const statusCol = headerIndex_(SHEETS.DONORS, 'DonorStatus') + 1;

    let customCol = headerIndex_(SHEETS.DONORS, 'CustomAmount') + 1;
    if (customCol === 0) {
      const sh = sheet_(SHEETS.DONORS);
      sh.getRange(1, sh.getLastColumn() + 1).setValue('CustomAmount');
      customCol = sh.getLastColumn();
    }

    const finalCustomAmount = Number(customAmount) || 0;

    if (existing) {
      if (existing.DonorStatus === 'Pledged') throw new Error('Anda sudah terdaftar di campaign ini.');
      const sh = sheet_(SHEETS.DONORS);
      sh.getRange(existing._row, statusCol).setValue('Pledged');
      if (customCol > 0) {
        sh.getRange(existing._row, customCol).setValue(finalCustomAmount > 0 ? finalCustomAmount : '');
      }
      
      let aliasCol = headerIndex_(SHEETS.DONORS, 'Alias') + 1;
      if (aliasCol > 0) {
        sh.getRange(existing._row, aliasCol).setValue(alias || '');
      }
      
      return true;
    }

    const newRow = [campaignId, name, whatsapp, new Date(), 'Pledged', '', 'FALSE', '', '', finalCustomAmount > 0 ? finalCustomAmount : '', '', 'FALSE', 'FALSE', alias || ''];
    sheet_(SHEETS.DONORS).appendRow(newRow);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function withdrawCampaign(campaignId, whatsapp) {
  whatsapp = normalizePhone_(whatsapp);
  const campaign = getRows_(SHEETS.CAMPAIGNS).find(c => c.CampaignID === campaignId);
  if (!campaign || campaign.Status !== 'Open') throw new Error('Tidak bisa keluar, daftar sudah ditutup.');

  const existing = getRows_(SHEETS.DONORS).find(d =>
    d.CampaignID === campaignId && normalizePhone_(d.WhatsApp) === whatsapp && d.DonorStatus === 'Pledged');
  if (!existing) throw new Error('Anda tidak terdaftar di campaign ini.');

  sheet_(SHEETS.DONORS).getRange(existing._row, headerIndex_(SHEETS.DONORS, 'DonorStatus') + 1).setValue('Withdrawn');
  return true;
}

/**
 * fileData: { base64: string, mimeType: string, fileName: string }
 */
function submitPaymentProof(campaignId, whatsapp, fileData) {
  whatsapp = normalizePhone_(whatsapp);
  const existing = getRows_(SHEETS.DONORS).find(d =>
    d.CampaignID === campaignId && normalizePhone_(d.WhatsApp) === whatsapp && d.DonorStatus === 'Pledged');
  if (!existing) throw new Error('Anda tidak terdaftar di campaign ini.');

  const folderId = getSetting('ProofsFolderId');
  const folder = DriveApp.getFolderById(folderId);
  const blob = Utilities.newBlob(Utilities.base64Decode(fileData.base64), fileData.mimeType, fileData.fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const sh = sheet_(SHEETS.DONORS);
  sh.getRange(existing._row, headerIndex_(SHEETS.DONORS, 'Paid') + 1).setValue('TRUE');
  sh.getRange(existing._row, headerIndex_(SHEETS.DONORS, 'ProofLink') + 1).setValue(file.getUrl());
  sh.getRange(existing._row, headerIndex_(SHEETS.DONORS, 'PaidAt') + 1).setValue(new Date());
  sh.getRange(existing._row, headerIndex_(SHEETS.DONORS, 'AmountPaid') + 1).setValue(existing.AmountDue || 0); // Snapshot original bill
  return file.getUrl();
}

// ====================== LATE DONOR REQUESTS ======================

function requestLateDonor(picToken, donorName, donorWhatsApp, isCustom, customAmount, reason, realRequestorToken, donorAlias) {
  const tok = requirePicCampaign_(picToken);
  const campaignId = tok.LinkedCampaignID;
  
  // By default, assume it's just the PIC submitting
  let picAlias = 'PIC';
  const campObj = getRows_(SHEETS.CAMPAIGNS).find(c => c.CampaignID === campaignId);
  if (campObj) picAlias = 'PIC (' + campObj.TargetName + ')';
  
  // If Deep Dive is active, the frontend sends the real token
  if (realRequestorToken) {
    const rTok = findToken_(realRequestorToken, 'SuperAdmin') || findToken_(realRequestorToken, 'Admin');
    if (rTok) picAlias = rTok.Role === 'SuperAdmin' ? 'SuperAdmin' : 'Admin (' + (rTok.Alias || 'No Alias') + ')';
  }
  
  const sh = sheet_(SHEETS.LATE_REQUESTS);
  const reqId = 'REQ-' + Utilities.getUuid().split('-')[0].toUpperCase();
  const cAmt = isCustom ? (Number(customAmount) || 0) : '';
  
  sh.appendRow([reqId, campaignId, picAlias, donorName.trim(), normalizePhone_(donorWhatsApp), isCustom ? 'TRUE' : 'FALSE', cAmt, reason.trim(), 'Pending', new Date(), donorAlias || '']);
  return { success: true, reqId: reqId };
}

function fixLateRequestsDB() {
  const sh = sheet_(SHEETS.LATE_REQUESTS);
  if (!sh) return;
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return;
  
  const expectedHeaders = HEADERS.LateRequests;
  const currentHeaders = data[0].map(h => String(h).trim());
  
  // If headers perfectly match, no need to fix
  if (expectedHeaders.join(',') === currentHeaders.join(',')) {
    return;
  }
  
  const newData = [expectedHeaders];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Check if it's the new format written blindly (10 columns, col index 8 is 'Pending')
    if (String(row[8]).trim() === 'Pending' || String(row[8]).trim() === 'Approved' || String(row[8]).trim() === 'Rejected') {
      // It's the new format!
      newData.push(row);
    } 
    // Check if it's the old format (9 columns, col index 7 is 'Pending')
    else if (String(row[7]).trim() === 'Pending' || String(row[7]).trim() === 'Approved' || String(row[7]).trim() === 'Rejected') {
      // It's the old format. Insert an empty string for PIC_Alias at index 2
      const newRow = [...row];
      newRow.splice(2, 0, ''); 
      newData.push(newRow);
    } else {
      // Unknown format, try to preserve as best as possible
      newData.push(row);
    }
  }
  
  // Ensure every row has exactly expectedHeaders.length columns to avoid jagged array errors in setValues
  for (let i = 0; i < newData.length; i++) {
    while (newData[i].length < expectedHeaders.length) newData[i].push('');
    if (newData[i].length > expectedHeaders.length) newData[i] = newData[i].slice(0, expectedHeaders.length);
  }
  
  // Overwrite the sheet
  sh.clear();
  sh.getRange(1, 1, newData.length, expectedHeaders.length).setValues(newData);
}

function getPendingLateRequests(adminToken) {
  if (!checkAdmin_(adminToken)) throw new Error('Not authorized');
  
  // Auto-fix DB before reading
  fixLateRequestsDB();
  
  const reqs = getRows_(SHEETS.LATE_REQUESTS).filter(r => String(r.Status).trim() === 'Pending');
  const campaigns = getRows_(SHEETS.CAMPAIGNS);
  
  // Remove duplicates based on DonorWhatsApp + CampaignID for pending requests
  const uniqueReqs = [];
  const seen = new Set();
  
  for (const r of reqs) {
    const key = r.CampaignID + '_' + r.DonorWhatsApp;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueReqs.push(r);
    } else {
      const rowNum = r._row;
      sheet_(SHEETS.LATE_REQUESTS).getRange(rowNum, headerIndex_(SHEETS.LATE_REQUESTS, 'Status') + 1).setValue('Duplicate');
    }
  }
  
  return uniqueReqs.map(r => {
    const camp = campaigns.find(c => c.CampaignID === r.CampaignID) || {};
    // CRITICAL: google.script.run silently converts objects containing Date to NULL.
    // We MUST convert all Date fields to strings before returning to the frontend.
    let createdAtStr = '';
    if (r.CreatedAt instanceof Date) {
      createdAtStr = r.CreatedAt.toISOString();
    } else if (r.CreatedAt) {
      createdAtStr = String(r.CreatedAt);
    }
    
    return {
      reqId: String(r.RequestID || ''),
      campaignId: String(r.CampaignID || ''),
      targetName: String(camp.TargetName || 'Unknown Campaign'),
      pic: String(r.PIC_Alias || ''),
      donorName: String(r.DonorName || ''),
      donorWhatsApp: String(r.DonorWhatsApp || ''),
      isCustom: String(r.IsCustom).toUpperCase() === 'TRUE',
      customAmount: Number(r.CustomAmount) || 0,
      reason: String(r.Reason || ''),
      createdAt: createdAtStr
    };
  });
}

function approveLateDonor(adminToken, reqId, isApproved) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!checkAdmin_(adminToken)) throw new Error('Not authorized');
    const sh = sheet_(SHEETS.LATE_REQUESTS);
    const req = getRows_(SHEETS.LATE_REQUESTS).find(r => r.RequestID === reqId && r.Status === 'Pending');
    if (!req) throw new Error('Request tidak ditemukan atau sudah diproses.');
    
    if (!isApproved) {
      sh.getRange(req._row, headerIndex_(SHEETS.LATE_REQUESTS, 'Status') + 1).setValue('Rejected');
      SpreadsheetApp.flush();
      return true;
    }

    const campaignId = req.CampaignID;
    const donorPhone = req.DonorWhatsApp;
    
    // Auto-register member if not exists
    const memSheet = sheet_(SHEETS.MEMBERS);
    const existingMem = getRows_(SHEETS.MEMBERS).find(m => normalizePhone_(m.WhatsApp) === donorPhone);
    if (!existingMem) {
      memSheet.appendRow([req.DonorName, donorPhone, 'active', 'Admin-LateApprove', new Date()]);
    }
    
    // Inject donor
    const donSheet = sheet_(SHEETS.DONORS);
    const existingDonor = getRows_(SHEETS.DONORS).find(d => d.CampaignID === campaignId && normalizePhone_(d.WhatsApp) === donorPhone);
    if (!existingDonor) {
      const isCust = String(req.IsCustom).toUpperCase() === 'TRUE';
      donSheet.appendRow([campaignId, req.DonorName, donorPhone, new Date(), 'Pledged', 0, 'FALSE', '', '', isCust ? Number(req.CustomAmount) : '', '', 'FALSE', 'FALSE', req.DonorAlias || '']);
    }

    // Recalculate everything
    recalculateCampaignMath_(campaignId);
    
    // Update request status
    sh.getRange(req._row, headerIndex_(SHEETS.LATE_REQUESTS, 'Status') + 1).setValue('Approved');
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return { error: e.message || String(e) };
  } finally {
    lock.releaseLock();
  }
}

function recalculateCampaignMath_(campaignId) {
  const cDetail = getCampaignDetail_(campaignId);
  const campaign = cDetail.campaign;
  const finalGiftAmount = Number(campaign.GiftAmount);
  if (!finalGiftAmount) return;

  const enableRounding = String(campaign.RoundingUsed).toUpperCase() === 'TRUE';
  const roundTo = Number(campaign.RoundTo) || 500;

  const donorSheet = sheet_(SHEETS.DONORS);
  const amtCol = headerIndex_(SHEETS.DONORS, 'AmountDue') + 1;
  const allDonorRows = getRows_(SHEETS.DONORS).filter(d => d.CampaignID === campaignId && d.DonorStatus === 'Pledged');

  let customSum = 0;
  let regularCount = 0;

  allDonorRows.forEach(d => {
    let customVal = Number(d.CustomAmount) || 0;
    if (customVal > 0) { customSum += customVal; } else { regularCount++; }
  });
  let remainingGoal = finalGiftAmount - customSum;
  if (remainingGoal < 0) remainingGoal = 0;

  const regularAmounts = computeAmounts_(remainingGoal, regularCount, enableRounding, roundTo);

  let regularIdx = 0;
  allDonorRows.forEach(d => {
    let finalAmount = 0;
    let customVal = Number(d.CustomAmount) || 0;
    if (customVal > 0) {
      finalAmount = customVal;
    } else {
      finalAmount = regularAmounts[regularIdx];
      regularIdx++;
    }
    donorSheet.getRange(d._row, amtCol).setValue(finalAmount);
  });
}

// 10. PIC: Verify Payment Proof
function picVerifyPayment(picToken, campaignId, whatsapp, isValid) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const tok = findToken_(picToken, 'PIC');
    if (!tok || tok.Status === 'Expired') throw new Error('Token PIC tidak valid.');
    if (String(tok.LinkedCampaignID).trim() !== String(campaignId).trim()) throw new Error('Not authorized for this campaign');

    whatsapp = normalizePhone_(whatsapp);
    const sh = sheet_(SHEETS.DONORS);
    const existing = getRows_(SHEETS.DONORS).find(d =>
      d.CampaignID === campaignId && normalizePhone_(d.WhatsApp) === whatsapp && d.DonorStatus === 'Pledged');
    if (!existing) throw new Error('Donatur tidak ditemukan.');
    if (isValid) {
      sh.getRange(existing._row, headerIndex_(SHEETS.DONORS, 'Verified') + 1).setValue('TRUE');
    } else {
      sh.getRange(existing._row, headerIndex_(SHEETS.DONORS, 'Paid') + 1).setValue('FALSE');
      sh.getRange(existing._row, headerIndex_(SHEETS.DONORS, 'ProofLink') + 1).setValue('');
      sh.getRange(existing._row, headerIndex_(SHEETS.DONORS, 'Verified') + 1).setValue('FALSE');
    }

    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return { error: e.message || String(e) };
  } finally {
    lock.releaseLock();
  }
}

// 11. PIC: Mark Refund as Settled
function picMarkRefunded(picToken, campaignId, whatsapp) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const tok = findToken_(picToken, 'PIC');
    if (!tok || tok.Status === 'Expired') throw new Error('Token PIC tidak valid.');
    if (String(tok.LinkedCampaignID).trim() !== String(campaignId).trim()) throw new Error('Not authorized for this campaign');

    whatsapp = normalizePhone_(whatsapp);
    const sh = sheet_(SHEETS.DONORS);
    const existing = getRows_(SHEETS.DONORS).find(d =>
      d.CampaignID === campaignId && normalizePhone_(d.WhatsApp) === whatsapp && d.DonorStatus === 'Pledged');
    if (!existing) throw new Error('Donatur tidak ditemukan.');

    sh.getRange(existing._row, headerIndex_(SHEETS.DONORS, 'Refunded') + 1).setValue('TRUE');

    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return { error: e.message || String(e) };
  } finally {
    lock.releaseLock();
  }
}

// ====================== MIGRATION SCRIPT ======================
function migrateDatabases_() {
  const updates = [];
  // 1. Members Role Migration
  const shMem = sheet_(SHEETS.MEMBERS);
  const dataMem = shMem.getDataRange().getValues();
  if (dataMem.length) {
    const headers = dataMem[0];
    let roleIdx = headers.indexOf('Role');
    if (roleIdx === -1) {
      roleIdx = headers.length;
      shMem.getRange(1, roleIdx + 1).setValue('Role');
      if (dataMem.length > 1) {
        const range = shMem.getRange(2, roleIdx + 1, dataMem.length - 1, 1);
        range.setValues(new Array(dataMem.length - 1).fill(['Member']));
      }
    } else {
      for (let i = 1; i < dataMem.length; i++) {
        if (!dataMem[i][roleIdx]) updates.push({row: i + 1, col: roleIdx + 1, val: 'Member'});
      }
      updates.forEach(u => shMem.getRange(u.row, u.col).setValue(u.val));
    }
  }

  // 2. Donors Verified & Refunded Migration
  const shDon = sheet_(SHEETS.DONORS);
  const dataDon = shDon.getDataRange().getValues();
  if (dataDon.length) {
    const headers = dataDon[0];
    let vfIdx = headers.indexOf('Verified');
    let rfIdx = headers.indexOf('Refunded');
    let added = false;
    
    if (vfIdx === -1) {
      vfIdx = headers.length;
      shDon.getRange(1, vfIdx + 1).setValue('Verified');
      added = true;
    }
    if (rfIdx === -1) {
      rfIdx = vfIdx + 1;
      shDon.getRange(1, rfIdx + 1).setValue('Refunded');
      added = true;
    }
    
    if (added && dataDon.length > 1) {
      // Initialize with FALSE
      const range = shDon.getRange(2, vfIdx + 1, dataDon.length - 1, 2);
      range.setValues(new Array(dataDon.length - 1).fill(['FALSE', 'FALSE']));
    }
  }
  
  // 3. Late Requests DB Setup
  getOrCreateSheet_(SHEETS.LATE_REQUESTS, ['RequestID', 'CampaignID', 'DonorWhatsApp', 'DonorName', 'DonorAlias', 'Reason', 'IsCustom', 'CustomAmount', 'Status', 'CreatedAt']);
}

// Ensure the old db matches the 10 headers
function fixLateRequestsDB() {
  const sh = sheet_(SHEETS.LATE_REQUESTS);
  const expectedHeaders = ['RequestID', 'CampaignID', 'PIC_Alias', 'DonorWhatsApp', 'DonorName', 'DonorAlias', 'Reason', 'IsCustom', 'CustomAmount', 'Status', 'CreatedAt'];
  
  const data = sh.getDataRange().getValues();
  if (!data || data.length === 0) return;
  
  const currentHeaders = data[0].map(h => String(h).trim());
  if (currentHeaders.length === expectedHeaders.length && currentHeaders.join(',') === expectedHeaders.join(',')) {
    return; // Already fixed
  }
  
  const newData = [expectedHeaders];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Check if it's the new format written blindly (10 columns, col index 8 is 'Pending')
    if (String(row[8]).trim() === 'Pending' || String(row[8]).trim() === 'Approved' || String(row[8]).trim() === 'Rejected') {
      newData.push(row);
    } 
    // Check if it's the old format (9 columns, col index 7 is 'Pending')
    else if (String(row[7]).trim() === 'Pending' || String(row[7]).trim() === 'Approved' || String(row[7]).trim() === 'Rejected') {
      const newRow = [...row];
      newRow.splice(2, 0, ''); 
      newData.push(newRow);
    } else {
      newData.push(row);
    }
  }
  
  for (let i = 0; i < newData.length; i++) {
    while (newData[i].length < expectedHeaders.length) newData[i].push('');
    if (newData[i].length > expectedHeaders.length) newData[i] = newData[i].slice(0, expectedHeaders.length);
  }
  
  sh.clear();
  sh.getRange(1, 1, newData.length, expectedHeaders.length).setValues(newData);
}

function getPendingLateRequests(adminToken) {
  if (!checkAdmin_(adminToken)) throw new Error('Not authorized');
  fixLateRequestsDB();
  const reqs = getRows_(SHEETS.LATE_REQUESTS).filter(r => String(r.Status).trim() === 'Pending');
  const campaigns = getRows_(SHEETS.CAMPAIGNS);
  const uniqueReqs = [];
  const seen = new Set();
  for (const r of reqs) {
    const key = r.CampaignID + '_' + r.DonorWhatsApp;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueReqs.push(r);
    } else {
      const rowNum = r._row;
      sheet_(SHEETS.LATE_REQUESTS).getRange(rowNum, headerIndex_(SHEETS.LATE_REQUESTS, 'Status') + 1).setValue('Duplicate');
    }
  }
  return uniqueReqs.map(r => {
    const camp = campaigns.find(c => c.CampaignID === r.CampaignID) || {};
    let createdAtStr = '';
    if (r.CreatedAt instanceof Date) {
      createdAtStr = r.CreatedAt.toISOString();
    } else if (r.CreatedAt) {
      createdAtStr = String(r.CreatedAt);
    }
    return {
      reqId: String(r.RequestID || ''),
      campaignId: String(r.CampaignID || ''),
      targetName: String(camp.TargetName || 'Unknown Campaign'),
      pic: String(r.PIC_Alias || ''),
      donorName: String(r.DonorName || ''),
      donorWhatsApp: String(r.DonorWhatsApp || ''),
      isCustom: String(r.IsCustom).toUpperCase() === 'TRUE',
      customAmount: Number(r.CustomAmount) || 0,
      reason: String(r.Reason || ''),
      createdAt: createdAtStr
    };
  });
}

function approveLateDonor(adminToken, reqId, isApproved) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!checkAdmin_(adminToken)) throw new Error('Not authorized');
    const sh = sheet_(SHEETS.LATE_REQUESTS);
    const req = getRows_(SHEETS.LATE_REQUESTS).find(r => r.RequestID === reqId && r.Status === 'Pending');
    if (!req) throw new Error('Request tidak ditemukan atau sudah diproses.');
    if (!isApproved) {
      sh.getRange(req._row, headerIndex_(SHEETS.LATE_REQUESTS, 'Status') + 1).setValue('Rejected');
      SpreadsheetApp.flush();
      return true;
    }
    const campaignId = req.CampaignID;
    const donorPhone = req.DonorWhatsApp;
    const memSheet = sheet_(SHEETS.MEMBERS);
    const existingMem = getRows_(SHEETS.MEMBERS).find(m => normalizePhone_(m.WhatsApp) === donorPhone);
    if (!existingMem) {
      memSheet.appendRow([req.DonorName, donorPhone, 'active', 'Admin-LateApprove', new Date()]);
    }
    const donSheet = sheet_(SHEETS.DONORS);
    const existingDonor = getRows_(SHEETS.DONORS).find(d => d.CampaignID === campaignId && normalizePhone_(d.WhatsApp) === donorPhone);
    if (!existingDonor) {
      const isCust = String(req.IsCustom).toUpperCase() === 'TRUE';
      donSheet.appendRow([campaignId, req.DonorName, donorPhone, new Date(), 'Pledged', 0, 'FALSE', '', '', isCust ? Number(req.CustomAmount) : '', '', 'FALSE', 'FALSE', req.DonorAlias || '']);
    }
    recalculateCampaignMath_(campaignId);
    sh.getRange(req._row, headerIndex_(SHEETS.LATE_REQUESTS, 'Status') + 1).setValue('Approved');
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return { error: e.message || String(e) };
  } finally {
    lock.releaseLock();
  }
}

function recalculateCampaignMath_(campaignId) {
  const cDetail = getCampaignDetail_(campaignId);
  const campaign = cDetail.campaign;
  const finalGiftAmount = Number(campaign.GiftAmount);
  if (!finalGiftAmount) return;
  const enableRounding = String(campaign.RoundingUsed).toUpperCase() === 'TRUE';
  const roundTo = Number(campaign.RoundTo) || 500;
  const donorSheet = sheet_(SHEETS.DONORS);
  const amtCol = headerIndex_(SHEETS.DONORS, 'AmountDue') + 1;
  const allDonorRows = getRows_(SHEETS.DONORS).filter(d => d.CampaignID === campaignId && d.DonorStatus === 'Pledged');
  let customSum = 0;
  let regularCount = 0;
  allDonorRows.forEach(d => {
    let customVal = Number(d.CustomAmount) || 0;
    if (customVal > 0) { customSum += customVal; } else { regularCount++; }
  });
  let remainingGoal = finalGiftAmount - customSum;
  if (remainingGoal < 0) remainingGoal = 0;
  const regularAmounts = computeAmounts_(remainingGoal, regularCount, enableRounding, roundTo);
  let regularIdx = 0;
  allDonorRows.forEach(d => {
    let finalAmount = 0;
    let customVal = Number(d.CustomAmount) || 0;
    if (customVal > 0) {
      finalAmount = customVal;
    } else {
      finalAmount = regularAmounts[regularIdx];
      regularIdx++;
    }
    donorSheet.getRange(d._row, amtCol).setValue(finalAmount);
  });
}

// ====================== SEAMLESS PIC MANAGEMENT ======================
function getUserPicCampaigns(whatsapp) {
  whatsapp = normalizePhone_(whatsapp);
  const tokens = getRows_(SHEETS.TOKENS).filter(t => t.Role === 'PIC' && normalizePhone_(t.CreatedBy) === whatsapp && t.Status !== 'Expired');
  
  const campaigns = getRows_(SHEETS.CAMPAIGNS);
  const result = [];
  
  tokens.forEach(t => {
    if (!String(t.LinkedCampaignID || '').trim()) {
      result.push({
        picToken: t.TokenID,
        targetName: '(Draft Campaign Baru)',
        status: 'Draft'
      });
    } else {
      const c = campaigns.find(c => c.CampaignID === String(t.LinkedCampaignID).trim());
      if (c && String(c.Status) !== 'Archived') {
        result.push({
          picToken: t.TokenID,
          targetName: String(c.TargetName),
          status: String(c.Status)
        });
      }
    }
  });
  
  return result.sort((a, b) => {
    if (a.status === 'Draft' && b.status !== 'Draft') return -1;
    if (b.status === 'Draft' && a.status !== 'Draft') return 1;
    return 0;
  });
}

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

function sweepArchivedData(superAdminToken) {
  if (!checkSuperAdmin_(superAdminToken)) throw new Error('Not authorized');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const campaignsSheet = sheet_(SHEETS.CAMPAIGNS);
    const donorsSheet = sheet_(SHEETS.DONORS);
    const cArchiveSheet = getOrCreateSheet_('Campaigns_Archive', HEADERS.Campaigns);
    const dArchiveSheet = getOrCreateSheet_('Donors_Archive', HEADERS.Donors);

    const campaignsData = campaignsSheet.getDataRange().getValues();
    const donorsData = donorsSheet.getDataRange().getValues();

    if (campaignsData.length <= 1) return { message: 'Tidak ada data untuk di-sweep.' };

    const cHeaders = campaignsData[0];
    const cStatusIdx = cHeaders.indexOf('Status');
    const cIdIdx = cHeaders.indexOf('CampaignID');

    const dHeaders = donorsData[0];
    const dCampIdIdx = dHeaders.indexOf('CampaignID');

    const archivedCampaignIds = new Set();
    const campaignsToArchive = [];
    const campaignsToKeep = [cHeaders];

    for (let i = 1; i < campaignsData.length; i++) {
      const row = campaignsData[i];
      if (String(row[cStatusIdx]).trim() === 'Archived') {
        archivedCampaignIds.add(String(row[cIdIdx]).trim());
        campaignsToArchive.push(row);
      } else {
        campaignsToKeep.push(row);
      }
    }

    if (campaignsToArchive.length === 0) {
      return { message: 'Tidak ada campaign berstatus Archived.' };
    }

    const donorsToArchive = [];
    const donorsToKeep = [dHeaders];

    for (let i = 1; i < donorsData.length; i++) {
      const row = donorsData[i];
      if (archivedCampaignIds.has(String(row[dCampIdIdx]).trim())) {
        donorsToArchive.push(row);
      } else {
        donorsToKeep.push(row);
      }
    }

    if (campaignsToArchive.length > 0) {
      cArchiveSheet.getRange(cArchiveSheet.getLastRow() + 1, 1, campaignsToArchive.length, cHeaders.length).setValues(campaignsToArchive);
    }
    if (donorsToArchive.length > 0) {
      dArchiveSheet.getRange(dArchiveSheet.getLastRow() + 1, 1, donorsToArchive.length, dHeaders.length).setValues(donorsToArchive);
    }

    campaignsSheet.clear();
    campaignsSheet.getRange(1, 1, campaignsToKeep.length, cHeaders.length).setValues(campaignsToKeep);

    donorsSheet.clear();
    donorsSheet.getRange(1, 1, donorsToKeep.length, dHeaders.length).setValues(donorsToKeep);

    SpreadsheetApp.flush();
    return { message: 'Berhasil sweep ' + campaignsToArchive.length + ' campaign dan ' + donorsToArchive.length + ' donatur ke cold storage.' };

  } finally {
    lock.releaseLock();
  }
}

function getDashboardSummary(adminToken) {
  if (!checkAdmin_(adminToken)) throw new Error('Not authorized');

  const campaigns = getRows_(SHEETS.CAMPAIGNS);
  const donors = getRows_(SHEETS.DONORS);
  const tokens = getRows_(SHEETS.TOKENS);
  const members = getRows_(SHEETS.MEMBERS);

  const summary = {
    campaignsByStatus: { Open: 0, Closed: 0, Finalized: 0 },
    totalDonors: 0,
    totalPending: 0,
    totalCollected: 0,
    picTokens: { unused: 0, active: 0, expired: 0 },
    totalMembers: 0,
    activeMembers: 0
  };

  campaigns.forEach(c => {
    if (summary.campaignsByStatus[c.Status] !== undefined) {
      summary.campaignsByStatus[c.Status]++;
    }
  });

  const pledgedDonors = donors.filter(d => String(d.DonorStatus) === 'Pledged');
  summary.totalDonors = pledgedDonors.length;

  pledgedDonors.forEach(d => {
    const amountDue = Number(d.AmountDue) || 0;
    if (String(d.Paid).toUpperCase() === 'TRUE') {
      summary.totalCollected += (Number(d.AmountPaid) || amountDue);
    } else {
      summary.totalPending += amountDue;
    }
  });

  tokens.filter(t => String(t.Role).trim() === 'PIC').forEach(t => {
    const status = String(t.Status).toLowerCase();
    if (status === 'unused') summary.picTokens.unused++;
    else if (status === 'active') summary.picTokens.active++;
    else if (status === 'expired') summary.picTokens.expired++;
  });

  const nonDeletedMembers = members.filter(m => String(m.Status).toLowerCase() !== 'deleted');
  summary.totalMembers = nonDeletedMembers.length;
  summary.activeMembers = nonDeletedMembers.filter(m => String(m.Status).toLowerCase() === 'active').length;

  return summary;
}

// ====================== MISSING ADMIN / SUPER ADMIN FUNCTIONS ======================

function fetchAllMembers(adminToken) {
  if (!checkAdmin_(adminToken)) throw new Error('Not authorized');
  return getRows_(SHEETS.MEMBERS).map(stripRow_);
}

function addMember(token, name, wa, status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!checkSuperAdmin_(token)) throw new Error('Not authorized');
    wa = normalizePhone_(wa);
    name = String(name || '').trim();
    if (!name || !wa) throw new Error('Nama dan WhatsApp wajib diisi.');
    
    const existing = getRows_(SHEETS.MEMBERS).find(m => normalizePhone_(m.WhatsApp) === wa);
    if (existing) throw new Error('Member dengan nomor WhatsApp ini sudah ada.');
    
    sheet_(SHEETS.MEMBERS).appendRow([name, wa, status || 'active', 'SuperAdmin', new Date(), 'Member']);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function removeMember(token, wa) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!checkSuperAdmin_(token)) throw new Error('Not authorized');
    wa = normalizePhone_(wa);
    
    const sh = sheet_(SHEETS.MEMBERS);
    const existing = getRows_(SHEETS.MEMBERS).find(m => normalizePhone_(m.WhatsApp) === wa);
    if (!existing) throw new Error('Member tidak ditemukan.');
    
    sh.getRange(existing._row, headerIndex_(SHEETS.MEMBERS, 'Status') + 1).setValue('deleted');
    return true;
  } finally {
    lock.releaseLock();
  }
}

function getSettingsForSuperAdmin(token) {
  if (!checkSuperAdmin_(token)) throw new Error('Not authorized');
  return {
    EnableRounding: String(getSetting('EnableRounding')).toUpperCase() === 'TRUE',
    RoundToNearest: Number(getSetting('RoundToNearest')) || 500,
    RequireMemberValidation: String(getSetting('RequireMemberValidation')).toUpperCase() === 'TRUE'
  };
}

function updateSettings(token, settings) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!checkSuperAdmin_(token)) throw new Error('Not authorized');
    
    if (settings.EnableRounding !== undefined) setSetting('EnableRounding', settings.EnableRounding);
    if (settings.RoundToNearest !== undefined) setSetting('RoundToNearest', settings.RoundToNearest);
    if (settings.RequireMemberValidation !== undefined) setSetting('RequireMemberValidation', settings.RequireMemberValidation);
    
    return true;
  } finally {
    lock.releaseLock();
  }
}

function updateDonorPaidAmountAdmin(token, campaignId, whatsapp, amount) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!checkAdmin_(token)) throw new Error('Not authorized');
    whatsapp = normalizePhone_(whatsapp);
    
    const sh = sheet_(SHEETS.DONORS);
    const existing = getRows_(SHEETS.DONORS).find(d => 
      d.CampaignID === campaignId && normalizePhone_(d.WhatsApp) === whatsapp && d.DonorStatus === 'Pledged'
    );
    if (!existing) throw new Error('Donatur tidak ditemukan di campaign ini.');
    
    sh.getRange(existing._row, headerIndex_(SHEETS.DONORS, 'AmountPaid') + 1).setValue(amount);
    
    const modifiedByCol = headerIndex_(SHEETS.DONORS, 'ModifiedBy') + 1;
    const modifiedAtCol = headerIndex_(SHEETS.DONORS, 'ModifiedAt') + 1;
    if (modifiedByCol > 0) sh.getRange(existing._row, modifiedByCol).setValue(getAdminAlias_(token));
    if (modifiedAtCol > 0) sh.getRange(existing._row, modifiedAtCol).setValue(new Date());
    
    return true;
  } finally {
    lock.releaseLock();
  }
}

function listAllCampaigns(adminToken) {
  if (!checkAdmin_(adminToken)) throw new Error('Not authorized');
  
  const campaigns = getRows_(SHEETS.CAMPAIGNS);
  const donors = getRows_(SHEETS.DONORS);
  const tokens = getRows_(SHEETS.TOKENS);
  
  return campaigns.map(c => {
    const cDonors = donors.filter(d => d.CampaignID === c.CampaignID && d.DonorStatus === 'Pledged');
    const paidCount = cDonors.filter(d => String(d.Paid).toUpperCase() === 'TRUE').length;
    
    const cToken = tokens.find(t => t.LinkedCampaignID === c.CampaignID && t.Role === 'PIC');
    const picName = cToken ? (cToken.Alias || cToken.CreatedBy) : '';
    
    return {
      CampaignID: c.CampaignID,
      TargetName: c.TargetName,
      Status: c.Status,
      picName: picName,
      donorCount: cDonors.length,
      paidCount: paidCount,
      ModifiedBy: c.ModifiedBy || '',
      ModifiedAt: c.ModifiedAt instanceof Date ? c.ModifiedAt.toISOString() : (c.ModifiedAt || '')
    };
  }).sort((a, b) => b.CampaignID.localeCompare(a.CampaignID));
}

function getCampaignDetailAdmin(adminToken, campaignId) {
  if (!checkAdmin_(adminToken)) throw new Error('Not authorized');
  
  const detail = getCampaignDetail_(campaignId);
  if (!detail) throw new Error('Campaign tidak ditemukan.');
  
  const tokens = getRows_(SHEETS.TOKENS);
  const cToken = tokens.find(t => t.LinkedCampaignID === campaignId && t.Role === 'PIC');
  
  detail.picToken = cToken ? cToken.TokenID : '';
  return detail;
}

function setCampaignStatusAdmin(adminToken, campaignId, newStatus) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!checkSuperAdmin_(adminToken)) throw new Error('Not authorized');
    
    const existing = getRows_(SHEETS.CAMPAIGNS).find(c => c.CampaignID === campaignId);
    if (!existing) throw new Error('Campaign tidak ditemukan.');
    
    setCampaignField_(campaignId, 'Status', newStatus);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function deleteCampaignAdmin(adminToken, campaignId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!checkSuperAdmin_(adminToken)) throw new Error('Not authorized');
    
    deleteRowsWhere_(SHEETS.CAMPAIGNS, 'CampaignID', campaignId);
    deleteRowsWhere_(SHEETS.DONORS, 'CampaignID', campaignId);
    deleteRowsWhere_(SHEETS.LATE_REQUESTS, 'CampaignID', campaignId);
    
    const sh = sheet_(SHEETS.TOKENS);
    const tokens = getRows_(SHEETS.TOKENS);
    const cToken = tokens.find(t => t.LinkedCampaignID === campaignId && t.Role === 'PIC');
    if (cToken) {
      sh.getRange(cToken._row, headerIndex_(SHEETS.TOKENS, 'LinkedCampaignID') + 1).setValue('');
      sh.getRange(cToken._row, headerIndex_(SHEETS.TOKENS, 'Status') + 1).setValue('Expired');
    }
    
    return true;
  } finally {
    lock.releaseLock();
  }
}

// ====================== DATA WAREHOUSE PARTITIONING ======================

function sweepArchivedData(superAdminToken) {
  if (!checkSuperAdmin_(superAdminToken)) throw new Error('Not authorized');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const campaignsSheet = sheet_(SHEETS.CAMPAIGNS);
    const donorsSheet = sheet_(SHEETS.DONORS);
    const cArchiveSheet = getOrCreateSheet_('Campaigns_Archive', HEADERS.Campaigns);
    const dArchiveSheet = getOrCreateSheet_('Donors_Archive', HEADERS.Donors);

    const campaignsData = campaignsSheet.getDataRange().getValues();
    const donorsData = donorsSheet.getDataRange().getValues();

    const statusColIndex = headerIndex_(SHEETS.CAMPAIGNS, 'Status');
    const campaignIdColIndex = headerIndex_(SHEETS.CAMPAIGNS, 'CampaignID');
    const donorCampIdColIndex = headerIndex_(SHEETS.DONORS, 'CampaignID');

    let rowsDeleted = 0;

    // Loop backwards to safely delete rows without messing up the index
    for (let i = campaignsData.length - 1; i >= 1; i--) {
      if (campaignsData[i][statusColIndex] === 'Archived') {
        const archivedCampaignId = campaignsData[i][campaignIdColIndex];

        // 1. Extract and Load Campaign to Archive
        cArchiveSheet.appendRow(campaignsData[i]);

        // 2. Extract and Load associated Donors to Archive
        for (let j = donorsData.length - 1; j >= 1; j--) {
          if (donorsData[j][donorCampIdColIndex] === archivedCampaignId) {
            dArchiveSheet.appendRow(donorsData[j]);
            donorsSheet.deleteRow(j + 1);
          }
        }

        // 3. Delete Campaign from Active Sheet
        campaignsSheet.deleteRow(i + 1);
        rowsDeleted++;
      }
    }
    return `Sweep complete. Moved ${rowsDeleted} campaigns to cold storage.`;
  } finally {
    lock.releaseLock();
  }
}

// ====================== PHASE 2: NEW FEATURES ======================

// 1. Fetch Dynamic Web App URL
function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return "URL_BELUM_TERSEDIA"; 
  }
}

// 2. SuperAdmin: Generate Admin Token WITH Alias
function generateAdminToken(superAdminToken, alias) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!checkSuperAdmin_(superAdminToken)) throw new Error('Not authorized');
    if (!alias) throw new Error('Alias Admin wajib diisi.');

    const id = 'ADM-' + Utilities.getUuid().split('-')[0].toUpperCase();

    // Append the alias to the 7th column (G)
    sheet_(SHEETS.TOKENS).appendRow([id, 'Admin', 'Active', '', 'SuperAdmin', new Date(), String(alias)]);
    
    // Force write to ensure the next immediate read fetch has the new row
    SpreadsheetApp.flush();
    
    return id;
  } finally {
    lock.releaseLock();
  }
}

// Helper to get the alias of the currently logged-in Admin
function getAdminAlias_(token) {
  if (checkSuperAdmin_(token)) return "SuperAdmin";
  const tok = findToken_(token, 'Admin');
  return tok && tok.Alias ? tok.Alias : "Unknown Admin";
}

// 3. Admin: Get Pending Members
function getPendingMembers(adminToken) {
  if (!checkAdmin_(adminToken)) throw new Error('Not authorized');
  return getRows_(SHEETS.MEMBERS).filter(m => m.Status === 'Pending').map(stripRow_);
}

// 4. Admin: Update Member Status
function adminUpdateMemberStatus(adminToken, whatsapp, newStatus) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!checkAdmin_(adminToken)) throw new Error('Not authorized');

    whatsapp = normalizePhone_(whatsapp);
    const sh = sheet_(SHEETS.MEMBERS);
    const existing = getRows_(SHEETS.MEMBERS).find(m => normalizePhone_(m.WhatsApp) === whatsapp);

    if (!existing) throw new Error('Member tidak ditemukan.');

    const alias = getAdminAlias_(adminToken);
    const statusLower = String(newStatus).toLowerCase();
    let finalStatus = 'active';
    if (statusLower === 'ex') finalStatus = 'ex';
    if (statusLower === 'pending') finalStatus = 'pending';
    if (statusLower === 'deleted' || statusLower === 'rejected') finalStatus = statusLower;

    sh.getRange(existing._row, headerIndex_(SHEETS.MEMBERS, 'Status') + 1).setValue(finalStatus);
    
    // Write modification audit logs
    const modifiedByCol = headerIndex_(SHEETS.MEMBERS, 'ModifiedBy') + 1;
    const modifiedAtCol = headerIndex_(SHEETS.MEMBERS, 'ModifiedAt') + 1;
    sh.getRange(existing._row, modifiedByCol).setValue(alias);
    sh.getRange(existing._row, modifiedAtCol).setValue(new Date());

    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return { error: e.message || String(e) };
  } finally {
    lock.releaseLock();
  }
}

// 5. Seamless: Generate PIC token directly for an Approved Member
function generateSeamlessPicToken(whatsapp) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    whatsapp = normalizePhone_(whatsapp);
    const existing = getRows_(SHEETS.MEMBERS).find(m => normalizePhone_(m.WhatsApp) === whatsapp);

    if (!existing || existing.Status !== 'active') {
      throw new Error('Hanya member aktif yang dapat membuat campaign.');
    }

    const id = 'PIC-' + Utilities.getUuid().split('-')[0].toUpperCase();

    // CreatedBy is marked as the Member's WhatsApp to track who generated it
    sheet_(SHEETS.TOKENS).appendRow([id, 'PIC', 'Unused', '', whatsapp, new Date(), '']);
    return id;
  } finally {
    lock.releaseLock();
  }
}

// 6. SuperAdmin: List all Admins
function listAdmins(token) {
  if (!checkSuperAdmin_(token)) throw new Error('Not authorized');
  return getRows_(SHEETS.TOKENS)
    .filter(t => t.Role === 'Admin')
    .sort((a, b) => new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0))
    .map(stripRow_);
}

// 7. SuperAdmin: Revoke an Admin
function revokeAdminToken(token, tokenId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!checkSuperAdmin_(token)) throw new Error('Not authorized');
    const tok = getRows_(SHEETS.TOKENS).find(t => t.TokenID === tokenId);
    if (!tok) throw new Error('Token Admin tidak ditemukan.');

    sheet_(SHEETS.TOKENS).getRange(tok._row, headerIndex_(SHEETS.TOKENS, 'Status') + 1).setValue('Expired');
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return { error: e.message || String(e) };
  } finally {
    lock.releaseLock();
  }
}

// 8. SuperAdmin: Reactivate an Admin
function reactivateAdminToken(token, tokenId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!checkSuperAdmin_(token)) throw new Error('Not authorized');
    const tok = getRows_(SHEETS.TOKENS).find(t => t.TokenID === tokenId);
    if (!tok) throw new Error('Token Admin tidak ditemukan.');

    sheet_(SHEETS.TOKENS).getRange(tok._row, headerIndex_(SHEETS.TOKENS, 'Status') + 1).setValue('Active');
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    return { error: e.message || String(e) };
  } finally {
    lock.releaseLock();
  }
}

// 9. SuperAdmin: Assign Role to Member
function superAdminAssignMemberRole(token, whatsapp, newRole) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (!checkSuperAdmin_(token)) throw new Error('Not authorized');
    whatsapp = normalizePhone_(whatsapp);
    
    const sh = sheet_(SHEETS.MEMBERS);
    const m = getRows_(SHEETS.MEMBERS).find(r => normalizePhone_(r.WhatsApp) === whatsapp);
    if (!m) throw new Error('Member tidak ditemukan.');

    const roleIndex = headerIndex_(SHEETS.MEMBERS, 'Role');
    sh.getRange(m._row, roleIndex + 1).setValue(newRole);

    const modifiedByCol = headerIndex_(SHEETS.MEMBERS, 'ModifiedBy') + 1;
    const modifiedAtCol = headerIndex_(SHEETS.MEMBERS, 'ModifiedAt') + 1;
    sh.getRange(m._row, modifiedByCol).setValue('SuperAdmin');
    sh.getRange(m._row, modifiedAtCol).setValue(new Date());

    let tokenMsg = '';
    if (newRole === 'Admin') {
      const existingToken = getRows_(SHEETS.TOKENS).find(t => t.Role === 'Admin' && normalizePhone_(t.CreatedBy) === whatsapp && t.Status !== 'Expired');
      if (!existingToken) {
        const id = 'ADM-' + Utilities.getUuid().split('-')[0].toUpperCase();
        sheet_(SHEETS.TOKENS).appendRow([id, 'Admin', 'Active', '', whatsapp, new Date(), m.Name]);
        tokenMsg = 'Token Admin baru dibuat: ' + id;
      }
    } else if (newRole === 'PIC') {
      const existingToken = getRows_(SHEETS.TOKENS).find(t => t.Role === 'PIC' && normalizePhone_(t.CreatedBy) === whatsapp && t.Status !== 'Expired');
      if (!existingToken) {
        const id = 'PIC-' + Utilities.getUuid().split('-')[0].toUpperCase();
        sheet_(SHEETS.TOKENS).appendRow([id, 'PIC', 'Unused', '', whatsapp, new Date(), '']);
        tokenMsg = 'Token PIC baru dibuat: ' + id;
      }
    }
    SpreadsheetApp.flush();
    return { message: 'Role berhasil diupdate ke ' + newRole + '. ' + tokenMsg };
  } catch (e) {
    return { error: e.message || String(e) };
  } finally {
    lock.releaseLock();
  }
}

// ====================== SEAMLESS PIC MANAGEMENT ======================
function getUserPicCampaigns(whatsapp) {
  whatsapp = normalizePhone_(whatsapp);
  const tokens = getRows_(SHEETS.TOKENS).filter(t => t.Role === 'PIC' && normalizePhone_(t.CreatedBy) === whatsapp && t.Status !== 'Expired');
  
  const campaigns = getRows_(SHEETS.CAMPAIGNS);
  const result = [];
  
  tokens.forEach(t => {
    if (!String(t.LinkedCampaignID || '').trim()) {
      result.push({
        picToken: t.TokenID,
        targetName: '(Draft Campaign Baru)',
        status: 'Draft'
      });
    } else {
      const c = campaigns.find(c => c.CampaignID === String(t.LinkedCampaignID).trim());
      if (c && String(c.Status) !== 'Archived') {
        result.push({
          picToken: t.TokenID,
          targetName: String(c.TargetName),
          status: String(c.Status)
        });
      }
    }
  });
  
  return result.sort((a, b) => {
    if (a.status === 'Draft' && b.status !== 'Draft') return -1;
    if (b.status === 'Draft' && a.status !== 'Draft') return 1;
    return 0;
  });
}
