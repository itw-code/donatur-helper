import { safeGet, safeSet, safeRemove } from '../storage.js';
import { escapeHtml, sanitizeUrl, formatUserErrorMessage, showInfoModal, showConfirmModal, showToast, showView, formatIDR, parseRibuan, statusBadge, paymentStatusIcon } from '../utils.js';
import { call, callQueued } from '../api.js';
import { appState } from '../state.js';
import { loadPicDashboard } from './pic.js';
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

export function openProfileModal() {
  const user = JSON.parse(safeGet('donor_user') || '{}');
  const profWa = document.getElementById('prof-wa');
  const profName = document.getElementById('prof-name');
  const profEmail = document.getElementById('prof-email');
  const profMsg = document.getElementById('prof-msg');
  const modal = document.getElementById('profile-modal');

  if (profWa) profWa.value = user.whatsapp || '';
  if (profName) profName.value = user.name || '';
  if (profEmail) profEmail.value = user.email || '';
  if (profMsg) profMsg.innerHTML = '';
  if (modal) modal.style.display = 'flex';
}

export function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (modal) modal.style.display = 'none';
}

export function saveProfile() {
  const user = JSON.parse(safeGet('donor_user') || '{}');
  const wa = user.whatsapp;
  const nameInput = document.getElementById('prof-name');
  const name = nameInput ? nameInput.value.trim() : '';
  const emailInput = document.getElementById('prof-email');
  const email = emailInput ? emailInput.value.trim() : '';
  const msgEl = document.getElementById('prof-msg');

  if (!name) {
    if (msgEl) msgEl.innerHTML = '<span class="error">Nama tidak boleh kosong.</span>';
    return;
  }

  if (msgEl) msgEl.innerHTML = '<span class="muted">Menyimpan...</span>';

  call('updateMemberProfile', wa, name, email).then(res => {
    user.name = res.name;
    user.email = res.email;
    safeSet('donor_user', JSON.stringify(user));

    if (msgEl) msgEl.innerHTML = '<span class="success" style="color:var(--primary);">Profil berhasil diperbarui.</span>';
    
    loadUserDashboard();
    setTimeout(() => closeProfileModal(), 1500);
  }).catch(e => {
    if (msgEl) msgEl.innerHTML = '<span class="error">' + formatUserErrorMessage(e) + '</span>';
  });
}

export function loadUserDashboard() {
  const user = JSON.parse(safeGet('donor_user') || 'null');
  if (!user) {
    showView('user-login');
    return;
  }

  let titleHtml = escapeHtml(user.name);
  if (user.verified) {
    if (user.status === 'ex') {
      titleHtml += ' <span class="badge closed">Member alumni</span>';
    } else {
      titleHtml += ' <span class="badge finalized">Member terverifikasi</span>';
    }
  }
  const displayNameEl = document.getElementById('u-display-name');
  if (displayNameEl) displayNameEl.innerHTML = titleHtml;

  let picBtnHtml = '';
  if (user.verified) {
    if (!user.email) {
      picBtnHtml += '<div class="card" style="background:#fffbeb; border-left:4px solid var(--amber); margin-bottom:16px;"><p style="margin:0; font-size:14px;"><strong>Email belum diisi.</strong><br/>Tambahkan email di Profil agar Anda mendapat pengingat tagihan otomatis.</p></div>';
    }
    
    if (user.status === 'active') {
      picBtnHtml = '<button class="btn blue" style="margin-bottom:16px;" onclick="seamlessBecomePic()">+ Buat Campaign Baru (Jadi PIC)</button>';
    } else if (user.status === 'ex') {
      picBtnHtml = '<div class="card" style="background:#f1efe8; border:none; margin-bottom:16px;"><p class="muted" style="margin:0;">Status Anda adalah Alumni. Anda dapat berpartisipasi dalam donasi, tetapi pembuatan campaign baru hanya dapat dilakukan oleh karyawan aktif.</p></div>';
    }
  }

  const el = document.getElementById('campaign-list');
  if (el) {
    el.innerHTML = '<div id="actual-campaign-list" style="padding:24px;text-align:center;"><span style="font-size:24px;">⏳</span><br><span style="color:var(--muted);">Memuat daftar campaign...</span></div>';
  }

  const picContainer = document.getElementById('pic-create-btn-container');
  if (picContainer) picContainer.innerHTML = picBtnHtml;

  showView('user-dashboard');
  refreshCampaignList();
}

export function seamlessBecomePic(e) {
  const user = JSON.parse(safeGet('donor_user') || 'null');
  if (!user || !user.whatsapp) {
    showInfoModal('Sesi login tidak valid. Silakan login kembali.', 'Peringatan');
    return;
  }
  const btn = (e && e.target) || (typeof event !== 'undefined' && event && event.target) || document.querySelector('#pic-create-btn-container button');
  if (btn) {
    btn.textContent = "Memproses...";
    btn.disabled = true;
  }

  call('generateSeamlessPicToken', user.whatsapp).then(res => {
    if (btn) {
      btn.textContent = "+ Buat Campaign Baru (Jadi PIC)";
      btn.disabled = false;
    }
    const token = typeof res === 'object' && res ? (res.token || res) : res;
    if (!token) {
      throw new Error('Token PIC tidak ditemukan dalam respons server.');
    }
    safeSet('auth_token', token);
    safeSet('auth_role', 'PIC');
    showInfoModal('Token PIC Anda: ' + token + '\n\nToken telah disimpan dan Anda dialihkan ke pembuatan campaign.', 'Sukses');
    loadPicDashboard();
  }).catch(err => {
    if (btn) {
      btn.textContent = "+ Buat Campaign Baru (Jadi PIC)";
      btn.disabled = false;
    }
    showInfoModal(formatUserErrorMessage(err), 'Kendala');
  });
}

