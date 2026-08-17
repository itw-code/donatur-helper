// Admin & SuperAdmin Shared Management: Members, Campaigns, Token Generation, Late Requests

import { safeGet } from '../storage.js';
import { escapeHtml, sanitizeUrl, formatUserErrorMessage, showInfoModal, showConfirmModal, showToast, showView, formatIDR, formatDate, formatTime, parseRibuan, formatInputRibuan, statusBadge, paymentStatusIcon } from '../utils.js';
import { call, callQueued } from '../api.js';
import { appState, currentToken } from '../state.js';
import { deepDive, startAdminPolling, recordPendingFetchTime } from './auth.js';
import { startViewTiming, markFetchStart, markFetchEnd, markRenderStart, markRenderEnd, endViewTiming } from '../perf.js';

export function renderSummaryCard(s) {
  let html = '<h2 style="margin-top:0">Ringkasan Operasional</h2>';
  html += '<div class="row">';
  html += '<div><div class="muted">Campaign Terbuka</div><strong>' + (s.campaignsByStatus ? (s.campaignsByStatus.Open || 0) : 0) + '</strong></div>';
  html += '<div><div class="muted">Menunggu Finalisasi</div><strong>' + (s.campaignsByStatus ? (s.campaignsByStatus.Closed || 0) : 0) + '</strong></div>';
  html += '<div><div class="muted">Final</div><strong>' + (s.campaignsByStatus ? (s.campaignsByStatus.Finalized || 0) : 0) + '</strong></div>';
  html += '</div>';
  html += '<div class="row" style="margin-top:8px;">';
  html += '<div><div class="muted">Total donatur</div><strong>' + (s.totalDonors || 0) + '</strong></div>';
  html += '<div><div class="muted">Belum dibayar</div><strong>' + formatIDR(s.totalPending || 0) + '</strong></div>';
  html += '<div><div class="muted">Terkumpul</div><strong>' + formatIDR(s.totalCollected || 0) + '</strong></div>';
  html += '</div>';
  const unusedToken = s.picTokens ? (s.picTokens.unused || 0) : 0;
  const activeToken = s.picTokens ? (s.picTokens.active || 0) : 0;
  const expToken = s.picTokens ? (s.picTokens.expired || 0) : 0;
  html += '<p class="muted" style="margin-top:8px;">Token PIC: ' + unusedToken + ' belum dipakai, '
    + activeToken + ' aktif, ' + expToken + ' kedaluwarsa.</p>';
  if (s.totalMembers !== undefined) {
    html += '<p class="muted">Members: ' + s.totalMembers + ' total di database (' + s.activeMembers + ' aktif).</p>';
  }
  return html;
}

export function refreshSummary(elId) {
  const el = document.getElementById(elId);
  if (!el) return Promise.resolve();
  el.innerHTML = '<div class="muted" style="padding:16px;text-align:center;">Memuat ringkasan...</div>';
  markFetchStart('Admin', 'getDashboardSummary');
  return call('getDashboardSummary', currentToken()).then(s => {
    markFetchEnd('Admin', 'getDashboardSummary', { recordCount: (s.totalDonors || 0) });
    markRenderStart('Admin', 'summary');
    el.innerHTML = renderSummaryCard(s);
    markRenderEnd('Admin', 'summary');
    return s;
  }).catch(e => {
    markFetchEnd('Admin', 'getDashboardSummary', { isError: true, isTimeout: e.isTimeout });
    el.innerHTML = '<p class="error" role="alert">Ringkasan belum dapat dimuat. <button type="button" class="btn secondary btn-auto retry-action" onclick="refreshSummary(\'' + elId + '\')">Coba lagi</button></p>';
    console.error('Summary error:', e);
  });
}

export function resetAdminActionQueue() {
  appState.adminActionQueueState = { pending: null, late: null };
  const totalEl = document.getElementById('admin-action-queue-total');
  const emptyEl = document.getElementById('admin-action-queue-empty');
  if (totalEl) {
    totalEl.className = 'semantic-status warning';
    totalEl.innerHTML = '<span>Memuat antrean...</span>';
  }
  if (emptyEl) emptyEl.classList.add('hidden');
  document.querySelectorAll('#admin-action-queue [id^="admin-queue-"]').forEach(row => {
    if (row.classList.contains('admin-queue-row')) row.classList.add('hidden');
  });
}

export function updateAdminActionQueue(kind, count) {
  if (kind !== 'pending' && kind !== 'late') return;
  appState.adminActionQueueState[kind] = typeof count === 'number' ? count : null;

  const row = document.getElementById('admin-queue-' + kind);
  const countEl = row ? row.querySelector('[data-queue-count]') : null;
  if (row) {
    row.classList.toggle('hidden', count === 0);
    if (count === null) row.classList.remove('hidden');
  }
  if (countEl) countEl.textContent = count === null ? '—' : String(count);

  const pendingCount = appState.adminActionQueueState.pending;
  const lateCount = appState.adminActionQueueState.late;
  const totalEl = document.getElementById('admin-action-queue-total');
  const emptyEl = document.getElementById('admin-action-queue-empty');
  if (!totalEl || !emptyEl) return;

  if (pendingCount === null || lateCount === null) {
    totalEl.className = 'semantic-status warning';
    totalEl.innerHTML = paymentStatusIcon('review') + '<span>Antrean belum lengkap</span>';
    emptyEl.classList.add('hidden');
    return;
  }

  const total = pendingCount + lateCount;
  totalEl.className = 'semantic-status ' + (total ? 'warning' : 'success');
  totalEl.innerHTML = paymentStatusIcon(total ? 'review' : 'verified') + '<span>' + total + ' item perlu tindakan</span>';
  emptyEl.classList.toggle('hidden', total !== 0);
}

export function loadAdminDashboard() {
  showView('admin-dashboard');
  startViewTiming('Admin');
  resetAdminActionQueue();

  // STAGE 1 (High Priority): Operational Summary & Action Queues
  const stage1 = Promise.allSettled([
    refreshSummary('admin-summary'),
    refreshPendingMembers('admin-pending-members'),
    refreshLateRequests('admin-late-donors')
  ]);

  // STAGE 2 (Medium Priority): Campaigns & Members
  stage1.finally(() => {
    Promise.allSettled([
      refreshAdminCampaigns(),
      refreshMembers()
    ]).finally(() => {
      startAdminPolling();
      endViewTiming('Admin');
    });
  });
}

export function getAdminParentCard(elId) {
  const parentCardIds = {
    'sa-pending-members': 'sa-pending-card',
    'admin-pending-members': 'admin-pending-card',
    'sa-late-donors': 'sa-late-card',
    'admin-late-donors': 'admin-late-card'
  };
  const parentCardId = parentCardIds[elId];
  return parentCardId ? document.getElementById(parentCardId) : null;
}

