import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function createDonorTestEnvironment(options = {}) {
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
        files: [],
        type: 'text',
        checked: false,
        dataset: {},
        getAttribute: (attr) => {
          if (attr === 'data-name') return el.dataset?.name || null;
          return null;
        },
        setAttribute: (attr, val) => {
          if (attr.startsWith('data-')) {
            el.dataset[attr.slice(5)] = val;
          }
        },
        classList: {
          add: (cls) => classList.add(cls),
          remove: (cls) => classList.delete(cls),
          contains: (cls) => classList.has(cls),
          toggle: (cls, force) => {
            if (force === true || (force === undefined && !classList.has(cls))) {
              classList.add(cls);
              return true;
            }
            classList.delete(cls);
            return false;
          }
        }
      };
      elements.set(id, el);
    }
    return elements.get(id);
  }

  // Pre-seed known DOM elements for donor views
  [
    'u-display-name', 'campaign-list', 'actual-campaign-list', 'pic-create-btn-container',
    'profile-modal', 'prof-wa', 'prof-name', 'prof-email', 'prof-msg',
    'toast', 'view-landing', 'view-user-login', 'view-user-dashboard',
    'view-token-login', 'view-pic-dashboard', 'view-pic-create', 'view-admin-dashboard',
    'view-superadmin-dashboard'
  ].forEach(getOrCreateElement);

  const document = {
    getElementById: (id) => getOrCreateElement(id),
    querySelector: (selector) => {
      if (selector === '#pic-create-btn-container button') {
        return getOrCreateElement('btn-become-pic');
      }
      if (selector.startsWith('#')) {
        return getOrCreateElement(selector.slice(1));
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === '.wrap > div[id^="view-"]') {
        return ['landing', 'user-login', 'user-dashboard', 'token-login', 'pic-dashboard', 'pic-create', 'admin-dashboard', 'superadmin-dashboard']
          .map(name => getOrCreateElement('view-' + name));
      }
      if (selector === '.bulk-join-checkbox') {
        return Array.from(elements.values()).filter(el => el.classList.contains('bulk-join-checkbox'));
      }
      if (selector === '.bulk-join-checkbox:checked') {
        return Array.from(elements.values()).filter(el => el.classList.contains('bulk-join-checkbox') && el.checked);
      }
      return [];
    },
    createElement: (tag) => {
      const el = getOrCreateElement('elem_' + Math.random().toString(36).slice(2));
      el.tagName = tag.toUpperCase();
      return el;
    },
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
    navigator: {
      clipboard: {
        writeText: async () => {}
      }
    },
    addEventListener: () => {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    __DH_ENV__: {
      BACKEND_MODE: options.backendMode || 'supabase',
      ALLOW_GAS_FALLBACK: options.allowGasFallback !== false,
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
    navigator: windowObj.navigator,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: options.fetch || (async () => ({ text: async () => JSON.stringify({ status: 'success', data: {} }) }))
  });

  return { context, elements, localStorageStore, getOrCreateElement };
}

function loadAllModules(context) {
  const modules = [
    'js/config.js',
    'js/storage.js',
    'js/utils.js',
    'js/perf.js',
    'js/debug-panel.js',
    'js/state.js',
    'js/services/supabaseClient.js',
    'js/services/backendAdapter.js',
    'js/api.js',
    'js/views/pic.js',
    'js/views/donor.js'
  ];

  for (const relPath of modules) {
    const fullPath = path.resolve(relPath);
    let code = fs.readFileSync(fullPath, 'utf8');
    code = code.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
    code = code.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
    code = code.replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2');
    code = code.replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');
    vm.runInContext(code, context, { filename: relPath });
  }
}

