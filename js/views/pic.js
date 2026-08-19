// PIC Campaign Management, Donor Verification, Progress, and Finalization

import { safeGet, safeRemove } from '../storage.js';
import { escapeHtml, sanitizeUrl, formatUserErrorMessage, showInfoModal, showConfirmModal, showToast, showView, formatIDR, formatTime, parseRibuan, statusBadge, paymentStatusIcon, actionArrowIcon } from '../utils.js';
import { call, callQueued } from '../api.js';
import { appState, currentToken } from '../state.js';
import { loadUserDashboard } from './donor.js';
import { getClient } from '../services/supabaseClient.js';

function _getSupabaseClient() {
  if (typeof getClient === 'function') {
    const cl = getClient();
    if (cl) return cl;
  }
  if (typeof window !== 'undefined') {
    if (window.__dhSupabase && typeof window.__dhSupabase.getClient === 'function') {
      const cl = window.__dhSupabase.getClient();
      if (cl) return cl;
    }
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      return window.supabase;
    }
  }
  return null;
}

function _normalizeCampaignStatus(rawStatus) {
  if (!rawStatus) return 'Open';
  const upper = String(rawStatus).toUpperCase();
  if (upper === 'OPEN') return 'Open';
  if (upper === 'CLOSED') return 'Closed';
  if (upper === 'FINALIZED') return 'Finalized';
  if (upper === 'ARCHIVED') return 'Archived';
  if (upper === 'DRAFT') return 'Draft';
  return rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
}

function _copyText(text, successMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => showToast(successMsg)).catch(() => showToast('Gagal menyalin.'));
  }
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  showToast(successMsg);
}

export async function getBuktiSignedUrl(storagePath) {
  if (!storagePath || typeof storagePath !== 'string' || !storagePath.trim()) return null;
  const cleanPath = storagePath.trim();
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) return cleanPath;
  try {
    const client = _getSupabaseClient();
    if (!client || !client.storage) return null;
    const { data, error } = await client.storage.from('bukti-transfer').createSignedUrl(cleanPath, 3600);
    return (!error && data && data.signedUrl) ? data.signedUrl : null;
  } catch (e) {
    return null;
  }
}

export async function uploadGiftImage(campaignId, file) {
  if (!file) return null;
  const client = _getSupabaseClient();
  if (!client || !client.storage) throw new Error('Layanan penyimpanan Supabase belum siap.');
  const timestamp = Date.now();
  const fileName = file.name || 'gift.jpg';
  const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
  const cleanCampaignId = String(campaignId || 'campaign').replace(/[^a-zA-Z0-9_-]/g, '_');
  const storagePath = `gifts/${cleanCampaignId}/${timestamp}.${ext}`;

  const { data, error } = await client.storage.from('bukti-transfer').upload(storagePath, file, { upsert: true });
  if (error) throw new Error('Gagal mengunggah foto hadiah: ' + (error.message || 'Error'));
  return (data && data.path) ? data.path : storagePath;
}

export async function resolvePicMediaUrls(detail) {
  if (!detail) return;
  const promises = [];

  if (detail.campaign) {
    const giftImg = detail.campaign.gift_image || detail.campaign.GiftImage;
    if (giftImg && typeof giftImg === 'string' && !giftImg.startsWith('http')) {
      promises.push(
        getBuktiSignedUrl(giftImg).then(url => {
          if (url) {
            detail.campaign.GiftImage = url;
            detail.campaign.gift_image = url;
          }
        })
      );
    }
  }

  if (Array.isArray(detail.donors)) {
    detail.donors.forEach(d => {
      const storagePath = d.proof_storage_path || d.ProofStoragePath;
      if (storagePath && typeof storagePath === 'string' && !storagePath.startsWith('http')) {
        promises.push(
          getBuktiSignedUrl(storagePath).then(url => {
            if (url) {
              d._resolvedProofUrl = url;
              d.ProofLink = url;
              d.proof_link = url;
            }
          })
        );
      }
    });
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }
}

export function loadPicDashboard() {
  const token = currentToken();
  if (!token) {
    showView('landing');
    return Promise.resolve();
  }

  return call('getCampaignForPic', token, 1, 100).then(async detail => {
    if (!detail || !detail.campaign) {
      showView('pic-create');
      return;
    }

    await resolvePicMediaUrls(detail);
    renderPicDashboard(detail);
    showView('pic-dashboard');

    const returnAdmin = document.getElementById('btn-return-admin');
    const returnMember = document.getElementById('btn-return-member');
    const picLogout = document.getElementById('btn-pic-logout');

    if (safeGet('deep_dive_return_token')) {
      if (returnAdmin) returnAdmin.classList.remove('hidden');
      if (returnMember) returnMember.classList.add('hidden');
      if (picLogout) picLogout.classList.add('hidden');
    } else if (safeGet('donor_user')) {
      if (returnAdmin) returnAdmin.classList.add('hidden');
      if (returnMember) returnMember.classList.remove('hidden');
      if (picLogout) picLogout.classList.add('hidden');
    } else {
      if (returnAdmin) returnAdmin.classList.add('hidden');
      if (returnMember) returnMember.classList.add('hidden');
      if (picLogout) picLogout.classList.remove('hidden');
    }
  }).catch(e => showInfoModal(formatUserErrorMessage(e), 'Error'));
}

export function createCampaign() {
  const errEl = document.getElementById('pc-error');
  if (errEl) errEl.textContent = '';

  const btn = document.getElementById('btn-create-campaign');
  let originalText = '';
  if (btn) {
    originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Membuat...';
  }

  const amtInput = document.getElementById('pc-amount');
  const targetInput = document.getElementById('pc-target');
  const reasonInput = document.getElementById('pc-reason');
  const startInput = document.getElementById('pc-start');
  const deadlineInput = document.getElementById('pc-deadline');

  const data = {
    token: currentToken(),
    targetName: targetInput ? targetInput.value.trim() : '',
    reason: reasonInput ? reasonInput.value.trim() : '',
    giftAmount: amtInput ? parseRibuan(amtInput.value) : 0,
    startDate: startInput ? startInput.value : '',
    deadline: deadlineInput ? deadlineInput.value : ''
  };

  call('createCampaign', currentToken(), data).then(detail => {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
    showToast('Campaign berhasil dibuat!');
    loadPicDashboard();
  }).catch(e => {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
    if (errEl) errEl.textContent = formatUserErrorMessage(e);
  });
}

