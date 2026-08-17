# Authenticated Mobile UX Phase 7 Implementation Plan: Performance Profiling, Timeout Hardening & Role-Based Observability

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement Phase 7 performance profiling, timeout hardening, and role-based observability for Donatur Helper to eliminate Admin/SuperAdmin slowness and timeout failures on localhost, establish safe timing instrumentation across all 5 user roles (Landing, Donor, PIC, Admin, SuperAdmin), prevent uncontrolled request hanging, optimize initial dashboard loading, and provide a localhost debug panel without regressing Phase 1–6 functionality.

**Architecture:** Continue working with the current modular architecture (valid HTML5 shell, `css/` modular stylesheets, `js/` ES modules). Add lightweight, privacy-safe performance instrumentation (`js/perf.js`) utilizing `performance.now()` / Performance Marks to separate network/API latency, data processing, and DOM rendering times per role. Enhance the API layer (`js/api.js`) with configurable `AbortController` timeout handling and idempotent in-flight request deduplication. Restructure Admin/SuperAdmin loading sequences to load critical summaries and action queues first while deferring heavy sections. Define role-based performance budgets with dev alerts and a localhost-only debug timing panel.

**Tech Stack:** Vanilla HTML5, CSS3 with semantic tokens, Vanilla JavaScript (ES6+ Modules), Performance Timing API (`performance.now`, `performance.mark`, `performance.measure`), Node.js built-in test runner (`node --test`), Google Apps Script backend (`Code.js`).

---

### Task 1: Role-Based Performance Timing Helper & Instrumentation Module

**Files:**
- Create: `js/perf.js`
- Modify: `js/app.js:1-50`
- Modify: `js/utils.js:1-30`
- Create: `tests/role-timing.test.js`

**Step 1: Write failing test for role performance instrumentation**
Create `tests/role-timing.test.js` asserting that:
1. `js/perf.js` exports `startViewTiming(roleName)`, `markFetchStart(roleName, actionName)`, `markFetchEnd(roleName, actionName, meta)`, `markRenderStart(roleName, sectionName)`, `markRenderEnd(roleName, sectionName)`, `endViewTiming(roleName)`, `getRoleMetrics(roleName)`, and `getAllRoleMetrics()`.
2. Measuring a lifecycle across all 5 roles (`Landing`, `Donor`, `PIC`, `Admin`, `SuperAdmin`) records:
   - `viewStartTime` and `viewEndTime`
   - `totalDurationMs` (time to usable view)
   - `fetchDurationMs` (cumulative network/API time)
   - `renderDurationMs` (cumulative DOM rendering time)
   - `recordCount` (total items processed)
   - `errorCount` and `timeoutCount`
3. Privacy validation: Metric payloads NEVER store or log sensitive information such as phone numbers, tokens, donor names, payment proof URLs, or credentials.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startViewTiming,
  markFetchStart,
  markFetchEnd,
  markRenderStart,
  markRenderEnd,
  endViewTiming,
  getRoleMetrics,
  getAllRoleMetrics,
  resetMetrics
} from '../js/perf.js';