test('Task 1: Unified Dashboard Read replaces multiple requests with single get_donor_dashboard RPC and normalizes joined/open campaigns', async () => {
  const rpcCalls = [];

  const mockClient = {
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (fn === 'get_donor_dashboard') {
        return {
          data: {
            identity: {
              name: 'Ahmad Faiz',
              alias: 'Faiz',
              whatsapp_masked: '+6281****123',
              member_status: 'ACTIVE',
              is_registered_member: true
            },
            summary: {
              total_joined: 2,
              need_payment_count: 1,
              waiting_verification_count: 1,
              verified_count: 0,
              refunded_count: 0,
              total_amount_due: 100000,
              total_amount_paid: 50000,
              outstanding_amount: 50000
            },
            joined_campaigns: [
              {
                donor_id: 101,
                donor_status: 'PLEDGED',
                amount_due: 50000,
                custom_amount: 50000,
                amount_paid: 0,
                paid: false,
                verified: false,
                refunded: false,
                proof_link: null,
                proof_storage_path: null,
                action_group: 'NEED_PAYMENT',
                campaign: {
                  campaign_id: 'CAMP-FINAL-1',
                  target_name: 'Hadiah Resign Budi',
                  reason: 'Resign per 1 Sept 2026',
                  gift_amount: 1000000,
                  status: 'FINALIZED',
                  deadline: '2026-09-01',
                  bank_name: 'Bank Mandiri',
                  bank_account: '1400012345678',
                  account_holder: 'Budi Santoso'
                }
              },
              {
                donor_id: 102,
                donor_status: 'PLEDGED',
                amount_due: 50000,
                custom_amount: null,
                amount_paid: 50000,
                paid: true,
                verified: false,
                refunded: false,
                proof_link: 'https://test.supabase.co/storage/v1/object/public/bukti-transfer/proofs/CAMP-FINAL-2/proof.jpg',
                proof_storage_path: 'proofs/CAMP-FINAL-2/proof.jpg',
                action_group: 'WAITING_VERIFICATION',
                campaign: {
                  campaign_id: 'CAMP-FINAL-2',
                  target_name: 'Hadiah Resign Siti',
                  reason: 'Resign pindah tugas',
                  gift_amount: 500000,
                  status: 'FINALIZED',
                  deadline: '2026-09-10',
                  bank_name: 'BCA',
                  bank_account: '8880012345',
                  account_holder: 'Siti Rahma'
                }
              }
            ],
            open_campaigns: [
              {
                campaign_id: 'CAMP-OPEN-1',
                target_name: 'Hadiah Resign Doni',
                reason: 'Resign lanjut studi',
                gift_amount: 750000,
                status: 'OPEN',
                deadline: '2026-09-15',
                gift_image: '',
                gift_link: ''
              }
            ],
            my_late_requests: []
          },
          error: null
        };
      }
      return { data: null, error: new Error('Unknown RPC: ' + fn) };
    }
  };

  const { context, elements, localStorageStore } = createDonorTestEnvironment({
    mockSupabaseClient: mockClient
  });
  loadAllModules(context);

  localStorageStore.set('donor_user', JSON.stringify({
    name: 'Ahmad Faiz',
    whatsapp: '081234567123',
    verified: true,
    status: 'active'
  }));

  // Trigger dashboard campaign refresh
  context.refreshCampaignList();
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify single RPC call to get_donor_dashboard with phone
  assert.strictEqual(rpcCalls.length, 1);
  assert.strictEqual(rpcCalls[0].fn, 'get_donor_dashboard');
  assert.strictEqual(rpcCalls[0].params.p_whatsapp, '081234567123');

  const html = elements.get('actual-campaign-list').innerHTML;

  // 1. Verify attention banner for pending payments
  assert.match(html, /donor-dashboard-attention/);
  assert.match(html, /1 pembayaran menunggu/);

  // 2. Verify pending payment campaign card in split-left with bank details
  assert.match(html, /Hadiah Resign Budi/);
  assert.match(html, /Bank Mandiri/);
  assert.match(html, /1400012345678/);
  assert.match(html, /Budi Santoso/);
  assert.match(html, /Rp50\.000/);

  // 3. Verify open campaign card in split-right "Bisa Diikuti"
  assert.match(html, /Bisa Diikuti/);
  assert.match(html, /Hadiah Resign Doni/);
  assert.match(html, /btn-join-CAMP-OPEN-1/);

  // 4. Verify joined campaign with waiting verification status
  assert.match(html, /Campaign yang Diikuti/);
  assert.match(html, /Hadiah Resign Siti/);
  assert.match(html, /Sudah konfirmasi transfer \(Menunggu Verifikasi PIC\)/);
});

