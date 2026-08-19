// Authentication Flow & Polling (Donor WhatsApp, Role Token Login, Deep Dive Session Management)

import { safeGet, safeSet, safeRemove } from '../storage.js';
import { escapeHtml, formatUserErrorMessage, showInfoModal, showToast, showView } from '../utils.js';
import { call, callQueued } from '../api.js';
import { appState, currentToken } from '../state.js';
import { loadUserDashboard } from './donor.js';
import { loadPicDashboard } from './pic.js';
import { loadAdminDashboard, refreshPendingMembers, refreshLateRequests, refreshSummary } from './admin.js';
import { loadSuperAdminDashboard } from './superadmin.js';

export function resetUserLoginForm() {
  const regFields = document.getElementById('u-register-fields');
  if (regFields) regFields.classList.add('hidden');
  const btn = document.getElementById('btn-u-login');
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Lanjut';
  }
  const errEl = document.getElementById('u-login-error');
  if (errEl) errEl.textContent = '';
  const nameEl = document.getElementById('u-name');
  if (nameEl) nameEl.value = '';
  const waEl = document.getElementById('u-wa');
  if (waEl) waEl.value = '';
  const statusSel = document.getElementById('u-status');
  if (statusSel) statusSel.value = '';
}

export function cancelUserLogin() {
  resetUserLoginForm();
  showView('landing');
}

export function userLogin() {
  const waInput = document.getElementById('u-wa');
  const wa = waInput ? waInput.value.trim() : '';
  const errEl = document.getElementById('u-login-error');
  const registerFields = document.getElementById('u-register-fields');
  const btn = document.getElementById('btn-u-login');

  if (btn && btn.disabled) return;

  if (!wa) {
    if (errEl) errEl.textContent = 'Harap isi Nomor WhatsApp.';
    return;
  }

  // STEP 1: Check WhatsApp (Login Mode)
  if (registerFields && registerFields.classList.contains('hidden')) {
    if (errEl) errEl.textContent = 'Memeriksa nomor...';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Memeriksa...';
    }
    call('checkDonorWhatsApp', wa).then(res => {
      if (errEl) errEl.textContent = '';
      if (res.exists) {
        if (res.pending) {
          showInfoModal(res.message, 'Menunggu Persetujuan');
          if (waInput) waInput.value = '';
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Lanjut';
          }
          return;
        }
        // Log them in immediately!
        safeSet('donor_user', JSON.stringify(res));
        resetUserLoginForm();
        loadUserDashboard();
      } else {
        // STEP 2: Show Registration Fields
        registerFields.classList.remove('hidden');
        if (btn) {
          btn.textContent = 'Selesaikan Pendaftaran';
          btn.disabled = false;
        }
      }
    }).catch(e => {
      if (errEl) errEl.textContent = formatUserErrorMessage(e);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Lanjut';
      }
    });
    return;
  }

  // STEP 3: Complete Registration
  const nameInput = document.getElementById('u-name');
  const name = nameInput ? nameInput.value.trim() : '';
  const statusSel = document.getElementById('u-status');
  const empStatus = statusSel ? statusSel.value : '';

  if (!name) {
    if (errEl) errEl.textContent = 'Harap isi Nama Lengkap.';
    return;
  }
  if (!empStatus) {
    if (errEl) errEl.textContent = 'Harap pilih Status Karyawan.';
    return;
  }

  if (errEl) errEl.textContent = 'Memproses pendaftaran...';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Mendaftarkan...';
  }
  callQueued('registerUser', name, wa, empStatus).then(user => {
    if (errEl) errEl.textContent = '';
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Lanjut';
    }
    if (user.pending) {
      showInfoModal(user.message, 'Pendaftaran Menunggu Persetujuan');
      resetUserLoginForm();
      return;
    }
    safeSet('donor_user', JSON.stringify(user));
    resetUserLoginForm();
    loadUserDashboard();
  }).catch(e => {
    if (errEl) errEl.textContent = formatUserErrorMessage(e);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Selesaikan Pendaftaran';
    }
  });
}

export function logoutUser() {
  const profileModal = document.getElementById('profile-modal');
  if (profileModal) profileModal.style.display = 'none';
  safeRemove('donor_user');
  showView('landing');
}

export function logoutToken() {
  if (appState.pollIntervalId) {
    clearInterval(appState.pollIntervalId);
    appState.pollIntervalId = null;
  }
  appState.lastNotifiedCount = 0;
  updateTabTitle(0);
  safeRemove('auth_token');
  safeRemove('auth_role');
  safeRemove('deep_dive_return_token');
  safeRemove('deep_dive_return_role');
  showView('landing');
}

export function loginToken(token) {
  const tokenInput = document.getElementById('t-token');
  if (tokenInput) tokenInput.value = token;
  tokenLogin();
}

export function deepDive(picToken) {
  safeSet('deep_dive_return_token', safeGet('auth_token'));
  safeSet('deep_dive_return_role', safeGet('auth_role'));
  const tokenInput = document.getElementById('t-token');
  if (tokenInput) tokenInput.value = picToken;
  tokenLogin(true);
}

