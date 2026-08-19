import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function createAuthTestEnvironment(options = {}) {
  const localStorageStore = new Map();
  const storage = {
    getItem: (k) => (localStorageStore.has(k) ? localStorageStore.get(k) : null),
    setItem: (k, v) => { localStorageStore.set(k, String(v)); },
    removeItem: (k) => { localStorageStore.delete(k); },
    clear: () => { localStorageStore.clear(); }
  };

  const elements = new Map();
  function getOrCreateElement(id) {
    if (!elements.has(id)) {
      const classList = new Set();
      const el = {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        style: {},
        disabled: false,
        classList: {
          add: (cls) => classList.add(cls),
          remove: (cls) => classList.delete(cls),
          contains: (cls) => classList.has(cls),
          toggle: (cls) => {
            if (classList.has(cls)) classList.delete(cls);
            else classList.add(cls);
          }
        }
      };
      elements.set(id, el);
    }
    return elements.get(id);
  }

  // Pre-seed known DOM elements for auth views
  ['u-wa', 'u-name', 'u-status', 'u-login-error', 'u-register-fields', 'btn-u-login',
   't-token', 't-login-error', 'btn-t-login', 'u-display-name', 'campaign-list',
   'pic-create-btn-container', 'profile-modal', 'toast', 'view-landing', 'view-user-login',
   'view-user-dashboard', 'view-token-login', 'view-pic-dashboard', 'view-admin-dashboard',
   'view-superadmin-dashboard', 'btn-return-admin'].forEach(getOrCreateElement);

  const document = {
    getElementById: (id) => getOrCreateElement(id),
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      id: '',
      style: {},
      innerHTML: '',
      textContent: '',
      appendChild: () => {},
      classList: { add() {}, remove() {}, contains: () => false }
    }),
    body: { appendChild: () => {} },
    addEventListener: () => {},
    readyState: 'complete',
    title: 'Donatur Helper'
  };

  const windowObj = {
    location: {
      hash: options.hash || '',
      search: options.search || '',
      origin: 'http://localhost:4173',
      pathname: '/'
    },
    localStorage: storage,
    history: { replaceState() {} },
    addEventListener: () => {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AudioContext: class {
      createOscillator() { return { connect() {}, frequency: { setValueAtTime() {} }, start() {}, stop() {} }; }
      createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
      get currentTime() { return 0; }
      get destination() { return {}; }
    },
    __DH_ENV__: {
      BACKEND_MODE: 'supabase',
      ALLOW_GAS_FALLBACK: true,
      DEBUG: true,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'test-pub-key'
    },
    supabase: {
      createClient: () => options.mockSupabaseClient || {}
    }
  };

  const context = vm.createContext({
    console,
    window: windowObj,
    document,
    localStorage: storage,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  });

  return { context, elements, localStorageStore };
}

test('Task 1: tokenLogin verifies valid Admin token via verify_auth_token RPC, stores session, and routes to Admin dashboard', async () => {
  let rpcCalledWith = null;

  const mockClient = {
    rpc: async (fn, params) => {
      rpcCalledWith = { fn, params };
      if (fn === 'verify_auth_token') {
        if (params.p_token === 'ADM-SUPER123') {
          return {
            data: [{
              token_id: 'token-uuid-1',
              role: 'ADMIN',
              status: 'ACTIVE',
              linked_campaign_id: null,
              alias: 'Admin Mirda',
              created_by: 'superadmin',
              created_at: '2026-08-19T00:00:00Z',
              expires_at: '2026-12-31T23:59:59Z'
            }],
            error: null
          };
        }
      }
      return { data: [], error: null };
    }
  };

  const { context } = createAuthTestEnvironment({
    mockSupabaseClient: mockClient
  });

  // Load modules
  const supabaseClientCode = fs.readFileSync(path.resolve('js/services/supabaseClient.js'), 'utf8')
    .replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2')
    .replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(supabaseClientCode, context);

  const backendAdapterCode = fs.readFileSync(path.resolve('js/services/backendAdapter.js'), 'utf8')
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2')
    .replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(backendAdapterCode, context);

  // Directly verify backendAdapter loginWithToken
  const res = await context.fetchBackend('loginWithToken', ['ADM-SUPER123']);
  assert.strictEqual(rpcCalledWith.fn, 'verify_auth_token');
  assert.strictEqual(rpcCalledWith.params.p_token, 'ADM-SUPER123');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.role, 'Admin');
  assert.strictEqual(res.alias, 'Admin Mirda');
  assert.strictEqual(res.status, 'ACTIVE');

  // Verify object payload support { token: 'ADM-SUPER123' }
  const resObj = await context.fetchBackend('loginWithToken', [{ token: 'ADM-SUPER123' }]);
  assert.strictEqual(resObj.role, 'Admin');
  assert.strictEqual(resObj.alias, 'Admin Mirda');
});

