// Global In-Memory Application State & Session Accessors

import { safeGet } from './storage.js';

export const appState = {
  targetCampaignId: null,
  picCampaignData: null,
  picCampaignDetail: null,
  adminActionQueueState: { pending: null, late: null },
  memberPageSize: { admin: 20, sa: 20 },
  allActiveMembers: { admin: [], sa: [] },
  originalTitle: (typeof document !== 'undefined' && document.title) ? document.title : 'Donatur Helper',
  activePendingCount: 0,
  lastNotifiedCount: 0,
  pollIntervalId: null,
  visibilityListenerRegistered: false
};

export function initTargetCampaignId() {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash;
  const urlParams = new URLSearchParams(window.location.search);

  if (hash && hash.startsWith('#c=')) {
    appState.targetCampaignId = hash.substring(3);
  } else if (urlParams.has('c')) {
    appState.targetCampaignId = urlParams.get('c');
  }
}

export function currentToken() {
  return safeGet('auth_token');
}

export function currentRole() {
  return safeGet('auth_role');
}

export function currentUser() {
  try {
    return JSON.parse(safeGet('donor_user') || 'null');
  } catch (e) {
    return null;
  }
}
