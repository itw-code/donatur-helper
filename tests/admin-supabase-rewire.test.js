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
    querySelectorAll(sel) {
      return [];
    }
  };
  return el;
}

function createAdminHarness(options = {}) {
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
      if (fn === 'get_admin_dashboard_stage1') {
        return {
          data: options.stage1Data || {
            summary: {
              campaigns_by_status: { Open: 3, Closed: 1, Finalized: 2 },
              total_donors: 42,
              total_pending: 150000,
              total_collected: 850000,
              pic_tokens: { unused: 2, active: 4, expired: 1 },
              total_members: 50,
              active_members: 45
            },
            pending_members_list: [
              { id: 'm1', name: 'Budi Santoso', whatsapp: '081234567890', added_by: 'Self-Registered - active', added_at: '2026-08-18' }
            ],
            pending_late_requests: [
              {
                request_id: 'lr-1',
                campaign_id: 'c-101',
                target_name: 'Kado Pernikahan Siti',
                pic: 'Andi PIC',
                donor_name: 'Donatur Baru',
                donor_whatsapp: '089876543210',
                is_custom: false,
                custom_amount: 0,
                reason: 'Baru tahu info campaign',
                created_at: '2026-08-18'
              }
            ]
          },
          error: null
        };
      }
      if (fn === 'get_admin_campaigns') {
        return {
          data: options.campaignsData || {
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
          data: options.membersData || {
            members: [
              { id: 'm1', name: 'Budi Santoso', whatsapp: '081234567890', role: 'Member', status: 'Active', modified_by: 'System' },
              { id: 'm2', name: 'Citra Dewi', whatsapp: '081234567891', role: 'PIC', status: 'Active', modified_by: 'Admin' }
            ],
            pagination: { page: 1, page_size: 50, total_records: 2, total_pages: 1 }
          },
          error: null
        };
      }
      if (fn === 'admin_update_member_status') {
        return { data: { success: true, whatsapp: params.p_whatsapp, new_status: params.p_new_status }, error: null };
      }
      if (fn === 'admin_approve_late_donor') {
        return { data: { success: true, req_id: params.p_req_id, is_approved: params.p_is_approved }, error: null };
      }
      return { data: null, error: { message: `Unknown RPC: ${fn}` } };
    }
  };

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
      BACKEND_MODE: 'supabase',
      ALLOW_GAS_FALLBACK: true,
      DEBUG: true,
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
    console,
    URLSearchParams,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async () => ({
      async text() { return JSON.stringify({ status: 'success', data: {} }); }
    }),
    __MOCK_SUPABASE_CLIENT__: mockSupabaseClient
  };

  windowObj.document = document;

  vm.createContext(context);
  vm.runInContext(inlineScript, context);

  return { context, elements, storage, rpcCalls };
}

test('Admin Dashboard Stage 1 executes single getDashboardSummary call and populates Summary, Pending Members, and Late Requests', async () => {
  const harness = createAdminHarness();
  const { loadAdminStage1 } = harness.context;

  assert.equal(typeof loadAdminStage1, 'function', 'loadAdminStage1 must be exported');

  harness.storage.set('auth_token', 'valid-admin-token');
  harness.storage.set('auth_role', 'Admin');
  harness.rpcCalls.length = 0;

  const stage1Promise = loadAdminStage1('admin');
  const data = await stage1Promise;

  assert.ok(data, 'Stage 1 must return data');
  assert.equal(harness.rpcCalls.length, 1, 'Stage 1 must execute exactly 1 RPC call');
  assert.equal(harness.rpcCalls[0].fn, 'get_admin_dashboard_stage1');
  assert.equal(harness.rpcCalls[0].params.p_token, 'valid-admin-token');

  // Verify Summary Card rendered
  const summaryEl = harness.elements.get('admin-summary');
  assert.ok(summaryEl, 'admin-summary element must exist');
  assert.ok(summaryEl.innerHTML.includes('Ringkasan Operasional'), 'Summary header must render');
  assert.ok(summaryEl.innerHTML.includes('Total donatur'), 'Donors metric must render');
  assert.ok(summaryEl.innerHTML.includes('42'), 'Donors count 42 must render');

  // Verify Pending Members rendered
  const pendingEl = harness.elements.get('admin-pending-members');
  assert.ok(pendingEl, 'admin-pending-members element must exist');
  assert.ok(pendingEl.innerHTML.includes('Budi Santoso'), 'Pending member name must render');
  assert.ok(pendingEl.innerHTML.includes('081234567890'), 'Pending member WA must render');

  // Verify Late Requests rendered
  const lateEl = harness.elements.get('admin-late-donors');
  assert.ok(lateEl, 'admin-late-donors element must exist');
  assert.ok(lateEl.innerHTML.includes('Kado Pernikahan Siti'), 'Late request target name must render');
  assert.ok(lateEl.innerHTML.includes('Donatur Baru'), 'Late request donor name must render');
});

test('Admin Dashboard Stage 2 loads paginated campaigns via listAllCampaigns and maps to get_admin_campaigns RPC', async () => {
  const harness = createAdminHarness();
  const { refreshAdminCampaigns } = harness.context;

  assert.equal(typeof refreshAdminCampaigns, 'function', 'refreshAdminCampaigns must be exported');

  harness.storage.set('auth_token', 'valid-admin-token');
  harness.storage.set('auth_role', 'Admin');
  harness.rpcCalls.length = 0;
  const campaigns = await refreshAdminCampaigns(1, 50, 'all');

  assert.ok(Array.isArray(campaigns), 'Campaigns result must be an array');
  assert.equal(campaigns.length, 1);

  const campaignRpc = harness.rpcCalls.find(c => c.fn === 'get_admin_campaigns');
  assert.ok(campaignRpc, 'get_admin_campaigns RPC must be called');
  assert.equal(campaignRpc.params.p_token, 'valid-admin-token');
  assert.equal(campaignRpc.params.p_page, 1);
  assert.equal(campaignRpc.params.p_page_size, 50);

  const listEl = harness.elements.get('admin-campaign-list');
  assert.ok(listEl, 'admin-campaign-list element must exist');
  assert.ok(listEl.innerHTML.includes('Kado Pernikahan Siti'), 'Campaign target name must render');
});

