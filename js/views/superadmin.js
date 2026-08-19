// SuperAdmin Exclusive Operations: System Settings, Archived Data Sweep, Admin Token Creation

import { escapeHtml, formatUserErrorMessage, showInfoModal, showToast, showView } from '../utils.js';
import { call } from '../api.js';
import { currentToken } from '../state.js';
import {
  renderSummaryCard,
  renderPendingMembersSection,
  renderLateRequestsSection,
  refreshMembers,
  refreshAdmins,
  refreshSACampaigns
} from './admin.js';
import { startAdminPolling } from './auth.js';
import {
  startViewTiming,
  markFetchStart,
  markFetchEnd,
  markRenderStart,
  markRenderEnd,
  endViewTiming
} from '../perf.js';

function _logSafe(action, status) {
  if (typeof window !== 'undefined' && window.__DH_ENV__ && window.__DH_ENV__.DEBUG) {
    console.log(`[DH-SuperAdmin] action="${action}" status="${status}"`);
  }
}

function _isMigrationError(err) {
  if (!err) return false;
  return err.error === 'migration_in_progress' ||
    (typeof err.message === 'string' && (err.message.includes('migrasi') || err.message.includes('migration_in_progress')));
}

const MIGRATION_NOTICE = 'Fitur SuperAdmin ini sedang dalam proses migrasi. Gunakan MCP atau coba lagi nanti.';

export function renderSuperAdminSettings(settingsInput) {
  const settingsMap = {};
  if (Array.isArray(settingsInput)) {
    settingsInput.forEach(item => {
      if (!item || !item.key) return;
      const isSecret = Boolean(item.is_secret || item.isSecret);
      // For settings where is_secret = true, display the value as "***" (masked)
      const val = isSecret ? '***' : item.value;
      settingsMap[item.key] = val;
    });
  } else if (settingsInput && typeof settingsInput === 'object') {
    Object.assign(settingsMap, settingsInput);
  }

  const roundingEl = document.getElementById('sa-rounding');
  const roundToEl = document.getElementById('sa-roundto');
  const validationEl = document.getElementById('sa-validation');
  const notifEmailsEl = document.getElementById('sa-notification-emails');
  const appUrlEl = document.getElementById('sa-app-url');

  const enableRoundingVal = settingsMap.EnableRounding !== undefined ? settingsMap.EnableRounding : (settingsMap.enable_rounding !== undefined ? settingsMap.enable_rounding : settingsMap.enableRounding);
  const roundToVal = settingsMap.RoundToNearest !== undefined ? settingsMap.RoundToNearest : (settingsMap.round_to_nearest !== undefined ? settingsMap.round_to_nearest : (settingsMap.roundTo || 500));
  const reqValidationVal = settingsMap.RequireMemberValidation !== undefined ? settingsMap.RequireMemberValidation : (settingsMap.require_member_validation !== undefined ? settingsMap.require_member_validation : settingsMap.requireMemberValidation);
  const adminEmailsVal = settingsMap.AdminNotificationEmails !== undefined ? settingsMap.AdminNotificationEmails : (settingsMap.admin_notification_emails !== undefined ? settingsMap.admin_notification_emails : (settingsMap.adminNotificationEmails || ''));
  const appUrlVal = settingsMap.AppUrl !== undefined ? settingsMap.AppUrl : (settingsMap.app_url !== undefined ? settingsMap.app_url : (settingsMap.appUrl || ''));

  if (roundingEl) {
    roundingEl.checked = String(enableRoundingVal).toUpperCase() === 'TRUE' || enableRoundingVal === true;
  }
  if (roundToEl) {
    roundToEl.value = (roundToVal !== undefined && roundToVal !== null) ? roundToVal : 500;
  }
  if (validationEl) {
    validationEl.checked = String(reqValidationVal).toUpperCase() === 'TRUE' || reqValidationVal === true;
  }
  if (notifEmailsEl) {
    notifEmailsEl.value = (adminEmailsVal !== undefined && adminEmailsVal !== null) ? adminEmailsVal : '';
  }
  if (appUrlEl) {
    appUrlEl.value = (appUrlVal !== undefined && appUrlVal !== null) ? appUrlVal : '';
  }
}

export function loadSuperAdminSettings() {
  const msgEl = document.getElementById('sa-settings-msg');
  return call('getSettingsForSuperAdmin', { token: currentToken() })
    .then(data => {
      const settingsList = (data && data.settings) ? data.settings : data;
      renderSuperAdminSettings(settingsList);
      if (msgEl) msgEl.innerHTML = '';
      _logSafe('loadSuperAdminSettings', 'success');
      return data;
    })
    .catch(e => {
      if (msgEl) {
        if (_isMigrationError(e)) {
          msgEl.innerHTML = '<p class="error" role="alert">' + escapeHtml(MIGRATION_NOTICE) + '</p>';
        } else {
          msgEl.innerHTML = '<p class="error" role="alert">Pengaturan belum dapat dimuat. <button type="button" class="btn secondary btn-auto retry-action" onclick="loadSuperAdminSettings()">Coba lagi</button></p>';
        }
      }
      _logSafe('loadSuperAdminSettings', 'error');
      console.error('SuperAdmin settings error:', e);
      throw e;
    });
}

