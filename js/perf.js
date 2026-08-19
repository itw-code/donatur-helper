const roleMetricsStore = {};
const activeViewTimings = {};

export const ROLE_PERFORMANCE_BUDGETS = { Landing: 500, Donor: 1000, PIC: 2000, Admin: 3000, SuperAdmin: 3500 };

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export function resetMetrics() {
  for (const k of Object.keys(roleMetricsStore)) delete roleMetricsStore[k];
  for (const k of Object.keys(activeViewTimings)) delete activeViewTimings[k];
}

export function startViewTiming(roleName) {
  const startTime = now();
  activeViewTimings[roleName] = { role: roleName, viewStartTime: startTime, fetches: {}, renders: {}, cumulativeFetchMs: 0, cumulativeRenderMs: 0, recordCount: 0, errorCount: 0, timeoutCount: 0 };
  return startTime;
}

export function markFetchStart(roleName, actionName) {
  const t = activeViewTimings[roleName];
  if (t) t.fetches[actionName] = { startTime: now() };
}

export function markFetchEnd(roleName, actionName, meta = {}) {
  const t = activeViewTimings[roleName];
  if (!t || !t.fetches[actionName]) return;
  const f = t.fetches[actionName];
  f.endTime = now();
  f.durationMs = f.endTime - f.startTime;
  t.cumulativeFetchMs += f.durationMs;
  if (typeof meta.recordCount === 'number') t.recordCount += meta.recordCount;
  if (meta.isError) t.errorCount++;
  if (meta.isTimeout) t.timeoutCount++;
}

export function markRenderStart(roleName, sectionName) {
  const t = activeViewTimings[roleName];
  if (t) t.renders[sectionName] = { startTime: now() };
}

export function markRenderEnd(roleName, sectionName) {
  const t = activeViewTimings[roleName];
  if (!t || !t.renders[sectionName]) return;
  const r = t.renders[sectionName];
  r.endTime = now();
  r.durationMs = r.endTime - r.startTime;
  t.cumulativeRenderMs += r.durationMs;
}

export function endViewTiming(roleName) {
  const t = activeViewTimings[roleName];
  if (!t) return roleMetricsStore[roleName] || null;
  const endTime = now();
  const total = Math.max(0, endTime - t.viewStartTime);
  const snapshot = {
    role: roleName,
    viewStartTime: t.viewStartTime,
    viewEndTime: endTime,
    totalDurationMs: Math.round(total * 100) / 100,
    fetchDurationMs: Math.round(t.cumulativeFetchMs * 100) / 100,
    renderDurationMs: Math.round(t.cumulativeRenderMs * 100) / 100,
    recordCount: t.recordCount,
    errorCount: t.errorCount,
    timeoutCount: t.timeoutCount,
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
  return { role: roleName, budgetMs, actualMs, exceeded, overMs: exceeded ? Math.round((actualMs - budgetMs) * 100) / 100 : 0 };
}
