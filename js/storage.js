// Safe LocalStorage Wrappers

export function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

export function safeSet(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch (e) {
    console.warn("Storage blocked");
  }
}

export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}

/**
 * Validates donor session object in storage.
 * Automatically purges stale/corrupted sessions missing essential fields (e.g. whatsapp).
 * @returns {Object|null} Validated user object or null
 */
export function getValidatedDonorSession() {
  const raw = safeGet('donor_user');
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    if (!user || typeof user !== 'object' || !user.whatsapp || typeof user.whatsapp !== 'string') {
      console.warn('[Session] Corrupted/outdated donor session detected. Purging stale session.');
      safeRemove('donor_user');
      return null;
    }
    return user;
  } catch (e) {
    console.warn('[Session] Failed to parse donor session JSON. Purging stale session.');
    safeRemove('donor_user');
    return null;
  }
}

/**
 * Validates token session in storage.
 * @returns {{ token: string, role: string }|null}
 */
export function getValidatedTokenSession() {
  const token = safeGet('auth_token');
  const role = safeGet('auth_role');
  const validRoles = ['PIC', 'Admin', 'SuperAdmin'];
  if (token && role && validRoles.includes(role)) {
    return { token: token.trim(), role };
  }
  if (token && (!role || !validRoles.includes(role))) {
    console.warn('[Session] Invalid role for token session. Purging token.');
    safeRemove('auth_token');
    safeRemove('auth_role');
  }
  return null;
}

/**
 * Completely clears all local auth and return-token sessions
 */
export function clearAllSessions() {
  safeRemove('donor_user');
  safeRemove('auth_token');
  safeRemove('auth_role');
  safeRemove('auth_alias');
  safeRemove('deep_dive_return_token');
  safeRemove('deep_dive_return_role');
}