export function refreshPendingMembers(elId) {
  markFetchStart('Admin', 'getPendingMembers');
  return call('getPendingMembers', currentToken()).then(list => {
    recordPendingFetchTime();
    markFetchEnd('Admin', 'getPendingMembers', { recordCount: list.length });
    markRenderStart('Admin', 'pendingMembers');
    const el = document.getElementById(elId);
    if (!el) {
      markRenderEnd('Admin', 'pendingMembers');
      return list;
    }
    if (elId === 'admin-pending-members') updateAdminActionQueue('pending', list.length);
    const parentCard = getAdminParentCard(elId);
    const bannerId = elId === 'sa-pending-members' ? 'sa-notify-banner' : 'admin-notify-banner';
    const bannerEl = document.getElementById(bannerId);

    if (!list.length) {
      el.innerHTML = '<p class="muted">Tidak ada pendaftaran baru.</p>';
      if (parentCard) parentCard.classList.add('hidden');
      if (bannerEl) bannerEl.classList.add('hidden');
      markRenderEnd('Admin', 'pendingMembers');
      return list;
    }
    if (parentCard) parentCard.classList.remove('hidden');

    if (bannerEl) {
      bannerEl.innerHTML = '<span class="semantic-status" style="color:inherit;">' + paymentStatusIcon('review') + '<span>Ada ' + list.length + ' pendaftaran member baru yang memerlukan persetujuan!</span></span>' +
                            '<button type="button" class="link-btn" aria-label="Lihat detail pendaftaran member baru" onclick="scrollToPending(\'' + elId + '\')" style="color:white; font-size:12px; text-decoration:underline;">Lihat Detail</button>';
      bannerEl.classList.remove('hidden');
    }

    let cardHtml = '<div class="pending-bulk-actions">';
    cardHtml += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;"><input type="checkbox" id="select-all-pending-mobile-' + elId + '" onclick="toggleSelectAllPending(this, \'' + elId + '\')"> Pilih Semua</label>';
    cardHtml += '<button type="button" class="btn green" onclick="bulkApprovePending(\'approve\', \'' + elId + '\')">Setujui</button>';
    cardHtml += '<button type="button" class="btn danger" onclick="bulkApprovePending(\'reject\', \'' + elId + '\')">Tolak</button>';
    cardHtml += '</div>';
    cardHtml += '<div class="pending-cards">';

    list.forEach((m) => {
      let defaultStatus = 'active';
      if (m.AddedBy && String(m.AddedBy).toLowerCase().includes('- ex')) defaultStatus = 'ex';
      const statusLabel = defaultStatus === 'active' ? 'Active (Karyawan)' : 'Ex (Alumni)';

      cardHtml += '<div class="pending-card">';
      cardHtml += '<div class="pending-card-header">';
      cardHtml += '<label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" class="pending-checkbox-' + elId + '" value="' + escapeHtml(m.WhatsApp) + '" data-status="' + defaultStatus + '"><span class="pending-card-name">' + escapeHtml(m.Name) + '</span></label>';
      cardHtml += '<span class="badge" style="font-size:11px;">' + statusLabel + '</span>';
      cardHtml += '</div>';
      cardHtml += '<span class="pending-card-wa">' + escapeHtml(m.WhatsApp) + '</span>';
      cardHtml += '<div class="pending-card-actions">';
      cardHtml += '<button type="button" class="btn green" aria-label="Setujui pendaftaran ' + escapeHtml(m.Name) + '" onclick="approvePending(\'' + m.WhatsApp + '\', \'' + defaultStatus + '\', \'' + elId + '\')">Setujui</button>';
      cardHtml += '<button type="button" class="btn danger" aria-label="Tolak pendaftaran ' + escapeHtml(m.Name) + '" onclick="approvePending(\'' + m.WhatsApp + '\', \'rejected\', \'' + elId + '\')">Tolak</button>';
      cardHtml += '</div>';
      cardHtml += '</div>';
    });
    cardHtml += '</div>';

    let tableHtml = '<div class="pending-table-view">';
    tableHtml += '<div style="margin-bottom: 12px; display: flex; gap: 8px;">';
    tableHtml += '<button type="button" class="btn green btn-auto" style="margin:0; padding:6px 12px; font-size:12px;" onclick="bulkApprovePending(\'approve\', \'' + elId + '\')">Setujui Terpilih</button>';
    tableHtml += '<button type="button" class="btn danger btn-auto" style="margin:0; padding:6px 12px; font-size:12px;" onclick="bulkApprovePending(\'reject\', \'' + elId + '\')">Tolak Terpilih</button>';
    tableHtml += '</div>';

    tableHtml += '<div class="table-responsive"><table><tr>';
    tableHtml += '<th style="width: 40px; text-align: center;"><input type="checkbox" id="select-all-pending-' + elId + '" onclick="toggleSelectAllPending(this, \'' + elId + '\')"></th>';
    tableHtml += '<th>Nama</th><th>WhatsApp</th><th>Status Awal</th><th>Aksi</th></tr>';

    list.forEach((m) => {
      let defaultStatus = 'active';
      if (m.AddedBy && String(m.AddedBy).toLowerCase().includes('- ex')) defaultStatus = 'ex';
      tableHtml += '<tr>';
      tableHtml += '<td style="text-align: center;"><input type="checkbox" class="pending-checkbox-' + elId + '" value="' + escapeHtml(m.WhatsApp) + '" data-status="' + defaultStatus + '"></td>';
      tableHtml += '<td>' + escapeHtml(m.Name) + '</td><td>' + escapeHtml(m.WhatsApp) + '</td>';
      tableHtml += '<td class="muted">' + (defaultStatus === 'active' ? 'Active (Karyawan)' : 'Ex (Alumni)') + '</td>';
      tableHtml += '<td><button type="button" class="btn green" aria-label="Setujui pendaftaran ' + escapeHtml(m.Name) + '" style="margin-top:0; padding:6px 12px; font-size:12px; margin-right:4px;" onclick="approvePending(\'' + m.WhatsApp + '\', \'' + defaultStatus + '\', \'' + elId + '\')">Setujui</button>';
      tableHtml += '<button type="button" class="btn danger" aria-label="Tolak pendaftaran ' + escapeHtml(m.Name) + '" style="margin-top:0; padding:6px 12px; font-size:12px;" onclick="approvePending(\'' + m.WhatsApp + '\', \'rejected\', \'' + elId + '\')">Tolak</button></td></tr>';
    });
    tableHtml += '</table></div></div>';

    el.innerHTML = cardHtml + tableHtml;
    markRenderEnd('Admin', 'pendingMembers');
    return list;
  }).catch(e => {
    markFetchEnd('Admin', 'getPendingMembers', { isError: true, isTimeout: e.isTimeout });
    if (elId === 'admin-pending-members') updateAdminActionQueue('pending', null);
    const el = document.getElementById(elId);
    const parentCard = getAdminParentCard(elId);
    if (parentCard) parentCard.classList.remove('hidden');
    if (el) el.innerHTML = '<p class="error" role="alert">Pendaftaran belum dapat dimuat. <button type="button" class="btn secondary btn-auto retry-action" onclick="refreshPendingMembers(\'' + elId + '\')">Coba lagi</button></p>';
    console.error('Pending members error:', e);
  });
}

export function scrollToPending(elId) {
  const el = document.getElementById(elId);
  if (el) {
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }
}

export function approvePending(wa, newStatus, elId) {
  call('adminUpdateMemberStatus', currentToken(), wa, newStatus).then(() => {
    refreshPendingMembers(elId);
    refreshMembers();
    refreshSummary(elId === 'sa-pending-members' ? 'sa-summary' : 'admin-summary');
  }).catch(e => showInfoModal(e.message || String(e), 'Error'));
}

export function toggleSelectAllPending(master, elId) {
  document.querySelectorAll('.pending-checkbox-' + elId).forEach(cb => cb.checked = master.checked);
}

export function bulkApprovePending(action, elId) {
  const selected = [];
  const selectedWhatsApp = new Set();
  document.querySelectorAll('.pending-checkbox-' + elId + ':checked').forEach(cb => {
    if (selectedWhatsApp.has(cb.value)) return;
    selectedWhatsApp.add(cb.value);
    selected.push({ whatsapp: cb.value, defaultStatus: cb.getAttribute('data-status') });
  });
  if (!selected.length) {
    showInfoModal('Pilih minimal satu member terlebih dahulu.', 'Info');
    return;
  }

  const isRejection = action === 'reject';
  const updates = selected.map(s => ({
    whatsapp: s.whatsapp,
    status: isRejection ? 'rejected' : s.defaultStatus
  }));

  call('adminBulkUpdateMemberStatus', currentToken(), updates).then(() => {
    showToast('Status member terpilih berhasil diperbarui.');
    refreshPendingMembers(elId);
    refreshMembers();
    refreshSummary(elId === 'sa-pending-members' ? 'sa-summary' : 'admin-summary');
  }).catch(e => showInfoModal(e.message || String(e), 'Error'));
}

export function refreshLateRequests(elId) {
  markFetchStart('Admin', 'getPendingLateRequests');
  return call('getPendingLateRequests', currentToken()).then(list => {
    markFetchEnd('Admin', 'getPendingLateRequests', { recordCount: list.length });
    markRenderStart('Admin', 'lateRequests');
    const el = document.getElementById(elId);
    if (!el) {
      markRenderEnd('Admin', 'lateRequests');
      return list;
    }
    if (elId === 'admin-late-donors') updateAdminActionQueue('late', list.length);
    const parentCard = getAdminParentCard(elId);
    if (!list.length) {
      el.innerHTML = '<p class="muted">Tidak ada pengajuan donatur susulan.</p>';
      if (parentCard) parentCard.classList.add('hidden');
      markRenderEnd('Admin', 'lateRequests');
      return list;
    }
    if (parentCard) parentCard.classList.remove('hidden');
    let cards = '<div class="admin-late-cards">';
    let table = '<div class="admin-late-table-view"><div class="table-responsive"><table><tr><th>Campaign (PIC)</th><th>Donatur Susulan</th><th>Nominal</th><th>Alasan</th><th>Aksi</th></tr>';
    list.forEach(r => {
      const targetName = escapeHtml(r.targetName);
      const donorName = escapeHtml(r.donorName);
      const amount = r.isCustom ? '<span class="badge blue">Khusus: ' + formatIDR(r.customAmount) + '</span>' : '<span class="badge green">Patungan Rata</span>';
      cards += '<article class="admin-late-card">';
      cards += '<div class="admin-data-card-header"><div class="admin-data-card-title"><span class="admin-data-card-label">Campaign</span><strong>' + targetName + '</strong><span class="muted">PIC: ' + escapeHtml(r.pic) + '</span></div><span class="semantic-status warning">' + paymentStatusIcon('review') + '<span>Perlu ditinjau</span></span></div>';
      cards += '<dl class="admin-data-card-meta"><div><dt>Donatur susulan</dt><dd>' + donorName + '<br><span class="muted">' + escapeHtml(r.donorWhatsApp) + '</span></dd></div>';
      cards += '<div><dt>Nominal</dt><dd>' + amount + '</dd></div><div><dt>Alasan</dt><dd class="muted">' + escapeHtml(r.reason) + '</dd></div></dl>';
      cards += '<div class="admin-card-actions"><button type="button" class="btn blue" aria-label="Setujui pengajuan ' + donorName + '" onclick="handleApproveLateDonor(\'' + r.reqId + '\', true, \'' + elId + '\')">Setujui</button><button type="button" class="btn danger" aria-label="Tolak pengajuan ' + donorName + '" onclick="handleApproveLateDonor(\'' + r.reqId + '\', false, \'' + elId + '\')">Tolak</button></div></article>';

      table += '<tr><td><strong>' + targetName + '</strong><br><small class="muted">PIC: ' + escapeHtml(r.pic) + '</small></td>';
      table += '<td>' + donorName + '<br><small class="muted">' + escapeHtml(r.donorWhatsApp) + '</small></td><td>' + amount + '</td><td class="muted">' + escapeHtml(r.reason) + '</td>';
      table += '<td><div class="action-group"><button type="button" class="btn blue" aria-label="Setujui pengajuan ' + donorName + '" onclick="handleApproveLateDonor(\'' + r.reqId + '\', true, \'' + elId + '\')">Setujui</button><button type="button" class="btn danger" aria-label="Tolak pengajuan ' + donorName + '" onclick="handleApproveLateDonor(\'' + r.reqId + '\', false, \'' + elId + '\')">Tolak</button></div></td></tr>';
    });
    cards += '</div>';
    table += '</table></div></div>';
    el.innerHTML = cards + table;
    markRenderEnd('Admin', 'lateRequests');
    return list;
  }).catch(e => {
    markFetchEnd('Admin', 'getPendingLateRequests', { isError: true, isTimeout: e.isTimeout });
    if (elId === 'admin-late-donors') updateAdminActionQueue('late', null);
    const el = document.getElementById(elId);
    const parentCard = getAdminParentCard(elId);
    if (parentCard) parentCard.classList.remove('hidden');
    if (el) el.innerHTML = '<p class="error" role="alert">Gagal memuat pengajuan. <button type="button" class="btn secondary btn-auto retry-action" onclick="refreshLateRequests(\'' + elId + '\')">Coba lagi</button></p>';
    console.error('Error fetching late requests:', e);
  });
}

export function handleApproveLateDonor(reqId, isApprove, elId) {
  if (isApprove) {
    return showConfirmModal('Peringatan: Menyetujui ini akan langsung mendaftarkan member (jika baru) dan MENGHITUNG ULANG tagihan donatur lain di campaign tersebut. Lanjutkan?', () => executeApproveLateDonor(reqId, isApprove, elId));
  } else {
    return executeApproveLateDonor(reqId, isApprove, elId);
  }
}

export function executeApproveLateDonor(reqId, isApprove, elId) {
  return call('approveLateDonor', currentToken(), reqId, isApprove).then(() => {
    refreshLateRequests(elId);
    refreshSummary(elId.startsWith('sa-') ? 'sa-summary' : 'admin-summary');
  }).catch(e => showInfoModal(e.message || String(e), 'Error'));
}

export function refreshAdmins() {
  call('listAdmins', currentToken()).then(list => {
    const el = document.getElementById('sa-admin-list');
    if (!el) return;
    el.innerHTML = renderAdminAccounts(list);
    filterAdminAccounts('sa-admin-list', 'sa-admin-search', 'sa-admin-status-filter', 'sa-admin-filter-summary');
  }).catch(e => {
    const el = document.getElementById('sa-admin-list');
    if (el) el.innerHTML = '<p class="error" role="alert">Daftar admin belum dapat dimuat. <button type="button" class="retry-action" onclick="refreshAdmins()">Coba lagi</button></p>';
    const summaryEl = document.getElementById('sa-admin-filter-summary');
    if (summaryEl) summaryEl.textContent = 'Admin belum dapat dimuat.';
    console.error('Admin list error:', e);
  });
}

export function adminFilterText(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

export function filterAdminItems(listId, searchId, statusId, summaryId, itemSelector, entityLabel) {
  const root = document.getElementById(listId);
  if (!root) return;

  const searchEl = document.getElementById(searchId);
  const statusEl = document.getElementById(statusId);
  const query = adminFilterText(searchEl ? searchEl.value : '');
  const selectedStatus = adminFilterText(statusEl ? statusEl.value : 'all') || 'all';
  const items = Array.from(root.querySelectorAll(itemSelector));

  items.forEach(item => {
    const searchable = adminFilterText(item.getAttribute('data-search'));
    const itemStatus = adminFilterText(item.getAttribute('data-status'));
    const matchesSearch = !query || searchable.includes(query);
    const matchesStatus = selectedStatus === 'all' || itemStatus === selectedStatus;
    item.classList.toggle('is-filtered-out', !(matchesSearch && matchesStatus));
  });

  const canonicalItems = Array.from(root.querySelectorAll(itemSelector + '.admin-filter-canonical'));
  const countableItems = canonicalItems.length ? canonicalItems : items;
  const visibleCount = countableItems.filter(item => !item.classList.contains('is-filtered-out')).length;
  const summaryEl = document.getElementById(summaryId);
  if (summaryEl) {
    summaryEl.textContent = visibleCount === countableItems.length
      ? visibleCount + ' ' + entityLabel + '.'
      : visibleCount + ' dari ' + countableItems.length + ' ' + entityLabel + ' ditampilkan.';
  }

  root.querySelectorAll('[data-filter-empty]').forEach(emptyEl => {
    emptyEl.classList.toggle('hidden', visibleCount !== 0 || countableItems.length === 0);
  });
}

export function filterAdminCampaigns(listId, searchId, statusId, summaryId) {
  filterAdminItems(listId, searchId, statusId, summaryId, '[data-admin-campaign-item]', 'campaign');
}

export function filterAdminAccounts(listId, searchId, statusId, summaryId) {
  filterAdminItems(listId, searchId, statusId, summaryId, '[data-admin-account-item]', 'admin');
}

export function renderAdminAccounts(list) {
  if (!list.length) return '<p class="muted admin-data-empty">Belum ada Admin terdaftar.</p>';

  let cards = '<div class="admin-account-cards">';
  let table = '<div class="admin-account-table-view"><div class="table-responsive"><table><tr><th>Alias</th><th>WhatsApp</th><th>Token</th><th>Status</th><th>Aksi</th></tr>';

  list.forEach(a => {
    const waStr = String(a.CreatedBy || '');
    const wa = (waStr && (waStr.startsWith('62') || waStr.startsWith('08'))) ? waStr : '-';
    const statusValue = String(a.Status) === 'Active' ? 'active' : 'revoked';
    const searchText = adminFilterText([a.Alias, wa, a.TokenID, a.Status].join(' '));
    const dataAttrs = ' data-admin-account-item data-search="' + escapeHtml(searchText) + '" data-status="' + statusValue + '"';
    const identity = escapeHtml(a.Alias || '-');

    cards += '<article class="admin-account-card admin-filterable admin-filter-canonical"' + dataAttrs + '>';
    cards += '<div class="admin-data-card-header"><div class="admin-data-card-title"><span class="admin-data-card-label">Admin</span><strong>' + identity + '</strong></div>' + statusBadge(a.Status) + '</div>';
    cards += '<dl class="admin-data-card-meta">';
    cards += '<div><dt>WhatsApp</dt><dd>' + escapeHtml(wa) + '</dd></div>';
    cards += '<div><dt>Token</dt><dd class="token-box">' + escapeHtml(a.TokenID) + '</dd></div>';
    cards += '</dl>';
    cards += '<div class="admin-card-actions">';
    if (a.Status === 'Active') {
      cards += '<button type="button" class="btn secondary" aria-label="Nonaktifkan admin ' + identity + '" onclick="revokeAdmin(\'' + a.TokenID + '\')">Nonaktifkan</button>';
    } else {
      cards += '<button type="button" class="btn green" aria-label="Aktifkan admin ' + identity + '" onclick="reactivateAdmin(\'' + a.TokenID + '\')">Aktifkan</button>';
    }
    cards += '<button type="button" class="btn danger" aria-label="Hapus admin ' + identity + '" onclick="deleteAdmin(\'' + a.TokenID + '\')">Hapus</button>';
    cards += '</div></article>';

    table += '<tr class="admin-filterable"' + dataAttrs + '><td>' + identity + '</td><td>' + escapeHtml(wa) + '</td><td style="font-family:monospace; overflow-wrap:anywhere;">' + escapeHtml(a.TokenID) + '</td><td>' + statusBadge(a.Status) + '</td><td><div class="action-group">';
    if (a.Status === 'Active') {
      table += '<button type="button" class="btn secondary" aria-label="Nonaktifkan admin ' + identity + '" onclick="revokeAdmin(\'' + a.TokenID + '\')">Nonaktifkan</button>';
    } else {
      table += '<button type="button" class="btn green" aria-label="Aktifkan admin ' + identity + '" onclick="reactivateAdmin(\'' + a.TokenID + '\')">Aktifkan</button>';
    }
    table += '<button type="button" class="btn danger" aria-label="Hapus admin ' + identity + '" onclick="deleteAdmin(\'' + a.TokenID + '\')">Hapus</button></div></td></tr>';
  });

  cards += '<p class="muted admin-data-empty hidden" data-filter-empty>Tidak ada admin yang sesuai filter.</p></div>';
  table += '</table></div><p class="muted admin-data-empty hidden" data-filter-empty>Tidak ada admin yang sesuai filter.</p></div>';
  return cards + table;
}

export function revokeAdmin(id) {
  showConfirmModal('Nonaktifkan Admin ini? Mereka tidak akan bisa login lagi.', () => {
    call('revokeAdminToken', currentToken(), id).then(refreshAdmins).catch(e => showInfoModal(e.message || String(e), 'Error'));
  });
}

export function deleteAdmin(id) {
  showConfirmModal('Hapus Admin ini secara permanen dari database?', () => {
    call('deleteAdminToken', currentToken(), id).then(() => {
      showToast('Admin berhasil dihapus permanen.');
      refreshAdmins();
    }).catch(e => showInfoModal(e.message || String(e), 'Error'));
  });
}

export function reactivateAdmin(id) {
  showConfirmModal('Aktifkan kembali Admin ini?', () => {
    call('reactivateAdminToken', currentToken(), id).then(() => {
      showToast('Admin berhasil diaktifkan kembali.');
      refreshAdmins();
    }).catch(e => showInfoModal(e.message || String(e), 'Error'));
  });
}

export function genPicToken() {
  call('generatePicToken', currentToken()).then(tok => {
    const tokenContainer = document.getElementById('admin-new-token');
    if (tokenContainer) {
      tokenContainer.innerHTML = '<p>Token PIC baru (bagikan ke 1 orang saja):</p><div class="token-box">' + tok + '</div>';
    }
  }).catch(e => showInfoModal(e.message || String(e), 'Error'));
}

export function refreshAdminCampaigns() {
  const listEl = document.getElementById('admin-campaign-list');
  if (!listEl) return Promise.resolve();
  listEl.innerHTML = '<div class="muted" style="padding:16px;text-align:center;">Memuat daftar campaign...</div>';
  const summaryEl = document.getElementById('admin-campaign-filter-summary');
  if (summaryEl) summaryEl.textContent = 'Memuat campaign...';
  markFetchStart('Admin', 'listAllCampaigns');
  return call('listAllCampaigns', currentToken()).then(list => {
    markFetchEnd('Admin', 'listAllCampaigns', { recordCount: list.length });
    markRenderStart('Admin', 'campaigns');
    listEl.innerHTML = renderAdminCampaignViews(list);
    filterAdminCampaigns('admin-campaign-list', 'admin-campaign-search', 'admin-campaign-status-filter', 'admin-campaign-filter-summary');
    markRenderEnd('Admin', 'campaigns');
    return list;
  }).catch(e => {
    markFetchEnd('Admin', 'listAllCampaigns', { isError: true, isTimeout: e.isTimeout });
    listEl.innerHTML = '<p class="error" role="alert">Gagal memuat campaign. <button type="button" class="btn secondary btn-auto retry-action" onclick="refreshAdminCampaigns()">Coba lagi</button></p>';
    if (summaryEl) summaryEl.textContent = 'Campaign belum dapat dimuat.';
    console.error('Campaign list error:', e);
  });
}

export function renderAdminCampaignDeadline(c) {
  if (!c.Deadline || c.Status === 'Archived') return '<span class="muted">-</span>';

  const diffDays = Math.ceil((new Date(c.Deadline) - new Date()) / (1000 * 60 * 60 * 24));
  let label = '';
  let kind = 'verified';
  let className = 'success';
  const absDate = formatDate(c.Deadline);
  if (diffDays < 0) {
    label = 'Terlewat ' + Math.abs(diffDays) + ' hari (' + absDate + ')';
    kind = 'alert';
    className = 'danger';
  } else if (diffDays <= 2) {
    label = (diffDays === 0 ? 'Hari ini' : diffDays + ' hari lagi') + ' (' + absDate + ')';
    kind = 'review';
    className = 'warning';
  } else {
    label = diffDays + ' hari lagi (' + absDate + ')';
  }
  return '<span class="semantic-status ' + className + '">' + paymentStatusIcon(kind) + '<span>' + label + '</span></span>';
}

export function renderAdminCampaignActions(c, role) {
  let html = '<div class="admin-card-actions">';
  html += '<button type="button" class="btn blue" aria-label="Lihat detail campaign ' + escapeHtml(c.TargetName) + '" onclick="adminView(\'' + c.CampaignID + '\')">Lihat detail</button>';
  if (c.Status !== 'Archived') {
    html += '<button type="button" class="btn secondary" aria-label="Arsipkan campaign ' + escapeHtml(c.TargetName) + '" onclick="adminArchive(\'' + c.CampaignID + '\')">Arsipkan</button>';
  }
  if (role === 'SuperAdmin') {
    html += '<button type="button" class="btn danger" aria-label="Hapus campaign ' + escapeHtml(c.TargetName) + '" onclick="adminDelete(\'' + c.CampaignID + '\')">Hapus campaign</button>';
  }
  return html + '</div>';
}

export function renderAdminCampaignViews(list) {
  const role = safeGet('auth_role');
  if (!list.length) return '<p class="muted admin-data-empty">Belum ada campaign.</p>';

  const sortedList = list.slice().sort((a, b) => {
    const isActiveA = (a.Status === 'Open' || a.Status === 'Closed') ? 1 : 0;
    const isActiveB = (b.Status === 'Open' || b.Status === 'Closed') ? 1 : 0;
    if (isActiveA !== isActiveB) return isActiveB - isActiveA;

    const deadlineA = a.Deadline ? new Date(a.Deadline).getTime() : Infinity;
    const deadlineB = b.Deadline ? new Date(b.Deadline).getTime() : Infinity;
    if (deadlineA !== deadlineB) return deadlineA - deadlineB;

    const createdA = a.CreatedAt ? new Date(a.CreatedAt).getTime() : Infinity;
    const createdB = b.CreatedAt ? new Date(b.CreatedAt).getTime() : Infinity;
    return createdA - createdB;
  });

  let cards = '<div class="admin-campaign-cards">';
  let table = '<div class="admin-campaign-table-view"><div class="table-responsive"><table><tr><th>Target</th><th>Status</th><th>Sisa Waktu</th><th>PIC</th><th>Donatur</th><th>Terakhir Diupdate</th><th>Aksi</th></tr>';

  sortedList.forEach(c => {
    const statusValue = adminFilterText(c.Status);
    const searchText = adminFilterText([c.TargetName, c.picName, c.Status].join(' '));
    const dataAttrs = ' data-admin-campaign-item data-search="' + escapeHtml(searchText) + '" data-status="' + escapeHtml(statusValue) + '"';
    const targetName = escapeHtml(c.TargetName);
    const updateText = c.ModifiedBy ? (formatTime(c.ModifiedAt) + '<br><small>oleh ' + escapeHtml(c.ModifiedBy) + '</small>') : '-';

    let overdueCallout = '';
    if (c.Status === 'Open' && c.Deadline && new Date(c.Deadline) < new Date()) {
      overdueCallout = '<div class="admin-overdue-callout" style="background:#fff1f2; border-left:4px solid var(--red); padding:8px 12px; margin-top:8px; border-radius:4px; font-size:12px; color:#991b1b;"><strong>Campaign terlewat:</strong> Hubungi PIC untuk menutup pendaftaran atau perbarui deadline.</div>';
    }

    cards += '<article class="admin-campaign-card admin-filterable admin-filter-canonical"' + dataAttrs + '>';
    cards += '<div class="admin-data-card-header"><div class="admin-data-card-title"><span class="admin-data-card-label">Target</span><strong>' + targetName + '</strong></div>' + statusBadge(c.Status) + '</div>';
    cards += '<dl class="admin-data-card-meta">';
    cards += '<div><dt>Sisa waktu</dt><dd>' + renderAdminCampaignDeadline(c) + '</dd></div>';
    cards += '<div><dt>Donatur</dt><dd>' + String(c.paidCount) + '/' + String(c.donorCount) + ' sudah bayar</dd></div>';
    cards += '</dl>';
    cards += overdueCallout;
    cards += '<details class="admin-card-more" style="margin-top: 8px; border-top: 1px dashed var(--border); padding-top: 6px;"><summary class="muted" style="cursor: pointer; font-size: 12px;">Info PIC & Log</summary><div style="font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.4;"><span><strong>PIC:</strong> ' + escapeHtml(c.picName || '-') + '</span><br><span><strong>Terakhir diupdate:</strong> ' + updateText + '</span></div></details>';
    cards += renderAdminCampaignActions(c, role) + '</article>';

    table += '<tr class="admin-filterable"' + dataAttrs + '><td>' + targetName + '</td><td>' + statusBadge(c.Status) + '</td>';
    table += '<td>' + renderAdminCampaignDeadline(c) + '</td><td>' + escapeHtml(c.picName || '-') + '</td><td>' + String(c.paidCount) + '/' + String(c.donorCount) + '</td>';
    table += '<td class="muted">' + updateText + '</td><td><div class="action-group">';
    table += '<button type="button" class="btn blue" aria-label="Lihat detail campaign ' + targetName + '" onclick="adminView(\'' + c.CampaignID + '\')">Lihat</button>';
    if (c.Status !== 'Archived') {
      table += '<button type="button" class="btn amber" aria-label="Arsipkan campaign ' + targetName + '" onclick="adminArchive(\'' + c.CampaignID + '\')">Arsipkan</button>';
    }
    if (role === 'SuperAdmin') {
      table += '<button type="button" class="btn danger" aria-label="Hapus campaign ' + targetName + '" onclick="adminDelete(\'' + c.CampaignID + '\')">Hapus</button>';
    }
    table += '</div></td></tr>';
  });

  cards += '<p class="muted admin-data-empty hidden" data-filter-empty>Tidak ada campaign yang sesuai filter.</p></div>';
  table += '</table></div><p class="muted admin-data-empty hidden" data-filter-empty>Tidak ada campaign yang sesuai filter.</p></div>';
  return cards + table;
}

export function adminView(campaignId) {
  call('getCampaignDetailAdmin', currentToken(), campaignId)
    .then(detail => {
      return call('fetchAllMembers', currentToken()).then(members => {
        return { detail: detail, members: members };
      });
    })
    .then(res => {
      const detail = res.detail;
      const members = res.members.filter(m => String(m.Status).toLowerCase() === 'active');

      let html = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999;padding:16px;">';
      html += '<div class="card" style="width:100%;max-width:600px;max-height:90vh;overflow-y:auto;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
      html += '<h2 style="margin:0;">Detail Campaign</h2>';
      html += '<button class="link-btn" onclick="document.getElementById(\'admin-modal\').innerHTML=\'\'" style="font-size:18px;color:var(--text);">&times;</button>';
      html += '</div>';

      if (detail.picToken) {
        html += '<button class="btn secondary" style="margin-bottom:12px;" onclick="deepDive(\'' + detail.picToken + '\'); document.getElementById(\'admin-modal\').innerHTML=\'\';">Tinjau sebagai PIC</button>';
      }

      const c = detail.campaign;

      if (c.Status === 'Finalized') {
        html += '<button class="btn amber" style="margin-bottom:12px; margin-left:8px;" onclick="adminRecalculateUI(\'' + c.CampaignID + '\')">Hitung Ulang Tagihan Donatur</button>';
      }
      let totalRefund = 0;
      detail.donors.forEach(d => {
        if (String(d.Paid).toUpperCase() === 'TRUE' && d.AmountPaid) {
          const diff = Number(d.AmountPaid) - Number(d.AmountDue);
          if (diff > 0 && String(d.Refunded).toUpperCase() !== 'TRUE') totalRefund += diff;
        }
      });

      html += '<strong>Target: ' + escapeHtml(c.TargetName) + '</strong> ' + statusBadge(c.Status) + '<br>';
      const role = safeGet('auth_role');
      let editGiftBtn = '';
      if (role === 'Admin' || role === 'SuperAdmin') {
        editGiftBtn = ' <button class="link-btn" style="font-size:12px; margin-left:4px;" onclick="adminEditGiftAmountUI(\'' + c.CampaignID + '\', \'' + c.GiftAmount + '\')">✏️ Edit</button>';
      }
      html += '<p class="muted">Total Hadiah: ' + formatIDR(c.GiftAmount) + editGiftBtn + ' &middot; ' + detail.donors.length + ' donatur</p>';
      if (totalRefund > 0) {
        html += '<p style="color:var(--amber); font-weight:bold; margin-bottom:12px;">⚠️ Total Perlu Refund: ' + formatIDR(totalRefund) + '</p>';
      }
      if (c.Reason) html += '<p class="muted">' + escapeHtml(c.Reason) + '</p>';

      if (detail.donors.length) {
        let donorCards = '<div class="admin-detail-donor-cards">';
        let donorTable = '<div class="admin-detail-donor-table"><div class="table-responsive"><table><tr><th>Nama</th><th>WA</th><th>Tagihan</th><th>Nominal Transfer</th><th>Terakhir Diupdate</th>';
        if (role === 'Admin' || role === 'SuperAdmin') {
          donorTable += '<th>Aksi</th>';
        }
        donorTable += '</tr>';
        detail.donors.forEach(d => {
          const displayName = d.Alias ? d.Name + ' (Alias: ' + d.Alias + ')' : d.Name;
          const isPaid = String(d.Paid).toUpperCase() === 'TRUE';
          const statusHtml = isPaid
            ? '<span class="semantic-status success">' + paymentStatusIcon('verified') + '<span>Lunas</span></span>'
            : '<span class="semantic-status warning">' + paymentStatusIcon('review') + '<span>Belum</span></span>';
          const displayNameHtml = escapeHtml(displayName);
          const paidText = d.AmountPaid ? formatIDR(d.AmountPaid) : '(Kosong)';
          const updateText = d.ModifiedBy ? (formatTime(d.ModifiedAt) + '<br><small>oleh ' + escapeHtml(d.ModifiedBy) + '</small>') : '-';
          const newPaidStatus = isPaid ? 'FALSE' : 'TRUE';

          donorCards += '<article class="admin-detail-donor-card"><div class="admin-data-card-header"><div class="admin-data-card-title"><span class="admin-data-card-label">Donatur</span><strong>' + displayNameHtml + '</strong></div>' + statusHtml + '</div>';
          donorCards += '<dl class="admin-data-card-meta"><div><dt>WhatsApp</dt><dd>' + escapeHtml(d.WhatsApp) + '</dd></div><div><dt>Tagihan</dt><dd>' + formatIDR(d.AmountDue) + '</dd></div><div><dt>Nominal transfer</dt><dd>' + paidText + '</dd></div><div><dt>Terakhir diupdate</dt><dd class="muted">' + updateText + '</dd></div></dl>';
          if (role === 'Admin' || role === 'SuperAdmin') {
            donorCards += '<div class="admin-card-actions"><button type="button" class="btn secondary" aria-label="Tandai ' + displayNameHtml + ' sebagai ' + (isPaid ? 'belum lunas' : 'lunas') + '" onclick="adminTogglePaidUI(\'' + c.CampaignID + '\', \'' + d.WhatsApp + '\', \'' + newPaidStatus + '\')">Tandai ' + (isPaid ? 'belum lunas' : 'lunas') + '</button>';
            donorCards += '<button type="button" class="btn secondary" aria-label="Edit nominal transfer ' + displayNameHtml + '" onclick="editAmountPaid(\'' + c.CampaignID + '\', \'' + d.WhatsApp + '\', \'' + d.AmountPaid + '\')">Edit nominal transfer</button>';
            donorCards += '<button type="button" class="btn danger" aria-label="Hapus donatur ' + displayNameHtml + '" onclick="adminDeleteDonorUI(\'' + c.CampaignID + '\', \'' + d.WhatsApp + '\')">Hapus donatur</button></div>';
          }
          donorCards += '</article>';

          donorTable += '<tr><td>' + displayNameHtml + '<br>' + statusHtml + '</td><td>' + escapeHtml(d.WhatsApp) + '</td><td>' + formatIDR(d.AmountDue) + '</td>';
          donorTable += '<td>' + paidText;
          donorTable += '<button type="button" class="link-btn admin-inline-action" aria-label="Edit nominal transfer ' + displayNameHtml + '" onclick="editAmountPaid(\'' + c.CampaignID + '\', \'' + d.WhatsApp + '\', \'' + d.AmountPaid + '\')">Edit</button></td>';
          donorTable += '<td class="muted">' + updateText + '</td>';
          if (role === 'Admin' || role === 'SuperAdmin') {
            donorTable += '<td><div class="action-group"><button type="button" class="btn secondary" aria-label="Tandai ' + displayNameHtml + ' sebagai ' + (isPaid ? 'belum lunas' : 'lunas') + '" onclick="adminTogglePaidUI(\'' + c.CampaignID + '\', \'' + d.WhatsApp + '\', \'' + newPaidStatus + '\')">' + (isPaid ? 'Belum lunas' : 'Lunas') + '</button><button type="button" class="btn danger" aria-label="Hapus donatur ' + displayNameHtml + '" onclick="adminDeleteDonorUI(\'' + c.CampaignID + '\', \'' + d.WhatsApp + '\')">Hapus</button></div></td>';
          }
          donorTable += '</tr>';
        });
        donorCards += '</div>';
        donorTable += '</table></div></div>';
        html += donorCards + donorTable;
      } else {
        html += '<p class="muted">Belum ada donatur.</p>';
      }

      if (c.Status !== 'Archived') {
        let transferHtml = '<div style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 16px; margin-bottom: 12px;">';
        transferHtml += '<h3 style="margin-top:0; font-size: 14px; color:var(--text);">🔄 Transfer Kepemilikan Campaign</h3>';
        transferHtml += '<p class="muted" style="font-size:11px; margin-bottom:8px; line-height:1.4;">Pindahkan hak PIC campaign ini ke member lain. Token PIC lama akan kedaluwarsa secara otomatis.</p>';
        transferHtml += '<div style="display:flex; gap:8px;">';
        transferHtml += '<select id="transfer-pic-select" style="flex:1; padding:6px; font-size:13px; border-radius:6px; border:1px solid var(--border); background:var(--card); color:var(--text);">';
        transferHtml += '<option value="">-- Pilih PIC Baru --</option>';
        members.forEach(m => {
          transferHtml += '<option value="' + escapeHtml(m.WhatsApp) + '">' + escapeHtml(m.Name) + ' (' + escapeHtml(m.WhatsApp) + ')</option>';
        });
        transferHtml += '</select>';
        transferHtml += '<button class="btn blue btn-auto" style="margin:0; padding:6px 12px; font-size:12px;" onclick="adminTransferOwnershipUI(\'' + c.CampaignID + '\')">Transfer</button>';
        transferHtml += '</div>';
        transferHtml += '</div>';
        html += transferHtml;
      }

      html += '</div></div>';

      let modalContainer = document.getElementById('admin-modal');
      if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'admin-modal';
        document.body.appendChild(modalContainer);
      }
      modalContainer.innerHTML = html;
    })
    .catch(e => showInfoModal(e.message || String(e), 'Error'));
}

export function adminRecalculateUI(campaignId) {
  showConfirmModal('Yakin ingin menghitung ulang pembagian donasi? Ini akan memperbarui nominal tagihan seluruh donatur pada campaign ini.', () => {
    callQueued('adminRecalculateCampaign', currentToken(), campaignId)
      .then(() => {
        showToast('Kalkulasi ulang berhasil.');
        adminView(campaignId);
      })
      .catch(e => showInfoModal(e.message || String(e), 'Error'));
  });
}

export function adminTransferOwnershipUI(campaignId) {
  const select = document.getElementById('transfer-pic-select');
  const targetWhatsapp = select ? select.value : '';
  if (!targetWhatsapp) {
    showInfoModal('Pilih member target terlebih dahulu.', 'Info');
    return;
  }
  
  showConfirmModal('Yakin ingin mentransfer kepemilikan campaign ini? PIC lama akan kehilangan akses dan campaign akan dipindahkan ke PIC baru.', () => {
    call('transferCampaignOwnershipAdmin', currentToken(), campaignId, targetWhatsapp)
      .then(newToken => {
        showInfoModal('Transfer kepemilikan berhasil!\nToken PIC Baru: ' + newToken + '\n\nCampaign ini otomatis muncul di dashboard member yang bersangkutan.', 'Sukses');
        const adminModal = document.getElementById('admin-modal');
        if (adminModal) adminModal.innerHTML = '';
        
        const role = safeGet('auth_role');
        if (role === 'SuperAdmin') {
          refreshSACampaigns();
        } else {
          refreshAdminCampaigns();
        }
      })
      .catch(e => showInfoModal(e.message || String(e), 'Error'));
  });
}

export function closeEditGiftModal() {
  const modal = document.getElementById('edit-gift-modal');
  if (modal) modal.style.display = 'none';
}

export function adminEditGiftAmountUI(campaignId, currentGiftAmount) {
  let modal = document.getElementById('edit-gift-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'edit-gift-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:none;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div class="card" style="max-width:400px;width:100%;margin:16px;position:relative;">
        <button style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:24px;line-height:1;cursor:pointer;color:#888;" onclick="closeEditGiftModal()">&times;</button>
        <h3 style="margin-top:0;">Edit Total Hadiah</h3>
        <p class="muted">Masukkan nominal Total Hadiah baru (IDR):</p>
        <label>Total Hadiah</label>
        <input type="text" id="edit-gift-input" inputmode="numeric" onkeyup="formatInputRibuan(event)" placeholder="Contoh: 1.000.000">
        <div class="modal-actions" style="display:flex;gap:8px;margin-top:16px;">
          <button class="btn secondary" onclick="closeEditGiftModal()">Batal</button>
          <button class="btn blue" id="edit-gift-save">Simpan</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const inputEl = document.getElementById('edit-gift-input');
  if (inputEl) {
    inputEl.value = currentGiftAmount ? Number(currentGiftAmount).toLocaleString('id-ID') : '';
    inputEl.focus();
  }
  modal.style.display = 'flex';

  const saveBtn = document.getElementById('edit-gift-save');
  if (saveBtn) {
    saveBtn.onclick = function () {
      const rawStr = inputEl ? inputEl.value : '';
      const newVal = parseRibuan(rawStr);
      if (isNaN(newVal) || rawStr.trim() === '' || newVal < 0) {
        showInfoModal('Nominal tidak valid.', 'Error');
        return;
      }
      closeEditGiftModal();
      showConfirmModal('Yakin ingin mengubah Total Hadiah menjadi ' + formatIDR(newVal) + '? (Jangan lupa Hitung Ulang Tagihan Donatur setelah ini!)', () => {
        callQueued('adminUpdateGiftAmount', currentToken(), campaignId, newVal)
          .then(() => {
            showToast('Total Hadiah berhasil diperbarui.');
            adminView(campaignId);
          })
          .catch(e => showInfoModal(e.message || String(e), 'Error'));
      });
    };
  }
}

export function adminDeleteDonorUI(campaignId, whatsapp) {
  showConfirmModal('Yakin ingin menghapus donatur ini?', () => {
    callQueued('adminDeleteDonor', currentToken(), campaignId, whatsapp)
      .then(() => {
        showToast('Donatur berhasil dihapus.');
        adminView(campaignId);
      })
      .catch(e => showInfoModal(e.message || String(e), 'Error'));
  });
}

export function adminTogglePaidUI(campaignId, whatsapp, newPaidStatus) {
  showConfirmModal('Yakin ingin mengubah status pembayaran donatur ini?', () => {
    callQueued('adminTogglePaidStatus', currentToken(), campaignId, whatsapp, newPaidStatus)
      .then(() => {
        showToast('Status pembayaran berhasil diubah.');
        adminView(campaignId);
      })
      .catch(e => showInfoModal(e.message || String(e), 'Error'));
  });
}

export function closeEditAmountModal() {
  const modal = document.getElementById('edit-amount-modal');
  if (modal) modal.style.display = 'none';
}

export function editAmountPaid(campaignId, whatsapp, currentAmount) {
  let modal = document.getElementById('edit-amount-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'edit-amount-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:none;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div class="card" style="max-width:400px;width:100%;margin:16px;position:relative;">
        <button style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:24px;line-height:1;cursor:pointer;color:#888;" onclick="closeEditAmountModal()">&times;</button>
        <h3 style="margin-top:0;">Edit Nominal Transfer</h3>
        <p class="muted" id="edit-amount-desc"></p>
        <label>Nominal Aktual (IDR)</label>
        <input type="text" id="edit-amount-input" inputmode="numeric" onkeyup="formatInputRibuan(event)" placeholder="Contoh: 1.000.000">
        <div class="modal-actions" style="display:flex;gap:8px;margin-top:16px;">
          <button class="btn secondary" onclick="closeEditAmountModal()">Batal</button>
          <button class="btn blue" id="edit-amount-save">Simpan</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const descEl = document.getElementById('edit-amount-desc');
  if (descEl) descEl.textContent = 'Masukkan nominal yang benar untuk ' + whatsapp + ':';

  const inputEl = document.getElementById('edit-amount-input');
  let initialVal = '';
  if (currentAmount && currentAmount !== 'undefined' && currentAmount !== 'null') {
    initialVal = Number(currentAmount).toLocaleString('id-ID');
  }
  if (inputEl) {
    inputEl.value = initialVal;
    inputEl.focus();
  }
  modal.style.display = 'flex';

  const saveBtn = document.getElementById('edit-amount-save');
  if (saveBtn) {
    saveBtn.onclick = function () {
      const rawStr = inputEl ? inputEl.value : '';
      const amount = parseRibuan(rawStr);
      if (isNaN(amount) || rawStr.trim() === '') {
        showInfoModal('Nominal tidak valid.', 'Peringatan');
        return;
      }

      closeEditAmountModal();

      callQueued('updateDonorPaidAmountAdmin', currentToken(), campaignId, whatsapp, amount)
        .then(() => {
          showToast('Data berhasil diperbarui!');
          adminView(campaignId);
          refreshSummary('sa-summary');
        })
        .catch(e => showInfoModal(e.message || String(e), 'Error'));
    };
  }
}

export function adminArchive(id) {
  showConfirmModal('Arsipkan campaign ini?', () => {
    callQueued('setCampaignStatusAdmin', currentToken(), id, 'Archived')
      .then(() => { refreshAdminCampaigns(); if (document.getElementById('sa-campaign-list')) refreshSACampaigns(); })
      .catch(e => showInfoModal(e.message || String(e), 'Error'));
  });
}

export function adminDelete(id) {
  showConfirmModal('Hapus campaign ini secara permanen? Tidak bisa dibatalkan.', () => {
    callQueued('deleteCampaignAdmin', currentToken(), id)
      .then(() => { refreshAdminCampaigns(); if (document.getElementById('sa-campaign-list')) refreshSACampaigns(); })
      .catch(e => showInfoModal(e.message || String(e), 'Error'));
  });
}

export function loadMoreMembers(scope = 'admin') {
  appState.memberPageSize[scope] = (appState.memberPageSize[scope] || 20) + 20;
  const isSuperAdmin = scope === 'sa';
  const listId = isSuperAdmin ? 'sa-member-list' : 'admin-member-list';
  const searchId = isSuperAdmin ? 'sa-search-member' : 'admin-search-member';
  const statusId = isSuperAdmin ? 'sa-member-status-filter' : 'admin-member-status-filter';
  const summaryId = isSuperAdmin ? 'sa-member-filter-summary' : 'admin-member-filter-summary';
  filterMembers(listId, searchId, statusId, summaryId);
}

export function filterMembers(listId, searchId, statusId, summaryId) {
  const isSuperAdmin = String(listId).startsWith('sa-');
  const scope = isSuperAdmin ? 'sa' : 'admin';
  const root = document.getElementById(listId);
  if (!root) return;

  const searchEl = document.getElementById(searchId);
  const statusEl = document.getElementById(statusId);
  const query = adminFilterText(searchEl ? searchEl.value : '');
  const selectedStatus = adminFilterText(statusEl ? statusEl.value : 'all') || 'all';
  const isFiltering = Boolean(query || selectedStatus !== 'all');

  const fullList = appState.allActiveMembers[scope] || [];
  const filteredList = fullList.filter(m => {
    const searchable = adminFilterText([m.Name, m.WhatsApp, m.Role, m.Status, m.ModifiedBy].join(' '));
    const itemStatus = adminFilterText(m.Status);
    const matchesSearch = !query || searchable.includes(query);
    const matchesStatus = selectedStatus === 'all' || itemStatus === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const limit = appState.memberPageSize[scope] || 20;
  const total = fullList.length;
  const listToRender = isFiltering ? filteredList : fullList.slice(0, limit);
  const displayedCount = isFiltering ? filteredList.length : Math.min(limit, total);

  root.innerHTML = renderMembersHtml(listToRender, isSuperAdmin, scope, total, displayedCount, isFiltering);

  const summaryEl = document.getElementById(summaryId);
  if (summaryEl) {
    summaryEl.textContent = 'Menampilkan ' + displayedCount + ' dari ' + total + ' member.';
  }
}

export function refreshMembers() {
  markFetchStart('Admin', 'fetchAllMembers');
  return call('fetchAllMembers', currentToken()).then(list => {
    markFetchEnd('Admin', 'fetchAllMembers', { recordCount: list.length });
    markRenderStart('Admin', 'members');
    const activeList = list.filter(m => {
      const st = String(m.Status).toLowerCase();
      return st !== 'deleted' && st !== 'rejected';
    });
    const role = safeGet('auth_role');
    const isSuperAdmin = role === 'SuperAdmin';
    const scope = isSuperAdmin ? 'sa' : 'admin';
    const listId = isSuperAdmin ? 'sa-member-list' : 'admin-member-list';
    const searchId = isSuperAdmin ? 'sa-search-member' : 'admin-search-member';
    const statusId = isSuperAdmin ? 'sa-member-status-filter' : 'admin-member-status-filter';
    const summaryId = isSuperAdmin ? 'sa-member-filter-summary' : 'admin-member-filter-summary';
    appState.allActiveMembers[scope] = activeList;
    appState.memberPageSize[scope] = 20;
    filterMembers(listId, searchId, statusId, summaryId);
    markRenderEnd('Admin', 'members');
    return activeList;
  }).catch(e => {
    markFetchEnd('Admin', 'fetchAllMembers', { isError: true, isTimeout: e.isTimeout });
    const role = safeGet('auth_role');
    const el = document.getElementById(role === 'SuperAdmin' ? 'sa-member-list' : 'admin-member-list');
    if (el) el.innerHTML = '<p class="error" role="alert">Gagal memuat member. <button type="button" class="btn secondary btn-auto retry-action" onclick="refreshMembers()">Coba lagi</button></p>';
    console.error('Members fetch error:', e);
  });
}

export function renderMemberStatusControl(m) {
  const wa = escapeHtml(m.WhatsApp);
  const currentStatus = String(m.Status).toLowerCase();
  let html = '<select class="admin-status-control member-status-control" data-member-wa="' + wa + '" aria-label="Status member ' + escapeHtml(m.Name) + '" onchange="updateMemberStatusUI(this)">';
  ['Active', 'Ex', 'Pending'].forEach(st => {
    html += '<option value="' + st.toLowerCase() + '"' + (currentStatus === st.toLowerCase() ? ' selected' : '') + '>' + st + '</option>';
  });
  return html + '</select>';
}

export function renderMemberActions(m) {
  let html = '<div class="admin-card-actions">';
  if (m.Role !== 'Admin' && m.Role !== 'SuperAdmin') {
    html += '<button type="button" class="btn blue" aria-label="Jadikan ' + escapeHtml(m.Name) + ' sebagai Admin" onclick="assignMemberRoleUI(\'' + m.WhatsApp + '\', \'Admin\')">Jadikan Admin</button>';
  }
  if (m.Role !== 'PIC' && m.Role !== 'SuperAdmin') {
    html += '<button type="button" class="btn secondary" aria-label="Jadikan ' + escapeHtml(m.Name) + ' sebagai PIC" onclick="assignMemberRoleUI(\'' + m.WhatsApp + '\', \'PIC\')">Jadikan PIC</button>';
  }
  html += '<button type="button" class="btn danger" aria-label="Hapus member ' + escapeHtml(m.Name) + '" onclick="removeMemberUI(\'' + m.WhatsApp + '\')">Hapus member</button>';
  return html + '</div>';
}

export function renderMembersView(activeList, isSuperAdmin, scope = (isSuperAdmin ? 'sa' : 'admin')) {
  appState.allActiveMembers[scope] = activeList;
  appState.memberPageSize[scope] = 20;
  const total = activeList.length;
  const limit = 20;
  const listToRender = activeList.slice(0, limit);
  const displayedCount = Math.min(limit, total);
  return renderMembersHtml(listToRender, isSuperAdmin, scope, total, displayedCount, false);
}

export function renderMembersHtml(itemsToRender, isSuperAdmin, scope, total, displayedCount, isFiltering) {
  if (!itemsToRender.length && total === 0) return '<p class="muted admin-data-empty">Belum ada member terdaftar.</p>';

  let cards = '<div class="admin-member-cards">';
  let table = '<div class="admin-member-table-view"><div class="table-responsive"><table><tr><th>Nama</th><th>WA</th><th>Role</th><th>Status</th><th>Terakhir Diupdate</th>' + (isSuperAdmin ? '<th>Aksi</th>' : '') + '</tr>';

  itemsToRender.forEach(m => {
    const statusValue = adminFilterText(m.Status);
    const searchText = adminFilterText([m.Name, m.WhatsApp, m.Role, m.Status, m.ModifiedBy].join(' '));
    const dataAttrs = ' data-admin-member-item data-search="' + escapeHtml(searchText) + '" data-status="' + escapeHtml(statusValue) + '"';
    const name = escapeHtml(m.Name);
    const updateText = m.ModifiedBy ? (formatTime(m.ModifiedAt) + '<br><small>oleh ' + escapeHtml(m.ModifiedBy) + '</small>') : '-';

    cards += '<article class="admin-member-card admin-filterable admin-filter-canonical"' + dataAttrs + '>';
    cards += '<div class="admin-data-card-header"><div class="admin-data-card-title"><span class="admin-data-card-label">Member</span><strong>' + name + '</strong></div><span class="badge">' + escapeHtml(m.Role || 'Member') + '</span></div>';
    cards += '<dl class="admin-data-card-meta">';
    cards += '<div><dt>WhatsApp</dt><dd>' + escapeHtml(m.WhatsApp) + '</dd></div>';
    cards += '<div><dt>Status</dt><dd>' + renderMemberStatusControl(m) + '</dd></div>';
    cards += '<div><dt>Terakhir diupdate</dt><dd class="muted">' + updateText + '</dd></div>';
    cards += '</dl>' + (isSuperAdmin ? renderMemberActions(m) : '') + '</article>';

    table += '<tr class="admin-filterable"' + dataAttrs + '><td>' + name + '</td><td>' + escapeHtml(m.WhatsApp) + '</td><td><span class="badge">' + escapeHtml(m.Role || 'Member') + '</span></td><td>' + renderMemberStatusControl(m) + '</td><td class="muted">' + updateText + '</td>';
    if (isSuperAdmin) {
      table += '<td><div class="action-group">';
      if (m.Role !== 'Admin' && m.Role !== 'SuperAdmin') {
        table += '<button type="button" class="btn blue" aria-label="Jadikan ' + name + ' sebagai Admin" onclick="assignMemberRoleUI(\'' + m.WhatsApp + '\', \'Admin\')">+ Admin</button>';
      }
      if (m.Role !== 'PIC' && m.Role !== 'SuperAdmin') {
        table += '<button type="button" class="btn secondary" aria-label="Jadikan ' + name + ' sebagai PIC" onclick="assignMemberRoleUI(\'' + m.WhatsApp + '\', \'PIC\')">+ PIC</button>';
      }
      table += '<button type="button" class="btn danger" aria-label="Hapus member ' + name + '" onclick="removeMemberUI(\'' + m.WhatsApp + '\')">Hapus</button></div></td>';
    }
    table += '</tr>';
  });

  let paginationHtml = '';
  if (!isFiltering) {
    if (displayedCount < total) {
      paginationHtml = '<div class="admin-pagination-controls" style="text-align:center; padding:16px 0;">' +
        '<p class="muted" style="margin-bottom:8px; font-size:13px;">Menampilkan ' + displayedCount + ' dari ' + total + ' member</p>' +
        '<button type="button" class="btn secondary btn-auto" onclick="loadMoreMembers(\'' + scope + '\')">Muat lebih banyak</button>' +
        '</div>';
    } else {
      paginationHtml = '<div class="admin-pagination-controls" style="text-align:center; padding:12px 0;">' +
        '<p class="muted" style="margin:0; font-size:13px;">Menampilkan ' + displayedCount + ' dari ' + total + ' member</p>' +
        '</div>';
    }
  }

  cards += '<p class="muted admin-data-empty hidden" data-filter-empty>Tidak ada member yang sesuai filter.</p></div>';
  table += '</table></div><p class="muted admin-data-empty hidden" data-filter-empty>Tidak ada member yang sesuai filter.</p></div>';
  return cards + table + paginationHtml;
}

export function updateMemberStatusUI(source) {
  const sel = source && source.nodeType ? source : null;
  const wa = sel ? sel.getAttribute('data-member-wa') : String(source || '');
  const controls = Array.from(document.querySelectorAll('.member-status-control')).filter(control => control.getAttribute('data-member-wa') === wa);
  const activeControl = sel || controls[0];
  if (!activeControl) return;
  const newStatus = activeControl.value;
  controls.forEach(control => control.disabled = true);
  callQueued('adminUpdateMemberStatus', currentToken(), wa, newStatus)
    .then(() => {
      controls.forEach(control => control.disabled = false);
      showToast('Status berhasil diupdate.');
      refreshMembers();
      refreshPendingMembers(safeGet('auth_role') === 'SuperAdmin' ? 'sa-pending-members' : 'admin-pending-members');
    })
    .catch(e => {
      controls.forEach(control => control.disabled = false);
      showInfoModal(e.message || String(e), 'Error');
    });
}

export function assignMemberRoleUI(wa, role) {
  showConfirmModal('Jadikan member ini sebagai ' + role + '?', () => {
    call('superAdminAssignMemberRole', currentToken(), wa, role)
      .then(res => {
        if (res && res.error) throw new Error(res.error);
        showToast(res ? res.message : 'Role berhasil diperbarui.');
        refreshMembers();
        if (role === 'Admin') refreshAdmins();
      })
      .catch(e => showInfoModal(e.message || String(e), 'Error'));
  });
}

export function addMemberUI() {
  const nameInput = document.getElementById('sa-mem-name');
  const waInput = document.getElementById('sa-mem-wa');
  const statusSel = document.getElementById('sa-mem-status');
  const msgEl = document.getElementById('sa-member-msg');

  const name = nameInput ? nameInput.value.trim() : '';
  const wa = waInput ? waInput.value.trim() : '';
  const status = statusSel ? statusSel.value : 'Active';

  call('addMember', currentToken(), name, wa, status).then(() => {
    if (nameInput) nameInput.value = '';
    if (waInput) waInput.value = '';
    if (msgEl) msgEl.innerHTML = '<div class="success">Member berhasil ditambahkan.</div>';
    refreshMembers();
  }).catch(e => {
    if (msgEl) msgEl.innerHTML = '<div class="error">' + formatUserErrorMessage(e) + '</div>';
  });
}

export function removeMemberUI(wa) {
  showConfirmModal('Hapus member ini?', () => {
    callQueued('removeMember', currentToken(), wa).then(() => {
      showToast('Member berhasil dihapus.');
      refreshMembers();
      refreshPendingMembers(safeGet('auth_role') === 'SuperAdmin' ? 'sa-pending-members' : 'admin-pending-members');
    }).catch(e => showInfoModal(e.message || String(e), 'Error'));
  });
}

export function refreshSACampaigns() {
  const listEl = document.getElementById('sa-campaign-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="muted" style="padding:16px;text-align:center;">Memuat daftar campaign...</div>';
  const summaryEl = document.getElementById('sa-campaign-filter-summary');
  if (summaryEl) summaryEl.textContent = 'Memuat campaign...';
  call('listAllCampaigns', currentToken()).then(list => {
    listEl.innerHTML = renderAdminCampaignViews(list);
    filterAdminCampaigns('sa-campaign-list', 'sa-campaign-search', 'sa-campaign-status-filter', 'sa-campaign-filter-summary');
  }).catch(e => {
    listEl.innerHTML = '<p class="error" role="alert">Gagal memuat campaign. <button type="button" class="link-btn" onclick="refreshSACampaigns()">Coba lagi</button></p>';
    if (summaryEl) summaryEl.textContent = 'Campaign belum dapat dimuat.';
    console.error('SuperAdmin campaign list error:', e);
  });
}
