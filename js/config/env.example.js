/**
 * Donatur Helper - Frontend Environment Configuration Template
 * File: js/config/env.example.js
 *
 * Description:
 * Template configuration for frontend backend integration.
 * Copy this file to js/config/env.local.js and supply your Supabase project credentials.
 *
 * Security & Configuration Guidelines:
 * 1. SUPABASE_URL:
 *    The public HTTPS endpoint of your Supabase project (e.g. "https://your-project.supabase.co").
 * 2. SUPABASE_PUBLISHABLE_KEY:
 *    The public client key (publishable/anon key) that is safe for browser use.
 * 3. WARNING - SENSITIVE SECRETS:
 *    DO NOT put SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL,
 *    or Gmail SMTP credentials here. Those keys bypass Row Level Security and must
 *    NEVER be exposed to the browser.
 * 4. BACKEND_MODE:
 *    - "supabase": Route all migrated operations directly through Supabase RPC functions.
 *    - "gas": Force all operations through legacy Google Apps Script endpoint.
 *    - "auto": Use Supabase for all migrated actions, and automatically fallback to GAS for unmigrated actions.
 * 5. ALLOW_GAS_FALLBACK:
 *    When true, allows fallback to legacy Apps Script for actions not yet migrated to Supabase.
 * 6. DEBUG:
 *    When true, enables safe diagnostic logging and activates window.__dhHealthCheck.
 */

window.__DH_ENV__ = {
  SUPABASE_URL: "",
  SUPABASE_PUBLISHABLE_KEY: "",
  BACKEND_MODE: "supabase", // "supabase" | "gas" | "auto"
  ALLOW_GAS_FALLBACK: true,
  DEBUG: false
};
