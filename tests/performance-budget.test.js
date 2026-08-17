import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 2: Performance budgets and baseline thresholds are defined and enforced in assets', () => {
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

  // Check JS size budget (<200KB total uncompressed, which compresses to <50KB on wire)
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
  assert.ok(totalJsBytes < 200000, `Total JS size (${totalJsBytes}B) must be under 200KB uncompressed budget`);

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