export function loadSuperAdminStage1() {
  const summaryEl = document.getElementById('sa-summary');
  if (summaryEl) summaryEl.innerHTML = '<div class="muted" style="padding:16px;text-align:center;">Memuat ringkasan...</div>';

  markFetchStart('SuperAdmin', 'getSettingsForSuperAdmin');

  return call('getSettingsForSuperAdmin', { token: currentToken() })
    .then(data => {
      const totalDonors = (data && data.summary && data.summary.donors) ? (data.summary.donors.total_donors || 0) : 0;
      markFetchEnd('SuperAdmin', 'getSettingsForSuperAdmin', { recordCount: totalDonors });
      markRenderStart('SuperAdmin', 'stage1');

      // a. Domain metrics panel (members, campaigns, donors, tokens counts)
      if (summaryEl && data && data.summary) {
        const s = data.summary || {};
        const mem = s.members || {};
        const camp = s.campaigns || {};
        const don = s.donors || {};
        const tok = s.tokens || {};

        const normalizedSummary = {
          campaignsByStatus: {
            Open: camp.open_campaigns !== undefined ? camp.open_campaigns : (camp.open || 0),
            Closed: camp.closed_campaigns !== undefined ? camp.closed_campaigns : (camp.closed || 0),
            Finalized: camp.finalized_campaigns !== undefined ? camp.finalized_campaigns : (camp.finalized || 0)
          },
          totalDonors: don.total_donors !== undefined ? don.total_donors : (don.total || 0),
          totalPending: don.outstanding_amount !== undefined ? don.outstanding_amount : (don.outstanding || 0),
          totalCollected: don.total_paid !== undefined ? don.total_paid : (don.paid || 0),
          picTokens: {
            unused: tok.unused_tokens !== undefined ? tok.unused_tokens : (tok.unused || 0),
            active: tok.active_tokens !== undefined ? tok.active_tokens : (tok.active || 0),
            expired: tok.expired_tokens !== undefined ? tok.expired_tokens : (tok.expired || 0)
          },
          totalMembers: mem.total_members !== undefined ? mem.total_members : (mem.total || 0),
          activeMembers: mem.active_members !== undefined ? mem.active_members : (mem.active || 0)
        };
        summaryEl.innerHTML = renderSummaryCard(normalizedSummary);
      }

      // b. Pending members queue
      const pendingMembers = (data.pending_members_list || []).map(m => ({
        Name: m.name || m.Name,
        name: m.name || m.Name,
        WhatsApp: m.whatsapp || m.WhatsApp,
        whatsapp: m.whatsapp || m.WhatsApp,
        AddedBy: m.added_by || m.AddedBy || 'Self-Registered - active',
        addedBy: m.added_by || m.AddedBy || 'Self-Registered - active',
        AddedAt: m.added_at || m.AddedAt,
        addedAt: m.added_at || m.AddedAt,
        id: m.id,
        role: m.role,
        status: m.status,
        ...m
      }));
      renderPendingMembersSection('sa-pending-members', pendingMembers);

      // c. Pending late requests queue
      const pendingLate = (data.pending_late_requests || []).map(r => ({
        reqId: r.request_id || r.reqId || r.requestId,
        requestId: r.request_id || r.reqId || r.requestId,
        targetName: r.target_name || r.targetName || r.campaign_id,
        campaignId: r.campaign_id || r.campaignId,
        pic: r.pic || '',
        donorName: r.donor_name || r.donorName,
        donorWhatsApp: r.donor_whatsapp || r.donorWhatsApp,
        isCustom: Boolean(r.is_custom !== undefined ? r.is_custom : r.isCustom),
        customAmount: Number(r.custom_amount !== undefined ? r.custom_amount : r.customAmount) || 0,
        reason: r.reason || '',
        createdAt: r.created_at || r.createdAt,
        status: r.status,
        ...r
      }));
      renderLateRequestsSection('sa-late-donors', pendingLate);

      // d. Settings panel (with secret values masked as "***")
      const settingsList = data.settings || [];
      renderSuperAdminSettings(settingsList);

      markRenderEnd('SuperAdmin', 'stage1');
      _logSafe('getSettingsForSuperAdmin', 'success');
      return data;
    })
    .catch(e => {
      markFetchEnd('SuperAdmin', 'getSettingsForSuperAdmin', { isError: true, isTimeout: e.isTimeout });
      if (summaryEl) {
        summaryEl.innerHTML = '<p class="error" role="alert">Ringkasan belum dapat dimuat. <button type="button" class="btn secondary btn-auto retry-action" onclick="loadSuperAdminDashboard()">Coba lagi</button></p>';
      }
      const pendingEl = document.getElementById('sa-pending-members');
      const pendingCard = document.getElementById('sa-pending-card');
      if (pendingCard) pendingCard.classList.remove('hidden');
      if (pendingEl) {
        pendingEl.innerHTML = '<p class="error" role="alert">Pendaftaran belum dapat dimuat. <button type="button" class="btn secondary btn-auto retry-action" onclick="loadSuperAdminDashboard()">Coba lagi</button></p>';
      }
      const lateEl = document.getElementById('sa-late-donors');
      const lateCard = document.getElementById('sa-late-card');
      if (lateCard) lateCard.classList.remove('hidden');
      if (lateEl) {
        lateEl.innerHTML = '<p class="error" role="alert">Gagal memuat pengajuan. <button type="button" class="btn secondary btn-auto retry-action" onclick="loadSuperAdminDashboard()">Coba lagi</button></p>';
      }
      const msgEl = document.getElementById('sa-settings-msg');
      if (msgEl) {
        if (_isMigrationError(e)) {
          msgEl.innerHTML = '<p class="error" role="alert">' + escapeHtml(MIGRATION_NOTICE) + '</p>';
        } else {
          msgEl.innerHTML = '<p class="error" role="alert">Pengaturan belum dapat dimuat. <button type="button" class="btn secondary btn-auto retry-action" onclick="loadSuperAdminSettings()">Coba lagi</button></p>';
        }
      }
      _logSafe('getSettingsForSuperAdmin', 'error');
      console.error('SuperAdmin Stage 1 error:', e);
      throw e;
    });
}

