# Research & Technical Report: Deployment Caching, Stale Assets, and Session Lifecycle Management

- **Project**: Donatur Helper (`don4tpro.pages.dev`)
- **Date**: 2026-08-20
- **Status**: RESEARCH COMPLETED & ARCHITECTURE PROPOSAL READY
- **Author**: Antigravity Research Agent

---

## 1. Executive Summary

When deploying updates to Cloudflare Pages (`don4tpro.pages.dev`), users frequently report seeing old errors, stale features, or broken workflows even after restarting their browser or mobile app.

This issue is caused by a compound interaction between **three distinct layers**:
1. **HTTP Caching Misconfiguration (`_headers`)**: Static JS/CSS files are served with `Cache-Control: public, max-age=31536000, immutable` without content-hash filenames. Browsers lock the unhashed `/js/*.js` files in disk cache for 1 year and refuse to revalidate with Cloudflare Pages.
2. **Persistent Stale `localStorage` State**: Client-side session objects (such as `donor_user`, `auth_token`) lack schema versioning and integrity validation, causing clients running on new code to process obsolete data structures stored by previous versions.
3. **Absence of Stale App / Version Drift Detection**: Single Page Applications (SPAs) loaded in background tabs or PWAs have no event listener or polling mechanism to detect that the server has deployed a newer revision.

By addressing both sides (the **Server/Deployment HTTP Caching layer** and the **Client-side Session & Version Lifecycle layer**), we achieve 100% immediate delivery of hotfixes to users without requiring manual hard-refreshes (`Ctrl+Shift+R`).

---

## 2. Root Cause Analysis (Both Sides)

```
+-----------------------------------------------------------------------------------+
| 1. HTTP CACHE LAYER (_headers)                                                   |
|    /js/* -> Cache-Control: max-age=31536000, immutable                           |
|    * Browser stores /js/app.js on disk.                                           |
|    * On reload: index.html (200/304) -> loads <script src="js/app.js">            |
|    * Browser sees "immutable" -> LOADS OLD CODE FROM DISK (NO NETWORK CALL).     |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| 2. LOCALSTORAGE SESSION LAYER (Browser Memory/Disk)                               |
|    safeSet('donor_user', { name: "Budi" })  <-- Missing 'whatsapp' / new schema   |
|    * initApp() reads stale JSON without schema check.                            |
|    * Action handlers crash on undefined properties -> "Sesi login tidak valid".   |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| 3. APP RUNTIME & REFRESH LIFECYCLE                                                |
|    * No ServiceWorker / Version polling / Visibility change revalidation.         |
|    * User stays on stale runtime indefinitely until cache is forcibly cleared.   |
+-----------------------------------------------------------------------------------+
```

### Layer 1: The `immutable` Cache-Control Header Flaw (Server/Deployment Side)

#### Primary Spec Evidence: RFC 8246 / RFC 9111 & MDN Web Docs
- `Cache-Control: immutable` tells the browser that the response body will **never** change during its `max-age` period.
- When `immutable` is active, user refreshes (normal F5, navigation, reopening tabs) **bypass conditional requests (`If-None-Match`, `If-Modified-Since`)** and read directly from local disk cache.
- **Rule of Web Performance Architecture**: `immutable` and long `max-age` (e.g., 1 year) are **strictly reserved for assets with content-hashed filenames** (e.g. `app.3a8f9c.js`, `vendor.b712c9.css`).
- In Donatur Helper, static scripts are referenced with static paths:
  ```html
  <script type="module" src="js/services/backendAdapter.js"></script>
  <script type="module" src="js/app.js" defer></script>
  ```
- Because `_headers` defines:
  ```http
  /js/*
    Cache-Control: public, max-age=31536000, immutable
  ```
  any browser that downloads `js/app.js` once will **never fetch a newer `js/app.js`** when Cloudflare Pages deploys, even if the deployment succeeded 100% on Cloudflare edge servers.

### Layer 2: Stale `localStorage` Session Schema Drift (Client Side)

- When bugs are patched in backend RPCs or data structures (e.g., the recent WhatsApp session fix where `donor_user` required `{ whatsapp, name, alias, status }`), users who were already logged in still have the older shape in `localStorage.getItem('donor_user')`.
- `initApp()` in `js/app.js` checks `if (user)` and directly renders the dashboard without verifying if `user.whatsapp` exists or if `user._v === CURRENT_SESSION_VERSION`.
- When the user tries to click an action, the UI throws errors or shows `"Sesi login tidak valid"` because the stored session was created under older app logic.

### Layer 3: Wrangler / Cloudflare Pages Deployment Pipeline

- Cloudflare Pages uses atomic deployments: each deployment creates an immutable container and swaps the DNS/edge routing pointer.
- Cloudflare Pages edge does **not** stale-cache `must-revalidate` assets. The caching bottleneck is purely client browser caching instructed by our own `_headers` configuration.
- However, if the build step (`npm run build`) is skipped prior to `wrangler pages deploy`, local developers might deploy stale `dist/` folders.

---

## 3. Two-Way Solution Architecture (Client + Server)

To completely eliminate stale deployments and broken sessions, we design a cohesive 4-step system:

### Strategy 1: Correct HTTP Caching in `_headers` (Zero Risk, Instant Delivery)