export function sortCampaignsForDonorDashboard(list) {
  if (!Array.isArray(list)) return [];
  const now = new Date().setHours(0, 0, 0, 0);
  return list.slice().sort((a, b) => {
    const aTime = a.deadline ? new Date(a.deadline).getTime() : NaN;
    const bTime = b.deadline ? new Date(b.deadline).getTime() : NaN;
    const aHas = !isNaN(aTime);
    const bHas = !isNaN(bTime);

    if (aHas && bHas) {
      const aOverdue = aTime < now;
      const bOverdue = bTime < now;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return aTime - bTime;
    }
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
  });
}

export function refreshCampaignList() {
  const user = JSON.parse(safeGet('donor_user') || 'null');
  if (!user) return;

  const el = document.getElementById('actual-campaign-list');
  if (el) {
    el.innerHTML = '<div style="padding:24px;text-align:center;"><span style="font-size:24px;">⏳</span><br><span style="color:var(--muted);">Memuat daftar campaign...</span></div>';
  }

  call('listActiveCampaigns', user.whatsapp).then(list => {
    let html = '';
    if (!list || !list.length) {
      if (el) el.innerHTML = '<div class="card muted">Belum ada campaign aktif saat ini.</div>';
      return;
    }

    if (appState.targetCampaignId) {
      const targetedCampaign = list.find(c => c.campaignId === appState.targetCampaignId);
      if (targetedCampaign) {
        html += '<h3 style="margin-top:0;">✨ Campaign Undangan</h3>';
        html += renderCampaignCard(targetedCampaign, user, false);
        html += '<button class="btn secondary" style="margin-top: 16px; display: block; width: 100%; text-align: center;" onclick="clearTargetCampaign()">⬅️ Lihat Semua Campaign</button>';
      } else {
        html += '<div class="card error">Campaign tidak ditemukan atau sudah diarsipkan.</div>';
        html += '<button class="btn secondary" style="margin-top: 16px;" onclick="clearTargetCampaign()">⬅️ Lihat Semua Campaign</button>';
      }
    } else {
      const isPendingPayment = c => (
        c.status === 'Finalized' &&
        c.joined &&
        !c.paid &&
        (Number(c.amountDue) > 0 || c.action_group === 'NEED_PAYMENT')
      );
      const pending = list.filter(isPendingPayment);
      const others = list.filter(c => !isPendingPayment(c));

      if (pending.length > 0) {
        const attentionTarget = pending.length === 1
          ? '#card-' + escapeHtml(pending[0].campaignId)
          : '#actual-campaign-list';
        const attentionAction = pending.length === 1 ? 'Lihat tagihan' : 'Lihat tagihan gabungan';
        html += '<div class="donor-dashboard-attention" role="status">';
        html += '<span class="donor-dashboard-attention-icon">' + paymentStatusIcon('review') + '</span>';
        html += '<span class="donor-dashboard-attention-copy"><strong>' + pending.length + ' pembayaran menunggu</strong><span>Bayar sebelum deadline agar campaign selesai tepat waktu.</span></span>';
        html += '<a class="link-btn" href="' + attentionTarget + '">' + attentionAction + '</a>';
        html += '</div>';
      }

      html += '<div class="split-layout">';
      html += '<div class="split-left">';
      if (pending.length > 0) {
        html += '<h3 style="margin-top:0;color:var(--red);">⚠️ Menunggu Pembayaran</h3>';
        const grouped = {};
        pending.forEach(c => {
          const bankName = String(c.bankName || '').trim().toLowerCase();
          const bankAccount = String(c.bankAccount || '').replace(/\s+/g, '');
          const accountHolder = String(c.accountHolder || '').trim().toLowerCase();

          // Only merge if the campaign is finalized and has valid destination bank details
          const isMergeable = Boolean(bankName && bankAccount);
          const key = isMergeable
            ? `${bankName}_${bankAccount}_${accountHolder}`
            : `single_${c.campaignId}`;

          if (!grouped[key]) {
            grouped[key] = [];
          }
          grouped[key].push(c);
        });
        Object.keys(grouped).forEach(key => {
          const groupList = grouped[key];
          if (groupList.length === 1) {
            html += renderCampaignCard(groupList[0], user, true);
          } else {
            html += renderCombinedCampaignCard(groupList, key, user);
          }
        });
      } else {
        html += '<div class="card donor-empty-state" style="padding: 24px 16px; text-align: center;">';
        html += '<div style="margin-bottom: 8px;">' + paymentStatusIcon('verified') + '</div>';
        html += '<strong style="display: block; font-size: 15px; margin-bottom: 4px;">Tidak ada tagihan tertunda</strong>';
        html += '<p class="muted" style="margin: 0 0 16px 0; font-size: 13px;">Semua partisipasi donasi Anda sudah lunas atau belum ada tagihan baru.</p>';
        html += '<a class="btn secondary btn-auto" href="#donor-group-open" style="display: inline-flex; font-size: 13px;">Lihat campaign yang masih terbuka</a>';
        html += '</div>';
      }
      html += '</div>';

      html += '<div class="split-right">';
      const canJoin = others.filter(c => c.status === 'Open' && !c.joined);
      const alreadyJoined = others.filter(c => c.joined && c.status !== 'Archived');
      const history = others.filter(c => c.status === 'Archived' || (c.status !== 'Open' && !c.joined));

      // Group 1: Bisa Diikuti
      html += '<div id="donor-group-open">';
      html += '<h3 style="margin-top:0;">Bisa Diikuti</h3>';
      if (canJoin.length > 0) {
        if (canJoin.length > 1) {
          let bulkJoinHtml = '<div class="card" style="background:#f4fbf7; border: 1px solid #cceadb; margin-bottom: 16px; padding: 12px 16px;">';
          bulkJoinHtml += '<h4 style="margin-top:0; color:#0f766e; font-size:14px; margin-bottom:4px;">📝 Gabung Banyak Campaign</h4>';
          bulkJoinHtml += '<p class="muted" style="font-size:11px; margin-bottom:8px; line-height:1.4;">Centang campaign di bawah, lalu klik tombol ini untuk gabung sekaligus.</p>';
          bulkJoinHtml += '<div style="display:flex; align-items:center; gap:8px;">';
          bulkJoinHtml += '<label style="margin:0; font-size:12px; display:flex; align-items:center; gap:4px; cursor:pointer;"><input type="checkbox" id="bulk-join-select-all" onclick="toggleSelectAllBulkJoin(this)" style="width:auto; margin:0; cursor:pointer;"> Pilih Semua</label>';
          bulkJoinHtml += '<button id="bulk-join-btn" class="btn green btn-auto" style="display:none; margin:0; padding:6px 12px; font-size:12px; margin-left:auto;" onclick="openBulkJoinModal()">Ikut Patungan Massal</button>';
          bulkJoinHtml += '</div>';
          bulkJoinHtml += '</div>';
          html += bulkJoinHtml;
        }
        const sortedCanJoin = sortCampaignsForDonorDashboard(canJoin);
        html += sortedCanJoin.map(c => renderCampaignCard(c, user, false)).join('');
      } else {
        html += '<div class="card muted">Tidak ada campaign terbuka untuk diikuti saat ini.</div>';
      }
      html += '</div>';

      // Group 2: Campaign yang Diikuti
      if (alreadyJoined.length > 0) {
        html += '<div id="donor-group-joined" style="margin-top:24px;">';
        html += '<h3 style="margin-top:0;">Campaign yang Diikuti</h3>';
        const sortedJoined = sortCampaignsForDonorDashboard(alreadyJoined);
        html += sortedJoined.map(c => renderCampaignCard(c, user, false)).join('');
        html += '</div>';
      }

      // Group 3: Selesai / Riwayat
      if (history.length > 0) {
        html += '<details class="donor-history-disclosure" style="margin-top:24px;">';
        html += '<summary style="cursor:pointer; font-weight:600; color:var(--muted); font-size:13px; padding:8px 0;">Riwayat Campaign Selesai (' + history.length + ')</summary>';
        html += '<div style="margin-top:12px;">';
        const sortedHistory = sortCampaignsForDonorDashboard(history);
        html += sortedHistory.map(c => renderCampaignCard(c, user, false)).join('');
        html += '</div>';
        html += '</details>';
      }

      html += '</div>';
      html += '</div>';
    }

    if (el) el.innerHTML = html;
  }).catch(e => {
    if (el) el.innerHTML = '<div class="card error">Gagal memuat: ' + escapeHtml(formatUserErrorMessage(e)) + '</div>';
  });
}