test('Task 2: Join Campaign Mutation calls join_campaign RPC, updates UI toast, and handles errors', async () => {
  const rpcCalls = [];

  const mockClient = {
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (fn === 'join_campaign') {
        if (params.p_campaign_id === 'CAMP-OPEN-CLOSED') {
          return {
            data: { error: 'campaign_not_open', message: 'Campaign ini tidak bisa diikuti karena sudah ditutup atau selesai.' },
            error: null
          };
        }
        return {
          data: {
            success: true,
            action: 'join_campaign',
            campaign_id: params.p_campaign_id,
            donor: {
              id: 999,
              campaign_id: params.p_campaign_id,
              name: params.p_name,
              alias: params.p_alias,
              amount_due: params.p_custom_amount || 0,
              donor_status: 'PLEDGED'
            }
          },
          error: null
        };
      }
      if (fn === 'get_donor_dashboard') {
        return {
          data: {
            identity: { name: 'Budi', whatsapp_masked: '+6281****', member_status: 'ACTIVE' },
            summary: {},
            joined_campaigns: [],
            open_campaigns: [],
            my_late_requests: []
          },
          error: null
        };
      }
      return { data: null, error: null };
    }
  };

  const { context, elements, localStorageStore, getOrCreateElement } = createDonorTestEnvironment({
    mockSupabaseClient: mockClient
  });
  loadAllModules(context);

  localStorageStore.set('donor_user', JSON.stringify({
    name: 'Budi Hartono',
    whatsapp: '081234567890',
    verified: true,
    status: 'active'
  }));

  // Test 1: Successful Join with custom amount and alias
  const checkCustom = getOrCreateElement('check-custom-CAMP-10');
  checkCustom.checked = true;
  const inputCustom = getOrCreateElement('input-custom-CAMP-10');
  inputCustom.value = '75.000';

  const checkAlias = getOrCreateElement('check-alias-CAMP-10');
  checkAlias.checked = true;
  const inputAlias = getOrCreateElement('input-alias-CAMP-10');
  inputAlias.value = 'Donatur Rahasia';

  context.joinCampaign('CAMP-10');
  await new Promise(resolve => setTimeout(resolve, 50));

  const joinCall = rpcCalls.find(c => c.fn === 'join_campaign');
  assert.ok(joinCall, 'join_campaign RPC should be called');
  assert.strictEqual(joinCall.params.p_campaign_id, 'CAMP-10');
  assert.strictEqual(joinCall.params.p_name, 'Budi Hartono');
  assert.strictEqual(joinCall.params.p_whatsapp, '081234567890');
  assert.strictEqual(joinCall.params.p_custom_amount, 75000);
  assert.strictEqual(joinCall.params.p_alias, 'Donatur Rahasia');

  // Verify toast shown
  assert.match(elements.get('toast').textContent, /Berhasil bergabung/);

  // Test 2: Error handling when campaign is closed
  checkCustom.checked = false;
  checkAlias.checked = false;
  context.joinCampaign('CAMP-OPEN-CLOSED');
  await new Promise(resolve => setTimeout(resolve, 50));

  const infoModal = elements.get('custom-info-modal');
  assert.ok(infoModal, 'Info modal should be rendered on error');
  assert.match(elements.get('custom-info-message').textContent, /tidak bisa diikuti/);
});

test('Task 3: Withdraw Campaign Mutation calls withdraw_campaign RPC and refreshes list', async () => {
  const rpcCalls = [];

  const mockClient = {
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (fn === 'withdraw_campaign') {
        return {
          data: {
            success: true,
            action: 'withdraw_campaign',
            campaign_id: params.p_campaign_id,
            donor: {
              campaign_id: params.p_campaign_id,
              donor_status: 'WITHDRAWN'
            }
          },
          error: null
        };
      }
      if (fn === 'get_donor_dashboard') {
        return {
          data: {
            identity: { name: 'Budi' },
            summary: {},
            joined_campaigns: [],
            open_campaigns: [],
            my_late_requests: []
          },
          error: null
        };
      }
      return { data: null, error: null };
    }
  };

  const { context, elements, localStorageStore } = createDonorTestEnvironment({
    mockSupabaseClient: mockClient
  });
  loadAllModules(context);

  localStorageStore.set('donor_user', JSON.stringify({
    name: 'Budi Hartono',
    whatsapp: '081234567890',
    verified: true,
    status: 'active'
  }));

  // Trigger withdraw
  context.withdraw('CAMP-TO-CANCEL');

  // Simulate user clicking "Ya, Lanjutkan" in confirm modal
  const okBtn = elements.get('custom-confirm-ok');
  assert.ok(okBtn, 'Confirm modal OK button should exist');
  okBtn.onclick();
  await new Promise(resolve => setTimeout(resolve, 50));

  const withdrawCall = rpcCalls.find(c => c.fn === 'withdraw_campaign');
  assert.ok(withdrawCall, 'withdraw_campaign RPC should be called');
  assert.strictEqual(withdrawCall.params.p_campaign_id, 'CAMP-TO-CANCEL');
  assert.strictEqual(withdrawCall.params.p_whatsapp, '081234567890');

  // Verify toast
  assert.match(elements.get('toast').textContent, /dibatalkan/);
});