test('Task 2: tokenLogin handles PIC and SuperAdmin roles, expired/revoked errors, and updates UI state', async () => {
  const mockClient = {
    rpc: async (fn, params) => {
      if (fn === 'verify_auth_token') {
        if (params.p_token === 'PIC-CAMPAIGN1') {
          return {
            data: [{
              token_id: 'pic-uuid-1',
              role: 'PIC',
              status: 'ACTIVE',
              linked_campaign_id: 'CAMP-001',
              alias: 'PIC Wanda'
            }],
            error: null
          };
        }
        if (params.p_token === 'SA-ROOT') {
          return {
            data: [{
              token_id: 'sa-uuid-1',
              role: 'SUPER_ADMIN',
              status: 'ACTIVE',
              linked_campaign_id: null,
              alias: 'Root Admin'
            }],
            error: null
          };
        }
        if (params.p_token === 'EXPIRED-TOKEN') {
          return {
            data: [{
              token_id: 'exp-uuid-1',
              role: 'ADMIN',
              status: 'EXPIRED',
              alias: 'Old Admin'
            }],
            error: null
          };
        }
        if (params.p_token === 'REVOKED-TOKEN') {
          return {
            data: [{
              token_id: 'rev-uuid-1',
              role: 'PIC',
              status: 'REVOKED',
              alias: 'Bad PIC'
            }],
            error: null
          };
        }
        return { data: [], error: null };
      }
      return { data: null, error: new Error('Unknown RPC') };
    }
  };

  const { context } = createAuthTestEnvironment({ mockSupabaseClient: mockClient });
  const supabaseClientCode = fs.readFileSync(path.resolve('js/services/supabaseClient.js'), 'utf8')
    .replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2')
    .replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(supabaseClientCode, context);

  const backendAdapterCode = fs.readFileSync(path.resolve('js/services/backendAdapter.js'), 'utf8')
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2')
    .replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(backendAdapterCode, context);

  // PIC role check
  const picRes = await context.fetchBackend('loginWithToken', ['PIC-CAMPAIGN1']);
  assert.strictEqual(picRes.role, 'PIC');
  assert.strictEqual(picRes.linkedCampaignId, 'CAMP-001');

  // SuperAdmin role check
  const saRes = await context.fetchBackend('loginWithToken', ['SA-ROOT']);
  assert.strictEqual(saRes.role, 'SuperAdmin');

  // Expired token check
  await assert.rejects(
    async () => context.fetchBackend('loginWithToken', ['EXPIRED-TOKEN']),
    /Token sudah kedaluwarsa/
  );

  // Revoked token check
  await assert.rejects(
    async () => context.fetchBackend('loginWithToken', ['REVOKED-TOKEN']),
    /Token telah dinonaktifkan/
  );

  // Non-existent token check
  await assert.rejects(
    async () => context.fetchBackend('loginWithToken', ['UNKNOWN-TOKEN']),
    /Token tidak valid/
  );
});

test('Task 3: checkDonorWhatsApp handles active members, pending members, not-found, and invalid phone formats', async () => {
  const mockClient = {
    rpc: async (fn, params) => {
      if (fn === 'get_donor_dashboard') {
        const wa = params.p_whatsapp;
        if (wa === '08123456789') {
          return {
            data: {
              identity: {
                name: 'Budi Santoso',
                alias: 'Budi',
                whatsapp_masked: '+62812****789',
                member_status: 'ACTIVE',
                is_registered_member: true
              },
              summary: { total_joined: 2 },
              joined_campaigns: [],
              open_campaigns: []
            },
            error: null
          };
        }
        if (wa === '08999999999') {
          return {
            data: {
              identity: {
                name: 'Pending User',
                alias: 'Pending',
                whatsapp_masked: '+62899****999',
                member_status: 'PENDING',
                is_registered_member: true
              },
              summary: {},
              joined_campaigns: [],
              open_campaigns: []
            },
            error: null
          };
        }
        if (wa === '08111111111') {
          return {
            data: {
              error: 'not_found',
              message: 'Data tidak ditemukan.'
            },
            error: null
          };
        }
        if (wa === '12345') {
          return {
            data: {
              error: 'invalid_input',
              message: 'Nomor WhatsApp tidak valid. Silakan periksa kembali nomor Anda.'
            },
            error: null
          };
        }
      }
      return { data: null, error: new Error('Unknown RPC') };
    }
  };

  const { context } = createAuthTestEnvironment({ mockSupabaseClient: mockClient });
  const supabaseClientCode = fs.readFileSync(path.resolve('js/services/supabaseClient.js'), 'utf8')
    .replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2')
    .replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(supabaseClientCode, context);

  const backendAdapterCode = fs.readFileSync(path.resolve('js/services/backendAdapter.js'), 'utf8')
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2')
    .replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(backendAdapterCode, context);

  // 1. Active member check
  const activeRes = await context.fetchBackend('checkDonorWhatsApp', ['08123456789']);
  assert.strictEqual(activeRes.exists, true);
  assert.strictEqual(activeRes.name, 'Budi Santoso');
  assert.strictEqual(activeRes.status, 'active');
  assert.strictEqual(activeRes.verified, true);
  assert.strictEqual(activeRes.pending, false);

  // Also test object argument { whatsapp: '08123456789' }
  const activeResObj = await context.fetchBackend('checkDonorWhatsApp', [{ whatsapp: '08123456789' }]);
  assert.strictEqual(activeResObj.name, 'Budi Santoso');
  assert.strictEqual(activeResObj.exists, true);

  // 2. Pending member check
  const pendingRes = await context.fetchBackend('checkDonorWhatsApp', ['08999999999']);
  assert.strictEqual(pendingRes.exists, true);
  assert.strictEqual(pendingRes.pending, true);
  assert.strictEqual(pendingRes.name, 'Pending User');

  // 3. Not-found check
  const notFoundRes = await context.fetchBackend('checkDonorWhatsApp', ['08111111111']);
  assert.strictEqual(notFoundRes.exists, false);

  // 4. Invalid phone check
  await assert.rejects(
    async () => context.fetchBackend('checkDonorWhatsApp', ['12345']),
    /Nomor WhatsApp tidak valid/
  );
});