export function clearTargetCampaign() {
  appState.targetCampaignId = null;
  try {
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      window.history.replaceState('', document.title, window.location.pathname + window.location.search);
    }
  } catch (e) { }
  refreshCampaignList();
}

export function toggleSelectAllBulkJoin(master) {
  document.querySelectorAll('.bulk-join-checkbox').forEach(cb => cb.checked = master.checked);
  updateBulkJoinBtnVisibility();
}

export function updateBulkJoinBtnVisibility() {
  const btn = document.getElementById('bulk-join-btn');
  if (!btn) return;
  const selectedCount = document.querySelectorAll('.bulk-join-checkbox:checked').length;
  if (selectedCount > 0) {
    btn.style.display = 'block';
  } else {
    btn.style.display = 'none';
  }
}

export function openBulkJoinModal() {
  const checkboxes = document.querySelectorAll('.bulk-join-checkbox:checked');
  const selectedIds = [];
  const selectedNames = [];
  checkboxes.forEach(cb => {
    selectedIds.push(cb.value);
    selectedNames.push(cb.getAttribute('data-name'));
  });

  if (!selectedIds.length) {
    showInfoModal('Pilih minimal satu campaign terlebih dahulu.', 'Info');
    return;
  }

  let modal = document.getElementById('custom-bulk-join-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'custom-bulk-join-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:none;align-items:center;justify-content:center;';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="card" style="width:90%; max-width:450px; background:white; padding:20px; border-radius:12px; position:relative; box-shadow:var(--shadow-lg); border:none;">
      <button style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:24px;line-height:1;cursor:pointer;color:#888;" onclick="document.getElementById('custom-bulk-join-modal').style.display='none'">&times;</button>
      <h3 style="margin-top:0; color:var(--blue); font-size:18px; font-weight:bold; margin-bottom:8px;">Ikut Patungan Massal</h3>
      <p style="font-size:13px; color:var(--text); margin-bottom:16px; line-height:1.4;">Anda memilih untuk bergabung ke <strong>${selectedIds.length} campaign</strong> sekaligus.</p>
      
      <div style="margin-bottom:16px;">
        <label style="font-weight:bold; font-size:12px; display:block; margin-bottom:8px;">Tipe Patungan:</label>
        <div style="margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <input type="radio" id="bj-type-rata" name="bj-type" value="rata" checked onclick="toggleBulkJoinFields()" style="width:auto; cursor:pointer;">
          <label for="bj-type-rata" style="font-size:13px; cursor:pointer; margin:0;">Patungan Rata (bagi rata tagihan nanti)</label>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <input type="radio" id="bj-type-bebas" name="bj-type" value="bebas" onclick="toggleBulkJoinFields()" style="width:auto; cursor:pointer;">
          <label for="bj-type-bebas" style="font-size:13px; cursor:pointer; margin:0;">Nominal Bebas (tulis nominal sendiri)</label>
        </div>
      </div>
      
      <div id="bj-custom-amount-wrap" class="hidden" style="margin-bottom:16px;">
        <label for="bj-custom-amount" style="font-weight:bold; font-size:12px; display:block; margin-bottom:6px;">Nominal Per Campaign (Rp):</label>
        <input type="number" id="bj-custom-amount" placeholder="Contoh: 50000" style="width:100%; box-sizing:border-box; padding:8px; border-radius:6px; border:1px solid var(--border);">
      </div>

      <div style="margin-bottom:20px;">
        <label for="bj-alias" style="font-weight:bold; font-size:12px; display:block; margin-bottom:6px;">Nama Alias (Opsional, jika ingin nama disamarkan):</label>
        <input type="text" id="bj-alias" placeholder="Contoh: Hamba Allah" style="width:100%; box-sizing:border-box; padding:8px; border-radius:6px; border:1px solid var(--border);">
      </div>

      <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn secondary" style="margin:0; padding:8px 16px; font-size:13px;" onclick="document.getElementById('custom-bulk-join-modal').style.display='none'">Batal</button>
        <button id="btn-submit-bulk-join" class="btn blue" style="margin:0; padding:8px 16px; font-size:13px;" onclick="submitBulkJoin('${selectedIds.join(',')}')">Gabung</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

export function toggleBulkJoinFields() {
  const isBebasEl = document.getElementById('bj-type-bebas');
  const isBebas = isBebasEl ? isBebasEl.checked : false;
  const wrap = document.getElementById('bj-custom-amount-wrap');
  if (wrap) {
    if (isBebas) {
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
    }
  }
}

export function submitBulkJoin(campaignIdsStr) {
  const user = JSON.parse(safeGet('donor_user') || 'null');
  if (!user || !user.whatsapp) {
    showInfoModal('Sesi login tidak valid. Silakan login kembali.', 'Peringatan');
    return;
  }

  const btn = document.getElementById('btn-submit-bulk-join');
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

  const campaignIds = campaignIdsStr.split(',').map(s => s.trim()).filter(Boolean);
  const isBebasEl = document.getElementById('bj-type-bebas');
  const isBebas = isBebasEl ? isBebasEl.checked : false;
  let customAmount = null;
  if (isBebas) {
    const customAmtEl = document.getElementById('bj-custom-amount');
    const rawAmt = customAmtEl ? customAmtEl.value : '';
    const parsed = parseRibuan(rawAmt) || Number(rawAmt);
    if (!parsed || parsed <= 0) {
      showInfoModal('Silakan masukkan nominal khusus yang valid.', 'Peringatan');
      resetBtn();
      return;
    }
    customAmount = parsed;
  }
  const aliasInput = document.getElementById('bj-alias');
  const alias = aliasInput ? aliasInput.value.trim() : '';

  call('joinCampaignsBulk', campaignIds, user.name, user.whatsapp, customAmount, alias)
    .then(() => {
      resetBtn();
      const bulkModal = document.getElementById('custom-bulk-join-modal');
      if (bulkModal) bulkModal.style.display = 'none';
      showToast('Berhasil bergabung di ' + campaignIds.length + ' campaign.');
      refreshCampaignList();
    })
    .catch(e => {
      resetBtn();
      showInfoModal(formatUserErrorMessage(e), 'Kendala');
    });
}

export function getDeadlineBadge(deadlineStr) {
  if (!deadlineStr) return '<span class="badge" style="background:#6b728022; color:#6b7280; margin-left:8px;">⏳ Deadline belum ditentukan</span>';
  const diffDays = Math.ceil((new Date(deadlineStr) - new Date()) / (1000 * 60 * 60 * 24));
  let color = '#1d9e75';
  let text = 'Aman';
  if (diffDays < 0) { color = '#a32d2d'; text = 'Deadline terlewat'; }
  else if (diffDays === 0) { color = '#a32d2d'; text = 'Hari ini!'; }
  else if (diffDays <= 2) { color = '#d97706'; text = diffDays + ' hari lagi'; }
  else if (diffDays <= 5) { color = '#ca8a04'; text = diffDays + ' hari lagi'; }

  return '<span class="badge" style="background:' + color + '22; color:' + color + '; margin-left:8px;">⏳ ' + text + '</span>';
}

export function copyAmount(amount, formattedText) {
  const raw = String(amount).replace(/[^0-9]/g, '');
  navigator.clipboard.writeText(raw).then(() => {
    showToast('Nominal Rp ' + formattedText + ' berhasil disalin untuk m-banking!');
  }).catch(() => {
    const textArea = document.createElement("textarea");
    textArea.value = raw;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    showToast('Nominal Rp ' + formattedText + ' berhasil disalin untuk m-banking!');
  });
}

export function renderCombinedCampaignCard(groupList, bankKey, user) {
  const first = groupList[0];
  const bankName = first.bankName || '';
  const bankAccount = first.bankAccount || '';
  const accountHolder = first.accountHolder || '';
  
  let totalDue = 0;
  const campaignIds = [];
  
  groupList.forEach(c => {
    totalDue += (Number(c.amountDue) || 0);
    campaignIds.push(c.campaignId);
  });
  
  const cIdsStr = campaignIds.join(',');
  const safeDomId = String(bankAccount).replace(/[^a-zA-Z0-9_-]/g, '') || 'combined';
  
  let html = '<div class="card donor-campaign-card donor-primary-card" style="border-left: 4px solid var(--blue); background: #f0f7ff; margin-bottom:16px;">';
  html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">';
  html += '<strong style="color:var(--blue); font-size:15px;">Pembayaran Gabungan (' + groupList.length + ' Campaign)</strong>';
  html += '<span class="badge" style="background:var(--blue-light); color:var(--blue);">⏳ Menunggu Pembayaran</span>';
  html += '</div>';
  
  html += '<p style="margin:4px 0; font-size:13px; line-height:1.4;">Menggabungkan patungan untuk:<br>';
  groupList.forEach(c => {
    html += ' &middot; <strong>' + escapeHtml(c.targetName) + '</strong> (' + formatIDR(c.amountDue) + ')<br>';
  });
  html += '</p>';
  
  html += '<div style="background:var(--blue-light); padding:12px; border-radius:8px; margin: 12px 0;">';
  html += '<div style="font-size:12px; color:var(--text);">Total nominal gabungan yang harus ditransfer:</div>';
  html += '<div style="font-size:20px; font-weight:bold; color:var(--blue); display:flex; align-items:center; gap:8px;">' + formatIDR(totalDue);
  html += ' <span class="link-btn" onclick="copyAmount(' + totalDue + ', \'' + formatIDR(totalDue) + '\')" style="margin-left: 8px; cursor: pointer; font-size:12px;">Salin</span>';
  html += '</div>';
  html += '</div>';
  
  html += '<p class="muted" style="margin:8px 0; font-size:12px;">Ke: ' + escapeHtml(bankName) + ' ' + escapeHtml(bankAccount);
  if (bankAccount) {
    html += ' <button class="link-btn" style="font-size:11px;" onclick="navigator.clipboard.writeText(\'' + escapeHtml(bankAccount) + '\'); showToast(\'Nomor rekening disalin!\');">Salin</button>';
  }
  if (accountHolder) {
    html += ' a.n. ' + escapeHtml(accountHolder);
  }
  html += '</p>';
  
  html += '<div style="margin-top:12px; border-top:1px dashed var(--border); padding-top:12px;">';
  html += '<label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">Upload satu bukti transfer untuk semua campaign di atas</label>';
  html += '<p class="muted" style="font-size:11px; margin:2px 0 6px 0;">Unggah bukti transfer (format JPG, PNG, atau PDF maks 2MB). Bukti hanya digunakan oleh PIC untuk verifikasi.</p>';
  html += '<input type="file" id="combined-proof-' + safeDomId + '" accept="image/*,application/pdf" style="font-size:12px; padding:4px; width:100%; box-sizing:border-box;">';
  html += '<button id="btn-submit-combined-' + safeDomId + '" class="btn blue" style="margin-top:8px; width:100%; font-size:12px; padding:8px;" onclick="submitCombinedProof(\'' + escapeHtml(bankAccount) + '\', \'' + cIdsStr + '\')">Konfirmasi Transfer</button>';
  html += '<div id="combined-error-' + safeDomId + '" class="error" style="font-size:11px; margin-top:4px;"></div>';
  html += '</div>';
  
  html += '</div>';
  return html;
}

export function renderCampaignCard(c, user, isPending) {
  let checkboxHtml = '';
  if (c.status === 'Open' && !c.joined) {
    checkboxHtml = '<input type="checkbox" class="bulk-join-checkbox" value="' + c.campaignId + '" data-name="' + escapeHtml(c.targetName) + '" onchange="updateBulkJoinBtnVisibility()" style="width:16px; height:16px; margin-right:8px; cursor:pointer; vertical-align:middle;"> ';
  }

  const cardClass = isPending ? 'card donor-campaign-card donor-primary-card' : 'card donor-campaign-card';
  let html = '<div class="' + cardClass + '" id="card-' + c.campaignId + '">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
  html += '<div style="display:flex;align-items:center;">' + checkboxHtml + '<strong>' + escapeHtml(c.targetName) + '</strong></div>';
  html += '<div>' + statusBadge(c.status) + getDeadlineBadge(c.deadline) + '</div>';
  html += '</div>';
  if (c.reason) html += '<p class="muted">' + escapeHtml(c.reason) + '</p>';

  const giftText = c.giftAmount > 0 ? formatIDR(c.giftAmount) : 'Ditentukan nanti';
  const donorCount = (c.donorCount !== undefined && c.donorCount !== null && !isNaN(c.donorCount))
    ? Number(c.donorCount)
    : (c.donor_count !== undefined && c.donor_count !== null && !isNaN(c.donor_count) ? Number(c.donor_count) : 0);
  html += '<p class="muted">Total hadiah: ' + giftText + ' &middot; ' + donorCount + ' donatur' + (c.deadline ? ' &middot; deadline ' + c.deadline : '') + '</p>';

  if (c.status === 'Finalized' && (c.GiftLink || c.GiftImage)) {
    html += '<div style="margin-bottom: 12px; display:flex; gap:8px; flex-wrap:wrap;">';
    if (c.GiftLink) html += '<a href="' + escapeHtml(sanitizeUrl(c.GiftLink)) + '" target="_blank" rel="noopener noreferrer" class="link-btn" style="border:1px solid var(--border); border-radius:4px; padding:4px 8px; text-decoration:none;">Lihat Barang/Hadiah</a>';
    if (c.GiftImage) html += '<a href="' + escapeHtml(sanitizeUrl(c.GiftImage)) + '" target="_blank" rel="noopener noreferrer" class="link-btn" style="border:1px solid var(--border); border-radius:4px; padding:4px 8px; text-decoration:none;">Lihat Screenshot Harga</a>';
    html += '</div>';
  }

  if (c.status === 'Open') {
    if (c.joined) {
      const customAmt = Number(c.customAmount !== undefined ? c.customAmount : (c.CustomAmount !== undefined ? c.CustomAmount : (c.custom_amount !== undefined ? c.custom_amount : 0))) || 0;
      let joinNotice = '<div class="success">✓ Kamu sudah daftar di list ini. Menunggu finalisasi oleh PIC.</div>';
      if (customAmt > 0) {
        joinNotice += '<div style="margin-top:6px; font-size:13px; color:#1e40af; font-weight:500;">🏷️ Komitmen nominal khusus: <strong>' + formatIDR(customAmt) + '</strong></div>';
      } else {
        joinNotice += '<div style="margin-top:6px; font-size:13px; color:var(--muted);">Partisipasi: Patungan rata-rata</div>';
      }
      html += joinNotice;
      html += '<button id="btn-withdraw-' + c.campaignId + '" class="btn secondary" style="margin-top:8px;" onclick="withdraw(\'' + c.campaignId + '\')">Batal ikut</button>';
    } else {
      html += '<div class="card" style="background:#f9f9f9;border:1px solid #eee;margin-top:8px;">';
      html += '<label style="margin-top:0; display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="check-custom-' + c.campaignId + '" onchange="toggleCustomAmount(\'' + c.campaignId + '\')" style="width:auto; min-height:unset;"> Saya ingin donasi dengan nominal khusus</label>';
      html += '<div id="wrap-custom-' + c.campaignId + '" class="hidden" style="margin-top:8px;">';
      html += '<label>Nominal Khusus (IDR)</label>';
      html += '<input id="input-custom-' + c.campaignId + '" type="text" inputmode="numeric" placeholder="Contoh: 100.000" onkeyup="formatInputRibuan(event)">';
      html += '</div>';

      html += '<label style="margin-top:12px; display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="check-alias-' + c.campaignId + '" onchange="document.getElementById(\'wrap-alias-\' + \'' + c.campaignId + '\').classList.toggle(\'hidden\')" style="width:auto; min-height:unset;"> Sembunyikan Nama Asli (Gunakan Alias)</label>';
      html += '<div id="wrap-alias-' + c.campaignId + '" class="hidden" style="margin-top:8px;">';
      html += '<label>Nama Alias / Samaran</label>';
      html += '<input id="input-alias-' + c.campaignId + '" type="text" placeholder="Contoh: Hamba Allah">';
      html += '</div>';

      html += '<button id="btn-join-' + c.campaignId + '" class="btn" style="margin-top:12px;" onclick="joinCampaign(\'' + c.campaignId + '\')">Gabung Donasi untuk ' + escapeHtml(c.targetName) + '</button>';
      html += '</div>';
    }
  } else if (c.status === 'Closed') {
    html += '<p class="muted">List sudah ditutup, menunggu PIC menentukan jumlah & rekening.</p>';
  } else if (c.status === 'Finalized') {
    if (c.joined) {
      html += '<div class="card" style="background:#e6f1fb;border:none;">';
      html += '<div style="background:var(--blue-light); padding:12px; border-radius:8px; margin-bottom:12px;">';
      html += '<div style="font-size:14px; color:var(--text);">Jumlah yang harus ditransfer:</div>';
      html += '<div style="font-size:24px; font-weight:bold; color:var(--blue); display:flex; align-items:center; gap:8px;">' + formatIDR(c.amountDue);
      html += ' <span class="link-btn" onclick="copyAmount(' + c.amountDue + ', \'' + formatIDR(c.amountDue) + '\')" style="margin-left: 8px; cursor: pointer; font-size:14px;">Salin</span>';
      html += '</div>';
      html += '</div>';
      html += '<p class="muted">Ke: ' + escapeHtml(c.bankName) + ' ' + escapeHtml(c.bankAccount);
      html += ' <button class="link-btn" style="font-size:12px;" onclick="navigator.clipboard.writeText(\'' + escapeHtml(c.bankAccount) + '\'); showToast(\'Nomor rekening disalin!\');">Salin</button>';
      html += ' a.n. ' + escapeHtml(c.accountHolder) + '</p>';
      if (c.paid) {
        if (c.verified) {
          html += '<div class="success">✓ Pembayaran terverifikasi oleh PIC.</div>';
        } else {
          html += '<div class="success">✓ Sudah konfirmasi transfer (Menunggu Verifikasi PIC).</div>';
        }
        if (c.proofLink) html += '<a class="link-btn" href="' + escapeHtml(sanitizeUrl(c.proofLink)) + '" target="_blank" rel="noopener noreferrer">Lihat bukti transfer</a>';
      } else {
        html += '<label>Upload bukti transfer</label>';
        html += '<p class="muted" style="font-size:11px; margin:2px 0 6px 0;">Unggah bukti transfer (format JPG, PNG, atau PDF maks 2MB). Bukti hanya digunakan oleh PIC untuk verifikasi.</p>';
        html += '<input type="file" id="proof-' + c.campaignId + '" accept="image/*,application/pdf" style="width:100%; box-sizing:border-box;">';
        html += '<button id="btn-submit-proof-' + c.campaignId + '" class="btn" onclick="submitProof(\'' + c.campaignId + '\')">Sudah transfer, kirim bukti</button>';
        html += '<div id="proof-error-' + c.campaignId + '" class="error"></div>';
      }
      html += '</div>';
    } else {
      html += '<p class="muted">Kamu tidak terdaftar sebagai donatur di campaign ini.</p>';
    }
  } else {
    html += '<p class="muted">Campaign sudah selesai/diarsipkan.</p>';
  }
  html += '</div>';
  return html;
}

export function joinCampaign(campaignId) {
  const user = JSON.parse(safeGet('donor_user') || 'null');
  if (!user || !user.whatsapp) {
    showInfoModal('Sesi login tidak valid. Silakan login kembali.', 'Peringatan');
    return;
  }

  let customAmount = null;
  const checkEl = document.getElementById('check-custom-' + campaignId);
  if (checkEl && checkEl.checked) {
    const inputEl = document.getElementById('input-custom-' + campaignId);
    const parsed = parseRibuan(inputEl ? inputEl.value : '');
    if (!parsed || parsed <= 0) {
      showInfoModal('Silakan masukkan nominal khusus yang valid.', 'Peringatan');
      return;
    }
    customAmount = parsed;
  }

  let alias = '';
  const checkAliasEl = document.getElementById('check-alias-' + campaignId);
  if (checkAliasEl && checkAliasEl.checked) {
    const inputAliasEl = document.getElementById('input-alias-' + campaignId);
    alias = inputAliasEl ? inputAliasEl.value.trim() : '';
    if (!alias) {
      showInfoModal('Silakan isi nama alias.', 'Peringatan');
      return;
    }
  }

  const btn = document.getElementById('btn-join-' + campaignId);
  let originalText = '';
  if (btn) {
    originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Memproses...';
  }

  callQueued('joinCampaign', campaignId, user.name, user.whatsapp, customAmount, alias)
    .then(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      showToast('Berhasil bergabung dalam campaign!');
      refreshCampaignList();
    })
    .catch(e => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      showInfoModal(formatUserErrorMessage(e), 'Kendala');
    });
}

