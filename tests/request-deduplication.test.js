import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, inFlightRequests } from '../js/api.js';

test('Task 5: Concurrent identical read requests share a single in-flight Promise', async () => {
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount++;
    // Simulate network latency
    await new Promise(res => setTimeout(res, 50));
    return {
      async text() {
        return JSON.stringify({ status: 'success', data: [{ id: 1, name: 'Test' }] });
      }
    };
  };

  // Launch 3 simultaneous requests for getPendingMembers
  const [res1, res2, res3] = await Promise.all([
    call('getPendingMembers', 'token-123'),
    call('getPendingMembers', 'token-123'),
    call('getPendingMembers', 'token-123')
  ]);

  assert.equal(fetchCount, 1, 'Concurrent identical read calls must trigger exactly 1 HTTP fetch');
  assert.deepEqual(res1, [{ id: 1, name: 'Test' }]);
  assert.deepEqual(res2, res1);
  assert.deepEqual(res3, res1);

  // After completion, in-flight map must be cleaned up
  assert.equal(inFlightRequests.size, 0, 'In-flight cache must clear completed requests');
});

test('Task 5: Mutating/write actions bypass read deduplication', async () => {
  let mutateCount = 0;
  global.fetch = async () => {
    mutateCount++;
    await new Promise(res => setTimeout(res, 20));
    return {
      async text() {
        return JSON.stringify({ status: 'success', data: 'ok' });
      }
    };
  };

  await Promise.all([
    call('adminUpdateMemberStatus', 'token-123', '08123', 'active'),
    call('adminUpdateMemberStatus', 'token-123', '08123', 'active')
  ]);

  assert.equal(mutateCount, 2, 'Mutating actions must never deduplicate');
});
