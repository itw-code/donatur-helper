const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const { getAppScript } = require('./test-harness');
const inlineScript = getAppScript();

function makeElement(id = 'elem') {
  const classes = new Set();
  const attributes = new Map();
  const children = [];
  const el = {
    id,
    checked: false,
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        if (force === true || (force === undefined && !classes.has(name))) {
          classes.add(name);
          return true;
        }
        classes.delete(name);
        return false;
      }
    },
    style: {},
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    children,
    appendChild(child) {
      children.push(child);
    },
    click() {
      if (typeof this.onclick === 'function') this.onclick();
    },
    focus() {},
    setAttribute(k, v) { attributes.set(k, String(v)); },
    getAttribute(k) { return attributes.get(k) || null; },
    scrollIntoView() {},
    querySelector(sel) {
      return makeElement('child_' + sel);
    },
    querySelectorAll() {
      return [];
    }
  };
  return el;
}

function createSuperAdminHarness(options = {}) {
  const elements = new Map();
  const storage = new Map(Object.entries(options.initialStorage || {}));
  const rpcCalls = [];

  const getElement = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };

  const document = {
    title: 'Donatur Helper',
    body: {
      appendChild(element) {
        if (element && element.id) elements.set(element.id, element);
      },
      removeChild() {}
    },
    addEventListener() {},
    createElement(tagName) { return makeElement(tagName); },
    getElementById: getElement,
    querySelector(sel) {
      if (sel.startsWith('#')) return getElement(sel.slice(1));
      return makeElement('queried_' + sel);
    },
    querySelectorAll(sel) {
      if (sel === '#admin-action-queue [id^="admin-queue-"]') {
        return [getElement('admin-queue-pending'), getElement('admin-queue-late')];
      }
      return [];
    }
  };

  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };

  const mockSupabaseClient = {
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (options.rpcHandler) {
        const customRes = options.rpcHandler(fn, params);
        if (customRes !== undefined) return customRes;
      }
      if (fn === 'get_superadmin_dashboard_stage1') {
        return {
          data: options.stage1Data || {
            token: { alias: 'SuperAdmin Bela', role: 'SUPER_ADMIN', status: 'ACTIVE' },
            summary: {
              members: {
                total_members: 50,
                active_members: 45,
                pending_members: 3,
                rejected_members: 1,
                deleted_members: 0,
                ex_members: 1,
                admin_members: 2
              },
              campaigns: {
                total_campaigns: 6,
                open_campaigns: 3,
                closed_campaigns: 1,
                finalized_campaigns: 2,
                archived_campaigns: 0,
                overdue_open_campaigns: 0
              },
              donors: {
                total_donors: 42,
                pledged_donors: 10,
                paid_donors: 32,
                verified_donors: 30,
                refunded_donors: 0,
                total_paid: 850000,
                outstanding_amount: 150000
              },
              tokens: {
                total_tokens: 10,
                active_tokens: 5,
                unused_tokens: 3,
                expired_tokens: 1,
                revoked_tokens: 1,
                pic_tokens: 7,
                admin_tokens: 2,
                superadmin_tokens: 1
              },
              late_requests: {
                total_late_requests: 2,
                pending_late_requests: 1,
                approved_late_requests: 1,
                rejected_late_requests: 0,
                duplicate_late_requests: 0
              },
              settings: {
                total_settings: 5,
                secret_settings: 1
              }
            },
            pending_members_list: [
              {
                id: 'm-pending-1',
                name: 'Budi Santoso',
                whatsapp: '081234567890',
                role: 'MEMBER',
                status: 'PENDING',
                added_by: 'Self-Registered - active',
                added_at: '2026-08-18T10:00:00Z'
              }
            ],
            pending_late_requests: [
              {
                request_id: 'lr-101',
                campaign_id: 'c-101',
                target_name: 'Kado Pernikahan Siti',
                pic: 'Andi PIC',
                donor_name: 'Donatur Susulan',
                donor_whatsapp: '089876543210',
                is_custom: false,
                custom_amount: 0,
                reason: 'Baru tahu info campaign',
                created_at: '2026-08-18T11:00:00Z'
              }
            ],
            settings: [
              { key: 'EnableRounding', value: true, is_secret: false, updated_at: '2026-08-18T00:00:00Z' },
              { key: 'RoundToNearest', value: 500, is_secret: false, updated_at: '2026-08-18T00:00:00Z' },
              { key: 'RequireMemberValidation', value: true, is_secret: false, updated_at: '2026-08-18T00:00:00Z' },
              { key: 'AdminNotificationEmails', value: 'sa@example.com', is_secret: false, updated_at: '2026-08-18T00:00:00Z' },
              { key: 'AppUrl', value: 'https://don4pro.com', is_secret: false, updated_at: '2026-08-18T00:00:00Z' },
              { key: 'SecretApiKey', value: '***', is_secret: true, updated_at: '2026-08-18T00:00:00Z' }
            ],
            server_time: '2026-08-18T12:00:00Z'
          },
          error: null
        };
      }
      if (fn === 'get_admin_campaigns') {
        return {
          data: {
            campaigns: [
              {
                id: 'c-101',
                campaign_id: 'c-101',
                target_name: 'Kado Pernikahan Siti',
                reason: 'Pernikahan',
                gift_amount: 500000,
                status: 'Open',
                deadline: '2026-08-25',
                pic_name: 'Andi PIC',
                donor_count: 10,
                paid_count: 8,
                modified_by: 'Admin',
                modified_at: '2026-08-18'
              }
            ],
            pagination: { page: 1, page_size: 50, total_records: 1, total_pages: 1 }
          },
          error: null
        };
      }
      if (fn === 'get_admin_members') {
        return {
          data: {
            members: [
              { id: 'm1', name: 'Budi Santoso', whatsapp: '081234567890', role: 'Member', status: 'Active', modified_by: 'System' }
            ],
            pagination: { page: 1, page_size: 50, total_records: 1, total_pages: 1 }
          },
          error: null
        };
      }
      if (fn === 'superadmin_update_settings') {
        return { data: { success: true, settings: params.p_settings }, error: null };
      }
      if (fn === 'superadmin_generate_admin_token') {
        return { data: { success: true, token: 'SA-ADMIN-TOKEN-999' }, error: null };
      }
      return { data: null, error: { message: `Unknown RPC: ${fn}` } };
    }
  };

  const logs = [];
  const mockConsole = {
    log: (...args) => {
      logs.push(args.join(' '));
      console.log(...args);
    },
    error: (...args) => {
      logs.push(args.join(' '));
      console.error(...args);
    },
    warn: (...args) => console.warn(...args),
    info: (...args) => console.info(...args)
  };

  let gasCalls = [];
  const windowObj = {
    location: {
      hostname: 'localhost',
      href: 'http://localhost',
      hash: '',
      search: '',
      origin: 'http://localhost',
      pathname: '/'
    },
    matchMedia: () => ({ matches: false }),
    localStorage,
    history: { replaceState() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    addEventListener: () => {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URLSearchParams,
    URL,
    __DH_ENV__: {
      BACKEND_MODE: options.backendMode || 'auto',
      ALLOW_GAS_FALLBACK: options.allowGasFallback !== false,
      DEBUG: options.debug !== false,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'test-pub-key'
    },
    supabase: {
      createClient: () => mockSupabaseClient
    }
  };

  const context = {
    window: windowObj,
    document,
    localStorage,
    console: mockConsole,
    URLSearchParams,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async (_url, opts) => {
      if (opts && opts.body) {
        const parsed = JSON.parse(opts.body);
        gasCalls.push(parsed);
      }
      if (options.customFetch) {
        return options.customFetch(_url, opts);
      }
      return {
        async text() {
          return JSON.stringify({ status: 'success', data: 'GAS_SUCCESS' });
        }
      };
    },
    __MOCK_SUPABASE_CLIENT__: mockSupabaseClient
  };

  windowObj.document = document;

  vm.createContext(context);
  vm.runInContext(inlineScript, context);

  return { context, elements, storage, rpcCalls, gasCalls, logs };
}

test('SuperAdmin Dashboard Stage 1 executes single getSettingsForSuperAdmin call mapped to get_superadmin_dashboard_stage1 RPC', async () => {
  const harness = createSuperAdminHarness();
  const { loadSuperAdminStage1 } = harness.context;

  assert.equal(typeof loadSuperAdminStage1, 'function', 'loadSuperAdminStage1 must be exported');

  harness.storage.set('auth_token', 'sa-secret-token');
  harness.storage.set('auth_role', 'SuperAdmin');
  harness.rpcCalls.length = 0;

  const data = await loadSuperAdminStage1();

  assert.ok(data, 'Stage 1 must return data');
  assert.equal(harness.rpcCalls.length, 1, 'Stage 1 must execute exactly 1 RPC call');
  assert.equal(harness.rpcCalls[0].fn, 'get_superadmin_dashboard_stage1');
  assert.equal(harness.rpcCalls[0].params.p_token, 'sa-secret-token');

  // Verify Summary Card rendered on sa-summary
  const summaryEl = harness.elements.get('sa-summary');
  assert.ok(summaryEl, 'sa-summary element must exist');
  assert.ok(summaryEl.innerHTML.includes('Ringkasan Operasional'), 'Summary header must render');
  assert.ok(summaryEl.innerHTML.includes('Total donatur'), 'Donors metric must render');
  assert.ok(summaryEl.innerHTML.includes('42'), 'Donors count 42 must render');
  assert.ok(summaryEl.innerHTML.includes('Token PIC: 3 belum dipakai, 5 aktif, 1 kedaluwarsa.'), 'Token counts must render');
  assert.ok(summaryEl.innerHTML.includes('Members: 50 total di database (45 aktif).'), 'Members count must render');

  // Verify Pending Members rendered on sa-pending-members
  const pendingEl = harness.elements.get('sa-pending-members');
  assert.ok(pendingEl, 'sa-pending-members element must exist');
  assert.ok(pendingEl.innerHTML.includes('Budi Santoso'), 'Pending member name must render');
  assert.ok(pendingEl.innerHTML.includes('081234567890'), 'Pending member WA must render');

  // Verify Pending Late Requests rendered on sa-late-donors
  const lateEl = harness.elements.get('sa-late-donors');
  assert.ok(lateEl, 'sa-late-donors element must exist');
  assert.ok(lateEl.innerHTML.includes('Kado Pernikahan Siti'), 'Late request target name must render');
  assert.ok(lateEl.innerHTML.includes('Donatur Susulan'), 'Late request donor name must render');

  // Verify Settings panel inputs populated
  const roundingEl = harness.elements.get('sa-rounding');
  const roundToEl = harness.elements.get('sa-roundto');
  const validationEl = harness.elements.get('sa-validation');
  const notifEmailsEl = harness.elements.get('sa-notification-emails');
  const appUrlEl = harness.elements.get('sa-app-url');

  assert.equal(roundingEl.checked, true, 'EnableRounding checkbox must be checked');
  assert.equal(roundToEl.value, 500, 'RoundToNearest value must be 500');
  assert.equal(validationEl.checked, true, 'RequireMemberValidation checkbox must be checked');
  assert.equal(notifEmailsEl.value, 'sa@example.com', 'Notification emails must match');
  assert.equal(appUrlEl.value, 'https://don4pro.com', 'App URL must match');
});

test('SuperAdmin Settings Rendering handles is_secret masking properly', () => {
  const harness = createSuperAdminHarness();
  const { renderSuperAdminSettings } = harness.context;

  assert.equal(typeof renderSuperAdminSettings, 'function', 'renderSuperAdminSettings must be exported');

  const sampleSettings = [
    { key: 'EnableRounding', value: false, is_secret: false },
    { key: 'RoundToNearest', value: 1000, is_secret: false },
    { key: 'RequireMemberValidation', value: false, is_secret: false },
    { key: 'AdminNotificationEmails', value: 'secret-email@test.com', is_secret: true },
    { key: 'AppUrl', value: 'https://custom.url', is_secret: false }
  ];

  renderSuperAdminSettings(sampleSettings);

  const roundingEl = harness.elements.get('sa-rounding');
  const roundToEl = harness.elements.get('sa-roundto');
  const validationEl = harness.elements.get('sa-validation');
  const notifEmailsEl = harness.elements.get('sa-notification-emails');
  const appUrlEl = harness.elements.get('sa-app-url');

  assert.equal(roundingEl.checked, false);
  assert.equal(roundToEl.value, 1000);
  assert.equal(validationEl.checked, false);
  assert.equal(notifEmailsEl.value, '***', 'Secret setting must be displayed as ***');
  assert.equal(appUrlEl.value, 'https://custom.url');
});

test('SuperAdmin Mutations execute mapped Supabase RPCs', async () => {
  const harness = createSuperAdminHarness();
  harness.storage.set('auth_token', 'sa-secret-token');
  harness.storage.set('auth_role', 'SuperAdmin');

  const { saveSettings, genAdminToken } = harness.context;

  // Test saveSettings RPC
  harness.rpcCalls.length = 0;
  saveSettings();
  await new Promise(resolve => setTimeout(resolve, 50));
  const settingsCall = harness.rpcCalls.find(c => c.fn === 'superadmin_update_settings');
  assert.ok(settingsCall, 'superadmin_update_settings RPC must be called');
  assert.equal(settingsCall.params.p_token, 'sa-secret-token');

  // Test genAdminToken RPC
  harness.rpcCalls.length = 0;
  const aliasInput = harness.context.document.getElementById('sa-admin-alias');
  aliasInput.value = 'Admin Unit Test';
  genAdminToken();
  await new Promise(resolve => setTimeout(resolve, 50));
  const tokenCall = harness.rpcCalls.find(c => c.fn === 'superadmin_generate_admin_token');
  assert.ok(tokenCall, 'superadmin_generate_admin_token RPC must be called');
  assert.equal(tokenCall.params.p_token, 'sa-secret-token');
});

test('SuperAdmin runDataSweep shows migration in progress notice when deferred', async () => {
  const harness = createSuperAdminHarness({
    backendMode: 'supabase',
    allowGasFallback: false
  });
  harness.storage.set('auth_token', 'sa-secret-token');
  harness.storage.set('auth_role', 'SuperAdmin');

  const { runDataSweep } = harness.context;

  runDataSweep();
  await new Promise(resolve => setTimeout(resolve, 50));

  const sweepMsg = harness.context.document.getElementById('sa-sweep-msg');
  assert.ok(sweepMsg.innerHTML.includes('Fitur SuperAdmin ini sedang dalam proses migrasi'), 'Sweep message must inform about migration');
});

test('SuperAdmin Dashboard Stage 1 gracefully handles RPC errors with retry buttons', async () => {
  const harness = createSuperAdminHarness({
    allowGasFallback: false,
    rpcHandler: (fn) => {
      if (fn === 'get_superadmin_dashboard_stage1') {
        return { data: null, error: { message: 'Database query timeout' } };
      }
      return undefined;
    }
  });

  harness.storage.set('auth_token', 'sa-secret-token');
  harness.storage.set('auth_role', 'SuperAdmin');

  const { loadSuperAdminStage1 } = harness.context;

  try {
    await loadSuperAdminStage1();
  } catch (err) {
    // Expected to throw
  }

  const summaryEl = harness.context.document.getElementById('sa-summary');
  assert.ok(summaryEl.innerHTML.includes('Ringkasan belum dapat dimuat.'), 'Summary error message must render');
  assert.ok(summaryEl.innerHTML.includes('Coba lagi'), 'Retry button must render');

  const pendingEl = harness.context.document.getElementById('sa-pending-members');
  assert.ok(pendingEl.innerHTML.includes('Pendaftaran belum dapat dimuat.'), 'Pending error message must render');

  const lateEl = harness.context.document.getElementById('sa-late-donors');
  assert.ok(lateEl.innerHTML.includes('Gagal memuat pengajuan.'), 'Late requests error message must render');

  const msgEl = harness.context.document.getElementById('sa-settings-msg');
  assert.ok(msgEl.innerHTML.includes('Pengaturan belum dapat dimuat.'), 'Settings error message must render');
});

test('Debug logging does not leak secret values, phone numbers, or token hashes', async () => {
  const harness = createSuperAdminHarness({ debug: true });
  harness.storage.set('auth_token', 'sa-secret-token-12345');
  harness.storage.set('auth_role', 'SuperAdmin');

  const { loadSuperAdminStage1 } = harness.context;
  await loadSuperAdminStage1();

  const joinedLogs = harness.logs.join(' ');
  assert.ok(!joinedLogs.includes('sa-secret-token-12345'), 'Logs must NOT contain superadmin token');
  assert.ok(!joinedLogs.includes('081234567890'), 'Logs must NOT contain phone numbers');
  assert.ok(!joinedLogs.includes('SecretApiKey'), 'Logs must NOT contain secret settings keys');
});