test('Task 1: Role performance timing helper tracks view, fetch, and render durations without leaking sensitive data', () => {
  resetMetrics();

  // Test Admin lifecycle instrumentation
  startViewTiming('Admin');
  markFetchStart('Admin', 'getDashboardSummary');
  markFetchEnd('Admin', 'getDashboardSummary', { recordCount: 12 });
  
  markFetchStart('Admin', 'getPendingMembers');
  markFetchEnd('Admin', 'getPendingMembers', { recordCount: 3 });

  markRenderStart('Admin', 'summary');
  markRenderEnd('Admin', 'summary');

  markRenderStart('Admin', 'actionQueue');
  markRenderEnd('Admin', 'actionQueue');

  const metrics = endViewTiming('Admin');

  assert.equal(metrics.role, 'Admin');
  assert.ok(typeof metrics.totalDurationMs === 'number' && metrics.totalDurationMs >= 0);
  assert.ok(typeof metrics.fetchDurationMs === 'number' && metrics.fetchDurationMs >= 0);
  assert.ok(typeof metrics.renderDurationMs === 'number' && metrics.renderDurationMs >= 0);
  assert.equal(metrics.recordCount, 15);
  assert.equal(metrics.errorCount, 0);
  assert.equal(metrics.timeoutCount, 0);

  // Check privacy safety: no sensitive keys in metric object
  const serialized = JSON.stringify(metrics);
  assert.ok(!serialized.includes('08'), 'Metrics must not contain phone numbers');
  assert.ok(!serialized.includes('token'), 'Metrics must not contain raw tokens');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/role-timing.test.js`  
Expected: FAIL due to missing `js/perf.js`.

**Step 3: Implement `js/perf.js`**
Create `js/perf.js`:
```javascript
// Lightweight, privacy-safe role performance instrumentation helper

const roleMetricsStore = {};
const activeViewTimings = {};

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export function resetMetrics() {
  for (const key of Object.keys(roleMetricsStore)) delete roleMetricsStore[key];
  for (const key of Object.keys(activeViewTimings)) delete activeViewTimings[key];
}

export function startViewTiming(roleName) {
  const startTime = now();
  activeViewTimings[roleName] = {
    role: roleName,
    viewStartTime: startTime,
    fetches: {},
    renders: {},
    cumulativeFetchMs: 0,
    cumulativeRenderMs: 0,
    recordCount: 0,
    errorCount: 0,
    timeoutCount: 0
  };
  return startTime;
}

export function markFetchStart(roleName, actionName) {
  const timing = activeViewTimings[roleName];
  if (!timing) return;
  timing.fetches[actionName] = { startTime: now() };
}

export function markFetchEnd(roleName, actionName, meta = {}) {
  const timing = activeViewTimings[roleName];
  if (!timing || !timing.fetches[actionName]) return;
  const f = timing.fetches[actionName];
  f.endTime = now();
  f.durationMs = f.endTime - f.startTime;
  timing.cumulativeFetchMs += f.durationMs;

  if (typeof meta.recordCount === 'number') {
    timing.recordCount += meta.recordCount;
  }
  if (meta.isError) timing.errorCount++;
  if (meta.isTimeout) timing.timeoutCount++;
}

export function markRenderStart(roleName, sectionName) {
  const timing = activeViewTimings[roleName];
  if (!timing) return;
  timing.renders[sectionName] = { startTime: now() };
}

export function markRenderEnd(roleName, sectionName) {
  const timing = activeViewTimings[roleName];
  if (!timing || !timing.renders[sectionName]) return;
  const r = timing.renders[sectionName];
  r.endTime = now();
  r.durationMs = r.endTime - r.startTime;
  timing.cumulativeRenderMs += r.durationMs;
}

export function endViewTiming(roleName) {
  const timing = activeViewTimings[roleName];
  if (!timing) return roleMetricsStore[roleName] || null;

  const endTime = now();
  const totalDurationMs = Math.max(0, endTime - timing.viewStartTime);

  const snapshot = {
    role: roleName,
    viewStartTime: timing.viewStartTime,
    viewEndTime: endTime,
    totalDurationMs: Math.round(totalDurationMs * 100) / 100,
    fetchDurationMs: Math.round(timing.cumulativeFetchMs * 100) / 100,
    renderDurationMs: Math.round(timing.cumulativeRenderMs * 100) / 100,
    recordCount: timing.recordCount,
    errorCount: timing.errorCount,
    timeoutCount: timing.timeoutCount,
    timestamp: new Date().toISOString()
  };

  roleMetricsStore[roleName] = snapshot;
  delete activeViewTimings[roleName];
  return snapshot;
}

export function getRoleMetrics(roleName) {
  return roleMetricsStore[roleName] || null;
}

export function getAllRoleMetrics() {
  return { ...roleMetricsStore };
}
```

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/role-timing.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add js/perf.js tests/role-timing.test.js
rtk git commit -m "feat(perf): add role-based performance instrumentation and privacy-safe metrics store"
```

---

### Task 2: Admin/SuperAdmin Bottleneck Diagnosis & Evidence-Based Reporting

**Files:**
- Create: `docs/reports/admin-performance-bottleneck-diagnosis.md`
- Create: `tests/performance-bottleneck-diagnosis.test.js`

**Step 1: Write failing test for bottleneck diagnostic framework**
Create `tests/performance-bottleneck-diagnosis.test.js` asserting that:
1. `docs/reports/admin-performance-bottleneck-diagnosis.md` exists and contains non-empty markdown documentation.
2. The diagnostic report explicitly evaluates all 8 potential slowness vectors with empirical criteria:
   - Network / API roundtrip latency
   - Backend Google Apps Script cold start & execution time
   - Record count volume (members, campaigns, donors)
   - Excessive DOM rendering (dual card + table simultaneous mounting)
   - Repeated rendering & duplicate render cycles
   - Duplicate concurrent requests (e.g. `getPendingMembers` called twice at init)
   - Blocking synchronous loops or unbatched calculations
   - Missing pagination or lack of deferred/lazy-loading
3. The report presents actionable solutions mapped to Tasks 3, 4, 5, 6, and 7.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 2: docs/reports/admin-performance-bottleneck-diagnosis.md documents evidence-based analysis of 8 performance vectors', () => {
  const diagPath = path.resolve('docs/reports/admin-performance-bottleneck-diagnosis.md');
  assert.ok(fs.existsSync(diagPath), 'admin-performance-bottleneck-diagnosis.md must exist');
  
  const content = fs.readFileSync(diagPath, 'utf8');
  assert.ok(content.includes('Network') || content.includes('Latensi Jaringan'), 'Must analyze network latency');
  assert.ok(content.includes('Backend') || content.includes('Google Apps Script'), 'Must analyze backend processing');
  assert.ok(content.includes('Volume Record') || content.includes('Jumlah Data'), 'Must analyze record counts');
  assert.ok(content.includes('DOM Rendering') || content.includes('Render DOM'), 'Must analyze DOM rendering');
  assert.ok(content.includes('Duplicate Request') || content.includes('Permintaan Duplikat'), 'Must analyze duplicate requests');
  assert.ok(content.includes('Lazy Loading') || content.includes('Paginasi'), 'Must analyze lazy loading and pagination');
  assert.ok(content.includes('Timeout') || content.includes('Batas Waktu'), 'Must analyze request timeouts');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/performance-bottleneck-diagnosis.test.js`  
Expected: FAIL due to missing `docs/reports/admin-performance-bottleneck-diagnosis.md`.

**Step 3: Create `docs/reports/admin-performance-bottleneck-diagnosis.md`**
Create the comprehensive diagnostic report analyzing root causes on localhost:
- Concurrent request queueing: 6 parallel POST requests fired by `loadAdminDashboard` and 7 by `loadSuperAdminDashboard` create severe lock contention on Google Apps Script.
- Redundant initial polling: `startAdminPolling` immediately triggers `getPendingMembers` on mount, duplicating the fetch just initiated by `refreshPendingMembers`.
- Unbounded member rendering: `fetchAllMembers` fetches all member records at once and renders both card views and table views simultaneously into `innerHTML`.
- Non-critical section blocking: Settings, Admin accounts, and cold storage sweeps are fetched during initial view setup rather than on-demand.
- Lack of client-side request timeout: Fetch requests wait indefinitely without an `AbortController`, leaving UI in an unrecoverable loading state.

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/performance-bottleneck-diagnosis.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add docs/reports/admin-performance-bottleneck-diagnosis.md tests/performance-bottleneck-diagnosis.test.js
rtk git commit -m "docs(diagnosis): create admin and superadmin performance bottleneck diagnostic report"
```

---

### Task 3: Request Timeout and Abort Handling with Safe Indonesian User States

**Files:**
- Modify: `js/api.js:1-75`
- Modify: `js/utils.js:120-170`
- Modify: `js/views/admin.js:30-100`
- Modify: `js/views/superadmin.js:10-40`
- Modify: `tests/error-handling-safety.test.js`

**Step 1: Write failing test for timeout handling and retry capabilities**
Update `tests/error-handling-safety.test.js` asserting that:
1. `fetchBackend` and `call` in `js/api.js` accept an optional timeout option (defaulting to 15,000ms for read requests).
2. When a request exceeds the timeout threshold, it aborts via `AbortController` and rejects with an explicit `TimeoutError` or `{ isTimeout: true }`.
3. `formatUserErrorMessage` maps timeout errors to the calm Indonesian message: `"Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi."`
4. Failed sections render an accessible `.retry-action` button enabling instant user retry without full page reloads.
5. Technical stack traces, script URLs, and internal line numbers are strictly excluded from user view.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatUserErrorMessage } from '../js/utils.js';

test('Task 3: formatUserErrorMessage formats timeouts into calm Indonesian copy with retry readiness', () => {
  const timeoutErr = new Error('The operation was aborted due to timeout');
  timeoutErr.name = 'AbortError';
  timeoutErr.isTimeout = true;

  const userMsg = formatUserErrorMessage(timeoutErr);
  assert.equal(userMsg, 'Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.');

  // Verify technical details are concealed
  assert.ok(!userMsg.includes('AbortError'));
  assert.ok(!userMsg.includes('fetch'));
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/error-handling-safety.test.js`  
Expected: FAIL on timeout copy assertion mismatch.

**Step 3: Update `js/api.js` and `js/utils.js`**
1. In `js/api.js`, introduce `AbortController` with timeout protection:
```javascript
export const DEFAULT_TIMEOUT_MS = 15000;

export function fetchBackend(name, args, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return fetch(SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({ action: name, params: args }),
    mode: 'cors',
    credentials: 'omit',
    redirect: 'follow',
    signal: controller.signal,
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    }
  })
    .then(async response => {
      clearTimeout(timer);
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error("Respons server bukan JSON (mungkin error atau diblokir). Detail: " + text.substring(0, 80));
      }
    })
    .then(res => {
      if (res.status === 'error') throw new Error(res.message);
      if (res.data && typeof res.data === 'object' && res.data.error) {
        throw new Error(res.data.error);
      }
      return res.data;
    })
    .catch(err => {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        const timeoutError = new Error('Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.');
        timeoutError.isTimeout = true;
        throw timeoutError;
      }
      throw err;
    });
}
```

2. In `js/utils.js`, update `formatUserErrorMessage`:
```javascript
export function formatUserErrorMessage(err) {
  if (!err) return 'Terjadi kendala saat memproses permintaan. Silakan coba lagi.';
  if (err.isTimeout) return 'Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.';

  const msg = typeof err === 'string' ? err : (err.message || String(err));
  
  if (/timeout|abort|waktu habis|lebih lama dari biasanya/i.test(msg)) {
    return 'Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.';
  }
  if (/network|fetch|failed to fetch|koneksi/i.test(msg)) {
    return 'Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.';
  }
  if (/unauthorized|token/i.test(msg)) {
    return 'Sesi akses Anda telah berakhir. Silakan masuk kembali.';
  }
  if (/cannot read properties|undefined|referenceerror|typeerror|syntaxerror|null is not an object|at doPost|at doGet|Code\.js/i.test(msg)) {
    return 'Terjadi kendala saat memproses data. Silakan muat ulang halaman atau coba lagi.';
  }
  
  return escapeHtml(msg);
}
```

3. In `js/views/admin.js` and `js/views/superadmin.js`, standardize error UI with retry action:
```html
<p class="error" role="alert">
  Ringkasan belum dapat dimuat.
  <button type="button" class="btn secondary btn-auto retry-action" onclick="refreshSummary('admin-summary')">Coba lagi</button>