Update `_headers` (and `netlify.toml` mirror) to use ETag-based revalidation for all unbundled JavaScript and CSS files:

```http
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://script.google.com https://script.googleusercontent.com https://accounts.google.com https://*.supabase.co; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self';

/
  Cache-Control: public, max-age=0, must-revalidate

/index.html
  Cache-Control: public, max-age=0, must-revalidate

/js/*
  Cache-Control: public, max-age=0, must-revalidate

/css/*
  Cache-Control: public, max-age=0, must-revalidate

/assets/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
```

#### Why `max-age=0, must-revalidate` is optimal for Vanilla ESM:
1. **Instant Updates**: The browser sends a lightweight 100-byte conditional request (`If-None-Match: "<ETag>"`) to Cloudflare Pages edge.
2. **If code changed**: Cloudflare returns `200 OK` with the new file immediately.
3. **If code didn't change**: Cloudflare returns `304 Not Modified` in ~10–20ms without transmitting file body. Fast, lightweight, and guaranteed fresh.

---

### Strategy 2: Client Session Versioning & Self-Healing Session Migration

Implement `SESSION_VERSION` in `js/storage.js` and `js/state.js`.

```javascript
// js/config/version.js
export const APP_VERSION = '1.2.0-20260820';
export const SESSION_SCHEMA_VERSION = 2;

// In js/storage.js:
export function getValidatedDonorSession() {
  const raw = safeGet('donor_user');
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    // Validate required contract fields
    if (!user || !user.whatsapp || typeof user.whatsapp !== 'string') {
      console.warn('[Session] Detected corrupted/outdated donor session. Purging stale session.');
      safeRemove('donor_user');
      return null;
    }
    return user;
  } catch (e) {
    safeRemove('donor_user');
    return null;
  }
}
```

If a user opens the app with a corrupted or outdated session structure:
1. The app detects missing fields (`!user.whatsapp`).
2. Cleans up only the corrupted session keys without crashing.
3. Returns the user cleanly to the login screen with an informative note: *"Sesi Anda telah diperbarui untuk keamanan. Silakan masukkan nomor WhatsApp kembali."*

---

### Strategy 3: Version Drift & Auto-Update Polling (Background Detection)

When users keep a tab open for days or on mobile devices:

1. `build-static.cjs` generates `dist/version.json`:
   ```json
   {
     "version": "1.2.0",
     "buildTime": "2026-08-20T04:30:00.000Z",
     "commit": "8f3a2b1"
   }
   ```
2. When the user switches back to the tab (`document.addEventListener('visibilitychange')` or window `focus`), the app checks `version.json`:
   ```javascript
   async function checkForAppUpdates() {
     try {
       const res = await fetch(`/version.json?_t=${Date.now()}`, { cache: 'no-store' });
       if (!res.ok) return;
       const info = await res.json();
       if (window.__DH_BUILD_TIME__ && info.buildTime !== window.__DH_BUILD_TIME__) {
         showUpdateNotification(info);
       }
     } catch (e) {
       // Silent fail in offline mode
     }
   }
   ```
3. A non-blocking toast appears:
   *"Versi baru Donatur Helper tersedia. [Perbarui Sekarang]"*
   Clicking it performs a clean reload: `window.location.reload()`.

---

### Strategy 4: Deployment Safeguards in `package.json` & Wrangler

Add automated pre-deploy checks so nobody deploys unbuilt or dirty assets:

```json
{
  "scripts": {
    "build": "node scripts/deployment/build-static.cjs",
    "deploy:preview": "npm run build && wrangler pages deploy dist --project-name=donatur-helper --branch=preview",
    "deploy:prod": "npm run build && wrangler pages deploy dist --project-name=donatur-helper --branch=main"
  }
}
```

---

## 4. Comparison Table: Before vs. After

| Attribute | Current Behavior (Problem) | Proposed Solution (Fixed) |
|---|---|---|
| **JS/CSS HTTP Header** | `max-age=31536000, immutable` | `max-age=0, must-revalidate` (ETag based) |
| **User on New Deploy** | Keeps running old cached JS for up to 1 year | Downloads updated JS instantly on refresh |
| **Stale `localStorage` Object** | Crashes action handler with "Sesi tidak valid" | Self-heals & sanitizes session on boot |
| **Open Tab / Mobile PWA** | Stays on stale build indefinitely | Detects new version on tab focus and offers 1-click update |
| **Deploy Command** | Risk of deploying outdated `dist/` | `npm run build` runs automatically before Wrangler upload |

---

## 5. Implementation Plan

1. **Step 1: Fix `_headers` and `netlify.toml`**: Replace `immutable` on `/js/*` and `/css/*` with `max-age=0, must-revalidate`.
2. **Step 2: Add `version.json` generation in `scripts/deployment/build-static.cjs`**: Write build timestamp and version to `dist/version.json`.
3. **Step 3: Add Session Integrity Sanitizer in `js/storage.js` & `js/app.js`**: Automatically purge broken or malformed session objects during `initApp()`.
4. **Step 4: Add Version Checking & Refresh Toast**: Listen to `visibilitychange` to notify users when a new deployment is live.
5. **Step 5: Add npm deploy scripts for Wrangler**: Ensure build runs before deploy.
