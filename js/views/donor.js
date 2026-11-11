import { safeGet, safeSet, safeRemove } from '../storage.js';
import { escapeHtml, sanitizeUrl, formatUserErrorMessage, showInfoModal, showConfirmModal, showToast, showView, formatIDR, parseRibuan, statusBadge, paymentStatusIcon, emptyState } from '../utils.js';
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

export async function getDonorProofSignedUrl(storagePath) {
  if (!storagePath || typeof storagePath !== 'string' || !storagePath.trim()) return null;
  const cleanPath = storagePath.trim();
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) return cleanPath;
  try {
    const client = _getSupabaseClient();
    if (!client || !client.storage) return null;
    const { data, error } = await client.storage.from('bukti-transfer').createSignedUrl(cleanPath, 3600);
    return (!error && data && data.signedUrl) ? data.signedUrl : null;
  } catch (_) {
    return null;
  }
}

export async function openMediaFile(storagePath, fallbackUrl) {
  const target = storagePath || fallbackUrl;
  if (!target) return;
  if (target.startsWith('http://') || target.startsWith('https://')) {
    window.open(target, '_blank', 'noopener,noreferrer');
    return;
  }
  showToast('Memuat dokumen/foto...');
  const signed = await getDonorProofSignedUrl(target);
  if (signed) {
    window.open(signed, '_blank', 'noopener,noreferrer');
  } else {
    // A rendered button means the record HAS a path, so this is "the file is not reachable",
    // not "the system broke". Saying "Kendala Sistem" told the donor to blame the app and
    // hid the real next step: ask the PIC to re-upload.
    showInfoModal('Berkas tidak dapat dibuka. Minta PIC mengunggah ulang.', 'Tidak Dapat Dibuka');
  }
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

    // [B6-fix2 · audit #2] The inline style forced forest #4a653b as INK, which is 3.05:1 on the
    // dark canvas and 2.87:1 on the dark modal #0b1411 — so the confirmation was least readable
    // exactly when it mattered. .success already resolves to --success (5.24:1 light, 13.07:1 dark)
    // and the inline declaration was overriding it. Removed so the class does its job.
    if (msgEl) msgEl.innerHTML = '<span class="success">Profil berhasil diperbarui.</span>';
    
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
      picBtnHtml += '<div class="card theme-surface-warning" data-testid="email-warning" style="border-left:4px solid var(--amber); margin-bottom:16px;"><p style="margin:0; font-size:14px;"><strong>Email belum diisi.</strong><br/>Tambahkan email di Profil agar Anda mendapat pengingat tagihan otomatis.</p></div>';
    }
    
    if (user.status === 'active') {
      picBtnHtml = '<button data-testid="btn-create-pic" class="btn blue" style="margin-bottom:16px;" onclick="seamlessBecomePic()">+ Buat Campaign Baru (Jadi PIC)</button>';
    } else if (user.status === 'ex') {
      picBtnHtml = '<div class="card theme-surface-muted" data-testid="pic-permission-notice" style="border:none; margin-bottom:16px;"><p class="muted" style="margin:0;">Status Anda adalah Alumni. Anda dapat berpartisipasi dalam donasi, tetapi pembuatan campaign baru hanya dapat dilakukan oleh karyawan aktif.</p></div>';
    }
  }

  const el = document.getElementById('campaign-list');
  if (el) {
    el.innerHTML = '<div id="actual-campaign-list" data-testid="campaign-list"><div data-testid="campaign-list-loading" style="padding:24px;text-align:center;"><span style="font-size:24px;">⏳</span><br><span style="color:var(--muted);">Memuat daftar campaign...</span></div></div>';
  }

  const picContainer = document.getElementById('pic-create-btn-container');
  if (picContainer) picContainer.innerHTML = picBtnHtml;

  showView('user-dashboard');
  refreshCampaignList();
  loadMyPicCampaigns(user.whatsapp);
}

// Option B: surface PIC-owned campaigns on the donor dashboard so a transferred
// campaign (whose token is persisted) can be entered without hunting the token.
export function loadMyPicCampaigns(whatsapp) {
  const container = document.getElementById('my-pic-campaigns');
  if (!container || !whatsapp) return;
  container.innerHTML = '';
  call('claimPicCampaigns', { whatsapp: whatsapp })
    .then(list => {
      container.innerHTML = renderMyPicCampaigns(list, whatsapp);
    })
    .catch(() => {
      // Non-fatal: donor dashboard should still work if this discovery fails.
      container.innerHTML = '';
    });
}

