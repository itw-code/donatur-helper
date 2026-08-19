const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createTestContext(overrides = {}) {
  const windowObj = {
    location: { hash: '', search: '', origin: 'http://localhost:4173', pathname: '/' },
    history: { replaceState() {} },
    addEventListener() {},
    setTimeout,
    clearTimeout,
    ...(overrides.window || {})
  };

  const context = {
    console,
    window: windowObj,
    fetch: overrides.fetch || (async () => ({ text: async () => JSON.stringify({ status: 'success', data: [] }) })),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URLSearchParams,
    AbortController,
    ...overrides
  };

  return vm.createContext(context);
}

test('Supabase Foundation Task 3 & 4: Env config files and .gitignore rules', () => {
  // Check env.example.js exists and has the required structure
  const examplePath = path.join(__dirname, '..', 'js', 'config', 'env.example.js');
  assert.ok(fs.existsSync(examplePath), 'js/config/env.example.js must exist');
  const exampleContent = fs.readFileSync(examplePath, 'utf8');

  assert.match(exampleContent, /window\.__DH_ENV__\s*=\s*\{/);
  assert.match(exampleContent, /SUPABASE_URL/);
  assert.match(exampleContent, /SUPABASE_PUBLISHABLE_KEY/);
  assert.match(exampleContent, /BACKEND_MODE/);
  assert.match(exampleContent, /ALLOW_GAS_FALLBACK/);
  assert.match(exampleContent, /DEBUG/);

  // Security checks: comments must explain secrets are forbidden
  assert.match(exampleContent, /SUPABASE_SECRET_KEY/i);
  assert.match(exampleContent, /SUPABASE_SERVICE_ROLE_KEY/i);

  // Check env.local.js exists
  const localPath = path.join(__dirname, '..', 'js', 'config', 'env.local.js');
  assert.ok(fs.existsSync(localPath), 'js/config/env.local.js must exist');

  // Check .gitignore contains js/config/env.local.js
  const gitignorePath = path.join(__dirname, '..', '.gitignore');
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  assert.ok(gitignoreContent.includes('js/config/env.local.js'), '.gitignore must ignore js/config/env.local.js');
});

test('Supabase Foundation Task 5: supabaseClient initialization and safety', () => {
  const context = createTestContext({
    window: {
      __DH_ENV__: {
        SUPABASE_URL: 'https://test-project.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sbp_test_publishable_key',
        BACKEND_MODE: 'supabase',
        ALLOW_GAS_FALLBACK: true,
        DEBUG: true
      },
      supabase: {
        createClient: (url, key, opts) => ({
          _isMockClient: true,
          url,
          key,
          opts,
          rpc: async (fn, params) => ({ data: { success: true }, error: null })
        })
      }
    }
  });

  const clientPath = path.join(__dirname, '..', 'js', 'services', 'supabaseClient.js');
  let code = fs.readFileSync(clientPath, 'utf8');
  code = code.replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2');
  code = code.replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');

  vm.runInContext(code, context);

  // Check window.__dhSupabase API
  assert.ok(context.window.__dhSupabase, 'window.__dhSupabase must be exposed');
  assert.strictEqual(typeof context.window.__dhSupabase.getClient, 'function');
  assert.strictEqual(typeof context.window.__dhSupabase.isConfigured, 'function');

  assert.strictEqual(context.window.__dhSupabase.isConfigured(), true);
  const client1 = context.window.__dhSupabase.getClient();
  assert.ok(client1 && client1._isMockClient, 'Client must be instantiated');
  const client2 = context.window.__dhSupabase.getClient();
  assert.strictEqual(client1, client2, 'Supabase client must be a singleton instance');
});

test('Supabase Foundation Task 5: supabaseClient gracefully handles missing credentials', () => {
  const context = createTestContext({
    window: {
      __DH_ENV__: {
        SUPABASE_URL: '',
        SUPABASE_PUBLISHABLE_KEY: '',
        BACKEND_MODE: 'supabase',
        DEBUG: false
      }
    }
  });

  const clientPath = path.join(__dirname, '..', 'js', 'services', 'supabaseClient.js');
  let code = fs.readFileSync(clientPath, 'utf8');
  code = code.replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2');
  code = code.replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');

  vm.runInContext(code, context);

  assert.strictEqual(context.window.__dhSupabase.isConfigured(), false);
  assert.strictEqual(context.window.__dhSupabase.getClient(), null);
});

test('Supabase Foundation Task 6 & 7: backendAdapter routes and normalizes migrated actions', async () => {
  const rpcCalls = [];
  const mockClient = {
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (fn === 'verify_auth_token') {
        if (params.p_token === 'VALID_ADMIN') {
          return {
            data: [{
              token_id: '12345',
              role: 'ADMIN',
              status: 'ACTIVE',
              linked_campaign_id: null,
              alias: 'Admin One'
            }],
            error: null
          };
        }
        return { data: [], error: null };
      }
      if (fn === 'get_admin_dashboard_stage1') {
        return {
          data: {
            summary: {
              total_members: 10,
              active_members: 8,
              open_campaigns: 2,
              total_donors: 15,
              total_collected: 500000
            },
            pending_members_list: [
              { id: 'm1', name: 'Budi', whatsapp: '+628123456789', added_at: '2026-08-19' }
            ],
            pending_late_requests: [
              { request_id: 'REQ-1', target_name: 'Farah', donor_name: 'Ani', donor_whatsapp: '+62811111111' }
            ]
          },
          error: null
        };
      }
      if (fn === 'register_donor_member') {
        return {
          data: {
            success: true,
            action: 'register_donor_member',
            message: 'Pendaftaran berhasil.',
            member: { name: params.p_name, whatsapp_masked: '+62812****', status: 'PENDING', role: 'MEMBER' }
          },
          error: null
        };
      }
      if (fn === 'generate_seamless_pic_token') {
        return {
          data: {
            success: true,
            token: 'PIC-TEST1234',
            role: 'PIC',
            status: 'UNUSED'
          },
          error: null
        };
      }
      if (fn === 'join_campaign') {
        return { data: { success: true, donor: { campaign_id: params.p_campaign_id } }, error: null };
      }
      if (fn === 'withdraw_campaign') {
        return { data: { success: true, donor_status: 'WITHDRAWN' }, error: null };
      }
      if (fn === 'close_campaign_list') {
        return { data: { success: true, status: 'CLOSED' }, error: null };
      }
      if (fn === 'reopen_campaign_list') {
        return { data: { success: true, status: 'OPEN' }, error: null };
      }
      if (fn === 'finalize_campaign') {
        return { data: { success: true, status: 'FINALIZED' }, error: null };
      }
      if (fn === 'update_campaign_gift_proof') {
        return { data: { success: true, gift_link: params.p_link }, error: null };
      }
      if (fn === 'verify_donor_payment') {
        return { data: { success: true, verified: params.p_is_valid }, error: null };
      }
      if (fn === 'verify_all_donor_payments') {
        return { data: { success: true, verified_count: 5 }, error: null };
      }
      if (fn === 'request_late_donor') {
        return { data: { success: true, request_id: 'REQ-NEW' }, error: null };
      }
      if (fn === 'archive_campaign_pic') {
        return { data: { success: true, status: 'ARCHIVED' }, error: null };
      }
      if (fn === 'delete_campaign_pic') {
        return { data: { success: true, message: 'Deleted' }, error: null };
      }
      if (fn === 'admin_update_member_status') {
        return { data: { success: true, status: params.p_new_status }, error: null };
      }
      if (fn === 'admin_approve_late_donor') {
        return { data: { success: true, status: 'APPROVED' }, error: null };
      }
      return { data: { success: true }, error: null };
    }
  };

  const context = createTestContext({
    window: {
      __DH_ENV__: {
        SUPABASE_URL: 'https://test-project.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sbp_test_publishable_key',
        BACKEND_MODE: 'supabase',
        ALLOW_GAS_FALLBACK: true,
        DEBUG: true
      },
      supabase: {
        createClient: () => mockClient
      }
    }
  });

  const clientPath = path.join(__dirname, '..', 'js', 'services', 'supabaseClient.js');
  let clientCode = fs.readFileSync(clientPath, 'utf8');
  clientCode = clientCode.replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2');
  clientCode = clientCode.replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(clientCode, context);

  const adapterPath = path.join(__dirname, '..', 'js', 'services', 'backendAdapter.js');
  let adapterCode = fs.readFileSync(adapterPath, 'utf8');
  adapterCode = adapterCode.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  adapterCode = adapterCode.replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2');
  adapterCode = adapterCode.replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(adapterCode, context);

  // Test 1: loginWithToken
  const authRes = await context.fetchBackend('loginWithToken', ['VALID_ADMIN']);
  assert.strictEqual(authRes.role, 'Admin');
  assert.strictEqual(authRes.alias, 'Admin One');

  // Test 2: getDashboardSummary
  const summaryRes = await context.fetchBackend('getDashboardSummary', ['VALID_ADMIN']);
  assert.strictEqual(summaryRes.totalMembers, 10);
  assert.strictEqual(summaryRes.campaignsByStatus.Open, 2);

  // Test 3: getPendingMembers
  const pendingMembers = await context.fetchBackend('getPendingMembers', ['VALID_ADMIN']);
  assert.strictEqual(pendingMembers.length, 1);
  assert.strictEqual(pendingMembers[0].Name, 'Budi');
  assert.strictEqual(pendingMembers[0].WhatsApp, '+628123456789');

  // Test 4: getPendingLateRequests
  const lateRequests = await context.fetchBackend('getPendingLateRequests', ['VALID_ADMIN']);
  assert.strictEqual(lateRequests.length, 1);
  assert.strictEqual(lateRequests[0].reqId, 'REQ-1');

  // Test 5: registerUser
  const regRes = await context.fetchBackend('registerUser', ['Eko', '08123456789', 'active']);
  assert.strictEqual(regRes.exists, true);
  assert.strictEqual(regRes.pending, true);

  // Test 6: generateSeamlessPicToken
  const picToken = await context.fetchBackend('generateSeamlessPicToken', ['08123456789']);
  assert.strictEqual(picToken, 'PIC-TEST1234');

  // Test 7: picVerifyAllPayments
  const countRes = await context.fetchBackend('picVerifyAllPayments', ['PIC-TOKEN', 'CAMP-1']);
  assert.strictEqual(countRes, 5);

  // Test 8: adminUpdateMemberStatus
  const updateRes = await context.fetchBackend('adminUpdateMemberStatus', ['VALID_ADMIN', '+628123456789', 'ACTIVE']);
  assert.strictEqual(updateRes.success, true);
});

