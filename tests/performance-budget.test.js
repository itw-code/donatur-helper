import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROLE_PERFORMANCE_BUDGETS, checkPerformanceBudget } from '../js/perf.js';

test('Task 2 & Task 7: Performance budgets and baseline thresholds are defined and enforced in assets and runtime', () => {
  // Check CSS size budget (<60KB total) and no render-blocking @import
  const cssDir = path.resolve('css');
  const cssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
  assert.ok(cssFiles.length >= 3, 'Must have at least 3 modular CSS files');
  
  let totalCssBytes = 0;
  for (const file of cssFiles) {
    const content = fs.readFileSync(path.join(cssDir, file), 'utf8');
    assert.ok(!content.includes('@import'), `File css/${file} must not contain render-blocking @import`);
    totalCssBytes += Buffer.byteLength(content, 'utf8');
  }
  assert.ok(totalCssBytes < 60000, `Total CSS size (${totalCssBytes}B) must be under 60KB budget`);

  // Check JS size budget (<250KB total uncompressed, which compresses to <50KB on wire)
  const jsDir = path.resolve('js');
  function getJsFiles(dir) {
    let files = [];
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) files.push(...getJsFiles(full));
      else if (item.endsWith('.js')) files.push(full);
    }
    return files;
  }
  const jsFiles = getJsFiles(jsDir);
  assert.ok(jsFiles.length >= 8, 'Must have modular JS views and utilities');
  
  let totalJsBytes = 0;
  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    totalJsBytes += Buffer.byteLength(content, 'utf8');
  }
  assert.ok(totalJsBytes < 250000, `Total JS size (${totalJsBytes}B) must be under 250KB uncompressed budget`);

  // Verify role runtime budgets
  assert.equal(ROLE_PERFORMANCE_BUDGETS.Landing, 500, 'Landing budget <= 500ms');
  assert.equal(ROLE_PERFORMANCE_BUDGETS.Donor, 1000, 'Donor budget <= 1000ms');
  assert.equal(ROLE_PERFORMANCE_BUDGETS.PIC, 2000, 'PIC budget <= 2000ms');
  assert.equal(ROLE_PERFORMANCE_BUDGETS.Admin, 3000, 'Admin budget <= 3000ms');
  assert.equal(ROLE_PERFORMANCE_BUDGETS.SuperAdmin, 3500, 'SuperAdmin budget <= 3500ms');

  // Verify checkPerformanceBudget helper
  const adminOk = checkPerformanceBudget('Admin', 2200);
  assert.equal(adminOk.exceeded, false);
  assert.equal(adminOk.overMs, 0);

  const adminOver = checkPerformanceBudget('Admin', 3800);
  assert.equal(adminOver.exceeded, true);
  assert.equal(adminOver.overMs, 800);

  // Verify index.html contains no blocking scripts or @import
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  assert.ok(indexHtml.includes('<script type="module" src="js/app.js" defer></script>'), 'App JS must be deferred module');
  assert.ok(indexHtml.includes('flatpickr.min.js') && indexHtml.includes('defer'), 'Flatpickr must load with defer');
  assert.ok(!indexHtml.includes('@import'), 'index.html must not contain @import');

  // Verify preconnect links are declared for font and CDN origins
  assert.ok(indexHtml.includes('rel="preconnect" href="https://fonts.googleapis.com"'), 'Must preconnect to fonts.googleapis.com');
  assert.ok(indexHtml.includes('rel="preconnect" href="https://fonts.gstatic.com"'), 'Must preconnect to fonts.gstatic.com');
  assert.ok(indexHtml.includes('rel="preconnect" href="https://cdn.jsdelivr.net"'), 'Must preconnect to cdn.jsdelivr.net');
});