test('Task 4: Supabase Storage File Upload and submitPaymentProof flow', async () => {
  const rpcCalls = [];
  const storageUploads = [];

  const mockClient = {
    storage: {
      from: (bucket) => ({
        upload: async (path, file, opts) => {
          storageUploads.push({ bucket, path, file, opts });
          if (file.name === 'fail.jpg') {
            return { data: null, error: new Error('Storage network timeout') };
          }
          return { data: { path }, error: null };
        }
      })
    },
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (fn === 'submit_payment_proof') {
        return {
          data: {
            success: true,
            action: 'submit_payment_proof',
            campaign_id: params.p_campaign_id,
            donor: {
              campaign_id: params.p_campaign_id,
              paid: true,
              verified: false,
              proof_storage_path: params.p_storage_path
            }
          },
          error: null
        };
      }
      if (fn === 'get_donor_dashboard') {
        return {
          data: {
            identity: { name: 'Eko' },
            summary: {},
            joined_campaigns: [],
            open_campaigns: [],
            my_late_requests: []
          },
          error: null
        };
      }
      return { data: null, error: null };
    }
  };

  const { context, elements, localStorageStore, getOrCreateElement } = createDonorTestEnvironment({
    mockSupabaseClient: mockClient
  });
  loadAllModules(context);

  localStorageStore.set('donor_user', JSON.stringify({
    name: 'Eko Prasetyo',
    whatsapp: '081987654321',
    verified: true,
    status: 'active'
  }));

  // Test 1: Upload failure
  const fileInputFail = getOrCreateElement('proof-CAMP-FAIL');
  fileInputFail.files = [{ name: 'fail.jpg', size: 1024 * 100, type: 'image/jpeg' }];
  const btnSubmitFail = getOrCreateElement('btn-submit-proof-CAMP-FAIL');

  await context.submitProof('CAMP-FAIL');
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.strictEqual(storageUploads.length, 1);
  assert.strictEqual(storageUploads[0].bucket, 'bukti-transfer');
  assert.match(storageUploads[0].path, /^proofs\/CAMP-FAIL\/081987654321_\d+\.jpg$/);
  assert.strictEqual(elements.get('proof-error-CAMP-FAIL').textContent, 'Gagal mengunggah bukti pembayaran.');
  assert.strictEqual(btnSubmitFail.disabled, false);

  // Test 2: Upload success & RPC submitPaymentProof
  const fileInputSuccess = getOrCreateElement('proof-CAMP-OK');
  fileInputSuccess.files = [{ name: 'bukti_transfer.png', size: 1024 * 300, type: 'image/png' }];
  const btnSubmitSuccess = getOrCreateElement('btn-submit-proof-CAMP-OK');

  await context.submitProof('CAMP-OK');
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.strictEqual(storageUploads.length, 2);
  assert.match(storageUploads[1].path, /^proofs\/CAMP-OK\/081987654321_\d+\.png$/);

  const proofRpcCall = rpcCalls.find(c => c.fn === 'submit_payment_proof');
  assert.ok(proofRpcCall, 'submit_payment_proof RPC should be called');
  assert.strictEqual(proofRpcCall.params.p_campaign_id, 'CAMP-OK');
  assert.strictEqual(proofRpcCall.params.p_whatsapp, '081987654321');
  assert.strictEqual(proofRpcCall.params.p_storage_path, storageUploads[1].path);

  // Toast confirmation
  assert.match(elements.get('toast').textContent, /Menunggu verifikasi PIC/);
});

