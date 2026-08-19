const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execSync, spawnSync } = require('node:child_process');
const vm = require('node:vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'deployment', 'build-static.cjs');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const GITIGNORE_PATH = path.join(ROOT_DIR, '.gitignore');
const CHECKLIST_PATH = path.join(ROOT_DIR, 'docs', 'reports', 'production-deployment-checklist.md');

test('Deployment Build Task 1: scripts/deployment/build-static.cjs module exports and helpers', (t) => {
  assert.ok(fs.existsSync(BUILD_SCRIPT_PATH), 'build-static.cjs must exist');
  const buildModule = require(BUILD_SCRIPT_PATH);

  // Verify parseBoolean helper
  assert.strictEqual(buildModule.parseBoolean('true', false), true);
  assert.strictEqual(buildModule.parseBoolean('TRUE', false), true);
  assert.strictEqual(buildModule.parseBoolean('1', false), true);
  assert.strictEqual(buildModule.parseBoolean('yes', false), true);
  assert.strictEqual(buildModule.parseBoolean(true, false), true);

  assert.strictEqual(buildModule.parseBoolean('false', true), false);
  assert.strictEqual(buildModule.parseBoolean('FALSE', true), false);
  assert.strictEqual(buildModule.parseBoolean('0', true), false);
  assert.strictEqual(buildModule.parseBoolean('no', true), false);
  assert.strictEqual(buildModule.parseBoolean(false, true), false);

  assert.strictEqual(buildModule.parseBoolean(undefined, true), true);
  assert.strictEqual(buildModule.parseBoolean(null, false), false);
  assert.strictEqual(buildModule.parseBoolean('', true), true);

  // Verify formatEnvLocalJs formatting
  const mockConfig = {
    SUPABASE_URL: 'https://xyzcompany.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_pub_secret_key_123',
    BACKEND_MODE: 'supabase',
    ALLOW_GAS_FALLBACK: true,
    DEBUG: false,
    GAS_ENDPOINT: 'https://script.google.com/macros/s/xyz/exec'
  };
  const formattedCode = buildModule.formatEnvLocalJs(mockConfig);

  // Verify it evaluates cleanly and produces real booleans
  const sandbox = { window: {} };
  vm.runInNewContext(formattedCode, sandbox);
  const evaluated = sandbox.window.__DH_ENV__;

  assert.strictEqual(evaluated.SUPABASE_URL, 'https://xyzcompany.supabase.co');
  assert.strictEqual(evaluated.SUPABASE_PUBLISHABLE_KEY, 'sb_pub_secret_key_123');
  assert.strictEqual(evaluated.BACKEND_MODE, 'supabase');
  assert.strictEqual(evaluated.ALLOW_GAS_FALLBACK, true);
  assert.strictEqual(typeof evaluated.ALLOW_GAS_FALLBACK, 'boolean');
  assert.strictEqual(evaluated.DEBUG, false);
  assert.strictEqual(typeof evaluated.DEBUG, 'boolean');
  assert.strictEqual(evaluated.GAS_ENDPOINT, 'https://script.google.com/macros/s/xyz/exec');
});

test('Deployment Build Task 1: Production build mode requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY', (t) => {
  // Test with CF_PAGES=1 but missing variables -> should exit code 1
  const result = spawnSync('node', [BUILD_SCRIPT_PATH], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      CF_PAGES: '1',
      SUPABASE_URL: '',
      SUPABASE_PUBLISHABLE_KEY: ''
    },
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 1, 'Process should fail with exit code 1 when env vars missing');
  assert.match(
    result.stderr + result.stdout,
    /Missing required environment variable/i,
    'Should output missing environment variable message'
  );
});

test('Deployment Build Task 1: Production build mode generates dist/js/config/env.local.js with proper defaults', (t) => {
  const result = spawnSync('node', [BUILD_SCRIPT_PATH], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      CF_PAGES: '1',
      SUPABASE_URL: 'https://production-test.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_pub_prod_test_key',
      DH_BACKEND_MODE: '',
      DH_ALLOW_GAS_FALLBACK: '',
      DH_DEBUG: '',
      DH_GAS_ENDPOINT: ''
    },
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0, `Build script should succeed. Output: ${result.stdout} ${result.stderr}`);

  const distEnvPath = path.join(DIST_DIR, 'js', 'config', 'env.local.js');
  assert.ok(fs.existsSync(distEnvPath), 'dist/js/config/env.local.js must exist');

  const content = fs.readFileSync(distEnvPath, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(content, sandbox);
  const env = sandbox.window.__DH_ENV__;

  assert.strictEqual(env.SUPABASE_URL, 'https://production-test.supabase.co');
  assert.strictEqual(env.SUPABASE_PUBLISHABLE_KEY, 'sb_pub_prod_test_key');
  assert.strictEqual(env.BACKEND_MODE, 'auto', 'Default BACKEND_MODE should be auto');
  assert.strictEqual(env.ALLOW_GAS_FALLBACK, true, 'Default ALLOW_GAS_FALLBACK should be true');
  assert.strictEqual(typeof env.ALLOW_GAS_FALLBACK, 'boolean');
  assert.strictEqual(env.DEBUG, false, 'Default DEBUG should be false');
  assert.strictEqual(typeof env.DEBUG, 'boolean');
  assert.strictEqual(env.GAS_ENDPOINT, '');
});

