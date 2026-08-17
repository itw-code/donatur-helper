const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function getIndexHtml() {
  return fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
}

function getFileContent(relPath) {
  const fullPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

test('Task 1: CSS files exist and are properly modularized', () => {
  const baseCss = getFileContent('css/base.css');
  const componentsCss = getFileContent('css/components.css');
  const viewsCss = getFileContent('css/views.css');

  assert.ok(baseCss, 'css/base.css must exist');
  assert.ok(componentsCss, 'css/components.css must exist');
  assert.ok(viewsCss, 'css/views.css must exist');

  // Base CSS assertions
  assert.match(baseCss, /:root\s*\{/, 'css/base.css must define :root tokens');
  assert.match(baseCss, /--primary:\s*#047857/, 'css/base.css must contain --primary token');
  assert.match(baseCss, /\.skip-link/, 'css/base.css must contain .skip-link styles');
  assert.match(baseCss, /:focus-visible/, 'css/base.css must contain :focus-visible styles');

  // Components CSS assertions
  assert.match(componentsCss, /\.card\b/, 'css/components.css must define .card');
  assert.match(componentsCss, /\.btn\b/, 'css/components.css must define .btn');
  assert.match(componentsCss, /\.badge\b/, 'css/components.css must define .badge');
  assert.match(componentsCss, /\.modal\b|#toast/, 'css/components.css must define modal or toast');

  // Views CSS assertions
  assert.match(viewsCss, /#view-landing|\.admin-nav-bar|#view-pic-dashboard/, 'css/views.css must define view-specific styles');

  // index.html checks
  const html = getIndexHtml();
  assert.match(html, /<link\s+rel="stylesheet"\s+href="css\/base\.css"/i, 'index.html must link css/base.css');
  assert.match(html, /<link\s+rel="stylesheet"\s+href="css\/components\.css"/i, 'index.html must link css/components.css');
  assert.match(html, /<link\s+rel="stylesheet"\s+href="css\/views\.css"/i, 'index.html must link css/views.css');

  // Ensure monolithic inline <style> block is removed
  const inlineStyleMatches = html.match(/<style[\s\S]*?>([\s\S]*?)<\/style>/gi);
  if (inlineStyleMatches) {
    for (const styleTag of inlineStyleMatches) {
      const lineCount = styleTag.split('\n').length;
      assert.ok(lineCount < 50, `Inline <style> tag too large (${lineCount} lines). Should be extracted to external CSS.`);
    }
  }
});