export function getPicProgress(detail) {
  const donors = (detail && detail.donors) || [];
  let collected = 0, reminderCount = 0, reviewCount = 0, verifiedCount = 0, refundCount = 0;

  donors.forEach(d => {
    const isPaid = String(d.Paid || (d.paid ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
    const isVerified = String(d.Verified || (d.verified ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
    const isRefunded = String(d.Refunded || (d.refunded ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
    const hasProof = Boolean(String(d.ProofStoragePath || d.proof_storage_path || d.ProofLink || d.proof_link || '').trim());
    const amountDue = Number(d.AmountDue !== undefined ? d.AmountDue : d.amount_due) || 0;
    const amountPaid = Number(d.AmountPaid !== undefined ? d.AmountPaid : d.amount_paid) || 0;

    if (isPaid) collected += amountPaid;
    if (isVerified) verifiedCount++;
    else if (isPaid && amountPaid > amountDue && !isRefunded) refundCount++;
    else if (hasProof) reviewCount++;
    else if (detail && detail.campaign && _normalizeCampaignStatus(detail.campaign.Status || detail.campaign.status) === 'Finalized' && !isPaid) reminderCount++;
  });

  const c = detail && detail.campaign;
  const target = c ? (Number(c.GiftAmount !== undefined ? c.GiftAmount : c.gift_amount) || 0) : 0;
  const percent = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;
  return { collected, percent, reminderCount, reviewCount, verifiedCount, refundCount, totalDonorCount: donors.length };
}

export function isVisiblePicActionTarget(el) {
  if (!el || el.classList.contains('hidden')) return false;
  return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

export function scrollToPicActions() {
  const target = document.getElementById('pic-actions');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function scrollToPicDonorAction(actionType) {
  const selector = '#pic-donor-list [data-pic-action="' + actionType + '"]';
  const targets = Array.from(document.querySelectorAll(selector));
  const target = targets.find(isVisiblePicActionTarget) || targets[0];
  if (!target) {
    scrollToPicActions();
    return;
  }

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.classList.remove('pic-donor-target-highlight');
  target.classList.add('pic-donor-target-highlight');
  target.setAttribute('tabindex', '-1');
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });

  const focusTarget = () => {
    if (typeof target.focus !== 'function') return;
    try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
  };
  if (reduceMotion) focusTarget();
  else if (typeof window !== 'undefined') window.setTimeout(focusTarget, 150);
  if (typeof window !== 'undefined') window.setTimeout(() => target.classList.remove('pic-donor-target-highlight'), reduceMotion ? 1200 : 2200);
}

export function renderPicActionItem(type, count, isPrimary) {
  const isReminder = type === 'reminder';
  const isRefund = type === 'refund';
  const label = isReminder ? 'Kirim pengingat WA' : (isRefund ? 'Refund' : 'Tinjau Bukti Transfer');
  const description = isReminder ? count + ' Donor belum upload Bukti Transfer.' : (isRefund ? count + ' Donor menunggu penyelesaian refund.' : count + ' Bukti Transfer menunggu verifikasi.');
  const className = isPrimary ? 'btn blue' : 'btn secondary';
  return '<div class="pic-action-item' + (isPrimary ? ' primary' : '') + '">' +
    '<div class="pic-action-copy"><strong>' + label + '</strong><span>' + description + '</span></div>' +
    '<button type="button" class="' + className + ' pic-next-action" onclick="scrollToPicDonorAction(\'' + type + '\')">' + label + ' ' + actionArrowIcon() + '</button>' +
    '</div>';
}

export function renderPicActionQueue(detail, progress) {
  const c = detail && detail.campaign;
  if (!c || _normalizeCampaignStatus(c.Status || c.status) !== 'Finalized') return '';

  let html = '<div class="pic-action-list" aria-label="Tindakan pembayaran">';
  if (progress.reminderCount > 0) html += renderPicActionItem('reminder', progress.reminderCount, true);
  if (progress.reviewCount > 0) html += renderPicActionItem('review', progress.reviewCount, progress.reminderCount === 0);
  if (progress.refundCount > 0) html += renderPicActionItem('refund', progress.refundCount, progress.reminderCount === 0 && progress.reviewCount === 0);
  if (progress.reminderCount === 0 && progress.reviewCount === 0 && progress.refundCount === 0) {
    const message = progress.totalDonorCount > 0 ? 'Semua pembayaran terverifikasi.' : 'Belum ada tindakan pembayaran.';
    html += '<div class="pic-complete-state" role="status">' + paymentStatusIcon('verified') + '<span>' + message + '</span></div>';
  }
  return html + '</div>';
}

export function renderPicNextAction(detail, progress) {
  const c = detail && detail.campaign;
  if (!c) return '';
  const status = _normalizeCampaignStatus(c.Status || c.status);
  if (status === 'Finalized') return renderPicActionQueue(detail, progress);

  let label = 'Lihat tindakan berikutnya';
  let action = 'scrollToPicActions()';
  if (status === 'Closed') {
    label = 'Input rekening';
    action = 'showFinalizeForm(' + (Number(c.GiftAmount !== undefined ? c.GiftAmount : c.gift_amount) || 0) + ')';
  }
  return '<button type="button" class="btn blue pic-next-action" onclick="' + action + '">' + label + ' ' + actionArrowIcon() + '</button>';
}

export function renderPicDashboard(detail) {
  if (!detail || !detail.campaign) {
    showView('pic-create');
    return;
  }
  const c = detail.campaign;
  c.CampaignID = c.CampaignID || c.campaign_id || c.campaignId || '';
  c.TargetName = c.TargetName || c.target_name || c.targetName || '';
  c.Reason = c.Reason || c.reason || '';
  c.GiftAmount = Number(c.GiftAmount !== undefined ? c.GiftAmount : c.gift_amount) || 0;
  c.Status = _normalizeCampaignStatus(c.Status || c.status);
  c.Deadline = c.Deadline || (c.deadline ? String(c.deadline).split('T')[0] : '') || '';
  c.GiftLink = c.GiftLink || c.gift_link || '';
  c.GiftImage = c.GiftImage || c.gift_image || '';
  c.BankName = c.BankName || c.bank_name || '';
  c.BankAccount = c.BankAccount || c.bank_account || '';
  c.AccountHolder = c.AccountHolder || c.account_holder || '';

  appState.picCampaignData = c;
  appState.picCampaignDetail = detail;
  const infoEl = document.getElementById('pic-campaign-info');
  const titleEl = document.getElementById('pic-dashboard-title');
  const subtitleEl = document.getElementById('pic-dashboard-subtitle');
  const progress = getPicProgress(detail);

  if (titleEl) titleEl.textContent = c.TargetName || 'Dashboard PIC';
  if (subtitleEl) subtitleEl.textContent = (c.Reason || 'Kelola progres campaign dan tindakan berikutnya.') + (c.Deadline ? ' · deadline ' + c.Deadline : '');

  const giftText = c.GiftAmount > 0 ? formatIDR(c.GiftAmount) : 'Belum ditentukan';
  const isZeroState = (!c.GiftAmount || c.GiftAmount <= 0) || (c.Status === 'Open' && progress.collected === 0);
  const zeroStateNotice = isZeroState
    ? '<div class="pic-state-callout">' + paymentStatusIcon('review') + '<span><strong>Langkah selanjutnya:</strong> Tentukan total hadiah dan rekening sebelum menagih donatur.</span></div>'
    : '';

  if (infoEl) {
    infoEl.innerHTML = '<div class="pic-progress-card">' +
      '<div class="pic-progress-header"><div><span class="role-eyebrow">PROGRES CAMPAIGN</span><h3>' + formatIDR(progress.collected) + ' terkumpul</h3></div>' + statusBadge(c.Status) + '</div>' +
      '<p class="pic-progress-copy">Target hadiah ' + giftText + ' &middot; deadline ' + (c.Deadline || '-') + '</p>' +
      '<div class="pic-progress-track" role="progressbar" aria-label="Progres campaign ' + progress.percent + ' persen" aria-valuenow="' + progress.percent + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + progress.percent + '%"></span></div>' +
      zeroStateNotice +
      '<div class="pic-progress-metrics"><div class="pic-progress-metric"><span>Pengingat pembayaran</span><strong>' + progress.reminderCount + '</strong></div><div class="pic-progress-metric"><span>Bukti Transfer perlu ditinjau</span><strong>' + progress.reviewCount + '</strong></div><div class="pic-progress-metric"><span>Sudah diverifikasi</span><strong>' + progress.verifiedCount + '</strong></div></div>' +
      renderPicNextAction(detail, progress) +
      '</div>';
  }

  renderPicActions(detail);
  renderDonorTable(detail);

  const dangerZone = document.getElementById('pic-danger-zone');
  if (dangerZone) {
    if (c.Status !== 'Archived') {
      let dangerHtml = '<h3 style="margin-top:0; color:var(--red);">Zona Berbahaya</h3>';
      if (c.Status === 'Open' || c.Status === 'Closed') {
        dangerHtml += '<button class="btn danger" style="margin-right:8px;" onclick="deleteThis()">Hapus campaign</button>';
      }
      if (c.Status === 'Finalized') {
        dangerHtml += '<button class="btn danger" onclick="archiveThis()">Arsipkan campaign</button>';
      }
      dangerZone.innerHTML = dangerHtml;
      dangerZone.classList.remove('hidden');
    } else {
      dangerZone.classList.add('hidden');
    }
  }
}

export function renderPicActions(detail) {
  const c = detail.campaign;
  const el = document.getElementById('pic-actions');
  if (!el) return;
  let html = '<div class="pic-section-heading"><div><span class="role-eyebrow">PIC · WORKSPACE</span><h3>Tindakan berikutnya</h3></div><span>Prioritaskan tindakan</span></div>';

  let isAchieved = Boolean(detail.donors && detail.donors.length > 0 && detail.donors.every(d => String(d.Verified || (d.verified ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE'));

  html += '<div class="pic-share-box" style="background:#eaf3de; padding:10px; border-radius:8px; margin-bottom:12px;">';
  if (c.Status === 'Open' || c.Status === 'Closed') {
    html += '<strong>Bagikan Undangan Patungan:</strong><br><p class="muted" style="margin:4px 0;">Salin pesan undangan beserta daftar peserta yang sudah bergabung.</p><button class="btn secondary btn-auto" style="margin-top:4px;" onclick="copyPicGroupReminder()">Salin Undangan Patungan</button>';
  } else if (c.Status === 'Finalized') {
    if (isAchieved) {
      html += '<strong>Target Terkumpul! 🎉</strong><br><p class="muted" style="margin:4px 0;">Semua pembayaran terverifikasi. Salin pesan terima kasih untuk grup.</p><button class="btn secondary btn-auto" style="margin-top:4px;" onclick="copyPicGroupReminder()">Salin Laporan Selesai</button>';
    } else {
      html += '<strong>Tagihan Patungan (Grup):</strong><br><p class="muted" style="margin:4px 0;">Salin rincian tagihan pro-rata, nominal bebas, dan nomor rekening untuk dibagikan ke grup.</p><button class="btn secondary btn-auto" style="margin-top:4px;" onclick="copyPicGroupReminder()">Salin Rincian Tagihan</button>';
    }
  } else {
    html += '<strong>Campaign Selesai:</strong><br><p class="muted" style="margin:4px 0;">Campaign sudah selesai/diarsipkan.</p>';
  }
  html += '</div>';

  if (c.Status === 'Open') {
    html += '<button class="btn blue" onclick="showFinalizeForm(' + (Number(c.GiftAmount) || 0) + ')">Selesaikan & input rekening</button>';
    html += '<button class="btn secondary" onclick="closeList()">Tutup pendaftaran</button>';
  } else if (c.Status === 'Closed') {
    html += '<button class="btn blue" onclick="showFinalizeForm(' + (Number(c.GiftAmount) || 0) + ')">Selesaikan & input rekening</button>';
    html += '<button class="btn secondary" onclick="reopenList()">Buka lagi pendaftaran</button>';
  } else if (c.Status === 'Finalized') {
    const paidCount = detail.donors.filter(d => String(d.Paid || (d.paid ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE').length;
    let totalRefund = 0;
    detail.donors.forEach(d => {
      const isPaid = String(d.Paid || (d.paid ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
      const isRef = String(d.Refunded || (d.refunded ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
      const amtPaid = Number(d.AmountPaid !== undefined ? d.AmountPaid : d.amount_paid) || 0;
      const amtDue = Number(d.AmountDue !== undefined ? d.AmountDue : d.amount_due) || 0;
      if (isPaid && amtPaid && amtPaid > amtDue && !isRef) totalRefund += (amtPaid - amtDue);
    });

    html += '<p class="muted">' + paidCount + ' / ' + detail.donors.length + ' sudah upload bukti</p>';
    if (totalRefund > 0) html += '<p style="color:var(--amber); font-weight:bold; margin-bottom:12px;">⚠️ Total Perlu Refund: ' + formatIDR(totalRefund) + '</p>';

    const hasReviewableProof = detail.donors.some(d => {
      const isPaid = String(d.Paid || (d.paid ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
      const isVerified = String(d.Verified || (d.verified ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
      const hasProof = Boolean(String(d.ProofStoragePath || d.proof_storage_path || d.ProofLink || d.proof_link || '').trim());
      return isPaid && !isVerified && hasProof;
    });
    const hasMissingProof = detail.donors.some(d => {
      const isPaid = String(d.Paid || (d.paid ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
      const isVerified = String(d.Verified || (d.verified ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
      const hasProof = Boolean(String(d.ProofStoragePath || d.proof_storage_path || d.ProofLink || d.proof_link || '').trim());
      return isPaid && !isVerified && !hasProof;
    });

    if (hasReviewableProof && !hasMissingProof) html += '<button class="btn green" style="margin-bottom:8px; margin-right:8px;" onclick="picVerifyAllUI(\'' + escapeHtml(c.CampaignID) + '\')">✓ Setujui Semua Bukti</button>';
    if (!isAchieved) html += '<button class="btn secondary" style="margin-bottom:8px; margin-right:8px;" onclick="showLateDonorForm()">+ Ajukan Donatur Susulan</button>';
    html += '<button class="btn blue" style="margin-bottom:8px;" onclick="showGiftProofForm()">📸 Upload Foto & Link Hadiah</button>';
  } else {
    html += '<p class="muted">Campaign sudah diarsipkan. Token ini sudah tidak aktif.</p>';
  }

  html += '<div id="finalize-form" class="hidden"></div>';
  html += '<div id="late-donor-form" class="hidden card" style="background:#f9f9f9; margin-top:16px; position:relative;">' +
    '<h4 style="margin-top:0;">Ajukan Donatur Susulan</h4><p class="muted" style="font-size:12px;">Tambahkan teman yang belum sempat daftar di list sebelumnya.</p>' +
    '<label>Nama Teman: <input type="text" id="late-name" placeholder="cth: Budi Susanto"></label>' +
    '<label>No WhatsApp: <input type="tel" id="late-wa" placeholder="cth: 08123456789"></label>' +
    '<label>Tipe Nominal: <select id="late-amount-type" onchange="toggleLateCustomAmount()"><option value="fixed">Ikuti Nominal Rata-rata</option><option value="custom">Nominal Bebas (Custom)</option></select></label>' +
    '<div id="late-custom-amount-group" class="hidden"><label>Nominal Donasi (Rp): <input type="number" id="late-custom-amount" placeholder="cth: 50000"></label></div>' +
    '<div style="margin-top:12px;"><button id="btn-submit-late-donor" class="btn green" onclick="submitLateDonor(\'' + escapeHtml(c.CampaignID) + '\')">Simpan & Masukkan ke List</button> <button class="btn secondary" onclick="hideLateDonorForm()">Batal</button></div>' +
    '<div id="late-error" class="error" style="margin-top:8px;"></div></div>';

  el.innerHTML = html;
}

export function showLateDonorForm() {
  const lateForm = document.getElementById('late-donor-form');
  const giftForm = document.getElementById('gift-proof-form');
  if (lateForm) lateForm.classList.remove('hidden');
  if (giftForm) giftForm.classList.add('hidden');
}

export function hideLateDonorForm() {
  const lateForm = document.getElementById('late-donor-form');
  if (lateForm) lateForm.classList.add('hidden');
}

export function toggleLateCustomAmount() {
  const typeSelect = document.getElementById('late-amount-type');
  const group = document.getElementById('late-custom-amount-group');
  if (typeSelect && group) {
    if (typeSelect.value === 'custom') group.classList.remove('hidden');
    else group.classList.add('hidden');
  }
}

export function showGiftProofForm() {
  const giftForm = document.getElementById('gift-proof-form');
  const lateForm = document.getElementById('late-donor-form');
  if (giftForm) giftForm.classList.remove('hidden');
  if (lateForm) lateForm.classList.add('hidden');
}

export async function submitGiftProof() {
  const errEl = document.getElementById('gift-error');
  if (errEl) errEl.textContent = 'Menyimpan...';

  const btn = document.querySelector('#gift-proof-form button.btn.blue') || document.getElementById('btn-submit-gift-proof');
  let originalText = '';
  if (btn) {
    originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';
  }

  const resetBtn = () => {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  const linkInput = document.getElementById('gift-link');
  const link = linkInput ? linkInput.value.trim() : '';
  const fileInput = document.getElementById('gift-image');
  const file = fileInput ? (fileInput.files && fileInput.files[0]) : null;

  if (!file && !link) {
    if (errEl) errEl.textContent = 'Harap isi link atau upload foto hadiah.';
    resetBtn();
    return;
  }

  if (file && file.size > 2 * 1024 * 1024) {
    if (errEl) errEl.textContent = 'Ukuran gambar maksimal 2MB.';
    resetBtn();
    return;
  }

  const c = appState.picCampaignData;
  const campaignId = (c && (c.CampaignID || c.campaign_id)) || 'campaign';

  try {
    let imageStoragePath = null;
    if (file) {
      if (errEl) errEl.textContent = 'Mengunggah foto hadiah...';
      imageStoragePath = await uploadGiftImage(campaignId, file);
    }

    await call('updateGiftProof', currentToken(), link, imageStoragePath);
    resetBtn();
    showToast('Dokumentasi hadiah berhasil disimpan!');
    const giftForm = document.getElementById('gift-proof-form');
    if (giftForm) giftForm.classList.add('hidden');
    loadPicDashboard();
  } catch (e) {
    resetBtn();
    if (errEl) errEl.textContent = formatUserErrorMessage(e);
  }
}

export function submitLateDonor() {
  const errEl = document.getElementById('late-error');
  if (errEl) errEl.textContent = 'Mengirim...';

  const btn = document.getElementById('btn-submit-late-donor') || (document.querySelector('#late-donor-form button.btn.green'));
  let originalText = '';
  if (btn) {
    originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Mengirim...';
  }

  const resetBtn = () => {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  const nameInput = document.getElementById('late-name');
  const waInput = document.getElementById('late-wa');
  const aliasInput = document.getElementById('late-alias');
  const isCustomEl = document.getElementById('late-is-custom');
  const customAmtEl = document.getElementById('late-custom-amount');
  const reasonInput = document.getElementById('late-reason');

  const name = nameInput ? nameInput.value.trim() : '';
  const wa = waInput ? waInput.value.trim() : '';
  const alias = aliasInput ? aliasInput.value.trim() : '';
  const isCustom = isCustomEl ? isCustomEl.checked : (document.getElementById('late-amount-type') && document.getElementById('late-amount-type').value === 'custom');
  const amount = isCustom && customAmtEl ? parseRibuan(customAmtEl.value) : null;
  const reason = reasonInput ? reasonInput.value.trim() : '';

  if (!name || !wa || !reason) {
    if (errEl) errEl.textContent = 'Harap isi semua kolom.';
    resetBtn();
    return;
  }

  const realToken = safeGet('deep_dive_return_token') || null;
  callQueued('requestLateDonor', currentToken(), name, wa, isCustom, amount, reason, realToken, alias).then(() => {
    resetBtn();
    showToast('Pengajuan berhasil dikirim ke Admin!');
    if (errEl) errEl.textContent = '';
    if (nameInput) nameInput.value = '';
    if (waInput) waInput.value = '';
    if (aliasInput) aliasInput.value = '';
    if (reasonInput) reasonInput.value = '';
    if (customAmtEl) customAmtEl.value = '';
    const lateForm = document.getElementById('late-donor-form');
    if (lateForm) lateForm.classList.add('hidden');
    loadPicDashboard();
  }).catch(e => {
    resetBtn();
    if (errEl) errEl.textContent = formatUserErrorMessage(e);
  });
}

export function copyShareLink() {
  const c = appState.picCampaignData;
  if (!c) { showToast('Data campaign belum tersedia.'); return; }
  const shareUrl = window.location.origin + window.location.pathname + '#c=' + c.CampaignID;
  const giftText = c.GiftAmount > 0 ? formatIDR(c.GiftAmount) : 'Ditentukan nanti';
  const msg = '🎁 *Yuk Patungan Donasi!*\n\n👤 Untuk: *' + c.TargetName + '*\n' + (c.Reason ? '💬 Alasan: ' + c.Reason + '\n' : '') + '💰 Total hadiah: ' + giftText + '\n📅 Deadline: ' + (c.Deadline || '-') + '\n\n👉 Daftar di sini:\n' + shareUrl;
  _copyText(msg, 'Pesan undangan berhasil disalin! Tempel ke grup WhatsApp.');
}

export function copyPicGroupReminder(e) {
  const baseUrl = window.location.origin + window.location.pathname;
  const btn = (e && e.target) || (typeof event !== 'undefined' && event && event.target);
  let oldText = '';
  if (btn) {
    oldText = btn.textContent;
    btn.textContent = "Loading...";
    btn.disabled = true;
  }

  call('getReminderInfo', currentToken(), baseUrl).then(res => {
    if (btn) { btn.textContent = oldText; btn.disabled = false; }
    if (!res || !res.bulkMessage) {
      showInfoModal("Gagal menghasilkan pesan reminder.", "Error");
      return;
    }
    _copyText(res.bulkMessage, 'Pesan berhasil disalin! Tempel ke grup WhatsApp.');
  }).catch(e => {
    if (btn) { btn.textContent = oldText; btn.disabled = false; }
    showInfoModal(formatUserErrorMessage(e), 'Error');
  });
}

export function closeList() {
  callQueued('closeCampaignList', currentToken()).then(() => {
    showToast('Pendaftaran campaign berhasil ditutup.');
    loadPicDashboard();
  }).catch(e => showInfoModal(formatUserErrorMessage(e), 'Error'));
}

export function reopenList() {
  call('reopenCampaignList', currentToken()).then(() => {
    showToast('Pendaftaran campaign dibuka kembali.');
    loadPicDashboard();
  }).catch(e => showInfoModal(formatUserErrorMessage(e), 'Error'));
}

export function archiveThis() {
  showConfirmModal('Arsipkan campaign ini? Token PIC akan nonaktif.', () => {
    return callQueued('archiveCampaign', currentToken()).then(() => {
      showToast('Campaign berhasil diarsipkan.');
      if (safeGet('deep_dive_return_token')) {
        const returnAdminBtn = document.getElementById('btn-return-admin');
        if (returnAdminBtn) returnAdminBtn.click();
      } else if (safeGet('donor_user')) {
        loadUserDashboard();
      } else {
        safeRemove('auth_token');
        safeRemove('auth_role');
        showView('landing');
      }
    }).catch(e => showInfoModal(formatUserErrorMessage(e), 'Error'));
  });
}

export function deleteThis() {
  showConfirmModal('Hapus campaign ini? Semua data campaign dan donatur akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.', () => {
    return callQueued('deleteCampaign', currentToken()).then(() => {
      showToast('Campaign berhasil dihapus.');
      if (safeGet('deep_dive_return_token')) {
        const returnAdminBtn = document.getElementById('btn-return-admin');
        if (returnAdminBtn) returnAdminBtn.click();
      } else if (safeGet('donor_user')) {
        loadUserDashboard();
      } else {
        safeRemove('auth_token');
        safeRemove('auth_role');
        showView('landing');
      }
    }).catch(e => showInfoModal(formatUserErrorMessage(e), 'Error'));
  });
}

export function renderAndShow(detail) {
  renderPicDashboard(detail);
}

export function showFinalizeForm(currentAmount) {
  call('getPublicSettings').then(settings => {
    const el = document.getElementById('finalize-form');
    if (!el) return;
    el.classList.remove('hidden');

    const defaultAmount = currentAmount > 0 ? currentAmount : '';
    let note = (settings && settings.enableRounding)
      ? 'Pembulatan AKTIF: tiap orang akan dibulatkan ke atas ke kelipatan ' + formatIDR(settings.roundTo || 500) + '.'
      : 'Pembulatan NONAKTIF: nominal dibagi rata (selisih kecil ditanggung sebagian donatur agar totalnya pas).';

    el.innerHTML =
      '<p class="muted">' + note + '</p>' +
      '<label>Total Harga Hadiah Akhir (IDR)</label>' +
      '<input id="fin-amount" type="text" inputmode="numeric" value="' + (defaultAmount ? defaultAmount.toLocaleString('id-ID') : '') + '" placeholder="Contoh: 1.000.000" onkeyup="formatInputRibuan(event)">' +
      '<label>Nama bank</label><input id="fin-bank" placeholder="contoh: BCA">' +
      '<label>No. rekening</label><input id="fin-acc" placeholder="1234567890">' +
      '<label>Nama pemilik rekening</label><input id="fin-holder" placeholder="Nama PIC">' +
      '<label>Link Barang / Hadiah (Opsional)</label><input id="fin-link" placeholder="https://tokopedia.com/...">' +
      '<label>Screenshot Total Harga (Opsional)</label><input id="fin-image" type="file" accept="image/*">' +
      '<button id="btn-do-finalize" class="btn blue" onclick="doFinalize()">Konfirmasi & finalisasi</button>' +
      '<div id="fin-error" class="error"></div>';
  }).catch(e => {
    showInfoModal(formatUserErrorMessage(e), 'Error');
  });
}

export function doFinalize() {
  const errEl = document.getElementById('fin-error');
  if (errEl) errEl.textContent = 'Memproses...';

  const btn = document.getElementById('btn-do-finalize');
  let originalText = '';
  if (btn) {
    originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Memproses...';
  }

  const resetBtn = () => {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  };

  const amtInput = document.getElementById('fin-amount');
  const rawFinalAmount = amtInput ? parseRibuan(amtInput.value) : 0;

  const bankInfo = {
    bankName: document.getElementById('fin-bank') ? document.getElementById('fin-bank').value.trim() : '',
    bankAccount: document.getElementById('fin-acc') ? document.getElementById('fin-acc').value.trim() : '',
    accountHolder: document.getElementById('fin-holder') ? document.getElementById('fin-holder').value.trim() : '',
    giftLink: document.getElementById('fin-link') ? document.getElementById('fin-link').value.trim() : ''
  };

  if (!bankInfo.bankName || !bankInfo.bankAccount || !bankInfo.accountHolder || rawFinalAmount <= 0) {
    if (errEl) errEl.textContent = 'Harap lengkapi nama bank, nomor rekening, nama pemilik, dan total nominal hadiah.';
    resetBtn();
    return;
  }

  const fileInput = document.getElementById('fin-image');
  const file = fileInput ? (fileInput.files && fileInput.files[0]) : null;

  if (file && file.size > 2 * 1024 * 1024) {
    if (errEl) errEl.textContent = 'Ukuran gambar maksimal 2MB.';
    resetBtn();
    return;
  }

  const c = appState.picCampaignData;
  const campaignId = (c && (c.CampaignID || c.campaign_id)) || 'campaign';

  (async () => {
    try {
      let giftImagePath = null;
      if (file) {
        if (errEl) errEl.textContent = 'Mengunggah screenshot harga...';
        giftImagePath = await uploadGiftImage(campaignId, file);
      }

      if (errEl) errEl.textContent = 'Menyimpan ke server...';
      await callQueued('finalizeCampaign', currentToken(), bankInfo, rawFinalAmount, giftImagePath);
      resetBtn();
      showToast('Campaign berhasil difinalisasi!');
      loadPicDashboard();
    } catch (e) {
      resetBtn();
      if (errEl) errEl.textContent = escapeHtml(formatUserErrorMessage(e));
    }
  })();
}

export function getPicDonorQueueState(d, campaignStatus) {
  const isPaid = String(d.Paid || (d.paid ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
  const isVerified = String(d.Verified || (d.verified ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
  const isRefunded = String(d.Refunded || (d.refunded ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
  const hasProof = Boolean(String(d.ProofStoragePath || d.proof_storage_path || d.ProofLink || d.proof_link || '').trim());
  const amountDue = Number(d.AmountDue !== undefined ? d.AmountDue : d.amount_due) || 0;
  const amountPaid = Number(d.AmountPaid !== undefined ? d.AmountPaid : d.amount_paid) || 0;
  const isFinalized = _normalizeCampaignStatus(campaignStatus) === 'Finalized';

  if (d.action_group || d.ActionGroup) {
    const ag = String(d.action_group || d.ActionGroup).toUpperCase();
    if (ag === 'REFUND') return 'refund';
    if (ag === 'FINAL') return 'complete';
    if (ag === 'REVIEW_PROOF') return 'review';
    if (ag === 'REMINDER') return 'reminder';
  }

  if (isVerified) return 'complete';
  if (isPaid && amountPaid > amountDue && !isRefunded) return 'refund';
  if (hasProof && !isVerified) return 'review';
  if (isPaid && !hasProof && !isVerified) return 'missing-proof';
  if (isFinalized && !isPaid) return 'reminder';
  return 'participant';
}

export function getPicDonorQueueLabel(key) {
  switch (key) {
    case 'reminder': return 'Pengingat pembayaran';
    case 'review': return 'Bukti Transfer perlu ditinjau';
    case 'refund': return 'Refund perlu diselesaikan';
    case 'missing-proof': return 'Bukti Transfer belum tersedia';
    case 'complete': return 'Terverifikasi';
    default: return 'Peserta terdaftar';
  }
}

export function renderDonorTable(detail) {
  const el = document.getElementById('pic-donor-list');
  if (!el) return;
  if (!detail.donors || !detail.donors.length) {
    el.innerHTML = '<div class="pic-section-heading"><h3>Donatur perlu tindakan</h3><span>0 item</span></div><p class="muted">Belum ada donatur.</p>';
    return;
  }

  const campaignStatus = _normalizeCampaignStatus(detail.campaign.Status || detail.campaign.status);
  const isFinalized = campaignStatus === 'Finalized';
  const queues = { 'reminder': [], 'review': [], 'refund': [], 'missing-proof': [], 'complete': [], 'participant': [] };

  detail.donors.forEach(d => {
    const q = isFinalized ? getPicDonorQueueState(d, campaignStatus) : 'participant';
    if (queues[q]) queues[q].push(d);
    else queues.participant.push(d);
  });

  const queueOrder = ['reminder', 'review', 'refund', 'missing-proof', 'complete', 'participant'];
  queueOrder.forEach(k => {
    queues[k].sort((a, b) => {
      const aDue = Number(a.AmountDue !== undefined ? a.AmountDue : a.amount_due) || 0;
      const bDue = Number(b.AmountDue !== undefined ? b.AmountDue : b.amount_due) || 0;
      return bDue - aDue;
    });
  });

  const reminderCount = queues.reminder.length;
  const reviewCount = queues.review.length;
  const refundCount = queues.refund.length;
  const missingProofCount = queues['missing-proof'].length;
  const unsettledCount = reminderCount + reviewCount + refundCount + missingProofCount;

  let html = '';
  if (isFinalized) {
    const headingSummary = [];
    if (reminderCount > 0) headingSummary.push(reminderCount + ' pengingat');
    if (reviewCount > 0) headingSummary.push(reviewCount + ' tinjau');
    if (refundCount > 0) headingSummary.push(refundCount + ' refund');
    if (missingProofCount > 0) headingSummary.push(missingProofCount + ' data perlu dicek');
    
    html += '<div class="pic-section-heading"><h3>Donatur perlu tindakan</h3><span>' + (headingSummary.join(' · ') || '0 item') + '</span></div>';

    if (unsettledCount === 0 && queues.complete.length > 0) {
      html += '<div class="verification-complete" style="margin-bottom:16px;">Semua donor selesai · Semua pembayaran terverifikasi dan final. Tidak ada tagihan tertunda.</div>';
    } else if (unsettledCount === 0) {
      html += '<div class="pic-complete-state" role="status">' + paymentStatusIcon('verified') + '<span>Semua donatur sudah tertata. Tidak ada tindakan pembayaran yang tertunda.</span></div>';
    }
  }

  let tableRows = '';
  let cardItems = '';

  queueOrder.forEach(qKey => {
    const list = queues[qKey];
    if (!list || !list.length) return;

    const qHeading = isFinalized ? getPicDonorQueueLabel(qKey) : '';
    if (qHeading && qKey !== 'participant') {
      const countLabel = qKey === 'complete' ? (' (' + list.length + ')') : '';
      if (qKey === 'reminder' && list.length > 0) {
        cardItems += '<div style="display:flex; justify-content:space-between; align-items:center; margin: 16px 0 8px 0; gap: 8px;">' +
          '<h4 class="pic-queue-heading" style="margin: 0; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em;">' + escapeHtml(qHeading + countLabel) + '</h4>' +
          '<button type="button" class="btn secondary btn-auto" style="font-size: 11px; padding: 4px 8px; margin: 0;" onclick="copyUnpaidDonorsRecap()">📋 Salin Rekap Pengingat (' + list.length + ')</button>' +
          '</div>';
      } else {
        cardItems += '<h4 class="pic-queue-heading" style="margin: 16px 0 8px 0; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em;">' + escapeHtml(qHeading + countLabel) + '</h4>';
      }
    }

    list.forEach(d => {
      const displayName = d.Alias || d.alias ? (d.Alias || d.alias) : (d.Name || d.name);
      const donorWa = d.WhatsApp || d.whatsapp || '';
      const isPaid = String(d.Paid || (d.paid ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
      const isVerified = String(d.Verified || (d.verified ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
      const isRefunded = String(d.Refunded || (d.refunded ? 'TRUE' : 'FALSE')).toUpperCase() === 'TRUE';
      const proofPath = d.proof_storage_path || d.ProofStoragePath || '';
      const proofLink = d._resolvedProofUrl || (proofPath && proofPath.startsWith('http') ? proofPath : '') || d.proof_link || d.ProofLink || '';
      const hasProof = Boolean(String(proofPath || proofLink || '').trim());
      const amountDue = Number(d.AmountDue !== undefined ? d.AmountDue : d.amount_due) || 0;
      const amountPaid = Number(d.AmountPaid !== undefined ? d.AmountPaid : d.amount_paid) || 0;
      const joinedAt = d.JoinedAt || d.joined_at || '';
      const paidAt = d.PaidAt || d.paid_at || '';
      const modifiedAt = d.ModifiedAt || d.modified_at || '';
      const modifiedBy = d.ModifiedBy || d.modified_by || '';

      const actionType = isFinalized ? (qKey === 'reminder' ? 'reminder' : (qKey === 'review' ? 'review' : (qKey === 'refund' ? 'refund' : ''))) : '';
      const actionAttribute = actionType ? ' data-pic-action="' + actionType + '" tabindex="-1"' : '';
      const picName = modifiedBy ? escapeHtml(modifiedBy) : '';
      const picLabel = picName ? ' (' + picName + ')' : '';

      let badgeHtml = '';
      if (isVerified) {
        badgeHtml = '<span class="badge green payment-status-badge donor-queue-badge">' + paymentStatusIcon('verified') + '<span>' + (isFinalized ? 'Terverifikasi' : 'Terdaftar') + '</span></span>';
      } else if (isPaid && hasProof) {
        badgeHtml = '<span class="badge warning payment-status-badge" style="background:#fff3cd;color:#856404;">' + paymentStatusIcon('review') + '<span>Perlu Ditinjau</span></span>';
      } else if (isPaid) {
        badgeHtml = '<span class="badge warning payment-status-badge" style="background:#fff3cd;color:#856404;">' + paymentStatusIcon('review') + '<span>Bukti Belum Diunggah</span></span>';
      } else {
        badgeHtml = '<span class="badge warning payment-status-badge" style="background:#faeeda;color:var(--amber);">' + paymentStatusIcon('unpaid') + '<span>Belum Bayar</span></span>';
      }

      const timeHtml = '<div class="milestone-stack">' +
        '<div class="milestone-item"><span class="milestone-dot daftar"></span><span class="milestone-label">Daftar:</span><span class="milestone-time">' + formatTime(joinedAt) + '</span></div>' +
        (isPaid ? ('<div class="milestone-item"><span class="milestone-dot bayar"></span><span class="milestone-label">Bayar:</span><span class="milestone-time">' + (paidAt ? formatTime(paidAt) : '-') + '</span></div>') : '') +
        (isVerified ? ('<div class="milestone-item"><span class="milestone-dot verif"></span><span class="milestone-label">Verif' + picLabel + ':</span><span class="milestone-time">' + (modifiedAt ? formatTime(modifiedAt) : '-') + '</span></div>') : '') +
        (isRefunded ? ('<div class="milestone-item"><span class="milestone-dot refund"></span><span class="milestone-label">Refund' + picLabel + ':</span><span class="milestone-time">' + (modifiedAt ? formatTime(modifiedAt) : '-') + '</span></div>') : '') +
        '</div>';

      let amountHtml = amountDue ? formatIDR(amountDue) : '-';
      if (isPaid) amountHtml = '<s style="color:var(--muted);">' + amountHtml + '</s>';

      let refundHtml = '-';
      let needsRefund = false;
      if (isPaid && amountPaid) {
        const diff = amountPaid - amountDue;
        if (diff > 0) {
          needsRefund = true;
          if (isRefunded) {
            refundHtml = '<span class="badge success">✅ Dikembalikan</span><br><small class="muted">Kelebihan: ' + formatIDR(diff) + '</small>';
          } else {
            refundHtml = '<span class="badge amber" style="margin-bottom:4px;">⚠️ Refund perlu diselesaikan: ' + formatIDR(diff) + '</span><br><button class="btn secondary" style="padding:2px 4px; font-size:11px;" onclick="markRefundedUI(\'' + escapeHtml(detail.campaign.CampaignID) + '\', \'' + escapeHtml(donorWa) + '\')">Tandai Dikembalikan</button>';
          }
        }
      }

      let verificationHtml = '-';
      let cardActions = '';
      if (isPaid && hasProof) {
        const proofHref = proofLink ? escapeHtml(sanitizeUrl(d.ProofLink)) : '#';
        const dataPathAttr = proofPath ? (' data-proof-path="' + escapeHtml(proofPath) + '"') : '';
        verificationHtml = '<div class="verification-stack"><a href="' + proofHref + '"' + dataPathAttr + ' target="_blank" rel="noopener noreferrer" class="link-btn donor-proof-link">Lihat Bukti</a>';
        if (!isVerified) {
          if (needsRefund && !isRefunded) {
            verificationHtml += '<span class="muted verification-warning" style="color:var(--red);">Selesaikan refund dulu sebelum verifikasi.</span>';
          } else {
            verificationHtml += '<div class="verification-controls"><button class="btn green" type="button" onclick="verifyPaymentUI(\'' + escapeHtml(detail.campaign.CampaignID) + '\', \'' + escapeHtml(donorWa) + '\', true)">Konfirmasi</button>';
            verificationHtml += '<button class="btn danger" type="button" onclick="verifyPaymentUI(\'' + escapeHtml(detail.campaign.CampaignID) + '\', \'' + escapeHtml(donorWa) + '\', false)">Tolak</button></div>';
          }
        } else {
          verificationHtml += '<span class="muted verification-complete">Sudah dikonfirmasi</span>';
        }
        verificationHtml += '</div>';
      } else if (isPaid && !isVerified) {
        verificationHtml = '<div class="verification-stack"><span class="semantic-status warning">' + paymentStatusIcon('review') + '<span>Bukti Transfer belum tersedia</span></span><span class="muted verification-warning">Minta Donor upload ulang sebelum verifikasi.</span></div>';
      } else if (!isPaid && isFinalized) {
        const msg = encodeURIComponent("Halo " + (d.Name || d.name) + ", ini reminder untuk patungan *" + (detail.campaign.TargetName || 'Campaign') + "*. Tagihan kamu: " + formatIDR(amountDue) + ".\n\nBisa cek detail dan upload bukti transfer di sini ya: " + window.location.origin + window.location.pathname + "#c=" + detail.campaign.CampaignID);
        verificationHtml = '<a href="https://wa.me/' + String(donorWa).replace(/\D/g, '') + '?text=' + msg + '" target="_blank" rel="noopener noreferrer" class="btn secondary donor-reminder">Kirim pengingat WA</a>';
      }

      if (isVerified && isFinalized) {
        cardActions = '<div class="donor-card-actions"><div class="donor-settled-notice" style="font-size:12px; color:var(--muted);">Selesai · Tidak ada tindakan lanjutan untuk donatur ini.</div></div>';
      } else if (verificationHtml !== '-') {
        cardActions = '<div class="donor-card-actions">' + verificationHtml + '</div>';
      }

      tableRows += '<tr' + actionAttribute + '><td><strong>' + escapeHtml(displayName) + '</strong><br><small class="muted">' + escapeHtml(donorWa) + '</small></td><td>' + timeHtml + '</td><td>' + badgeHtml + '</td><td>' + amountHtml + '</td><td>' + refundHtml + '</td><td>' + verificationHtml + '</td></tr>';

      const cardClass = isVerified ? 'donor-card donor-card-settled' : (actionType ? ('donor-card donor-card-needs-action donor-card-action-' + actionType) : 'donor-card');
      cardItems += '<div class="' + cardClass + '"' + actionAttribute + '>' +
        '<div class="donor-card-header"><div class="donor-card-identity"><span class="donor-card-name">' + escapeHtml(displayName) + '</span><br><span class="donor-card-wa">' + escapeHtml(donorWa) + '</span></div><div class="donor-card-status">' + badgeHtml + '</div></div>' +
        '<div class="donor-card-body">' +
        '<div class="donor-card-field donor-card-amount"><span class="label">Tagihan</span><strong class="donor-card-value">' + amountHtml + '</strong></div>' +
        (needsRefund ? ('<div class="donor-card-field"><span class="label">Refund</span><div class="donor-card-value">' + (isRefunded ? '<span class="badge success">✅ Dikembalikan</span><br><small class="muted">Kelebihan: ' + formatIDR(amountPaid - amountDue) + '</small>' : '<span class="badge amber" style="margin-bottom:4px;">⚠️ Refund perlu diselesaikan: ' + formatIDR(amountPaid - amountDue) + '</span><br><button class="btn secondary" style="padding:2px 4px; font-size:11px;" onclick="markRefundedUI(\'' + escapeHtml(detail.campaign.CampaignID) + '\', \'' + escapeHtml(donorWa) + '\')">Tandai Dikembalikan</button>') + '</div></div>') : '') +
        '<div class="donor-card-timeline">' + timeHtml + '</div></div>' +
        cardActions + '</div>';
    });
  });

  let totalTagihan = 0;
  detail.donors.forEach(d => {
    totalTagihan += (Number(d.AmountDue !== undefined ? d.AmountDue : d.amount_due) || 0);
  });

  let cardContainer = '<div class="donor-cards">' + cardItems;
  if (totalTagihan > 0) cardContainer += '<div class="donor-card-total">Total Tagihan: ' + formatIDR(totalTagihan) + '</div>';
  cardContainer += '</div>';

  let tableHtml = '<div class="table-responsive"><table><thead><tr><th>Nama / WA</th><th>Waktu</th><th>Status</th><th>Tagihan</th><th>Refund</th><th>Bukti & Verifikasi</th></tr></thead><tbody>' + tableRows + '</tbody>';
  if (totalTagihan > 0) tableHtml += '<tfoot style="background:#f5f7fa; font-weight:bold; border-top: 2px solid var(--border);"><tr><td colspan="3" style="text-align:right;">Total Keseluruhan Tagihan:</td><td style="color:var(--text);">' + formatIDR(totalTagihan) + '</td><td colspan="2"></td></tr></tfoot>';
  tableHtml += '</table></div>';

  el.innerHTML = html + cardContainer + tableHtml;

  if (typeof el.querySelectorAll === 'function') {
    const unhydrated = el.querySelectorAll('a[data-proof-path]');
    if (unhydrated && unhydrated.length) {
      unhydrated.forEach(async linkEl => {
        const p = linkEl.getAttribute('data-proof-path');
        if (p && !p.startsWith('http')) {
          const signed = await getBuktiSignedUrl(p);
          if (signed) linkEl.href = sanitizeUrl(signed);
        }
      });
    }
  }
}

export function copyUnpaidDonorsRecap() {
  if (!appState.picCampaignData || !appState.picCampaignDetail || !appState.picCampaignDetail.donors) return;
  const c = appState.picCampaignData;
  const unpaid = appState.picCampaignDetail.donors.filter(d => getPicDonorQueueState(d, c.Status) === 'reminder');
  if (!unpaid.length) {
    showToast('Tidak ada donatur yang menunggu pembayaran.');
    return;
  }
  let text = '*Pengingat Patungan: ' + (c.TargetName || 'Campaign') + '*\n';
  text += 'Berikut daftar donatur yang belum transfer/upload bukti pembayaran:\n\n';
  unpaid.forEach((d, idx) => {
    const name = d.Alias || d.alias ? ((d.Alias || d.alias) + ' (' + (d.Name || d.name) + ')') : (d.Name || d.name);
    const amtDue = Number(d.AmountDue !== undefined ? d.AmountDue : d.amount_due) || 0;
    text += (idx + 1) + '. ' + name + ' - ' + formatIDR(amtDue) + '\n';
  });
  text += '\nMohon segera konfirmasi atau upload bukti transfer melalui link:\n';
  text += window.location.origin + window.location.pathname + '#c=' + c.CampaignID;

  _copyText(text, 'Rekap ' + unpaid.length + ' pengingat berhasil disalin!');
}

export function copyBulkMessage() {
  const el = document.getElementById('pic-bulk-msg');
  if (el) {
    el.select();
    document.execCommand('copy');
    showToast('Pesan berhasil disalin!');
  }
}

export function verifyPaymentUI(campaignId, whatsapp, isValid) {
  const action = isValid ? 'konfirmasi' : 'tolak';
  showConfirmModal('Yakin ingin ' + action + ' bukti transfer donatur ini?', () => {
    return callQueued('picVerifyPayment', currentToken(), campaignId, whatsapp, isValid).then(res => {
      if (res && res.error) throw new Error(res.error);
      showToast('Bukti transfer berhasil di' + action + '.');
      return loadPicDashboard();
    }).catch(e => showInfoModal(formatUserErrorMessage(e), 'Error'));
  });
}

export function picVerifyAllUI(campaignId) {
  showConfirmModal('Yakin ingin menyetujui/mengonfirmasi SEMUA bukti transfer yang sudah diupload?', () => {
    return callQueued('picVerifyAllPayments', currentToken(), campaignId).then(count => {
      if (typeof count === 'object' && count && count.error) throw new Error(count.error);
      const verifiedCount = (typeof count === 'object' && count && count.verified_count !== undefined) ? count.verified_count : count;
      showToast('Berhasil mengonfirmasi ' + (verifiedCount || 0) + ' bukti transfer.');
      return loadPicDashboard();
    }).catch(e => showInfoModal(formatUserErrorMessage(e), 'Error'));
  });
}

export function markRefundedUI(campaignId, whatsapp) {
  showConfirmModal('Tandai refund sebagai sudah dikembalikan?', () => {
    return callQueued('picMarkRefunded', currentToken(), campaignId, whatsapp).then(res => {
      if (res && res.error) throw new Error(res.error);
      showToast('Refund berhasil ditandai selesai.');
      return loadPicDashboard();
    }).catch(e => showInfoModal(formatUserErrorMessage(e), 'Error'));
  });
}

export function copyLaporanSelesai() {
  call('getCampaignForPic', currentToken(), 1, 100).then(async detail => {
    if (!detail || !detail.campaign) {
      showInfoModal('Data campaign tidak ditemukan.', 'Error');
      return;
    }
    let customCount = 0;
    let proRata = 0;

    (detail.donors || []).forEach(d => {
      const customAmt = Number(d.CustomAmount !== undefined ? d.CustomAmount : d.custom_amount) || 0;
      const amtDue = Number(d.AmountDue !== undefined ? d.AmountDue : d.amount_due) || 0;
      if (customAmt > 0) customCount++;
      else if (proRata === 0) proRata = amtDue;
    });

    const targetName = detail.campaign.TargetName || detail.campaign.target_name || 'Campaign';
    const giftAmount = Number(detail.campaign.GiftAmount !== undefined ? detail.campaign.GiftAmount : detail.campaign.gift_amount) || 0;
    const donors = detail.donors || [];

    let text = "🎉 *Laporan Selesai: Patungan untuk " + targetName + "*\n\n";
    let summaryText = "Terima kasih banyak untuk teman-teman yang sudah berpartisipasi! Total partisipan : " + donors.length + " orang dengan total donasi " + formatIDR(giftAmount);
    if (customCount > 0) summaryText += ", " + customCount + " donasi nominal khusus dan pro-rata sebanyak " + formatIDR(proRata);
    else summaryText += " dan pro-rata sebanyak " + formatIDR(proRata);
    text += summaryText + "\n\n*Daftar Donatur:*\n";

    donors.forEach((d, i) => {
      const displayName = d.Alias || d.alias ? (d.Alias || d.alias) : (d.Name || d.name);
      const customAmt = Number(d.CustomAmount !== undefined ? d.CustomAmount : d.custom_amount) || 0;
      let suffix = " ✅";
      if (customAmt > 0) suffix += " (" + formatIDR(customAmt) + ")";
      text += (i + 1) + ". " + displayName + suffix + "\n";
    });

    _copyText(text, 'Laporan selesai berhasil disalin!');
    const giftImage = detail.campaign.GiftImage || detail.campaign.gift_image;
    if (giftImage) {
      showInfoModal('Laporan berhasil disalin! Jangan lupa untuk simpan/unduh gambar barang dan tempel ke WhatsApp bersama laporan ini.', 'Sukses');
    }
  }).catch(e => showInfoModal(formatUserErrorMessage(e), 'Error'));
}
