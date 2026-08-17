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

  // Check stored metric retrieval
  assert.deepEqual(getRoleMetrics('Admin'), metrics);
  assert.ok(getAllRoleMetrics().Admin);

  // Check privacy safety: no sensitive keys in metric object
  const serialized = JSON.stringify(metrics);
  assert.ok(!serialized.includes('0812'), 'Metrics must not contain phone numbers');
  assert.ok(!serialized.includes('whatsapp'), 'Metrics must not contain whatsapp keys');
  assert.ok(!serialized.includes('donorName'), 'Metrics must not contain donor names');
  assert.ok(!serialized.includes('token'), 'Metrics must not contain raw tokens');
  assert.ok(!serialized.includes('http'), 'Metrics must not contain proof URLs');
});

test('Task 1: Role timing handles all 5 distinct user roles (Landing, Donor, PIC, Admin, SuperAdmin)', () => {
  resetMetrics();
  const roles = ['Landing', 'Donor', 'PIC', 'Admin', 'SuperAdmin'];

  roles.forEach(role => {
    startViewTiming(role);
    markFetchStart(role, 'initialFetch');
    markFetchEnd(role, 'initialFetch', { recordCount: 5 });
    markRenderStart(role, 'mainRender');
    markRenderEnd(role, 'mainRender');
    const res = endViewTiming(role);
    assert.equal(res.role, role);
    assert.equal(res.recordCount, 5);
  });

  const allMetrics = getAllRoleMetrics();
  assert.equal(Object.keys(allMetrics).length, 5);
});