export function renderMyPicCampaigns(list, whatsapp) {
  if (!Array.isArray(list) || !list.length) return '';
  const rows = list.map(c => {
    const statusBadgeHtml = statusBadge(c.status);
    return '<div class="my-pic-row" data-testid="pic-campaign-row" data-id="' + escapeHtml(c.campaignId || '') + '" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px dashed var(--border);flex-wrap:wrap;">'
      + '<div style="min-width:0;flex:1;"><strong>' + escapeHtml(c.targetName || c.campaignId || '-') + '</strong> <span class="muted" style="font-size:12px;">(' + escapeHtml(c.campaignId || '') + ')</span><br>'
      + '<span class="muted" style="font-size:12px;">' + String(c.donorCount || 0) + ' donatur &middot; Terkumpul ' + formatIDR(c.totalCollected || 0) + '</span></div>'
      + statusBadgeHtml
      + '<button data-testid="btn-open-pic-campaign" class="btn secondary btn-auto" style="font-size:12px;padding:4px 10px;" onclick="openPicCampaignFromDonor(\'' + escapeHtml(c.campaignId || '') + '\')">Buka Dashboard PIC</button>'
      + '</div>';
  }).join('');
  return '<div class="card" data-testid="my-pic-campaigns" style="margin-bottom:16px;"><h3 style="margin-top:0;font-size:15px;">🛠️ Campaign yang kamu kelola sebagai PIC</h3>'
    + rows
    + '</div>';
}

export async function openPicCampaignFromDonor(campaignId) {
  const user = JSON.parse(safeGet('donor_user') || 'null');
  if (!user || !user.whatsapp) {
    showInfoModal('Sesi login tidak valid. Silakan login kembali.', 'Peringatan');
    return;
  }
  try {
    const list = await call('getUserPicCampaigns', { whatsapp: user.whatsapp });
    const row = Array.isArray(list) ? list.find(c => c.campaignId === campaignId) : null;
    if (!row || !row.token) {
      showInfoModal('Token PIC untuk campaign ini belum tersimpan. Hubungi admin untuk mendapatkan token PIC baru.', 'Info');
      return;
    }
    // Use the global loginToken exposed by app.js (avoids circular import with auth.js).
    if (typeof window !== 'undefined' && typeof window.loginToken === 'function') {
      window.loginToken(String(row.token).trim());
    } else {
      showInfoModal('Mohon login manual dengan token PIC: ' + String(row.token), 'Info');
    }
  } catch (err) {
    showInfoModal(formatUserErrorMessage(err), 'Kendala');
  }
}


/**
 * [B12-fix] Entry point from the landing page.
 *
 * The landing-page link cannot call seamlessBecomePic() directly: that function requires a
 * `donor_user` session and shows "Sesi login tidak valid" to anyone who is not logged in — which
 * is everyone on the landing page. Reported live after deploy.
 *
 * So: if there is no session, go to the WhatsApp login with an intent flag; the login flow then
 * continues into the PIC creation. If there IS a session, hand straight over.
 */
