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
  resetMetrics,
  checkPerformanceBudget,
  ROLE_PERFORMANCE_BUDGETS
} from '../js/perf.js';
import { formatUserErrorMessage } from '../js/utils.js';
import { DEFAULT_TIMEOUT_MS, call, inFlightRequests } from '../js/api.js';
import { isLocalhostDebugEnabled, renderDebugPanelHtml } from '../js/debug-panel.js';
import { createBrowserHarness } from './test-harness.js';

test('Task 8 (Gate 1): Role-based performance timing instrument all 5 roles without PII leakage', () => {
  resetMetrics();
  const roles = ['Landing', 'Donor', 'PIC', 'Admin', 'SuperAdmin'];

  roles.forEach((role, idx) => {
    startViewTiming(role);
    markFetchStart(role, 'mainData');
    markFetchEnd(role, 'mainData', { recordCount: (idx + 1) * 5 });
    markRenderStart(role, 'mainUi');
    markRenderEnd(role, 'mainUi');
    const snapshot = endViewTiming(role);

    assert.equal(snapshot.role, role);
    assert.equal(snapshot.recordCount, (idx + 1) * 5);
    assert.ok(typeof snapshot.totalDurationMs === 'number');
    assert.ok(typeof snapshot.fetchDurationMs === 'number');
    assert.ok(typeof snapshot.renderDurationMs === 'number');

    // Verify privacy safety
    const str = JSON.stringify(snapshot);
    assert.ok(!str.includes('0812'), 'Must not contain phone numbers');
    assert.ok(!str.includes('password'), 'Must not contain passwords');
    assert.ok(!str.includes('token-'), 'Must not contain raw tokens');
  });

  const allMetrics = getAllRoleMetrics();
  assert.equal(Object.keys(allMetrics).length, 5);
});

test('Task 8 (Gate 2): Timeout hardening with calm Indonesian copy and DEFAULT_TIMEOUT_MS', () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 15000);
  
  const timeoutErr = new Error('The user aborted a request.');
  timeoutErr.isTimeout = true;
  assert.equal(
    formatUserErrorMessage(timeoutErr),
    'Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.'
  );

  assert.equal(
    formatUserErrorMessage('timeout of 15000ms exceeded'),
    'Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.'
  );
});

test('Task 8 (Gate 3): In-flight query deduplication and polling throttling', async () => {
  let fetchCounter = 0;
  global.fetch = async () => {
    fetchCounter++;
    await new Promise(r => setTimeout(r, 40));
    return {
      async text() {
        return JSON.stringify({ status: 'success', data: { campaigns: 5 } });
      }
    };
  };

  const results = await Promise.all([
    call('listAllCampaigns', 'token-abc'),
    call('listAllCampaigns', 'token-abc'),
    call('listAllCampaigns', 'token-abc')
  ]);

  assert.equal(fetchCounter, 1, '3 concurrent reads must execute exactly 1 HTTP fetch');
  assert.equal(results[0].campaigns, 5);
  assert.equal(inFlightRequests.size, 0);
});

test('Task 8 (Gate 4): Admin staged loading sequence and pagination preservation', async () => {
  const actions = [];
  const harness = createBrowserHarness({
    customFetch: async (_url, opts) => {
      const body = JSON.parse(opts.body);
      actions.push(body.action);
      if (body.action === 'getDashboardSummary') {
        return { async text() { return JSON.stringify({ status: 'success', data: { totalDonors: 10 } }); } };
      }
      return { async text() { return JSON.stringify({ status: 'success', data: [] }); } };
    }
  });

  const { loadAdminDashboard, renderMembersView, appState } = harness.context;
  loadAdminDashboard();

  assert.ok(actions.includes('getDashboardSummary'));

  // Test pagination preservation
  const members = Array.from({ length: 30 }, (_, i) => ({
    Name: `Member ${i + 1}`,
    WhatsApp: `08120000${i < 10 ? '0' + i : i}`,
    Role: 'Member',
    Status: 'Active'
  }));

  const renderedHtml = renderMembersView(members, false, 'admin');
  assert.ok(renderedHtml.includes('Menampilkan 20 dari 30 member'));
  assert.ok(renderedHtml.includes('Muat lebih banyak'));
  assert.equal(appState.memberPageSize.admin, 20);
});

test('Task 8 (Gate 5): Localhost debug panel renders and enforces performance budgets', () => {
  resetMetrics();
  assert.equal(isLocalhostDebugEnabled({ hostname: 'localhost' }), true);
  assert.equal(isLocalhostDebugEnabled({ hostname: 'don4tpro.pages.dev' }), false);

  startViewTiming('Landing');
  markRenderStart('Landing', 'hero');
  markRenderEnd('Landing', 'hero');
  endViewTiming('Landing');

  const budgetLanding = checkPerformanceBudget('Landing', 450);
  assert.equal(budgetLanding.exceeded, false);

  const budgetAdminOver = checkPerformanceBudget('Admin', 3500);
  assert.equal(budgetAdminOver.exceeded, true);
  assert.equal(budgetAdminOver.overMs, 500);

  const html = renderDebugPanelHtml();
  assert.ok(html.includes('Observabilitas Kinerja (Localhost)'));
  assert.ok(html.includes('Landing'));
});