export function toggleCustomAmount(campaignId) {
  const wrap = document.getElementById('wrap-custom-' + campaignId);
  const check = document.getElementById('check-custom-' + campaignId);
  if (wrap && check) {
    if (check.checked) wrap.classList.remove('hidden');
    else wrap.classList.add('hidden');
  }
}

export function withdraw(campaignId) {
  const user = JSON.parse(safeGet('donor_user') || 'null');
  if (!user || !user.whatsapp) {
    showInfoModal('Sesi login tidak valid. Silakan login kembali.', 'Peringatan');
    return;
  }
  showConfirmModal('Batalkan keikutsertaan Anda dalam campaign ini?', () => {
    const btn = document.getElementById('btn-withdraw-' + campaignId);
    let originalText = '';
    if (btn) {
      originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Memproses...';
    }
    return call('withdrawCampaign', campaignId, user.whatsapp)
      .then(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalText;
        }
        showToast('Keikutsertaan berhasil dibatalkan.');
        refreshCampaignList();
      })
      .catch(e => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalText;
        }
        showInfoModal(formatUserErrorMessage(e), 'Kendala');
      });
  });
}

export async function submitProof(campaignId) {
  const user = JSON.parse(safeGet('donor_user') || 'null');
  if (!user || !user.whatsapp) {
    showInfoModal('Sesi login tidak valid. Silakan login kembali.', 'Peringatan');
    return;
  }
  const fileInput = document.getElementById('proof-' + campaignId);
  const errEl = document.getElementById('proof-error-' + campaignId);
  const submitBtn = document.getElementById('btn-submit-proof-' + campaignId);
  if (errEl) errEl.textContent = '';
  const file = fileInput ? (fileInput.files && fileInput.files[0]) : null;
  if (!file) {
    if (errEl) errEl.textContent = 'Pilih file bukti transfer dulu.';
    return;
  }

  if (file.size && file.size > 2 * 1024 * 1024) {
    if (errEl) errEl.textContent = 'Ukuran file maksimal 2MB.';
    return;
  }

  if (submitBtn) {
    submitBtn.textContent = 'Mengunggah...';
    submitBtn.disabled = true;
  }

  const resetBtn = () => {
    if (submitBtn) {
      submitBtn.textContent = 'Sudah transfer, kirim bukti';
      submitBtn.disabled = false;
    }
  };

  try {
    const client = _getSupabaseClient();
    if (!client || !client.storage) {
      throw new Error('Layanan penyimpanan Supabase belum siap.');
    }

    const cleanWa = String(user.whatsapp).replace(/\D/g, '');
    const timestamp = Date.now();
    const fileName = file.name || 'receipt.jpg';
    const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
    const storagePath = `proofs/${campaignId}/${cleanWa}_${timestamp}.${ext}`;

    const { data: uploadData, error: uploadError } = await client.storage
      .from('bukti-transfer')
      .upload(storagePath, file, { upsert: true });

    if (uploadError) {
      if (errEl) errEl.textContent = 'Gagal mengunggah bukti pembayaran.';
      resetBtn();
      return;
    }

    const savedPath = (uploadData && uploadData.path) ? uploadData.path : storagePath;

    await call('submitPaymentProof', campaignId, user.whatsapp, savedPath);

    showToast('Bukti transfer berhasil dikirim. Menunggu verifikasi PIC.');
    refreshCampaignList();
  } catch (err) {
    if (errEl) errEl.textContent = formatUserErrorMessage(err) || 'Gagal mengunggah bukti pembayaran.';
    resetBtn();
  }
}