test('Deployment Build Task 1: Build summary does not leak SUPABASE_PUBLISHABLE_KEY or GAS_ENDPOINT', (t) => {
  const secretKey = 'sb_pub_ultra_secret_test_value_9999';
  const gasSecret = 'https://script.google.com/macros/s/super-secret-gas-url/exec';

  const result = spawnSync('node', [BUILD_SCRIPT_PATH], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      CF_PAGES: '1',
      SUPABASE_URL: 'https://prod.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: secretKey,
      DH_GAS_ENDPOINT: gasSecret
    },
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0);
  const combinedOutput = result.stdout + result.stderr;

  // The summary must NOT contain the key or gas URL
  assert.strictEqual(
    combinedOutput.includes(secretKey),
    false,
    'Build stdout/stderr must not leak SUPABASE_PUBLISHABLE_KEY'
  );
  assert.strictEqual(
    combinedOutput.includes(gasSecret),
    false,
    'Build stdout/stderr must not leak GAS_ENDPOINT'
  );
  assert.match(combinedOutput, /Static Build Complete/);
  assert.match(combinedOutput, /Dist Output Path/);
  assert.match(combinedOutput, /Copied Assets/);
});

test('Deployment Build Task 1: dist folder contains only allowed static frontend assets and excludes sensitive folders', (t) => {
  // Run local build
  const result = spawnSync('node', [BUILD_SCRIPT_PATH], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      CF_PAGES: '',
      CI: ''
    },
    encoding: 'utf8'
  });

  assert.strictEqual(result.status, 0);

  // Allowed files/dirs
  assert.ok(fs.existsSync(path.join(DIST_DIR, 'index.html')), 'dist/index.html must exist');
  assert.ok(fs.existsSync(path.join(DIST_DIR, 'css')), 'dist/css must exist');
  assert.ok(fs.existsSync(path.join(DIST_DIR, 'js')), 'dist/js must exist');
  assert.ok(fs.existsSync(path.join(DIST_DIR, 'assets')), 'dist/assets must exist');
  assert.ok(fs.existsSync(path.join(DIST_DIR, '_headers')), 'dist/_headers must exist');
  assert.ok(fs.existsSync(path.join(DIST_DIR, 'robots.txt')), 'dist/robots.txt must exist');
  assert.ok(fs.existsSync(path.join(DIST_DIR, 'js', 'config', 'env.local.js')), 'dist/js/config/env.local.js must exist');

  // Strictly excluded files/dirs
  const forbiddenPaths = [
    path.join(DIST_DIR, '.env'),
    path.join(DIST_DIR, '.env.local'),
    path.join(DIST_DIR, '.env.production'),
    path.join(DIST_DIR, '.git'),
    path.join(DIST_DIR, 'node_modules'),
    path.join(DIST_DIR, 'docs'),
    path.join(DIST_DIR, 'reports'),
    path.join(DIST_DIR, 'supabase'),
    path.join(DIST_DIR, 'scripts'),
    path.join(DIST_DIR, 'tests'),
    path.join(DIST_DIR, 'data'),
    path.join(DIST_DIR, 'legacy'),
    path.join(DIST_DIR, 'package.json'),
    path.join(DIST_DIR, 'package-lock.json'),
    path.join(DIST_DIR, 'appsscript.json'),
    path.join(DIST_DIR, 'Code.js'),
    path.join(DIST_DIR, 'build-dist.js')
  ];

  for (const forbidden of forbiddenPaths) {
    assert.strictEqual(
      fs.existsSync(forbidden),
      false,
      `Forbidden asset ${path.basename(forbidden)} must not exist in dist/`
    );
  }
});

test('Deployment Build Task 2: package.json includes build script', (t) => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  assert.strictEqual(
    pkg.scripts.build,
    'node scripts/deployment/build-static.cjs',
    'package.json scripts.build must point to node scripts/deployment/build-static.cjs'
  );
});

test('Deployment Build Task 3: .gitignore includes all required entries', (t) => {
  const gitignoreContent = fs.readFileSync(GITIGNORE_PATH, 'utf8');
  const lines = gitignoreContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const required = [
    'js/config/env.local.js',
    'dist/',
    '.env',
    '.env.local',
    '.env.production'
  ];

  for (const item of required) {
    const matched = lines.some(line => line === item || line === `${item}/` || line === item.replace(/\/$/, ''));
    assert.ok(matched, `.gitignore must contain rule: ${item}`);
  }
});

test('Deployment Build Task 4: docs/reports/production-deployment-checklist.md contains required sections', (t) => {
  assert.ok(fs.existsSync(CHECKLIST_PATH), 'production-deployment-checklist.md must exist');
  const content = fs.readFileSync(CHECKLIST_PATH, 'utf8');

  // Verify sections and key information
  assert.match(content, /Cloudflare Pages/i);
  assert.match(content, /SUPABASE_URL/);
  assert.match(content, /SUPABASE_PUBLISHABLE_KEY/);
  assert.match(content, /npm run build|node scripts\/deployment\/build-static\.cjs/);
  assert.match(content, /dist/);
  assert.match(content, /Smoke Test/i);
  assert.match(content, /Rollback/i);
  assert.match(content, /Security/i);
});