test('Task 4: registerUser registers a new member via register_donor_member RPC and maps response', async () => {
  const mockClient = {
    rpc: async (fn, params) => {
      if (fn === 'register_donor_member') {
        return {
          data: {
            success: true,
            action: 'register_donor_member',
            message: 'Pendaftaran berhasil. Akun Anda menunggu persetujuan admin.',
            member: {
              name: params.p_name,
              whatsapp_masked: '+62812****999',
              status: 'PENDING',
              role: 'MEMBER'
            }
          },
          error: null
        };
      }
      return { data: null, error: new Error('Unknown RPC') };
    }
  };

  const { context } = createAuthTestEnvironment({ mockSupabaseClient: mockClient });
  const supabaseClientCode = fs.readFileSync(path.resolve('js/services/supabaseClient.js'), 'utf8')
    .replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2')
    .replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(supabaseClientCode, context);

  const backendAdapterCode = fs.readFileSync(path.resolve('js/services/backendAdapter.js'), 'utf8')
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2')
    .replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(backendAdapterCode, context);

  const regRes = await context.fetchBackend('registerUser', ['Dewi Lestari', '081299999999', 'active']);
  assert.strictEqual(regRes.exists, true);
  assert.strictEqual(regRes.name, 'Dewi Lestari');
  assert.strictEqual(regRes.pending, true);
  assert.strictEqual(regRes.status, 'active');
  assert.strictEqual(regRes.maskedWhatsapp, '+62812****999');

  // Also test object argument { name, whatsapp, empStatus }
  const regObjRes = await context.fetchBackend('registerUser', [{
    name: 'Dewi Lestari',
    whatsapp: '081299999999',
    empStatus: 'ex'
  }]);
  assert.strictEqual(regObjRes.exists, true);
  assert.strictEqual(regObjRes.name, 'Dewi Lestari');
  assert.strictEqual(regObjRes.status, 'ex');
});

test('Task 5: Session storage keys match exact legacy contracts for admin, pic, and donor views', () => {
  const authFile = fs.readFileSync(path.resolve('js/views/auth.js'), 'utf8');

  // Verify auth_token, auth_role, auth_alias, and donor_user safeSet calls exist
  assert.ok(authFile.includes("safeSet('auth_token', token)"), 'Must store auth_token on token login');
  assert.ok(authFile.includes("safeSet('auth_role', res.role)"), 'Must store auth_role on token login');
  assert.ok(authFile.includes("safeSet('auth_alias', res.alias)"), 'Must store auth_alias on token login');
  assert.ok(authFile.includes("safeSet('donor_user', JSON.stringify("), 'Must store donor_user on donor login and registration');

  // Verify safeRemove calls for cleanup on logout
  assert.ok(authFile.includes("safeRemove('donor_user')"), 'Must clean up donor_user on logoutUser');
  assert.ok(authFile.includes("safeRemove('auth_token')"), 'Must clean up auth_token on logoutToken');
  assert.ok(authFile.includes("safeRemove('auth_role')"), 'Must clean up auth_role on logoutToken');
});

test('Task 6: initApp automatically extracts ?token= URL parameter and invokes loginToken', () => {
  const appFile = fs.readFileSync(path.resolve('js/app.js'), 'utf8');

  assert.ok(appFile.includes("urlParams.get('token')"), 'initApp must parse ?token= from URL search params');
  assert.ok(appFile.includes("loginToken("), 'initApp must call loginToken when token parameter is present');
});