export async function submitCombinedProof(bankAccount, campaignIdsStr) {
  const user = JSON.parse(safeGet('donor_user') || 'null');
  if (!user || !user.whatsapp) {
    showInfoModal('Sesi login tidak valid. Silakan login kembali.', 'Peringatan');
    return;
  }

  const safeDomId = String(bankAccount).replace(/[^a-zA-Z0-9_-]/g, '') || 'combined';
  const fileInput = document.getElementById('combined-proof-' + safeDomId) || document.getElementById('combined-proof-' + bankAccount);
  const errEl = document.getElementById('combined-error-' + safeDomId) || document.getElementById('combined-error-' + bankAccount);
  const submitBtn = document.getElementById('btn-submit-combined-' + safeDomId) || document.getElementById('btn-submit-combined-' + bankAccount);
  if (errEl) errEl.textContent = '';
  const file = fileInput ? (fileInput.files && fileInput.files[0]) : null;
  if (!file) {
    if (errEl) errEl.textContent = 'Pilih file bukti transfer dulu.';
    return;
  }

  if (file.size && file.size > 2 * 1024 * 1024) {
    if (errEl) errEl.textContent = 'Ukuran file maksimal 2MB.';
    return;
  }

  if (submitBtn) {
    submitBtn.textContent = 'Mengunggah...';
    submitBtn.disabled = true;
  }

  const resetBtn = () => {
    if (submitBtn) {
      submitBtn.textContent = 'Konfirmasi Transfer';
      submitBtn.disabled = false;
    }
  };

  const campaignIds = campaignIdsStr.split(',').map(s => s.trim()).filter(Boolean);

  try {
    const client = _getSupabaseClient();
    if (!client || !client.storage) {
      throw new Error('Layanan penyimpanan Supabase belum siap.');
    }

    const cleanWa = String(user.whatsapp).replace(/\D/g, '');
    const cleanAcc = String(bankAccount).replace(/\D/g, '');
    const timestamp = Date.now();
    const fileName = file.name || 'receipt.jpg';
    const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
    const storagePath = `proofs/combined_${cleanAcc}/${cleanWa}_${timestamp}.${ext}`;

    const { data: uploadData, error: uploadError } = await client.storage
      .from('bukti-transfer')
      .upload(storagePath, file, { upsert: true });

    if (uploadError) {
      if (errEl) errEl.textContent = 'Gagal mengunggah bukti pembayaran.';
      resetBtn();
      return;
    }

    const savedPath = (uploadData && uploadData.path) ? uploadData.path : storagePath;

    await call('submitCombinedPaymentProof', campaignIds, user.whatsapp, savedPath);

    showToast('Bukti transfer gabungan berhasil dikirim. Menunggu verifikasi PIC.');
    refreshCampaignList();
  } catch (err) {
    if (errEl) errEl.textContent = formatUserErrorMessage(err) || 'Gagal mengunggah bukti pembayaran.';
    resetBtn();
  }
}

export function deleteDraftCampaign(picToken) {
  showConfirmModal('Hapus draft campaign ini? Tindakan ini tidak bisa dibatalkan.', () => {
    call('deleteDraftPicToken', picToken).then(() => {
      showToast('Draft campaign berhasil dihapus.');
      loadUserDashboard();
    }).catch(e => showInfoModal(formatUserErrorMessage(e), 'Kendala'));
  });
}
