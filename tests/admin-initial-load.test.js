import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserHarness } from './test-harness.js';

test('Task 4: Admin dashboard initializes critical summary and action queues before secondary sections', async () => {
  const callSequence = [];
  const harness = createBrowserHarness({
    customFetch: async (_url, fetchOpts) => {
      const body = JSON.parse(fetchOpts.body);
      callSequence.push(body.action);
      if (body.action === 'getDashboardSummary') {
        return { async text() { return JSON.stringify({ status: 'success', data: { campaignsByStatus: {}, totalDonors: 5 } }); } };
      }
      if (body.action === 'getPendingMembers' || body.action === 'getPendingLateRequests' || body.action === 'listAllCampaigns' || body.action === 'fetchAllMembers') {
        return { async text() { return JSON.stringify({ status: 'success', data: [] }); } };
      }
      return { async text() { return JSON.stringify({ status: 'success', data: {} }); } };
    }
  });

  const { loadAdminDashboard } = harness.context;
  assert.equal(typeof loadAdminDashboard, 'function');

  loadAdminDashboard();

  // Primary calls must occur immediately in initial batch
  assert.ok(callSequence.includes('getDashboardSummary'), 'Summary must be requested at start');
  assert.ok(callSequence.includes('getPendingMembers'), 'Pending members must be requested at start');
  assert.ok(callSequence.includes('getPendingLateRequests'), 'Late requests must be requested at start');
});

test('Task 4: Member pagination remains strictly limited to 20 items per initial render', () => {
  const harness = createBrowserHarness();
  const { renderMembersView, appState } = harness.context;

  // Generate 50 mock members
  const mockMembers = Array.from({ length: 50 }, (_, i) => ({
    Name: `Member ${i + 1}`,
    WhatsApp: `0812345678${i < 10 ? '0' + i : i}`,
    Role: 'Member',
    Status: 'Active'
  }));

  const html = renderMembersView(mockMembers, false, 'admin');

  // Should contain pagination controls
  assert.ok(html.includes('Menampilkan 20 dari 50 member'), 'Should show initial 20 item limit');
  assert.ok(html.includes('Muat lebih banyak'), 'Should provide pagination button');
  assert.equal(appState.memberPageSize.admin, 20);
});