export function loadSuperAdminDashboard() {
  showView('superadmin-dashboard');
  startViewTiming('SuperAdmin');

  // STAGE 1 (High Priority): Operational Summary, Action Queues & Settings via Single Unified RPC
  const stage1 = loadSuperAdminStage1();

  // STAGE 2 (Medium Priority): Campaigns, Members, Admins
  stage1.finally(() => {
    Promise.allSettled([
      refreshSACampaigns(),
      refreshMembers(),
      refreshAdmins()
    ]).finally(() => {
      startAdminPolling();
      endViewTiming('SuperAdmin');
    });
  });
}

export function runDataSweep() {
  const msgEl = document.getElementById('sa-sweep-msg');
  if (msgEl) msgEl.innerHTML = '<span class="muted">Membersihkan data arsip...</span>';

  call('sweepArchivedData', currentToken())
    .then(msg => {
      if (msgEl) msgEl.innerHTML = '<div class="success">✓ ' + escapeHtml(msg) + '</div>';
      _logSafe('sweepArchivedData', 'success');
      refreshSACampaigns();
    })
    .catch(e => {
      const errorMsg = _isMigrationError(e) ? MIGRATION_NOTICE : formatUserErrorMessage(e);
      if (msgEl) msgEl.innerHTML = '<div class="error">' + escapeHtml(errorMsg) + '</div>';
      _logSafe('sweepArchivedData', 'error');
    });
}

export function saveSettings() {
  const roundingEl = document.getElementById('sa-rounding');
  const roundToEl = document.getElementById('sa-roundto');
  const validationEl = document.getElementById('sa-validation');
  const notifEmailsEl = document.getElementById('sa-notification-emails');
  const appUrlEl = document.getElementById('sa-app-url');
  const msgEl = document.getElementById('sa-settings-msg');

  const settings = {
    EnableRounding: (roundingEl && roundingEl.checked) ? 'TRUE' : 'FALSE',
    RoundToNearest: (roundToEl && roundToEl.value) ? roundToEl.value : '500',
    RequireMemberValidation: (validationEl && validationEl.checked) ? 'TRUE' : 'FALSE',
    AdminNotificationEmails: notifEmailsEl ? notifEmailsEl.value.trim() : '',
    AppUrl: appUrlEl ? appUrlEl.value.trim() : ''
  };

  call('updateSettings', currentToken(), settings).then(() => {
    if (msgEl) msgEl.innerHTML = '<div class="success">Pengaturan disimpan.</div>';
    _logSafe('updateSettings', 'success');
  }).catch(e => {
    const errorMsg = _isMigrationError(e) ? MIGRATION_NOTICE : (e.message || String(e));
    _logSafe('updateSettings', 'error');
    showInfoModal(errorMsg, 'Error');
  });
}

export function genAdminToken() {
  const aliasInput = document.getElementById('sa-admin-alias');
  const alias = aliasInput ? aliasInput.value.trim() : '';
  const tokenBox = document.getElementById('sa-new-token');

  if (!alias) {
    showInfoModal('Silakan isi Alias Admin terlebih dahulu.', 'Peringatan');
    return;
  }

  call('generateAdminToken', currentToken(), alias).then(tok => {
    if (tokenBox) {
      tokenBox.innerHTML =
        '<p class="success">✓ Token Admin (' + escapeHtml(alias) + ') berhasil dibuat:</p>' +
        '<div class="token-box">' + tok + '</div>';
    }
    if (aliasInput) aliasInput.value = '';
    _logSafe('generateAdminToken', 'success');
    refreshAdmins();
  }).catch(e => {
    const errorMsg = _isMigrationError(e) ? MIGRATION_NOTICE : (e.message || String(e));
    if (tokenBox) {
      tokenBox.innerHTML = '<p class="error">Gagal membuat token: ' + escapeHtml(errorMsg) + '</p>';
    }
    _logSafe('generateAdminToken', 'error');
    showInfoModal(errorMsg, 'Error');
  });
}
