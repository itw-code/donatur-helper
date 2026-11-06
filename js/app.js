// Main Application Entry Point (ES Module)

import { SCRIPT_URL, DEBUG } from './config.js';
import { safeGet, safeSet, safeRemove, getValidatedDonorSession, getValidatedTokenSession, clearAllSessions } from './storage.js';
import {
  escapeHtml,
  sanitizeUrl,
  formatUserErrorMessage,
  showToast,
  showInfoModal,
  closeConfirmModal,
  showConfirmModal,
  showView,
  formatIDR,
  formatRupiah,
  formatTime,
  formatDate,
  formatCompactDate,
  formatInputRibuan,
  parseRibuan,
  statusBadge,
  paymentStatusIcon,
  emptyState,
  actionArrowIcon,
  renderOptimizedImage,
  showUpdateBanner
} from './utils.js';
import {
  startViewTiming,
  markFetchStart,
  markFetchEnd,
  markRenderStart,
  markRenderEnd,
  endViewTiming,
  getRoleMetrics,
  getAllRoleMetrics,
  resetMetrics,
  checkPerformanceBudget,
  ROLE_PERFORMANCE_BUDGETS
} from './perf.js';
import {
  isLocalhostDebugEnabled,
  renderDebugPanelHtml,
  toggleDebugPanel,
  refreshDebugPanelUI,
  mountDebugPanel
} from './debug-panel.js';
import { fetchBackend, run, callQueued, call, DEFAULT_TIMEOUT_MS, inFlightRequests } from './api.js';
import { appState, initTargetCampaignId, currentToken, currentRole, currentUser } from './state.js';
import {
  resetUserLoginForm,
  cancelUserLogin,
  userLogin,
  logoutUser,
  logoutToken,
  loginToken,
  deepDive,
  returnFromDeepDive,
  tokenLogin,
  cancelPicCreate,
  seamlessLoginAsPic,
  returnToMemberDashboard,
  updateTabTitle,
  playAlertChime,
  startAdminPolling
} from './views/auth.js';
import {
  openProfileModal,
  closeProfileModal,
  saveProfile,
  loadUserDashboard,
  seamlessBecomePic,
  becomePicFromLanding,
  loadMyPicCampaigns,
  openPicCampaignFromDonor,
  sortCampaignsForDonorDashboard,
  refreshCampaignList,
  clearTargetCampaign,
  toggleSelectAllBulkJoin,
  updateBulkJoinBtnVisibility,
  openBulkJoinModal,
  toggleBulkJoinFields,
  submitBulkJoin,
  getDeadlineBadge,
  copyAmount,
  renderCombinedCampaignCard,
  renderCampaignCard,
  joinCampaign,
  toggleCustomAmount,
  withdraw,
  submitProof,
  submitCombinedProof,
  deleteDraftCampaign,
  openMediaFile,
  getDonorProofSignedUrl
} from './views/donor.js';
import {
  loadPicDashboard,
  createCampaign,
  getPicProgress,
  isVisiblePicActionTarget,
  scrollToPicActions,
  scrollToPicDonorAction,
  renderPicActionItem,
  renderPicActionQueue,
  renderPicNextAction,
  renderPicDashboard,
  renderPicActions,
  showLateDonorForm,
  hideLateDonorForm,
  toggleLateCustomAmount,
  showGiftProofForm,
  submitGiftProof,
  submitLateDonor,
  copyShareLink,
  copyPicGroupReminder,
  closeList,
  reopenList,
  archiveThis,
  deleteThis,
  renderAndShow,
  showFinalizeForm,
  doFinalize,
  getPicDonorQueueState,
  getPicDonorQueueLabel,
  renderDonorTable,
  copyUnpaidDonorsRecap,
  copyBulkMessage,
  verifyPaymentUI,
  picVerifyAllUI,
  markRefundedUI,
  openManualVerifyModal,
  closeManualVerifyModal,
  submitManualVerifyDonor,
  copyLaporanSelesai
} from './views/pic.js';
import {
  renderSummaryCard,
  refreshSummary,
  resetAdminActionQueue,
  updateAdminActionQueue,
  loadAdminDashboard,
  getAdminParentCard,
  refreshPendingMembers,
  scrollToPending,
  approvePending,
  toggleSelectAllPending,
  bulkApprovePending,
  refreshLateRequests,
  handleApproveLateDonor,
  executeApproveLateDonor,
  refreshAdmins,
  adminFilterText,
  filterAdminItems,
  filterAdminCampaigns,
  filterAdminAccounts,
  renderAdminAccounts,
  revokeAdmin,
  deleteAdmin,
  reactivateAdmin,
  genPicToken,
  refreshAdminCampaigns,
  renderAdminCampaignDeadline,
  renderAdminCampaignActions,
  renderAdminCampaignViews,
  adminView,
  adminRecalculateUI,
  adminTransferOwnershipUI,
  filterTransferPicOptions,
  closeEditGiftModal,
  adminEditGiftAmountUI,
  adminDeleteDonorUI,
  adminTogglePaidUI,
  closeEditAmountModal,
  editAmountPaid,
  adminArchive,
  adminDelete,
  changeMemberPage,
  loadMoreMembers,
  filterMembers,
  refreshMembers,
  renderMemberStatusControl,
  renderMemberActions,
  renderMembersView,
  renderMembersHtml,
  updateMemberStatusUI,
  assignMemberRoleUI,
  addMemberUI,
  removeMemberUI,
  refreshSACampaigns
} from './views/admin.js';
import {
  loadSuperAdminDashboard,
  loadSuperAdminSettings,
  loadSuperAdminStage1,
  renderSuperAdminSettings,
  runDataSweep,
  saveSettings,
  genAdminToken
} from './views/superadmin.js';