export function returnFromDeepDive() {
  const rToken = safeGet('deep_dive_return_token');
  const rRole = safeGet('deep_dive_return_role');
  if (rToken) {
    safeSet('auth_token', rToken);
    safeSet('auth_role', rRole);
    safeRemove('deep_dive_return_token');
    safeRemove('deep_dive_return_role');
    const returnAdminBtn = document.getElementById('btn-return-admin');
    if (returnAdminBtn) returnAdminBtn.classList.add('hidden');
    if (rRole === 'Admin') loadAdminDashboard();
    else if (rRole === 'SuperAdmin') loadSuperAdminDashboard();
  }
}

export function tokenLogin(isDeepDive = false) {
  const tokenInput = document.getElementById('t-token');
  const token = tokenInput ? tokenInput.value.trim() : '';
  const errEl = document.getElementById('t-login-error');
  const btn = document.getElementById('btn-t-login');
  if (errEl) errEl.textContent = '';

  if (btn && btn.disabled) return;

  if (!token) {
    if (errEl) errEl.textContent = 'Harap isi token login.';
    return;
  }

  // Wipe any lingering deep dive states from previous un-logged-out sessions
  if (isDeepDive !== true) {
    safeRemove('deep_dive_return_token');
    safeRemove('deep_dive_return_role');
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Memeriksa token...';
  }

  call('loginWithToken', token).then(res => {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Lanjut';
    }
    safeSet('auth_token', token);
    safeSet('auth_role', res.role);
    if (res.alias) safeSet('auth_alias', res.alias);
    if (res.role === 'PIC') loadPicDashboard();
    else if (res.role === 'Admin') loadAdminDashboard();
    else if (res.role === 'SuperAdmin') loadSuperAdminDashboard();
  }).catch(e => {
    if (errEl) errEl.textContent = formatUserErrorMessage(e);
    showView('token-login');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Lanjut';
    }
  });
}

export function cancelPicCreate() {
  if (safeGet('deep_dive_return_token')) {
    returnFromDeepDive();
  } else if (safeGet('donor_user')) {
    returnToMemberDashboard();
  } else {
    logoutToken();
  }
}

export function seamlessLoginAsPic(token) {
  safeSet('auth_token', token);
  safeSet('auth_role', 'PIC');
  loadPicDashboard();
}

export function returnToMemberDashboard() {
  safeRemove('auth_token');
  safeRemove('auth_role');
  loadUserDashboard();
}

export function updateTabTitle(pendingCount) {
  appState.activePendingCount = pendingCount;
  if (pendingCount > 0) {
    document.title = '(' + pendingCount + ') Pendaftaran Baru | ' + appState.originalTitle;
  } else {
    document.title = appState.originalTitle;
  }
}

export function playAlertChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    
    // Ding
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.4);

    // Dong
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.setValueAtTime(440, ctx.currentTime); // A4
      gain2.gain.setValueAtTime(0.3, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 0.6);
    }, 150);
  } catch (_) {
    // Audio chime blocked or unsupported in current browser environment
  }
}

let lastPendingFetchTime = 0;

export function recordPendingFetchTime() {
  lastPendingFetchTime = Date.now();
}

export function startAdminPolling() {
  if (appState.pollIntervalId) return;
  
  function runCheck() {
    const token = currentToken();
    if (!token) return;
    const role = safeGet('auth_role');
    if (role !== 'Admin' && role !== 'SuperAdmin') return;

    // Guard: Skip check if getPendingMembers was fetched within last 5 seconds
    if (Date.now() - lastPendingFetchTime < 5000) {
      return;
    }

    call('getPendingMembers', token).then(list => {
      recordPendingFetchTime();
      const currentCount = list.length;
      updateTabTitle(currentCount);

      if (currentCount > appState.lastNotifiedCount) {
        playAlertChime();
        showToast('Ada ' + currentCount + ' pendaftaran member baru menunggu persetujuan!');
        
        // Trigger updates of target elements if visible
        const activePendingEl = document.getElementById('admin-pending-members') || document.getElementById('sa-pending-members');
        if (activePendingEl) {
          refreshPendingMembers(activePendingEl.id);
        }
        // Also refresh dashboard summary stats and campaigns/late requests
        if (role === 'Admin') {
          refreshSummary('admin-summary');
          refreshLateRequests('admin-late-donors');
        } else if (role === 'SuperAdmin') {
          refreshSummary('sa-summary');
          refreshLateRequests('sa-late-donors');
        }
      } else if (currentCount < appState.lastNotifiedCount) {
        const activePendingEl = document.getElementById('admin-pending-members') || document.getElementById('sa-pending-members');
        if (activePendingEl) {
          refreshPendingMembers(activePendingEl.id);
        }
      }
      appState.lastNotifiedCount = currentCount;
    }).catch(() => {});
  }

  runCheck();
  appState.pollIntervalId = setInterval(runCheck, 60000);
  if (appState.pollIntervalId && typeof appState.pollIntervalId.unref === 'function') {
    appState.pollIntervalId.unref();
  }

  // Watch tab visibility (only register listener once)
  if (!appState.visibilityListenerRegistered && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (appState.pollIntervalId) {
          clearInterval(appState.pollIntervalId);
          appState.pollIntervalId = null;
        }
      } else {
        startAdminPolling();
      }
    });
    appState.visibilityListenerRegistered = true;
  }
}