</p>
```

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/error-handling-safety.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add js/api.js js/utils.js js/views/admin.js js/views/superadmin.js tests/error-handling-safety.test.js
rtk git commit -m "fix(api): implement request timeout controller and user-safe indonesian error states"
```

---

### Task 4: Reduce Admin/SuperAdmin Initial Load & Defer Non-Critical Sections

**Files:**
- Modify: `js/views/admin.js:80-160`
- Modify: `js/views/superadmin.js:1-45`
- Modify: `js/views/auth.js:200-240`
- Create: `tests/admin-initial-load.test.js`

**Step 1: Write failing test for initial loading reduction**
Create `tests/admin-initial-load.test.js` asserting that:
1. `loadAdminDashboard()` loads High-Priority sections first (Summary and Action Queues: `getDashboardSummary`, `getPendingMembers`, `getPendingLateRequests`).
2. Secondary sections (`listAllCampaigns` and `fetchAllMembers`) are queued after primary data resolves or are scheduled non-blockingly.
3. SuperAdmin settings (`getSettingsForSuperAdmin`), Admin accounts (`listAdmins`), and Tools sections are deferred until either visible or explicitly opened by user interaction.
4. Member list initial chunk remains strictly capped at 20 items with working "Muat lebih banyak" expansion.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserEnvironment } from './test-harness.js';