// Expose all functions on window for inline HTML onclick/onchange/onkeyup and global tests
const globalBindings = {
  SCRIPT_URL,
  DEBUG,
  safeGet,
  safeSet,
  safeRemove,
  getValidatedDonorSession,
  getValidatedTokenSession,
  clearAllSessions,
  escapeHtml,
  sanitizeUrl,
  formatUserErrorMessage,
  showToast,
  showInfoModal,
  showUpdateBanner,
  closeConfirmModal,
  showConfirmModal,
  showView,
  formatIDR,
  formatRupiah,
  formatTime,
  formatDate,
  formatCompactDate,
  formatInputRibuan,
  parseRibuan,
  statusBadge,
  paymentStatusIcon,
  emptyState,
  actionArrowIcon,
  renderOptimizedImage,
  fetchBackend,
  run,
  callQueued,
  call,
  DEFAULT_TIMEOUT_MS,
  inFlightRequests,
  appState,
  initTargetCampaignId,
  currentToken,
  currentRole,
  currentUser,
  resetUserLoginForm,
  cancelUserLogin,
  userLogin,
  logoutUser,
  logoutToken,
  loginToken,
  deepDive,
  returnFromDeepDive,
  tokenLogin,
  cancelPicCreate,
  seamlessLoginAsPic,
  returnToMemberDashboard,
  updateTabTitle,
  playAlertChime,
  startAdminPolling,
  openProfileModal,
  closeProfileModal,
  saveProfile,
  loadUserDashboard,
  seamlessBecomePic,
  becomePicFromLanding,
  loadMyPicCampaigns,
  openPicCampaignFromDonor,
  sortCampaignsForDonorDashboard,
  refreshCampaignList,
  clearTargetCampaign,
  toggleSelectAllBulkJoin,
  updateBulkJoinBtnVisibility,
  openBulkJoinModal,
  toggleBulkJoinFields,
  submitBulkJoin,
  getDeadlineBadge,
  copyAmount,
  renderCombinedCampaignCard,
  renderCampaignCard,
  joinCampaign,
  toggleCustomAmount,
  withdraw,
  submitProof,
  submitCombinedProof,
  deleteDraftCampaign,
  openMediaFile,
  getDonorProofSignedUrl,
  loadPicDashboard,
  createCampaign,
  getPicProgress,
  isVisiblePicActionTarget,
  scrollToPicActions,
  scrollToPicDonorAction,
  renderPicActionItem,
  renderPicActionQueue,
  renderPicNextAction,
  renderPicDashboard,
  renderPicActions,
  showLateDonorForm,
  hideLateDonorForm,
  toggleLateCustomAmount,
  showGiftProofForm,
  submitGiftProof,
  submitLateDonor,
  copyShareLink,
  copyPicGroupReminder,
  closeList,
  reopenList,
  archiveThis,
  deleteThis,
  renderAndShow,
  showFinalizeForm,
  doFinalize,
  getPicDonorQueueState,
  getPicDonorQueueLabel,
  renderDonorTable,
  copyUnpaidDonorsRecap,
  copyBulkMessage,
  verifyPaymentUI,
  picVerifyAllUI,
  markRefundedUI,
  openManualVerifyModal,
  closeManualVerifyModal,
  submitManualVerifyDonor,
  copyLaporanSelesai,
  renderSummaryCard,
  refreshSummary,
  resetAdminActionQueue,
  updateAdminActionQueue,
  loadAdminDashboard,
  getAdminParentCard,
  refreshPendingMembers,
  scrollToPending,
  approvePending,
  toggleSelectAllPending,
  bulkApprovePending,
  refreshLateRequests,
  handleApproveLateDonor,
  executeApproveLateDonor,
  refreshAdmins,
  adminFilterText,
  filterAdminItems,
  filterAdminCampaigns,
  filterAdminAccounts,
  renderAdminAccounts,
  revokeAdmin,
  deleteAdmin,
  reactivateAdmin,
  genPicToken,
  refreshAdminCampaigns,
  renderAdminCampaignDeadline,
  renderAdminCampaignActions,
  renderAdminCampaignViews,
  adminView,
  adminRecalculateUI,
  adminTransferOwnershipUI,
  filterTransferPicOptions,
  closeEditGiftModal,
  adminEditGiftAmountUI,
  adminDeleteDonorUI,
  adminTogglePaidUI,
  closeEditAmountModal,
  editAmountPaid,
  adminArchive,
  adminDelete,
  changeMemberPage,
  loadMoreMembers,
  filterMembers,
  refreshMembers,
  renderMemberStatusControl,
  renderMemberActions,
  renderMembersView,
  renderMembersHtml,
  updateMemberStatusUI,
  assignMemberRoleUI,
  addMemberUI,
  removeMemberUI,
  refreshSACampaigns,
  loadSuperAdminDashboard,
  loadSuperAdminSettings,
  loadSuperAdminStage1,
  renderSuperAdminSettings,
  runDataSweep,
  saveSettings,
  genAdminToken,
  startViewTiming,
  markFetchStart,
  markFetchEnd,
  markRenderStart,
  markRenderEnd,
  endViewTiming,
  getRoleMetrics,
  getAllRoleMetrics,
  resetMetrics,
  checkPerformanceBudget,
  ROLE_PERFORMANCE_BUDGETS,
  isLocalhostDebugEnabled,
  renderDebugPanelHtml,
  toggleDebugPanel,
  refreshDebugPanelUI,
  mountDebugPanel,
  checkForAppUpdates,
  initAppVersionCheck
};

