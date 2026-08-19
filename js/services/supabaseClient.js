/**
 * Donatur Helper - Supabase Client Singleton Service
 * File: js/services/supabaseClient.js
 *
 * Requirements:
 * - Load environment configuration safely from window.__DH_ENV__.
 * - Instantiate a single client instance using @supabase/supabase-js SDK.
 * - Safely validate configuration without leaking tokens or private keys.
 * - Expose safe internal APIs on window.__dhSupabase and as ES module exports.
 */

let _clientInstance = null;
let _isConfigured = false;

function _getEnv() {
  if (typeof window !== 'undefined' && window.__DH_ENV__) {
    return window.__DH_ENV__;
  }
  return null;
}

/**
 * Initializes or returns the existing Supabase client instance.
 * @returns {object|null} The initialized Supabase client or null if not configured.
 */
export function initClient() {
  if (_clientInstance) {
    return _clientInstance;
  }

  const env = _getEnv();
  const url = env && typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim() : '';
  const key = env && typeof env.SUPABASE_PUBLISHABLE_KEY === 'string' ? env.SUPABASE_PUBLISHABLE_KEY.trim() : '';

  if (!url || !key) {
    _isConfigured = false;
    _clientInstance = null;
    if (env && env.DEBUG) {
      console.warn('[SupabaseClient] Supabase credentials not configured (SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY missing).');
    }
    return null;
  }

  // Retrieve global supabase factory provided by supabase-js CDN UMD bundle
  const supabaseFactory = (typeof window !== 'undefined' && window.supabase) || (typeof supabase !== 'undefined' ? supabase : null);

  if (!supabaseFactory || typeof supabaseFactory.createClient !== 'function') {
    _isConfigured = false;
    _clientInstance = null;
    if (env && env.DEBUG) {
      console.warn('[SupabaseClient] supabase-js SDK library is not loaded in global window scope.');
    }
    return null;
  }

  try {
    _clientInstance = supabaseFactory.createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    _isConfigured = true;
  } catch (err) {
    _isConfigured = false;
    _clientInstance = null;
    if (env && env.DEBUG) {
      console.error('[SupabaseClient] Error initializing Supabase client:', err.message || err);
    }
  }

  return _clientInstance;
}

/**
 * Returns the active Supabase client instance.
 * @returns {object|null}
 */
export function getClient() {
  if (!_clientInstance) {
    return initClient();
  }
  return _clientInstance;
}

/**
 * Checks whether the Supabase client is properly configured with valid credentials and SDK.
 * @returns {boolean}
 */
export function isConfigured() {
  if (!_clientInstance && !_isConfigured) {
    initClient();
  }
  return _isConfigured && _clientInstance !== null;
}

// Attach to window for global access across vanilla JS scripts
const dhSupabaseApi = {
  getClient,
  isConfigured,
  initClient
};

if (typeof window !== 'undefined') {
  window.__dhSupabase = dhSupabaseApi;
}
