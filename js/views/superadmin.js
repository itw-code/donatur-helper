// SuperAdmin Exclusive Operations: System Settings, Archived Data Sweep, Admin Token Creation

import { escapeHtml, formatUserErrorMessage, showInfoModal, showToast, showView } from '../utils.js';
import { call } from '../api.js';
import { currentToken } from '../state.js';
import { refreshSummary, refreshMembers, refreshAdmins, refreshPendingMembers, refreshLateRequests, refreshSACampaigns } from './admin.js';
import { startAdminPolling } from './auth.js';

export function loadSuperAdminDashboard() {
  showView('superadmin-dashboard');
  refreshSummary('sa-summary');
  call('getSettingsForSuperAdmin', currentToken()).then(s => {
    const roundingEl = document.getElementById('sa-rounding');
    const roundToEl = document.getElementById('sa-roundto');
    const validationEl = document.getElementById('sa-validation');
    const notifEmailsEl = document.getElementById('sa-notification-emails');
    const appUrlEl = document.getElementById('sa-app-url');

    if (roundingEl) roundingEl.checked = String(s.EnableRounding).toUpperCase() === 'TRUE';
    if (roundToEl) roundToEl.value = s.RoundToNearest || 500;
    if (validationEl) validationEl.checked = String(s.RequireMemberValidation).toUpperCase() === 'TRUE';
    if (notifEmailsEl) notifEmailsEl.value = s.AdminNotificationEmails || '';
    if (appUrlEl) appUrlEl.value = s.AppUrl || '';
  }).catch(e => {
    const msgEl = document.getElementById('sa-settings-msg');
    if (msgEl) {
      msgEl.innerHTML = '<p class="error" role="alert">Pengaturan belum dapat dimuat. <button type="button" class="retry-action" onclick="loadSuperAdminDashboard()">Coba lagi</button></p>';
    }
    console.error('SuperAdmin settings error:', e);
  });

  refreshMembers();
  refreshAdmins();
  refreshPendingMembers('sa-pending-members');
  refreshLateRequests('sa-late-donors');
  refreshSACampaigns();
  startAdminPolling();
}

export function runDataSweep() {
  const msgEl = document.getElementById('sa-sweep-msg');
  if (msgEl) msgEl.innerHTML = '<span class="muted">Membersihkan data arsip...</span>';

  call('sweepArchivedData', currentToken())
    .then(msg => {
      if (msgEl) msgEl.innerHTML = '<div class="success">✓ ' + escapeHtml(msg) + '</div>';
      refreshSACampaigns();
    })
    .catch(e => {
      if (msgEl) msgEl.innerHTML = '<div class="error">' + formatUserErrorMessage(e) + '</div>';
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
  }).catch(e => showInfoModal(e.message || String(e), 'Error'));
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
    refreshAdmins();
  }).catch(e => {
    if (tokenBox) {
      tokenBox.innerHTML = '<p class="error">Gagal membuat token: ' + escapeHtml(e.message || String(e)) + '</p>';
    }
    showInfoModal(e.message || String(e), 'Error');
  });
}