if (typeof window !== 'undefined') {
  Object.assign(window, globalBindings);
}

/**
 * Checks if a newer deployment exists by polling /version.json
 */
export async function checkForAppUpdates() {
  if (typeof window === 'undefined' || !window.fetch) return;
  try {
    const res = await fetch(`/version.json?_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.buildTime) {
      if (!appState.currentBuildTime) {
        appState.currentBuildTime = data.buildTime;
      } else if (appState.currentBuildTime !== data.buildTime) {
        showUpdateBanner(data);
      }
    }
  } catch (err) {
    // Offline / silent pass
  }
}

/**
 * Initializes visibility and focus listeners to detect updates when users return to tab
 */
export function initAppVersionCheck() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  checkForAppUpdates();

  if (!appState.visibilityListenerRegistered && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkForAppUpdates();
      }
    });
    if (window.addEventListener) {
      window.addEventListener('focus', () => {
        checkForAppUpdates();
      });
    }
    appState.visibilityListenerRegistered = true;
  }
}

export function initApp() {
  initTargetCampaignId();
  initAppVersionCheck();

  if (typeof window !== 'undefined' && window.location && window.location.search) {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken && urlToken.trim()) {
      loginToken(urlToken.trim());
      mountDebugPanel();
      /* [B3-fix2 · audit #12] This early return is the PRIMARY PIC/Admin entry path, and it
         skipped constrainDateInputs() entirely — verified: on ?token=... the date inputs had
         empty min/max, so a user could pick any past or far-future deadline. The form is static
         HTML, so applying the bounds here is enough. */
      constrainDateInputs();
      return;
    }
  }

  const tokenSession = getValidatedTokenSession();
  const validUser = getValidatedDonorSession();

  if (tokenSession) {
    if (tokenSession.role === 'PIC') loadPicDashboard();
    else if (tokenSession.role === 'Admin') loadAdminDashboard();
    else if (tokenSession.role === 'SuperAdmin') loadSuperAdminDashboard();
  } else if (validUser) {
    loadUserDashboard();
  } else {
    showView('landing');
  }

  // Mount localhost performance HUD if in dev environment
  mountDebugPanel();

  // [B3 · P1-5] Native date inputs, per ADR-0018. Flatpickr used to rewrite every
  // <input type="date"> to type="text" (disableMobile:"true") and force a desktop calendar
  // onto phones. The bounds it provided are now real `min`/`max` attributes, which the
  // native control honours natively — and native inputs already emit Y-m-d for the backend.
  constrainDateInputs();
}

/* [B3 · P1-5] Apply today .. today+2 months as native min/max. Kept as a function so it can
   be re-applied after dynamically rendered forms (PIC create is inline, but this is the
   pattern to reuse if a form is ever rendered from JS).
   [B3-fix] The old `max.setMonth(getMonth() + 2)` overflows at year end: Dec 31 + 2 months
   produced 2027-03-03 instead of 2027-02-28, handing users a date beyond the intended window.
   This bug was inherited from the removed flatpickr config, not introduced here. Clamp the
   day instead so it always lands on a real date inside the window. */
export function constrainDateInputs(root) {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  const scope = root || document;
  if (typeof scope.querySelectorAll !== 'function') return;
  const inputs = scope.querySelectorAll('input[type="date"]');
  if (!inputs || typeof inputs.forEach !== 'function') return;
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = new Date();
  const max = addMonthsClamped(today, 2);
  inputs.forEach(input => {
    if (!input || input.type !== 'date') return;
    if (!input.min) input.min = iso(today);
    if (!input.max) input.max = iso(max);
  });
}

/* Add whole months, clamping the day to the target month's length (Dec 31 + 2 => Feb 28/29). */
function addMonthsClamped(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}

export default globalBindings;
