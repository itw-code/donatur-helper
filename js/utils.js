// Core UI and Formatting Utilities

export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sanitizeUrl(rawUrl, fallback = '#') {
  if (!rawUrl || typeof rawUrl !== 'string') return fallback;
  const trimmed = rawUrl.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
  if (/^(?:javascript|data|vbscript):/i.test(trimmed)) return fallback;
  try {
    const base = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : 'https://don4tpro.pages.dev';
    const parsed = new URL(trimmed, base);
    if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') {
      return trimmed;
    }
    return fallback;
  } catch (_) {
    if (/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(trimmed) || /^tel:\+?[0-9\-\s()]+$/i.test(trimmed)) {
      return trimmed;
    }
    return fallback;
  }
}

export function formatUserErrorMessage(err) {
  if (!err) return 'Terjadi kendala saat memproses permintaan. Silakan coba lagi.';
  const msg = typeof err === 'string' ? err : (err.message || String(err));
  const trimmed = msg.trim();
  if (err && err.isTimeout) {
    return 'Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.';
  }
  if (/timeout|abort|lebih lama dari biasanya|waktu habis/i.test(trimmed)) {
    return 'Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.';
  }
  if (/network|fetch|failed to fetch|err_internet_disconnected|offline|koneksi/i.test(trimmed)) {
    return 'Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.';
  }
  if (/unauthorized|invalid token|expired token|sesi/i.test(trimmed)) {
    return 'Sesi akses Anda telah berakhir. Silakan masuk kembali.';
  }
  if (/respons server bukan json|error 500|server 502|503 service|<!doctype/i.test(trimmed)) {
    return 'Respons server tidak dapat diproses. Silakan coba beberapa saat lagi.';
  }
  if (/cannot read properties|undefined|referenceerror|typeerror|syntaxerror|null is not an object|at doPost|at doGet|Code\.js|\.js:\d+|pgrst|violates.*constraint|relation.*does not exist|syntax error at or near|column.*does not exist|permission denied for/i.test(trimmed)) {
    return 'Terjadi kendala saat memproses data. Silakan muat ulang halaman atau coba lagi.';
  }
  return escapeHtml(trimmed);
}

export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'show';
  setTimeout(function () {
    toast.className = toast.className.replace('show', '');
  }, 3000);
}