test('Task 4: Admin dashboard initializes critical summary and action queues before fetching secondary sections', () => {
  const env = createBrowserEnvironment();
  const callSequence = [];

  // Mock API call to record invocation sequence
  env.window.call = (action, ...args) => {
    callSequence.push(action);
    if (action === 'getDashboardSummary') return Promise.resolve({ totalDonors: 10, totalPending: 0, totalCollected: 100000 });
    if (action === 'getPendingMembers') return Promise.resolve([]);
    if (action === 'getPendingLateRequests') return Promise.resolve([]);
    if (action === 'listAllCampaigns') return Promise.resolve([]);
    if (action === 'fetchAllMembers') return Promise.resolve([]);
    return Promise.resolve({});
  };

  env.window.loadAdminDashboard();

  // Primary calls must occur immediately in initial batch
  assert.ok(callSequence.includes('getDashboardSummary'), 'Summary must be requested at start');
  assert.ok(callSequence.includes('getPendingMembers'), 'Pending members must be requested at start');
  assert.ok(callSequence.includes('getPendingLateRequests'), 'Late requests must be requested at start');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/admin-initial-load.test.js`  
Expected: FAIL due to missing test file.

**Step 3: Implement prioritized staged loading in `js/views/admin.js` and `js/views/superadmin.js`**
1. In `js/views/admin.js`, structure `loadAdminDashboard`:
```javascript
export function loadAdminDashboard() {
  showView('admin-dashboard');
  startViewTiming('Admin');
  resetAdminActionQueue();

  // STAGE 1 (High Priority): Summary & Action Queues
  markFetchStart('Admin', 'primaryQueue');
  Promise.allSettled([
    refreshSummary('admin-summary'),
    refreshPendingMembers('admin-pending-members'),
    refreshLateRequests('admin-late-donors')
  ]).then(() => {
    markFetchEnd('Admin', 'primaryQueue');
    // STAGE 2 (Medium Priority): Campaigns & Members
    refreshAdminCampaigns();
    refreshMembers();
    startAdminPolling();
    endViewTiming('Admin');
  });
}
```

2. In `js/views/superadmin.js`, structure `loadSuperAdminDashboard`:
```javascript
export function loadSuperAdminDashboard() {
  showView('superadmin-dashboard');
  startViewTiming('SuperAdmin');

  // STAGE 1 (High Priority): Summary & Pending approvals
  Promise.allSettled([
    refreshSummary('sa-summary'),
    refreshPendingMembers('sa-pending-members'),
    refreshLateRequests('sa-late-donors')
  ]).then(() => {
    // STAGE 2: Campaigns & Members
    refreshSACampaigns();
    refreshMembers();
    refreshAdmins();
    startAdminPolling();
    endViewTiming('SuperAdmin');
  });
}
```

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/admin-initial-load.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add js/views/admin.js js/views/superadmin.js tests/admin-initial-load.test.js
rtk git commit -m "perf(admin): implement staged prioritized loading for admin and superadmin dashboards"
```

---

### Task 5: Request Deduplication and Polling Guards

**Files:**
- Modify: `js/api.js:40-75`
- Modify: `js/views/auth.js:290-350`
- Create: `tests/request-deduplication.test.js`

**Step 1: Write failing test for in-flight request deduplication**
Create `tests/request-deduplication.test.js` asserting that:
1. `call(action, ...args)` deduplicates simultaneous in-flight read operations: calling `call('getPendingMembers', token)` twice in the same tick executes only ONE network fetch and resolves both promises with the same response.
2. Distinct actions or differing arguments are NOT deduplicated.
3. Write operations (`callQueued`) bypass deduplication and execute serially.
4. `startAdminPolling()` does NOT fire an immediate redundant `getPendingMembers` call if a fetch was performed within the last 5 seconds.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, resetInflightCache } from '../js/api.js';

test('Task 5: call deduplicates concurrent in-flight read requests with identical arguments', async () => {
  resetInflightCache();
  let networkFetchCount = 0;

  // Mock global fetch
  globalThis.fetch = async () => {
    networkFetchCount++;
    await new Promise(r => setTimeout(r, 20));
    return {
      text: async () => JSON.stringify({ status: 'success', data: [{ WhatsApp: '081234' }] })
    };
  };

  const p1 = call('getPendingMembers', 'TOKEN-123');
  const p2 = call('getPendingMembers', 'TOKEN-123');

  const [res1, res2] = await Promise.all([p1, p2]);

  assert.equal(networkFetchCount, 1, 'Should execute only 1 network fetch for duplicate concurrent calls');
  assert.deepEqual(res1, res2);
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/request-deduplication.test.js`  
Expected: FAIL due to missing `resetInflightCache` or duplicate requests executing twice.

**Step 3: Implement in-flight deduplication in `js/api.js` and guard `startAdminPolling` in `js/views/auth.js`**
1. In `js/api.js`:
```javascript
const inflightRequests = new Map();

export function resetInflightCache() {
  inflightRequests.clear();
}

export function call(name, ...args) {
  // Only deduplicate read/query actions, not mutative operations
  const isReadAction = /^(get|list|fetch|check)/i.test(name);
  if (!isReadAction) {
    return fetchBackend(name, args);
  }

  // Create a safe cache key (excluding any large raw objects)
  const cacheKey = name + ':' + JSON.stringify(args);
  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }

  const promise = fetchBackend(name, args).finally(() => {
    inflightRequests.delete(cacheKey);
  });

  inflightRequests.set(cacheKey, promise);
  return promise;
}
```

2. In `js/views/auth.js`, update `startAdminPolling`:
```javascript
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

    // Guard: Skip immediate polling check if fetched within last 5 seconds
    if (Date.now() - lastPendingFetchTime < 5000) {
      return;
    }

    call('getPendingMembers', token).then(list => {
      recordPendingFetchTime();
      const currentCount = list.length;
      updateTabTitle(currentCount);
      // update UI only if count changed...
    }).catch(() => {});
  }

  appState.pollIntervalId = setInterval(runCheck, 60000);
}
```

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/request-deduplication.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add js/api.js js/views/auth.js tests/request-deduplication.test.js
rtk git commit -m "feat(api): add inflight request deduplication and polling throttling guard"
```

