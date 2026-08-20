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
  deleteDraftCampaign
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

  // Initialize Flatpickr for date inputs if available
  if (typeof flatpickr !== 'undefined') {
    const maxD = new Date();
    maxD.setMonth(maxD.getMonth() + 2);

    flatpickr("input[type='date']", {
      dateFormat: "Y-m-d",
      allowInput: true,
      disableMobile: "true",
      minDate: "today",
      maxDate: maxD
    });
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}

export default globalBindings;