export function showInfoModal(message, title = 'Informasi') {
  let modal = document.getElementById('custom-info-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'custom-info-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:none;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div class="card" style="max-width:400px;width:100%;margin:16px;position:relative;text-align:center;">
        <h3 style="margin-top:0; font-size:18px; color:var(--text);" id="custom-info-title">Informasi</h3>
        <p id="custom-info-message" style="color:var(--muted); line-height:1.5; font-size:14px; margin-bottom:24px;"></p>
        <div style="display:flex;justify-content:center;">
          <button type="button" class="btn blue" style="width:100%; font-size:14px; padding:10px;" onclick="document.getElementById('custom-info-modal').style.display='none'">Mengerti</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  const cleanTitle = (title === 'Error') ? 'Kendala Sistem' : title;
  const cleanMessage = (typeof message === 'object' && message !== null) ? formatUserErrorMessage(message) : (message || '');
  document.getElementById('custom-info-title').textContent = cleanTitle;
  document.getElementById('custom-info-message').textContent = cleanMessage;
  modal.style.display = 'flex';
}

export function closeConfirmModal() {
  const modal = document.getElementById('custom-confirm-modal');
  if (modal) modal.style.display = 'none';
}

export function showConfirmModal(message, onConfirm) {
  let modal = document.getElementById('custom-confirm-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'custom-confirm-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:none;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div class="card" style="max-width:400px;width:100%;margin:16px;position:relative;">
        <button type="button" id="custom-confirm-close" style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:24px;line-height:1;cursor:pointer;color:#888;" onclick="closeConfirmModal()">&times;</button>
        <h3 style="margin-top:0;">Konfirmasi</h3>
        <p id="custom-confirm-message"></p>
        <div class="modal-actions" style="display:flex;gap:8px;margin-top:16px;">
          <button type="button" class="btn secondary" id="custom-confirm-cancel" onclick="closeConfirmModal()">Batal</button>
          <button type="button" class="btn danger" id="custom-confirm-ok">Ya, Lanjutkan</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  document.getElementById('custom-confirm-message').textContent = message;
  modal.style.display = 'flex';

  const okBtn = document.getElementById('custom-confirm-ok');
  const cancelBtn = document.getElementById('custom-confirm-cancel');
  const closeBtn = document.getElementById('custom-confirm-close');

  okBtn.disabled = false;
  okBtn.textContent = 'Ya, Lanjutkan';
  cancelBtn.disabled = false;
  if (closeBtn) closeBtn.style.display = 'block';

  okBtn.onclick = function () {
    okBtn.disabled = true;
    okBtn.textContent = 'Memproses...';
    cancelBtn.disabled = true;
    if (closeBtn) closeBtn.style.display = 'none';

    Promise.resolve(onConfirm())
      .then(() => {
        modal.style.display = 'none';
      })
      .catch(() => {
        modal.style.display = 'none';
      });
  };
}

export function showView(name) {
  document.querySelectorAll('.wrap > div[id^="view-"]').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.remove('hidden');
}

export function formatIDR(n) {
  return 'Rp' + Number(n || 0).toLocaleString('id-ID');
}

export function formatRupiah(n) {
  return formatIDR(n);
}

export function formatTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(dStr) {
  if (!dStr) return '-';
  try {
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  } catch(e) { return dStr; }
}

export function formatCompactDate(dStr) {
  return formatDate(dStr);
}

export function formatInputRibuan(e) {
  const target = e.target || e;
  let val = target.value.replace(/[^0-9]/g, '');
  if (val) {
    target.value = val.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  } else {
    target.value = '';
  }
}

export function parseRibuan(str) {
  return Number(String(str).replace(/\./g, '')) || 0;
}

export function statusBadge(status) {
  const map = { Open: 'open', Closed: 'closed', Finalized: 'finalized', Archived: 'archived' };
  const labelMap = { Open: 'Terbuka', Closed: 'Menunggu finalisasi', Finalized: 'Final', Archived: 'Selesai' };
  const cls = map[status] || 'archived';
  return '<span class="badge ' + cls + '">' + (labelMap[status] || status) + '</span>';
}

export function paymentStatusIcon(kind) {
  const attrs = 'class="status-icon" width="16" height="16" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  if (kind === 'verified') {
    return '<svg ' + attrs + '><path d="m5 12 4 4L19 6"></path></svg>';
  }
  if (kind === 'review') {
    return '<svg ' + attrs + '><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>';
  }
  return '<svg ' + attrs + '><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5"></path><path d="M12 16h.01"></path></svg>';
}

export function actionArrowIcon() {
  return '<svg class="action-arrow-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>';
}

export function renderOptimizedImage(src, alt = '', options = {}) {
  const safeSrc = sanitizeUrl(src, '');
  if (!safeSrc) return '';
  const safeAlt = escapeHtml(alt);
  const loading = options.loading || 'lazy';
  const decoding = options.decoding || 'async';
  const className = options.className ? ' class="' + escapeHtml(options.className) + '"' : '';
  const widthAttr = options.width ? ' width="' + options.width + '"' : '';
  const heightAttr = options.height ? ' height="' + options.height + '"' : '';
  return '<img src="' + escapeHtml(safeSrc) + '" alt="' + safeAlt + '" loading="' + loading + '" decoding="' + decoding + '"' + className + widthAttr + heightAttr + '>';
}

/**
 * Renders a sticky non-intrusive update notification when a new Cloudflare Pages build is detected
 * @param {Object} [versionInfo]
 */
export function showUpdateBanner(versionInfo) {
  if (typeof document === 'undefined' || !document.body) return;
  const existing = document.getElementById('app-update-banner');
  if (existing && existing.classList && existing.classList.contains('app-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'app-update-banner';
  banner.className = 'app-update-banner';
  if (banner.classList && banner.classList.add) banner.classList.add('app-update-banner');
  banner.setAttribute('role', 'status');
  banner.innerHTML = `
    <p>
      <span aria-hidden="true">✨</span>
      <span>Pembaruan aplikasi tersedia</span>
    </p>
    <button class="app-update-btn" onclick="window.location.reload()">Muat Ulang</button>
  `;
  document.body.appendChild(banner);
}