export function becomePicFromLanding() {
  const user = JSON.parse(safeGet('donor_user') || 'null');
  if (user && user.whatsapp) {
    seamlessBecomePic();
    return;
  }
  try { sessionStorage.setItem('donatpro.intent', 'become-pic'); } catch (_) {}
  showView('user-login');
  showToast('Masuk dengan WhatsApp dulu, lalu kamu bisa buat campaign.');
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

  // Option B: if the member already owns ACTIVE PIC campaigns (e.g. transferred
  // by admin), reuse the latest login token instead of always minting a draft.
  const reuseExisting = () => call('getUserPicCampaigns', { whatsapp: user.whatsapp })
    .then(list => {
      const owned = Array.isArray(list)
        ? list.find(c => Boolean(c.token) && c.status !== 'Draft')
        : null;
      if (owned && owned.token) {
        if (btn) {
          btn.textContent = "+ Buat Campaign Baru (Jadi PIC)";
          btn.disabled = false;
        }
        safeSet('auth_token', String(owned.token).trim());
        safeSet('auth_role', 'PIC');
        showInfoModal('Anda sudah menjadi PIC untuk campaign ' + (owned.targetName || owned.campaignId) + '.\n\nAnda dialihkan ke dashboard PIC campaign tersebut.', 'Info');
        loadPicDashboard();
        return true;
      }
      return false;
    })
    .catch(() => false);

  reuseExisting().then(used => {
    if (used) return;
    return call('generateSeamlessPicToken', user.whatsapp).then(res => {
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
    });
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
    el.innerHTML = '<div data-testid="campaign-list-loading" style="padding:24px;text-align:center;"><span style="font-size:24px;">⏳</span><br><span style="color:var(--muted);">Memuat daftar campaign...</span></div>';
  }

  call('listActiveCampaigns', user.whatsapp).then(list => {
    let html = '';
    if (!list || !list.length) {
      if (el) el.innerHTML = renderDonorEmptyState({ title: 'Belum ada campaign aktif', note: 'Campaign akan muncul di sini saat pengelola membukanya.' });
      return;
    }

    if (appState.targetCampaignId) {
      const targetedCampaign = list.find(c => c.campaignId === appState.targetCampaignId);
      if (targetedCampaign) {
        html += '<h3 style="margin-top:0;">✨ Campaign Undangan</h3>';
        html += renderCampaignCard(targetedCampaign, user, false);
        html += '<button data-testid="btn-back-campaigns" class="btn secondary" style="margin-top: 16px; display: block; width: 100%; text-align: center;" onclick="clearTargetCampaign()">⬅️ Lihat Semua Campaign</button>';
      } else {
        html += '<div data-testid="campaign-not-found" class="card error">Campaign tidak ditemukan atau sudah diarsipkan.</div>';
        html += '<button data-testid="btn-back-campaigns" class="btn secondary" style="margin-top: 16px;" onclick="clearTargetCampaign()">⬅️ Lihat Semua Campaign</button>';
      }
    } else {
      const isPendingPayment = c => (
        c.status === 'Finalized' &&
        c.status !== 'Archived' &&
        c.joined &&
        !c.paid &&
        Number(c.amountDue) > 0
      );
      const pending = list.filter(isPendingPayment);
      const others = list.filter(c => !isPendingPayment(c));

      if (pending.length > 0) {
        const attentionTarget = pending.length === 1
          ? '#card-' + escapeHtml(pending[0].campaignId)
          : '#actual-campaign-list';
        const attentionAction = pending.length === 1 ? 'Lihat tagihan' : 'Lihat tagihan gabungan';
        html += '<div class="donor-dashboard-attention" data-testid="payment-attention" role="status">';
        html += '<span class="donor-dashboard-attention-icon">' + paymentStatusIcon('review') + '</span>';
        html += '<span class="donor-dashboard-attention-copy"><strong>' + pending.length + ' pembayaran menunggu</strong><span>Bayar sebelum deadline agar campaign selesai tepat waktu.</span></span>';
        html += '<a data-testid="link-payment-attention" class="link-btn" href="' + attentionTarget + '">' + attentionAction + '</a>';
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
        html += renderDonorEmptyState({
          icon: 'verified',
          title: 'Tidak ada tagihan tertunda',
          note: 'Semua partisipasi donasi Anda sudah lunas atau belum ada tagihan baru.',
          href: '#donor-group-open',
          action: 'Lihat campaign yang masih terbuka'
        });
      }
      html += '</div>';

      html += '<div class="split-right">';
      const canJoin = others.filter(c => c.status === 'Open' && !c.joined);
      const alreadyJoined = others.filter(c => c.joined && c.status !== 'Archived');
      const history = others.filter(c => c.status === 'Archived' || (c.status !== 'Open' && !c.joined));

      // Group 1: Bisa Diikuti
      html += '<div id="donor-group-open" data-testid="campaign-group-open">';
      html += '<h3 style="margin-top:0;">Bisa Diikuti</h3>';
      if (canJoin.length > 0) {
        if (canJoin.length > 1) {
          let bulkJoinHtml = '<div class="card theme-surface-success" data-testid="bulk-join-options" style="margin-bottom: 16px; padding: 12px 16px;">';
          bulkJoinHtml += '<h4 class="theme-success-heading" style="margin-top:0; font-size:14px; margin-bottom:4px;">📝 Gabung Banyak Campaign</h4>';
                    bulkJoinHtml += '<div style="display:flex; align-items:center; gap:8px;">';
          bulkJoinHtml += '<label style="margin:0; font-size:12px; display:flex; align-items:center; gap:4px; cursor:pointer;"><input data-testid="input-bulk-join-all" type="checkbox" id="bulk-join-select-all" onclick="toggleSelectAllBulkJoin(this)" style="width:auto; margin:0; cursor:pointer;"> Pilih Semua</label>';
          bulkJoinHtml += '<button data-testid="btn-bulk-join" id="bulk-join-btn" class="btn green btn-auto" style="display:none; margin:0; padding:6px 12px; font-size:12px; margin-left:auto;" onclick="openBulkJoinModal()">Ikut Patungan Massal</button>';
          bulkJoinHtml += '</div>';
          bulkJoinHtml += '</div>';
          html += bulkJoinHtml;
        }
        const sortedCanJoin = sortCampaignsForDonorDashboard(canJoin);
        html += sortedCanJoin.map(c => renderCampaignCard(c, user, false)).join('');
      } else {
        html += renderDonorEmptyState({ title: 'Tidak ada campaign terbuka', note: 'Semua campaign yang kamu ikuti sedang berjalan atau sudah selesai.' });
      }
      html += '</div>';

      // Group 2: Campaign yang Diikuti
      if (alreadyJoined.length > 0) {
        html += '<div id="donor-group-joined" data-testid="campaign-group-joined" style="margin-top:24px;">';
        html += '<h3 style="margin-top:0;">Campaign yang Diikuti</h3>';
        const sortedJoined = sortCampaignsForDonorDashboard(alreadyJoined);
        html += sortedJoined.map(c => renderCampaignCard(c, user, false)).join('');
        html += '</div>';
      }

      // Group 3: Selesai / Riwayat
      if (history.length > 0) {
        html += '<details class="donor-history-disclosure" data-testid="campaign-history" style="margin-top:24px;">';
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
    if (el) el.innerHTML = '<div data-testid="campaign-error" class="card error">Gagal memuat: ' + escapeHtml(formatUserErrorMessage(e)) + '</div>';
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
    <div class="card theme-surface-modal" data-testid="bulk-join-modal" style="width:90%; max-width:450px; padding:20px; border-radius:12px; position:relative; box-shadow:var(--shadow-lg); border:none;">
      <button data-testid="btn-close-bulk-join" style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:24px;line-height:1;cursor:pointer;color:var(--muted);" onclick="document.getElementById('custom-bulk-join-modal').style.display='none'">&times;</button>
      <h3 style="margin-top:0; color:var(--blue); font-size:18px; font-weight:bold; margin-bottom:8px;">Ikut Patungan Massal</h3>
      <p style="font-size:13px; color:var(--text); margin-bottom:16px; line-height:1.4;">Anda memilih untuk bergabung ke <strong>${selectedIds.length} campaign</strong> sekaligus.</p>
      
      <div style="margin-bottom:16px;">
        <label style="font-weight:bold; font-size:12px; display:block; margin-bottom:8px;">Tipe Patungan:</label>
        <div style="margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          <input data-testid="input-bulk-type-rata" type="radio" id="bj-type-rata" name="bj-type" value="rata" checked onclick="toggleBulkJoinFields()" style="width:auto; cursor:pointer;">
          <label for="bj-type-rata" style="font-size:13px; cursor:pointer; margin:0;">Patungan Rata (bagi rata tagihan nanti)</label>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <input data-testid="input-bulk-type-bebas" type="radio" id="bj-type-bebas" name="bj-type" value="bebas" onclick="toggleBulkJoinFields()" style="width:auto; cursor:pointer;">
          <label for="bj-type-bebas" style="font-size:13px; cursor:pointer; margin:0;">Nominal Bebas (tulis nominal sendiri)</label>
        </div>
      </div>
      
      <div data-testid="bulk-custom-amount-fields" id="bj-custom-amount-wrap" class="hidden" style="margin-bottom:16px;">
        <div class="theme-info-note" style="padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
          <span>ℹ️</span>
          <span>Nominal khusus minimal <strong>Rp 50.000</strong> per campaign.</span>
        </div>
        <label for="bj-custom-amount" style="font-weight:bold; font-size:12px; display:block; margin-bottom:6px;">Nominal Per Campaign (Rp):</label>
        <input data-testid="input-bulk-custom-amount" type="text" id="bj-custom-amount" inputmode="numeric" placeholder="Contoh: 50.000 (Minimal 50.000)" onkeyup="formatInputRibuan(event)" style="width:100%; box-sizing:border-box; padding:8px; border-radius:6px; border:1px solid var(--border);">
      </div>

      <div style="margin-bottom:20px;">
        <label for="bj-alias" style="font-weight:bold; font-size:12px; display:block; margin-bottom:6px;">Nama Alias (Opsional, jika ingin nama disamarkan):</label>
        <input data-testid="input-bulk-alias" type="text" id="bj-alias" placeholder="Contoh: Hamba Allah" style="width:100%; box-sizing:border-box; padding:8px; border-radius:6px; border:1px solid var(--border);">
      </div>

      <div class="modal-actions" style="display:flex; justify-content:flex-end; gap:8px;">
        <button data-testid="btn-cancel-bulk-join" class="btn secondary" style="margin:0; padding:8px 16px; font-size:13px;" onclick="document.getElementById('custom-bulk-join-modal').style.display='none'">Batal</button>
        <button data-testid="btn-submit-bulk-join" id="btn-submit-bulk-join" class="btn blue" style="margin:0; padding:8px 16px; font-size:13px;" onclick="submitBulkJoin('${selectedIds.join(',')}')">Gabung</button>
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
    if (parsed < 50000) {
      showInfoModal('Nominal khusus minimal adalah Rp 50.000 per campaign. Jika ingin patungan standar, gunakan opsi Patungan Rata.', 'Peringatan');
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
  if (!deadlineStr) return '<span data-testid="deadline-badge" class="badge" style="background:#6b728022; color:#6b7280; margin-left:8px;">⏳ Deadline belum ditentukan</span>';
  const diffDays = Math.ceil((new Date(deadlineStr) - new Date()) / (1000 * 60 * 60 * 24));
  let color = '#1d9e75';
  let text = 'Aman';
  if (diffDays < 0) { color = '#a32d2d'; text = 'Deadline terlewat'; }
  else if (diffDays === 0) { color = '#a32d2d'; text = 'Hari ini!'; }
  else if (diffDays <= 2) { color = '#d97706'; text = diffDays + ' hari lagi'; }
  else if (diffDays <= 5) { color = '#ca8a04'; text = diffDays + ' hari lagi'; }

  return '<span data-testid="deadline-badge" class="badge" style="background:' + color + '22; color:' + color + '; margin-left:8px;">⏳ ' + text + '</span>';
}

export function renderDonorEmptyState(options) {
  return emptyState(options).replace('<div ', '<div data-testid="campaign-card-emptystate" ');
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
  
  let html = '<div class="card donor-campaign-card donor-primary-card theme-surface-blue" data-testid="campaign-card" data-id="' + escapeHtml(cIdsStr) + '" style="border-left: 4px solid var(--blue); margin-bottom:16px; text-align:left;">';
  html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">';
  html += '<strong style="color:var(--blue); font-size:15px;">Pembayaran Gabungan (' + groupList.length + ' Campaign)</strong>';
  html += '<span class="badge theme-status-unpaid">⏳ Menunggu Pembayaran</span>';
  html += '</div>';
  
  html += '<p style="margin:4px 0; font-size:13px; line-height:1.4;">Menggabungkan patungan untuk:<br>';
  groupList.forEach(c => {
    html += ' &middot; <strong>' + escapeHtml(c.targetName) + '</strong> (' + formatIDR(c.amountDue) + ')<br>';
  });
  html += '</p>';
  
  html += '<div class="theme-blue-total" data-testid="donor-total" style="padding:12px; border-radius:8px; margin: 12px 0;">';
  html += '<div style="font-size:12px; color:var(--text);">Total nominal gabungan yang harus ditransfer:</div>';
  html += '<div style="font-size:20px; font-weight:bold; color:var(--blue); display:flex; align-items:center; justify-content:center; gap:8px;">' + formatIDR(totalDue);
  html += ' <span data-testid="btn-copy-total" class="link-btn" onclick="copyAmount(' + totalDue + ', \'' + formatIDR(totalDue) + '\')" style="margin-left: 8px; cursor: pointer; font-size:12px;">Salin</span>';
  html += '</div>';
  html += '</div>';
  
  const trimmedAcc = String(bankAccount || '').trim();
  const trimmedName = String(bankName || '').trim();
  const trimmedHolder = String(accountHolder || '').trim();
  if (trimmedAcc || trimmedName || trimmedHolder) {
    html += '<p class="muted" style="margin:8px 0; font-size:12px;">Ke: ' + (trimmedName ? escapeHtml(trimmedName) + ' ' : '') + escapeHtml(trimmedAcc);
    if (trimmedAcc) {
      html += ' <button data-testid="btn-copy-account" type="button" class="link-btn" style="font-size:11px;" onclick="navigator.clipboard.writeText(\'' + escapeHtml(trimmedAcc) + '\'); showToast(\'Nomor rekening disalin!\');">Salin</button>';
    }
    if (trimmedHolder) {
      html += ' a.n. ' + escapeHtml(trimmedHolder);
    }
    html += '</p>';
  } else {
    html += '<p class="muted" style="margin:8px 0; font-size:12px; font-style:italic;">Rekening tujuan belum ditentukan oleh PIC.</p>';
  }
  
  html += '<div style="margin-top:12px; border-top:1px dashed var(--border); padding-top:12px;">';
  html += '<label style="font-size:12px; font-weight:bold; display:block; margin-bottom:4px;">Upload satu bukti transfer untuk semua campaign di atas</label>';
  html += '<p class="muted" style="font-size:11px; margin:2px 0 6px 0;">Unggah bukti transfer (format JPG, PNG, atau PDF maks 2MB). Bukti hanya digunakan oleh PIC untuk verifikasi.</p>';
  html += '<input data-testid="proof-upload" type="file" id="combined-proof-' + safeDomId + '" accept="image/*,application/pdf" style="font-size:12px; padding:4px; width:100%; box-sizing:border-box;">';
  html += '<button data-testid="btn-verify" id="btn-submit-combined-' + safeDomId + '" class="btn blue" style="margin-top:8px; width:100%; font-size:12px; padding:8px;" onclick="submitCombinedProof(\'' + escapeHtml(bankAccount) + '\', \'' + cIdsStr + '\')">Konfirmasi Transfer</button>';
  html += '<div data-testid="proof-error" id="combined-error-' + safeDomId + '" class="error" style="font-size:11px; margin-top:4px;"></div>';
  html += '</div>';
  
  html += '</div>';
  return html;
}

export function renderCampaignGiftActions(c) {
  const giftLink = c.GiftLink || c.giftLink || '';
  const giftImage = c.GiftImage || c.giftImage || '';
  // [product 2026-11-11] Archived campaigns keep their gift proof visible — the donor paid
  // for it and the PIC uploaded it — but ONLY for donors who actually took part. The
  // "Riwayat" group also lists Closed/Finalized campaigns the donor never joined, so
  // participation has to be checked explicitly rather than assumed from the group.
  const statusEligible = c.status === 'Finalized' || c.status === 'Archived';
  if (!statusEligible || c.joined === false || (!giftLink && !giftImage)) return '';

  const giftActionStyle = 'display:inline-flex; align-items:center; justify-content:center; gap:6px; font-family:inherit; font-size:12px; font-weight:600; line-height:1.2; min-height:36px; padding:6px 12px; border:1px solid var(--border-hover); border-radius:6px; background:rgba(255,255,255,0.04); color:var(--amber,#f5d347); text-decoration:none; box-sizing:border-box; cursor:pointer; flex:1 1 auto; text-align:center;';
  let html = '<div class="donor-gift-actions" data-testid="gift-actions" style="margin-bottom: 12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">';
  if (giftLink) {
    html += '<a data-testid="link-gift" href="' + escapeHtml(sanitizeUrl(giftLink)) + '" target="_blank" rel="noopener noreferrer" class="donor-gift-btn" style="' + giftActionStyle + '">🔗 Lihat Barang/Hadiah</a>';
  }
  if (giftImage) {
    if (giftImage.startsWith('http://') || giftImage.startsWith('https://')) {
      html += '<a data-testid="link-gift-image" href="' + escapeHtml(sanitizeUrl(giftImage)) + '" target="_blank" rel="noopener noreferrer" class="donor-gift-btn" style="' + giftActionStyle + '">📷 Lihat Screenshot Harga</a>';
    } else {
      // [fix 2026-11-11] This branch handles a STORAGE PATH (e.g. gifts/<campaign>/<ts>.jpg),
      // not a URL. It used to be passed through sanitizeUrl(), which only whitelists
      // https:/mailto:/tel: — so on any http origin (localhost, previews) the path became '#'
      // and openMediaFile('#') failed to sign, surfacing "Kendala Sistem / Gagal memuat link
      // dokumen/foto" even though the screenshot was uploaded. Pass the raw path through;
      // escapeHtml is enough here because it is inlined into an HTML attribute.
      html += '<button data-testid="btn-gift-image" type="button" class="donor-gift-btn" style="' + giftActionStyle + '" onclick="openMediaFile(\'' + escapeHtml(giftImage) + '\')">📷 Lihat Screenshot Harga</button>';
    }
  }
  return html + '</div>';
}

export function renderCampaignJoinOptions(c) {
  if (c.joined) {
    const customAmt = Number(c.customAmount !== undefined ? c.customAmount : (c.CustomAmount !== undefined ? c.CustomAmount : (c.custom_amount !== undefined ? c.custom_amount : 0))) || 0;
    let html = '<div class="success" data-testid="join-status">✓ Kamu sudah daftar di list ini. Menunggu finalisasi oleh PIC.</div>';
    if (customAmt > 0) {
      html += '<div class="theme-custom-amount-text" data-testid="custom-amount-status" style="margin-top:6px; font-size:13px; font-weight:500;">🏷️ Komitmen nominal khusus: <strong>' + formatIDR(customAmt) + '</strong></div>';
    } else {
      html += '<div data-testid="join-type-status" style="margin-top:6px; font-size:13px; color:var(--muted);">Partisipasi: Patungan rata-rata</div>';
    }
    return html + '<button data-testid="btn-withdraw" id="btn-withdraw-' + c.campaignId + '" class="btn secondary" style="margin-top:8px;" onclick="withdraw(\'' + c.campaignId + '\')">Batal ikut</button>';
  }

  let html = '<div class="card theme-surface-muted" data-testid="donation-options" style="margin-top:8px;">';
  html += '<label style="margin-top:0; display:flex; align-items:center; gap:8px; cursor:pointer;"><input data-testid="input-custom-toggle" type="checkbox" id="check-custom-' + c.campaignId + '" onchange="toggleCustomAmount(\'' + c.campaignId + '\')" style="width:auto; min-height:unset;"> Saya ingin donasi dengan nominal khusus</label>';
  html += '<div data-testid="custom-amount-fields" id="wrap-custom-' + c.campaignId + '" class="hidden" style="margin-top:8px;">';
  html += '<div class="theme-info-note" style="padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">';
  html += '<span>ℹ️</span>';
  html += '<span><strong>Ketentuan:</strong> Nominal khusus minimal <strong>Rp 50.000</strong>. Jika ingin patungan nominal standar, silakan tetap gunakan opsi patungan rata.</span>';
  html += '</div>';
  html += '<label>Nominal Khusus (IDR)</label>';
  html += '<input data-testid="input-custom-amount" id="input-custom-' + c.campaignId + '" type="text" inputmode="numeric" placeholder="Contoh: 50.000 (Minimal 50.000)" onkeyup="formatInputRibuan(event)">';
  html += '</div>';

  html += '<label style="margin-top:12px; display:flex; align-items:center; gap:8px; cursor:pointer;"><input data-testid="input-alias-toggle" type="checkbox" id="check-alias-' + c.campaignId + '" onchange="document.getElementById(\'wrap-alias-\' + \'' + c.campaignId + '\').classList.toggle(\'hidden\')" style="width:auto; min-height:unset;"> Sembunyikan Nama Asli (Gunakan Alias)</label>';
  html += '<div data-testid="alias-fields" id="wrap-alias-' + c.campaignId + '" class="hidden" style="margin-top:8px;">';
  html += '<label>Nama Alias / Samaran</label>';
  html += '<input data-testid="input-alias" id="input-alias-' + c.campaignId + '" type="text" placeholder="Contoh: Hamba Allah">';
  html += '</div>';

  return html + '<button data-testid="btn-donasi" id="btn-join-' + c.campaignId + '" class="btn" style="margin-top:12px;" onclick="joinCampaign(\'' + c.campaignId + '\')">Gabung Donasi untuk ' + escapeHtml(c.targetName) + '</button></div>';
}

export function renderCampaignPaymentSection(c) {
  const cardBankName = String(c.bankName || c.BankName || '').trim();
  const cardBankAccount = String(c.bankAccount || c.BankAccount || '').trim();
  const cardHolder = String(c.accountHolder || c.AccountHolder || '').trim();
  let html = '';

  if (c.paid) {
    const proofRef = c.proofLink || c.ProofLink || c.proofStoragePath || c.ProofStoragePath;
    const proofBtnHtml = proofRef
      ? (proofRef.startsWith('http://') || proofRef.startsWith('https://')
        ? '<a data-testid="link-proof" class="link-btn" href="' + escapeHtml(sanitizeUrl(proofRef)) + '" target="_blank" rel="noopener noreferrer" style="font-size:12px; text-decoration:none; padding:4px 10px; border:1px solid rgba(52,211,153,0.3); border-radius:4px; background:rgba(52,211,153,0.08); color:var(--success);">Lihat Bukti</a>'
        : '<button data-testid="btn-proof" type="button" class="link-btn" style="cursor:pointer; background:rgba(52,211,153,0.08); border:1px solid rgba(52,211,153,0.3); border-radius:4px; padding:4px 10px; font-size:12px; color:var(--success);" onclick="openMediaFile(\'' + escapeHtml(proofRef) + '\')">Lihat Bukti</button>')
      : '';

    html += '<div class="card theme-surface-blue theme-blue-total" data-testid="payment-status" style="padding:14px 16px; border-radius:10px; margin-top:8px; border:1px solid var(--border); background:var(--surface);">';
    html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">';
    html += '<div style="display:flex; align-items:center; gap:6px; color:var(--success); font-weight:700; font-size:13px;">';
    html += '<span>' + (c.verified ? '✓ Pembayaran Terverifikasi PIC' : '✓ Sudah konfirmasi transfer (Menunggu Verifikasi PIC)') + '</span>';
    html += '</div>';
    html += '<div data-testid="donor-total" style="font-family:\'Plus Jakarta Sans\', system-ui, sans-serif; font-size:17px; font-weight:800; color:var(--text);">' + formatIDR(c.amountPaid || c.amountDue) + '</div>';
    html += '</div>';
    // [audit-fix] Gate on member status too, not just payment verification. A verified EX
    // (alumni) donor saw this CTA, and the RPC refuses them outright:
    // "Alumni tidak dapat membuat campaign baru." Offering a control the server will reject is
    // the same class of bug as the landing link that demanded a session it could not have.
    const _canBecomePic = (() => {
      const u = JSON.parse(safeGet('donor_user') || 'null');
      return !!(u && u.whatsapp && String(u.status || '').toLowerCase() === 'active');
    })();
    html += (c.verified && _canBecomePic) ? '<p class="muted">Butuh patungan untuk orang lain? Kamu bisa <button type="button" class="link-btn" data-testid="cta-become-pic-after-pay" onclick="seamlessBecomePic()">buat campaign sendiri</button>.</p>' : '';

    if (cardBankAccount || cardBankName || cardHolder) {
      html += '<div style="display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px solid var(--border); font-size:12px; color:var(--muted); flex-wrap:wrap; gap:6px;">';
      html += '<div style="line-height:1.35;">';
      html += '<span>Transfer ke: <strong>' + (cardBankName ? escapeHtml(cardBankName) + ' ' : '') + escapeHtml(cardBankAccount) + '</strong></span>';
      if (cardHolder) html += '<span style="display:block; font-size:11px; opacity:0.85;">a.n. ' + escapeHtml(cardHolder) + '</span>';
      html += '</div>';
      if (proofBtnHtml) html += '<div>' + proofBtnHtml + '</div>';
      html += '</div>';
    } else if (proofBtnHtml) {
      html += '<div style="padding-top:8px; border-top:1px solid var(--border); text-align:right;">' + proofBtnHtml + '</div>';
    }
    return html + '</div>';
  }

  html += '<div class="card theme-surface-blue theme-blue-total" data-testid="payment-form" style="padding:16px; border-radius:10px; margin-top:8px; border:1px solid var(--border);">';
  html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">';
  html += '<span style="font-size:12px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Jumlah Tagihan</span>';
  html += '<div style="display:flex; align-items:center; gap:8px;">';
  html += '<span data-testid="donor-total" style="font-family:\'Plus Jakarta Sans\', system-ui, sans-serif; font-size:22px; font-weight:800; color:var(--blue);">' + formatIDR(c.amountDue) + '</span>';
  html += '<button data-testid="btn-copy-total" type="button" class="btn secondary" style="padding:3px 10px; font-size:11px; min-height:unset; border-radius:4px;" onclick="copyAmount(' + c.amountDue + ', \'' + formatIDR(c.amountDue) + '\')">Salin</button>';
  html += '</div>';
  html += '</div>';

  if (cardBankAccount || cardBankName || cardHolder) {
    html += '<div style="background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">';
    html += '<div style="line-height:1.4;">';
    html += '<div style="font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em;">Rekening Tujuan PIC:</div>';
    html += '<div style="font-weight:700; font-size:14px; color:var(--text);">' + (cardBankName ? escapeHtml(cardBankName) + ' ' : '') + escapeHtml(cardBankAccount) + '</div>';
    if (cardHolder) html += '<div style="font-size:12px; color:var(--muted);">a.n. ' + escapeHtml(cardHolder) + '</div>';
    html += '</div>';
    if (cardBankAccount) {
      html += '<button data-testid="btn-copy-account" type="button" class="btn secondary" style="padding:4px 10px; font-size:11px; min-height:unset; border-radius:4px;" onclick="navigator.clipboard.writeText(\'' + escapeHtml(cardBankAccount) + '\'); showToast(\'Nomor rekening disalin!\');">Salin Rek</button>';
    }
    html += '</div>';
  }

  html += '<label style="font-size:13px; font-weight:600;">Upload Bukti Transfer</label>';
  html += '<p class="muted" style="font-size:11px; margin:2px 0 8px 0;">Format JPG, PNG, atau PDF (maks 2MB) untuk diverifikasi oleh PIC.</p>';
  html += '<input data-testid="proof-upload" type="file" id="proof-' + c.campaignId + '" accept="image/*,application/pdf" style="width:100%; box-sizing:border-box;">';
  html += '<button data-testid="btn-pay" id="btn-submit-proof-' + c.campaignId + '" class="btn" style="margin-top:8px; width:100%;" onclick="submitProof(\'' + c.campaignId + '\')">Sudah Transfer, Kirim Bukti</button>';
  return html + '<div data-testid="proof-error" id="proof-error-' + c.campaignId + '" class="error"></div></div>';
}

export function renderCampaignCard(c, user, isPending) {
  let checkboxHtml = '';
  if (c.status === 'Open' && !c.joined) {
    checkboxHtml = '<input data-testid="input-bulk-join" type="checkbox" class="bulk-join-checkbox" value="' + c.campaignId + '" data-name="' + escapeHtml(c.targetName) + '" onchange="updateBulkJoinBtnVisibility()" style="width:16px; height:16px; margin-right:8px; cursor:pointer; vertical-align:middle;"> ';
  }

  const cardClass = isPending ? 'card donor-campaign-card donor-primary-card' : 'card donor-campaign-card';
  let html = '<div class="' + cardClass + '" data-testid="campaign-card" data-id="' + escapeHtml(c.campaignId) + '" id="card-' + c.campaignId + '">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
  html += '<div style="display:flex;align-items:center;">' + checkboxHtml + '<strong>' + escapeHtml(c.targetName) + '</strong></div>';
  html += '<div>' + statusBadge(c.status) + getDeadlineBadge(c.deadline) + '</div>';
  html += '</div>';
  if (c.reason) html += '<p class="muted">' + escapeHtml(c.reason) + '</p>';

  const giftText = c.giftAmount > 0 ? formatIDR(c.giftAmount) : 'Ditentukan nanti';
  const rawCount = c.donorCount !== undefined ? c.donorCount : (c.donor_count !== undefined ? c.donor_count : (c.DonorCount !== undefined ? c.DonorCount : 0));
  const parsedCount = Number(rawCount);
  const donorCount = (!isNaN(parsedCount) && rawCount !== null && rawCount !== '') ? parsedCount : 0;
  html += '<p class="muted">Total hadiah: ' + giftText + ' &middot; ' + donorCount + ' donatur' + (c.deadline ? ' &middot; deadline ' + c.deadline : '') + '</p>';
  html += renderCampaignGiftActions(c);

  if (c.status === 'Open') {
    html += renderCampaignJoinOptions(c);
  } else if (c.status === 'Closed') {
    html += '<p class="muted">List sudah ditutup, menunggu PIC menentukan jumlah & rekening.</p>';
  } else if (c.status === 'Finalized') {
    html += c.joined ? renderCampaignPaymentSection(c) : '<p class="muted">Kamu tidak terdaftar sebagai donatur di campaign ini.</p>';
  } else {
    html += '<p class="muted">Campaign sudah selesai/diarsipkan.</p>';
  }
  return html + '</div>';
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
      showInfoModal('Silakan masukkan nominal khusus yang ingin didonasikan.', 'Peringatan');
      return;
    }
    if (parsed < 50000) {
      showInfoModal('Nominal khusus minimal adalah Rp 50.000. Silakan masukkan minimal Rp 50.000 atau hapus centang nominal khusus untuk ikut patungan rata.', 'Peringatan');
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

  if (file.size && file.size > 10 * 1024 * 1024) {
    if (errEl) errEl.textContent = 'Ukuran file maksimal 10MB.';
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

  if (file.size && file.size > 10 * 1024 * 1024) {
    if (errEl) errEl.textContent = 'Ukuran file maksimal 10MB.';
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
