// Lightweight, privacy-safe role performance instrumentation helper

const roleMetricsStore = {};
const activeViewTimings = {};

export const ROLE_PERFORMANCE_BUDGETS = {
  Landing: 500,
  Donor: 1000,
  PIC: 2000,
  Admin: 3000,
  SuperAdmin: 3500
};

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