test('Admin Dashboard Stage 2 loads paginated members via fetchAllMembers and maps to get_admin_members RPC', async () => {
  const harness = createAdminHarness();
  const { refreshMembers } = harness.context;

  assert.equal(typeof refreshMembers, 'function', 'refreshMembers must be exported');

  harness.storage.set('auth_token', 'valid-admin-token');
  harness.storage.set('auth_role', 'Admin');
  harness.rpcCalls.length = 0;
  const members = await refreshMembers(1, 50, null, 'all', 'all');

  assert.ok(Array.isArray(members), 'Members result must be an array');
  assert.equal(members.length, 2);

  const membersRpc = harness.rpcCalls.find(c => c.fn === 'get_admin_members');
  assert.ok(membersRpc, 'get_admin_members RPC must be called');
  assert.equal(membersRpc.params.p_token, 'valid-admin-token');
  assert.equal(membersRpc.params.p_page, 1);
  assert.equal(membersRpc.params.p_page_size, 50);

  const memberListEl = harness.elements.get('admin-member-list');
  assert.ok(memberListEl, 'admin-member-list element must exist');
  assert.ok(memberListEl.innerHTML.includes('Budi Santoso'), 'Member Budi Santoso must render');
  assert.ok(memberListEl.innerHTML.includes('Citra Dewi'), 'Member Citra Dewi must render');
});

test('Admin mutation approvePending calls adminUpdateMemberStatus RPC', async () => {
  const harness = createAdminHarness();
  const { approvePending } = harness.context;

  assert.equal(typeof approvePending, 'function', 'approvePending must be exported');

  harness.storage.set('auth_token', 'valid-admin-token');
  harness.storage.set('auth_role', 'Admin');
  harness.rpcCalls.length = 0;
  approvePending('081234567890', 'active', 'admin-pending-members');

  // Allow async execution
  await new Promise(resolve => setTimeout(resolve, 50));

  const updateRpc = harness.rpcCalls.find(c => c.fn === 'admin_update_member_status');
  assert.ok(updateRpc, 'admin_update_member_status RPC must be called');
  assert.equal(updateRpc.params.p_token, 'valid-admin-token');
  assert.equal(updateRpc.params.p_whatsapp, '081234567890');
  assert.equal(updateRpc.params.p_new_status, 'active');
});

test('Admin mutation executeApproveLateDonor calls admin_approve_late_donor RPC', async () => {
  const harness = createAdminHarness();
  const { executeApproveLateDonor } = harness.context;

  assert.equal(typeof executeApproveLateDonor, 'function', 'executeApproveLateDonor must be exported');

  harness.storage.set('auth_token', 'valid-admin-token');
  harness.storage.set('auth_role', 'Admin');
  harness.rpcCalls.length = 0;
  await executeApproveLateDonor('lr-1', true, 'admin-late-donors');

  const approveLateRpc = harness.rpcCalls.find(c => c.fn === 'admin_approve_late_donor');
  assert.ok(approveLateRpc, 'admin_approve_late_donor RPC must be called');
  assert.equal(approveLateRpc.params.p_token, 'valid-admin-token');
  assert.equal(approveLateRpc.params.p_req_id, 'lr-1');
  assert.equal(approveLateRpc.params.p_is_approved, true);
});

test('Admin Dashboard Stage 1 gracefully handles RPC errors with retry buttons', async () => {
  const harness = createAdminHarness({
    rpcHandler: (fn) => {
      if (fn === 'get_admin_dashboard_stage1') {
        return { data: null, error: { message: 'Database unreachable' } };
      }
      return undefined;
    }
  });
  const { loadAdminStage1 } = harness.context;

  harness.storage.set('auth_token', 'valid-admin-token');
  harness.storage.set('auth_role', 'Admin');
  harness.rpcCalls.length = 0;

  await loadAdminStage1('admin');

  const summaryEl = harness.elements.get('admin-summary');
  assert.ok(summaryEl.innerHTML.includes('Ringkasan belum dapat dimuat.'), 'Summary error message must render');
  assert.ok(summaryEl.innerHTML.includes('Coba lagi'), 'Retry button must render');

  const pendingEl = harness.elements.get('admin-pending-members');
  assert.ok(pendingEl.innerHTML.includes('Pendaftaran belum dapat dimuat.'), 'Pending error message must render');

  const lateEl = harness.elements.get('admin-late-donors');
  assert.ok(lateEl.innerHTML.includes('Gagal memuat pengajuan.'), 'Late requests error message must render');
});

test('Unimplemented Admin mutations fall back to legacy GAS', async () => {
  let gasActionCalled = null;
  const harness = createAdminHarness();

  harness.storage.set('auth_token', 'valid-admin-token');
  harness.storage.set('auth_role', 'Admin');

  harness.context.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    gasActionCalled = body.action;
    return {
      async text() {
        return JSON.stringify({ status: 'success', data: 'NEW-PIC-TOKEN-123' });
      }
    };
  };

  const { genPicToken } = harness.context;
  assert.equal(typeof genPicToken, 'function', 'genPicToken must be exported');

  genPicToken();

  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(gasActionCalled, 'generatePicToken', 'generatePicToken must route to legacy GAS fallback');
});