test('Task 5: seamlessBecomePic generates PIC token via generate_seamless_pic_token and displays modal', async () => {
  const rpcCalls = [];

  const mockClient = {
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (fn === 'generate_seamless_pic_token') {
        return {
          data: {
            success: true,
            token: 'PIC-A1B2C3D4',
            role: 'PIC',
            status: 'UNUSED',
            alias: 'Rudi',
            expires_at: '2026-09-18T00:00:00Z'
          },
          error: null
        };
      }
      if (fn === 'get_pic_dashboard') {
        return {
          data: { campaign: null, donors: [] },
          error: null
        };
      }
      return { data: null, error: null };
    }
  };

  const { context, elements, localStorageStore, getOrCreateElement } = createDonorTestEnvironment({
    mockSupabaseClient: mockClient
  });
  loadAllModules(context);

  localStorageStore.set('donor_user', JSON.stringify({
    name: 'Rudi Gunawan',
    whatsapp: '081234567777',
    verified: true,
    status: 'active'
  }));

  const becomePicBtn = getOrCreateElement('btn-become-pic');
  becomePicBtn.textContent = '+ Buat Campaign Baru (Jadi PIC)';

  context.seamlessBecomePic({ target: becomePicBtn });
  await new Promise(resolve => setTimeout(resolve, 50));

  const picTokenCall = rpcCalls.find(c => c.fn === 'generate_seamless_pic_token');
  assert.ok(picTokenCall, 'generate_seamless_pic_token RPC should be called');
  assert.strictEqual(picTokenCall.params.p_whatsapp, '081234567777');

  // Verify stored credentials
  assert.strictEqual(localStorageStore.get('auth_token'), 'PIC-A1B2C3D4');
  assert.strictEqual(localStorageStore.get('auth_role'), 'PIC');

  // Verify token modal presented
  assert.match(elements.get('custom-info-message').textContent, /PIC-A1B2C3D4/);
});

test('Task 6 & 7: Combined payment proof submission across multiple campaigns and GAS fallback in auto mode', async () => {
  const rpcCalls = [];
  const storageUploads = [];

  const mockClient = {
    storage: {
      from: (bucket) => ({
        upload: async (path, file, opts) => {
          storageUploads.push({ bucket, path, file, opts });
          return { data: { path }, error: null };
        }
      })
    },
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (fn === 'submit_payment_proof' || fn === 'submit_combined_payment_proof') {
        return { data: { success: true }, error: null };
      }
      if (fn === 'get_donor_dashboard') {
        return {
          data: {
            identity: { name: 'Eko' },
            summary: {},
            joined_campaigns: [],
            open_campaigns: [],
            my_late_requests: []
          },
          error: null
        };
      }
      return { data: null, error: null };
    }
  };

  const { context, elements, localStorageStore, getOrCreateElement } = createDonorTestEnvironment({
    mockSupabaseClient: mockClient
  });
  loadAllModules(context);

  localStorageStore.set('donor_user', JSON.stringify({
    name: 'Eko Prasetyo',
    whatsapp: '081987654321',
    verified: true,
    status: 'active'
  }));

  // Submit combined proof for 2 campaigns to BCA 123456789
  const fileInput = getOrCreateElement('combined-proof-123456789');
  fileInput.files = [{ name: 'combined_receipt.pdf', size: 1024 * 400, type: 'application/pdf' }];

  await context.submitCombinedProof('123456789', 'CAMP-A, CAMP-B');
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.strictEqual(storageUploads.length, 1);
  assert.match(storageUploads[0].path, /^proofs\/combined_123456789\/081987654321_\d+\.pdf$/);

  const combinedCalls = rpcCalls.filter(c => c.fn === 'submit_combined_payment_proof');
  assert.strictEqual(combinedCalls.length, 1);
  assert.strictEqual(JSON.stringify(Array.from(combinedCalls[0].params.p_campaign_ids)), JSON.stringify(['CAMP-A', 'CAMP-B']));
  assert.strictEqual(combinedCalls[0].params.p_whatsapp, '081987654321');

  // Verify toast
  assert.match(elements.get('toast').textContent, /Bukti transfer gabungan berhasil dikirim/);
});