test('Supabase Foundation Task 8 & 10: Debug logging and health check', () => {
  const context = createTestContext({
    window: {
      __DH_ENV__: {
        SUPABASE_URL: 'https://test-project.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sbp_test_publishable_key',
        BACKEND_MODE: 'supabase',
        ALLOW_GAS_FALLBACK: true,
        DEBUG: true
      },
      supabase: {
        createClient: () => ({
          _mock: true
        })
      }
    }
  });

  const clientPath = path.join(__dirname, '..', 'js', 'services', 'supabaseClient.js');
  let clientCode = fs.readFileSync(clientPath, 'utf8');
  clientCode = clientCode.replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2');
  clientCode = clientCode.replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(clientCode, context);

  const adapterPath = path.join(__dirname, '..', 'js', 'services', 'backendAdapter.js');
  let adapterCode = fs.readFileSync(adapterPath, 'utf8');
  adapterCode = adapterCode.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  adapterCode = adapterCode.replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2');
  adapterCode = adapterCode.replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
  vm.runInContext(adapterCode, context);

  assert.strictEqual(typeof context.window.__dhHealthCheck, 'function');
  const health = context.window.__dhHealthCheck();
  assert.strictEqual(health.status, 'healthy');
  assert.strictEqual(health.supabaseConfigured, true);
  assert.strictEqual(health.backendMode, 'supabase');
  assert.strictEqual(health.allowGasFallback, true);
  // Ensure no sensitive keys are in the health check output
  assert.strictEqual(health.SUPABASE_PUBLISHABLE_KEY, undefined);
  assert.strictEqual(health.SUPABASE_URL, undefined);
});
