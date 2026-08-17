import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLocalhostDebugEnabled,
  renderDebugPanelHtml,
  mountDebugPanel
} from '../js/debug-panel.js';
import {
  startViewTiming,
  markFetchStart,
  markFetchEnd,
  markRenderStart,
  markRenderEnd,
  endViewTiming,
  resetMetrics
} from '../js/perf.js';

test('Task 6: isLocalhostDebugEnabled returns true only for localhost or explicit debug flag', () => {
  assert.equal(isLocalhostDebugEnabled({ hostname: 'localhost' }), true);
  assert.equal(isLocalhostDebugEnabled({ hostname: '127.0.0.1' }), true);
  assert.equal(isLocalhostDebugEnabled({ hostname: 'app.localhost' }), true);
  assert.equal(isLocalhostDebugEnabled({ hostname: 'don4tpro.pages.dev' }), false);
  assert.equal(isLocalhostDebugEnabled({ hostname: 'donaturhelper.com' }), false);
  assert.equal(isLocalhostDebugEnabled({ hostname: 'don4tpro.pages.dev' }, true), true);
});

test('Task 6: renderDebugPanelHtml renders formatted metrics and budget status for all active roles', () => {
  resetMetrics();

  startViewTiming('Admin');
  markFetchStart('Admin', 'getDashboardSummary');
  markFetchEnd('Admin', 'getDashboardSummary', { recordCount: 10 });
  markRenderStart('Admin', 'summary');
  markRenderEnd('Admin', 'summary');
  endViewTiming('Admin');

  startViewTiming('PIC');
  markFetchStart('PIC', 'getCampaignForPic');
  markFetchEnd('PIC', 'getCampaignForPic', { recordCount: 8 });
  markRenderStart('PIC', 'donorList');
  markRenderEnd('PIC', 'donorList');
  endViewTiming('PIC');

  const html = renderDebugPanelHtml();

  assert.ok(html.includes('Observabilitas Kinerja (Localhost)'), 'Must include header');
  assert.ok(html.includes('Admin'), 'Must render Admin metric block');
  assert.ok(html.includes('PIC'), 'Must render PIC metric block');
  assert.ok(html.includes('Total:'), 'Must show total duration');
  assert.ok(html.includes('Fetch:'), 'Must show fetch duration');
  assert.ok(html.includes('Render:'), 'Must show render duration');
  assert.ok(html.includes('10 item') || html.includes('10 record'), 'Must show record count');

  // Privacy assertion
  assert.ok(!html.includes('08123'), 'Debug panel must never contain phone numbers');
  assert.ok(!html.includes('token-'), 'Debug panel must never contain raw tokens');
});