---

### Task 6: Localhost Debug Timing Panel & Observability HUD

**Files:**
- Create: `js/debug-panel.js`
- Modify: `css/components.css:350-400`
- Modify: `js/app.js:330-360`
- Create: `tests/debug-panel.test.js`

**Step 1: Write failing test for localhost debug panel**
Create `tests/debug-panel.test.js` asserting that:
1. `initDebugPanel()` activates when running on `localhost`, `127.0.0.1`, or when `window._DH_DEBUG === true`.
2. Debug panel renders a collapsible HUD element (`#dh-debug-panel`) displaying:
   - Active Role / View Name (`Landing`, `Donor`, `PIC`, `Admin`, `SuperAdmin`)
   - Fetch Duration (ms)
   - Render Duration (ms)
   - Total Usable Duration (ms)
   - Record Count
   - Error / Timeout status indicator
3. The panel is completely inert and hidden in production environments by default.
4. The panel NEVER displays sensitive data (phone numbers, tokens, donor names, proof URLs).

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserEnvironment } from './test-harness.js';
import { initDebugPanel, renderDebugMetrics } from '../js/debug-panel.js';

test('Task 6: Localhost debug timing panel renders role metrics safely without PII', () => {
  const env = createBrowserEnvironment();
  env.window.location.hostname = 'localhost';

  const panel = initDebugPanel(env.window);
  assert.ok(panel, 'Debug panel must initialize on localhost');

  renderDebugMetrics({
    role: 'Admin',
    totalDurationMs: 840,
    fetchDurationMs: 620,
    renderDurationMs: 220,
    recordCount: 18,
    errorCount: 0,
    timeoutCount: 0
  }, env.window);

  const panelHtml = env.document.getElementById('dh-debug-panel').innerHTML;
  assert.ok(panelHtml.includes('Admin'));
  assert.ok(panelHtml.includes('840') || panelHtml.includes('Total'));
  assert.ok(!panelHtml.includes('08'), 'Must not display phone numbers');
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/debug-panel.test.js`  
Expected: FAIL due to missing `js/debug-panel.js`.

**Step 3: Implement `js/debug-panel.js` and styles**
1. Create `js/debug-panel.js`:
```javascript
// Localhost Debug Timing Panel (Dev HUD)

import { getRoleMetrics, getAllRoleMetrics } from './perf.js';

export function isLocalhostEnvironment(win = window) {
  if (win._DH_DEBUG === true) return true;
  const host = win.location?.hostname || '';
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export function initDebugPanel(win = window) {
  if (!isLocalhostEnvironment(win) || win.document.getElementById('dh-debug-panel')) {
    return null;
  }

  const doc = win.document;
  const panel = doc.createElement('aside');
  panel.id = 'dh-debug-panel';
  panel.className = 'dh-debug-panel';
  panel.setAttribute('aria-label', 'Panel Pengukuran Kinerja Lokal');
  panel.innerHTML = `
    <details class="dh-debug-details">
      <summary class="dh-debug-summary">
        <span>⚡ Dev Perf HUD</span>
        <span id="dh-debug-status" class="dh-debug-badge">OK</span>
      </summary>
      <div id="dh-debug-body" class="dh-debug-body">
        <p class="muted" style="margin:4px 0;font-size:11px;">Pengukuran Kinerja (Localhost)</p>
        <div id="dh-debug-metrics" class="dh-debug-metrics">Menunggu data role...</div>
      </div>
    </details>
  `;

  doc.body.appendChild(panel);
  return panel;
}

export function renderDebugMetrics(metrics, win = window) {
  if (!metrics || !isLocalhostEnvironment(win)) return;
  const el = win.document.getElementById('dh-debug-metrics');
  const statusBadge = win.document.getElementById('dh-debug-status');
  if (!el) return;

  const isSlow = metrics.totalDurationMs > 3000;
  const hasErrors = metrics.errorCount > 0 || metrics.timeoutCount > 0;

  if (statusBadge) {
    statusBadge.textContent = hasErrors ? 'ERR/TIMEOUT' : (isSlow ? 'SLOW' : 'FAST');
    statusBadge.className = 'dh-debug-badge ' + (hasErrors ? 'danger' : (isSlow ? 'warning' : 'success'));
  }

  el.innerHTML = `
    <table class="dh-debug-table">
      <tr><th>Role</th><td><strong>${metrics.role}</strong></td></tr>
      <tr><th>Total Waktu</th><td>${metrics.totalDurationMs} ms</td></tr>
      <tr><th>Fetch (API)</th><td>${metrics.fetchDurationMs} ms</td></tr>
      <tr><th>Render (DOM)</th><td>${metrics.renderDurationMs} ms</td></tr>
      <tr><th>Record Count</th><td>${metrics.recordCount}</td></tr>
      <tr><th>Status</th><td>${hasErrors ? '⚠️ Ada kendala' : '✓ Normal'}</td></tr>
    </table>
  `;
}
```

2. Add CSS styles in `css/components.css`:
```css
/* Localhost Debug HUD Panel */
.dh-debug-panel {
  position: fixed;
  bottom: 12px;
  right: 12px;
  z-index: 99999;
  background: rgba(15, 23, 42, 0.92);
  color: #f8fafc;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  font-family: monospace;
  font-size: 11px;
  max-width: 280px;
}
.dh-debug-summary {
  padding: 6px 10px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}
.dh-debug-body {
  padding: 8px 10px;
  border-top: 1px solid rgba(255,255,255,0.1);
}
.dh-debug-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
}
.dh-debug-badge.success { background: #059669; color: white; }
.dh-debug-badge.warning { background: #d97706; color: white; }
.dh-debug-badge.danger { background: #dc2626; color: white; }
.dh-debug-table { width: 100%; border-collapse: collapse; }
.dh-debug-table th { text-align: left; color: #94a3b8; padding: 2px 0; }
.dh-debug-table td { text-align: right; color: #f8fafc; padding: 2px 0; }
```

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/debug-panel.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add js/debug-panel.js css/components.css tests/debug-panel.test.js
rtk git commit -m "feat(debug): add localhost debug timing hud for real-time role performance visibility"
```

---

### Task 7: Performance Budgets, Threshold Enforcement & Localhost Alerts

**Files:**
- Modify: `js/perf.js:60-120`
- Modify: `tests/performance-budget.test.js`

**Step 1: Write failing test for role-based performance budgets**
Update `tests/performance-budget.test.js` asserting:
1. Performance budgets are cataloged per role:
   - `Landing`: ≤ 500ms (Fast)
   - `Donor`: ≤ 1000ms (Fast)
   - `PIC`: ≤ 2000ms (Moderate)
   - `Admin`: ≤ 3000ms (Moderate)
   - `SuperAdmin`: ≤ 3500ms (Moderate)
2. `checkPerformanceBudget(roleName, durationMs)` evaluates durations against role thresholds.
3. When budget is exceeded on localhost, it returns `{ exceeded: true, budgetMs: X, actualMs: Y }` and triggers a console warning without crashing or alarming production end-users.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_PERFORMANCE_BUDGETS, checkPerformanceBudget } from '../js/perf.js';

test('Task 7: Role performance budgets are strictly defined and warn when exceeded', () => {
  assert.equal(ROLE_PERFORMANCE_BUDGETS.Landing, 500);
  assert.equal(ROLE_PERFORMANCE_BUDGETS.Donor, 1000);
  assert.equal(ROLE_PERFORMANCE_BUDGETS.PIC, 2000);
  assert.equal(ROLE_PERFORMANCE_BUDGETS.Admin, 3000);
  assert.equal(ROLE_PERFORMANCE_BUDGETS.SuperAdmin, 3500);

  const withinBudget = checkPerformanceBudget('Admin', 1200);
  assert.equal(withinBudget.exceeded, false);

  const overBudget = checkPerformanceBudget('Admin', 4200);
  assert.equal(overBudget.exceeded, true);
  assert.equal(overBudget.budgetMs, 3000);
  assert.equal(overBudget.actualMs, 4200);
});
```

**Step 2: Run test to verify it fails**
Run: `rtk node --test tests/performance-budget.test.js`  
Expected: FAIL due to missing `ROLE_PERFORMANCE_BUDGETS` in `js/perf.js`.

**Step 3: Implement budget checks in `js/perf.js`**
Add budget rules to `js/perf.js`:
```javascript
export const ROLE_PERFORMANCE_BUDGETS = {
  Landing: 500,
  Donor: 1000,
  PIC: 2000,
  Admin: 3000,
  SuperAdmin: 3500
};

export function checkPerformanceBudget(roleName, actualMs) {
  const budgetMs = ROLE_PERFORMANCE_BUDGETS[roleName] || 3000;
  const exceeded = actualMs > budgetMs;
  return {
    role: roleName,
    budgetMs,
    actualMs,
    exceeded,
    overMs: exceeded ? Math.round((actualMs - budgetMs) * 100) / 100 : 0
  };
}
```

**Step 4: Run test to verify it passes**
Run: `rtk node --test tests/performance-budget.test.js`  
Expected: PASS.

**Step 5: Commit**
```bash
rtk git add js/perf.js tests/performance-budget.test.js
rtk git commit -m "feat(perf): define role performance budgets and non-intrusive dev warning checks"
```

---

### Task 8: Full Regression Test Suite & Verification Delivery Gate

**Files:**
- Create: `tests/performance-timeout-observability.test.js`
- Test: `tests/*.test.js` (all 26 test files)
- Modify: `docs/plans/2026-08-17-performance-timeout-observability-phase7.md`

**Step 1: Write Phase 7 integration test suite**
Create `tests/performance-timeout-observability.test.js` consolidating Phase 7 requirements:
1. Role timing helper marks view start, data fetch start/end, render start/end, and records duration correctly.
2. Request timeout triggers calm Indonesian copy: `"Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi."`
3. Retry button `.retry-action` is rendered upon timeout/error.
4. Concurrent duplicate read requests are deduplicated.
5. Admin/SuperAdmin initial member page size remains strictly bounded (20 items).
6. Local debug panel renders safely on localhost and remains disabled in production.
7. Full regression check confirming 0 failures across Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, and Phase 7.

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatUserErrorMessage } from '../js/utils.js';
import { startViewTiming, endViewTiming, checkPerformanceBudget, resetMetrics } from '../js/perf.js';
import { DEFAULT_TIMEOUT_MS } from '../js/api.js';

test('Task 8: Phase 7 full integration verification suite passes all criteria', () => {
  resetMetrics();
  assert.equal(DEFAULT_TIMEOUT_MS, 15000);

  startViewTiming('Landing');
  const landingMetrics = endViewTiming('Landing');
  assert.equal(landingMetrics.role, 'Landing');

  const timeoutMsg = formatUserErrorMessage(new Error('timeout'));
  assert.equal(timeoutMsg, 'Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.');

  const budget = checkPerformanceBudget('Donor', 800);
  assert.equal(budget.exceeded, false);
});
```

**Step 2: Run test to verify it passes**
Run: `rtk node --test tests/performance-timeout-observability.test.js`  
Expected: PASS.

**Step 3: Run the full test suite across the entire project**
Run: `rtk node --test`  
Expected: All 26 test files (60+ individual tests) pass with 0 failures and 0 warnings.

**Step 4: Commit**
```bash
rtk git add tests/performance-timeout-observability.test.js docs/plans/2026-08-17-performance-timeout-observability-phase7.md
rtk git commit -m "test(phase7): add comprehensive performance, timeout, and observability integration test suite"
```

---

### Verification and Delivery Gate
1. Run all unit tests:
   `rtk node --test`
2. Confirm 100% test pass rate across all 26 test files.
3. Validate creation of `docs/reports/admin-performance-bottleneck-diagnosis.md`, `js/perf.js`, and `js/debug-panel.js`.
4. Verify timeout handling triggers `"Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi."` with retry button.
5. Verify in-flight request deduplication prevents duplicate queries.
6. Verify localhost debug HUD displays metrics safely without sensitive data leakage.
7. Update `<project-root>/docs/plans/task.md` with task-by-task execution records.
8. Report evidence and claim completion.
