const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');

const { getAppScript } = require('./test-harness');
const inlineScript = getAppScript();

function makeElement(id) {
  const classes = new Set();
  const attributes = new Map();
  const children = [];
  return {
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
    files: [],
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
    select() {}
  };
}

function createPicHarness(options = {}) {
  const elements = new Map();
  const storage = new Map(Object.entries(options.initialStorage || {}));
  const rpcCalls = [];
  const storageCalls = [];

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
      return makeElement('queried');
    },
    querySelectorAll() {
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
      if (fn === 'get_pic_dashboard') {
        return {
          data: options.dashboardData || {
            campaign: {
              campaign_id: 'camp_123',
              target_name: 'Pak Bos',
              reason: 'Ulang Tahun',
              gift_amount: 500000,
              status: 'OPEN',
              deadline: '2026-09-01'
            },
            donors: [
              { id: '1', name: 'Alice', whatsapp: '08123', donor_status: 'joined', amount_due: 100000, paid: false, verified: false }
            ],
            summary: { total_donors: 1, total_paid: 0 }
          },
          error: null
        };
      }
      if (fn === 'create_campaign_for_pic') {
        return { data: { campaign_id: 'new_camp_123' }, error: null };
      }
      if (fn === 'close_campaign_list' || fn === 'reopen_campaign_list') {
        return { data: { success: true }, error: null };
      }
      if (fn === 'finalize_campaign') {
        return { data: { success: true }, error: null };
      }
      if (fn === 'update_campaign_gift_proof') {
        return { data: { success: true }, error: null };
      }
      if (fn === 'verify_donor_payment') {
        return { data: { success: true }, error: null };
      }
      if (fn === 'verify_all_donor_payments') {
        return { data: { verified_count: 5 }, error: null };
      }
      if (fn === 'request_late_donor') {
        return { data: { success: true }, error: null };
      }
      if (fn === 'archive_campaign_pic') {
        return { data: { success: true }, error: null };
      }
      if (fn === 'delete_campaign_pic') {
        return { data: { success: true }, error: null };
      }
      return { data: { success: true }, error: null };
    },
    storage: {
      from: bucket => ({
        createSignedUrl: async (filePath, expiresIn) => {
          storageCalls.push({ action: 'createSignedUrl', bucket, filePath, expiresIn });
          return { data: { signedUrl: `https://supabase.co/storage/v1/object/sign/${bucket}/${filePath}?token=xyz` }, error: null };
        },
        upload: async (filePath, file, opts) => {
          storageCalls.push({ action: 'upload', bucket, filePath, file, opts });
          return { data: { path: filePath }, error: null };
        }
      })
    }
  };

  let clipboardText = '';
  const window = {
    location: { hash: '', search: '', pathname: '/', origin: 'https://donaturhelper.app' },
    history: { replaceState() {} },
    addEventListener() {},
    matchMedia() { return { matches: false }; },
    setTimeout,
    clearTimeout,
    supabase: {
      createClient: () => mockSupabaseClient
    },
    __DH_ENV__: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      DEBUG: false
    },
    __dhSupabase: {
      getClient: () => mockSupabaseClient,
      isSupabaseActive: () => true
    }
  };

  const fetch = async () => ({
    async text() {
      return JSON.stringify({ status: 'success', data: {} });
    }
  });

  const context = {
    console,
    document,
    localStorage,
    fetch,
    navigator: {
      clipboard: {
        writeText: async text => { clipboardText = text; }
      }
    },
    URLSearchParams,
    setTimeout,
    clearTimeout,
    window,
    confirm: () => true
  };

  vm.runInNewContext(inlineScript, context, { filename: 'index.html' });

  return {
    context,
    elements,
    storage,
    rpcCalls,
    storageCalls,
    getClipboardText: () => clipboardText
  };
}

test('PIC Signed URL helper returns signed URL for private storage paths and leaves external URLs intact', async () => {
  const harness = createPicHarness();
  const { getBuktiSignedUrl } = harness.context;

  // Empty or invalid paths
  assert.strictEqual(await getBuktiSignedUrl(null), null);
  assert.strictEqual(await getBuktiSignedUrl(''), null);
  assert.strictEqual(await getBuktiSignedUrl('   '), null);

  // External / http URLs
  assert.strictEqual(await getBuktiSignedUrl('https://example.com/receipt.jpg'), 'https://example.com/receipt.jpg');
  assert.strictEqual(await getBuktiSignedUrl('http://insecure.com/proof.png'), 'http://insecure.com/proof.png');

  // Supabase Storage paths
  const signed = await getBuktiSignedUrl('proofs/camp1/alice.jpg');
  assert.match(signed, /https:\/\/supabase\.co\/storage\/v1\/object\/sign\/bukti-transfer\/proofs\/camp1\/alice\.jpg/);
  assert.strictEqual(harness.storageCalls.length, 1);
  assert.strictEqual(harness.storageCalls[0].bucket, 'bukti-transfer');
});

test('PIC Dashboard load calls getCampaignForPic and resolves signed URLs for proof and gift image', async () => {
  const harness = createPicHarness({
    initialStorage: { auth_token: 'pic_token_123', auth_role: 'PIC' },
    dashboardData: {
      campaign: {
        campaign_id: 'camp_456',
        target_name: 'Kak Shanti',
        reason: 'Farewell',
        gift_amount: 1000000,
        status: 'FINALIZED',
        deadline: '2026-08-30',
        gift_image: 'gifts/camp_456/cake.jpg'
      },
      donors: [
        {
          id: 'd1',
          name: 'Budi',
          whatsapp: '081111',
          donor_status: 'joined',
          amount_due: 250000,
          amount_paid: 250000,
          paid: true,
          verified: false,
          proof_storage_path: 'proofs/camp_456/budi.jpg',
          action_group: 'REVIEW_PROOF'
        }
      ],
      summary: { total_donors: 1, total_paid: 250000 }
    }
  });

  const { loadPicDashboard, appState } = harness.context;
  await loadPicDashboard();

  // Assert RPC call
  const picRpc = harness.rpcCalls.find(c => c.fn === 'get_pic_dashboard');
  assert.ok(picRpc, 'Must call get_pic_dashboard RPC');
  assert.strictEqual(picRpc.params.p_token, 'pic_token_123');

  // Assert signed URLs generated
  assert.ok(harness.storageCalls.length >= 2, 'Must generate signed URLs for gift image and donor proof');
  assert.ok(harness.storageCalls.some(c => c.filePath === 'gifts/camp_456/cake.jpg'));
  assert.ok(harness.storageCalls.some(c => c.filePath === 'proofs/camp_456/budi.jpg'));

  // Assert app state hydrated
  assert.strictEqual(appState.picCampaignData.TargetName, 'Kak Shanti');
  assert.strictEqual(appState.picCampaignData.Status, 'Finalized');
  assert.match(appState.picCampaignData.GiftImage, /https:\/\/supabase\.co\/storage/);

  // Assert view switched to pic-dashboard
  const dashboardView = harness.context.document.getElementById('view-pic-dashboard');
  assert.ok(dashboardView, 'view-pic-dashboard element should be rendered');
  assert.strictEqual(dashboardView.classList.contains('hidden'), false);
});

test('PIC mutations: finalizeCampaign and updateGiftProof upload images to Supabase storage', async () => {
  const harness = createPicHarness({
    initialStorage: { auth_token: 'pic_token_123', auth_role: 'PIC' }
  });
  const { uploadGiftImage, appState } = harness.context;
  appState.picCampaignData = { CampaignID: 'camp_789' };

  const fakeFile = { name: 'proof_gift.png', size: 1024 };
  const storagePath = await uploadGiftImage('camp_789', fakeFile);

  assert.match(storagePath, /^gifts\/camp_789\/\d+\.png$/);
  const uploadCall = harness.storageCalls.find(c => c.action === 'upload');
  assert.ok(uploadCall, 'Must invoke storage.upload');
  assert.strictEqual(uploadCall.bucket, 'bukti-transfer');
});

test('PIC actions: verifyPaymentUI, picVerifyAllUI, requestLateDonor route through backendAdapter', async () => {
  const harness = createPicHarness({
    initialStorage: { auth_token: 'pic_token_999', auth_role: 'PIC' }
  });

  const { verifyPaymentUI, picVerifyAllUI, submitLateDonor, appState, document } = harness.context;
  appState.picCampaignData = { CampaignID: 'camp_xyz', Status: 'Finalized' };

  // 1. Verify single payment
  document.getElementById('custom-confirm-ok'); // ensure created
  verifyPaymentUI('camp_xyz', '08123456789', true);

  const confirmOkBtn = document.getElementById('custom-confirm-ok');
  if (confirmOkBtn && typeof confirmOkBtn.onclick === 'function') {
    await confirmOkBtn.onclick();
  }
  await new Promise(r => setTimeout(r, 20));

  const verifyRpc = harness.rpcCalls.find(c => c.fn === 'verify_donor_payment');
  assert.ok(verifyRpc, 'Must trigger verify_donor_payment RPC');
  assert.strictEqual(verifyRpc.params.p_campaign_id, 'camp_xyz');
  assert.strictEqual(verifyRpc.params.p_whatsapp, '08123456789');
  assert.strictEqual(verifyRpc.params.p_is_valid, true);

  // 2. Verify all payments
  picVerifyAllUI('camp_xyz');
  if (confirmOkBtn && typeof confirmOkBtn.onclick === 'function') {
    await confirmOkBtn.onclick();
  }
  await new Promise(r => setTimeout(r, 20));

  const verifyAllRpc = harness.rpcCalls.find(c => c.fn === 'verify_all_donor_payments');
  assert.ok(verifyAllRpc, 'Must trigger verify_all_donor_payments RPC');
  assert.strictEqual(verifyAllRpc.params.p_campaign_id, 'camp_xyz');

  // 3. Late donor submission
  document.getElementById('late-name').value = 'Donatur Baru';
  document.getElementById('late-wa').value = '0899999999';
  document.getElementById('late-reason').value = 'Tertinggal';
  submitLateDonor();
  await new Promise(r => setTimeout(r, 20));

  const lateRpc = harness.rpcCalls.find(c => c.fn === 'request_late_donor');
  assert.ok(lateRpc, 'Must trigger request_late_donor RPC');
  assert.strictEqual(lateRpc.params.p_donor_name, 'Donatur Baru');
  assert.strictEqual(lateRpc.params.p_donor_whatsapp, '0899999999');
  assert.strictEqual(lateRpc.params.p_reason, 'Tertinggal');
});

test('PIC queue priority: correctly classifies reminder, review, refund, and complete states', () => {
  const harness = createPicHarness();
  const { getPicDonorQueueState } = harness.context;

  // Unpaid finalized donor -> reminder
  assert.strictEqual(getPicDonorQueueState({ Paid: 'FALSE', Verified: 'FALSE' }, 'Finalized'), 'reminder');

  // Paid with proof and not verified -> review
  assert.strictEqual(getPicDonorQueueState({ Paid: 'TRUE', Verified: 'FALSE', proof_storage_path: 'proof.jpg', AmountPaid: 50000, AmountDue: 50000 }, 'Finalized'), 'review');

  // Overpaid not refunded -> refund
  assert.strictEqual(getPicDonorQueueState({ Paid: 'TRUE', Verified: 'FALSE', AmountPaid: 60000, AmountDue: 50000, Refunded: 'FALSE' }, 'Finalized'), 'refund');

  // Verified donor -> complete
  assert.strictEqual(getPicDonorQueueState({ Paid: 'TRUE', Verified: 'TRUE' }, 'Finalized'), 'complete');
});

test('PIC getReminderInfo generates formatted WhatsApp reminder text on Supabase', async () => {
  const harness = createPicHarness({
    initialStorage: { auth_token: 'pic_token_999', auth_role: 'PIC' },
    dashboardData: {
      campaign: {
        campaign_id: 'camp_123',
        target_name: 'Pak Bos',
        reason: 'Ulang Tahun',
        gift_amount: 500000,
        status: 'OPEN',
        deadline: '2026-09-01'
      },
      donors: [
        { name: 'Andi', whatsapp: '081111111', alias: 'Andi Cool', donor_status: 'PLEDGED' },
        { name: 'Budi', whatsapp: '082222222', alias: '', donor_status: 'PLEDGED' }
      ],
      summary: { total_donors: 2, total_paid: 0 }
    }
  });

  const { adapterFetchBackend } = harness.context;
  const res = await adapterFetchBackend('getReminderInfo', ['pic_token_999', 'https://don4tpro.pages.dev']);

  assert.ok(res, 'getReminderInfo must return a valid object');
  assert.ok(res.bulkMessage, 'bulkMessage must be present');
  assert.match(res.bulkMessage, /Pak Bos/);
  assert.match(res.bulkMessage, /https:\/\/don4tpro\.pages\.dev\?c=camp_123/);
  assert.match(res.bulkMessage, /Andi Cool/);
  assert.strictEqual(res.totalDonors, 2);
});

test('PIC manual verification: adapter dispatches pic_manual_verify_donor RPC and UI modal handles optional WA proof upload', async () => {
  const harness = createPicHarness({
    initialStorage: { auth_token: 'pic_token_777', auth_role: 'PIC' }
  });
  const { adapterFetchBackend, openManualVerifyModal, submitManualVerifyDonor } = harness.context;

  // 1. Adapter call directly
  await adapterFetchBackend('picManualVerifyDonor', [
    'pic_token_777',
    'camp_123',
    '08123456789',
    50000,
    'proofs/camp_123/wa_proof.jpg',
    'Bukti dicek via WA'
  ]);

  const verifyRpc = harness.rpcCalls.find(c => c.fn === 'pic_manual_verify_donor');
  assert.ok(verifyRpc, 'pic_manual_verify_donor RPC must be called');
  assert.strictEqual(verifyRpc.params.p_token, 'pic_token_777');
  assert.strictEqual(verifyRpc.params.p_campaign_id, 'camp_123');
  assert.strictEqual(verifyRpc.params.p_whatsapp, '08123456789');
  assert.strictEqual(verifyRpc.params.p_amount_paid, 50000);
  assert.strictEqual(verifyRpc.params.p_storage_path, 'proofs/camp_123/wa_proof.jpg');
  assert.strictEqual(verifyRpc.params.p_note, 'Bukti dicek via WA');

  // 2. UI Modal flow
  openManualVerifyModal('camp_123', '08999888777', 'Budi Santoso', 75000);
  const modal = harness.elements.get('pic-manual-verify-modal');
  assert.ok(modal, 'Modal must be mounted');
  assert.strictEqual(modal.style.display, 'flex');
  assert.strictEqual(harness.elements.get('mv-donor-name').textContent, 'Budi Santoso');
  assert.strictEqual(harness.elements.get('mv-donor-wa').textContent, '08999888777');

  // Submit via modal without file
  await submitManualVerifyDonor('camp_123', '08999888777');
  const modalRpc = harness.rpcCalls.filter(c => c.fn === 'pic_manual_verify_donor')[1];
  assert.ok(modalRpc, 'Second pic_manual_verify_donor RPC must be called from modal');
  assert.strictEqual(modalRpc.params.p_whatsapp, '08999888777');
  assert.strictEqual(modalRpc.params.p_amount_paid, 75000);
  assert.strictEqual(modalRpc.params.p_storage_path, null);
  assert.strictEqual(modal.style.display, 'none', 'Modal should be closed after submit');
});

test('PIC gift proof UI: renderPicActions mounts #gift-proof-form, toggles visibility, and submits photo (>2MB up to 10MB) + link', async () => {
  const harness = createPicHarness({
    initialStorage: { auth_token: 'pic_token_eugenia', auth_role: 'PIC' },
    dashboardData: {
      campaign: {
        campaign_id: 'C-EF925655',
        target_name: 'Eugenia Florensia Halim',
        status: 'FINALIZED',
        gift_amount: 1100000,
        gift_link: '',
        gift_image: ''
      },
      donors: [
        { name: 'Donatur 1', whatsapp: '081111111', paid: true, verified: true, amount_due: 50000, amount_paid: 50000, proof_link: 'proofs/C-EF925655/1.jpg' }
      ],
      summary: { total_donors: 1, total_paid: 1 }
    }
  });

  const { loadPicDashboard, showGiftProofForm, hideGiftProofForm, submitGiftProof, document } = harness.context;
  await loadPicDashboard();

  const actionsHtml = harness.elements.get('pic-actions').innerHTML;
  assert.match(actionsHtml, /id="gift-proof-form"/, 'renderPicActions must render #gift-proof-form');
  assert.match(actionsHtml, /id="gift-link"/, 'renderPicActions must render #gift-link');
  assert.match(actionsHtml, /id="gift-image"/, 'renderPicActions must render #gift-image');
  assert.match(actionsHtml, /id="btn-submit-gift-proof"/, 'renderPicActions must render #btn-submit-gift-proof');
  assert.match(actionsHtml, /id="gift-error"/, 'renderPicActions must render #gift-error');

  // Toggle visibility via showGiftProofForm / hideGiftProofForm
  const giftForm = document.getElementById('gift-proof-form');
  const lateForm = document.getElementById('late-donor-form');
  giftForm.classList.add('hidden');
  lateForm.classList.remove('hidden');

  showGiftProofForm();
  assert.strictEqual(giftForm.classList.contains('hidden'), false, 'showGiftProofForm must unhide #gift-proof-form');
  assert.strictEqual(lateForm.classList.contains('hidden'), true, 'showGiftProofForm must hide #late-donor-form');

  // Submit a realistic mobile photo (4MB > old 2MB cap, <= 10MB bucket limit) + gift link
  document.getElementById('gift-link').value = 'https://tokopedia.com/hadiah-eugenia';
  document.getElementById('gift-image').files = [{ name: 'IMG_20261123.jpg', size: 4 * 1024 * 1024 }];

  await submitGiftProof();

  const uploadCall = harness.storageCalls.find(c => c.action === 'upload');
  assert.ok(uploadCall, 'Must upload gift image to Supabase storage');
  assert.strictEqual(uploadCall.bucket, 'bukti-transfer');
  assert.match(uploadCall.filePath, /^gifts\/C-EF925655\/\d+\.jpg$/);

  const giftRpc = harness.rpcCalls.find(c => c.fn === 'update_campaign_gift_proof');
  assert.ok(giftRpc, 'Must call update_campaign_gift_proof RPC');
  assert.strictEqual(giftRpc.params.p_token, 'pic_token_eugenia');
  assert.strictEqual(giftRpc.params.p_link, 'https://tokopedia.com/hadiah-eugenia');
  assert.match(giftRpc.params.p_image_path, /^gifts\/C-EF925655\/\d+\.jpg$/);
  assert.strictEqual(giftForm.classList.contains('hidden'), true, 'Form must hide after successful save');

  // Reject oversized file (> 10MB) without uploading
  showGiftProofForm();
  document.getElementById('gift-image').files = [{ name: 'huge.jpg', size: 11 * 1024 * 1024 }];
  await submitGiftProof();
  assert.match(document.getElementById('gift-error').textContent, /10MB/);

  hideGiftProofForm();
  assert.strictEqual(giftForm.classList.contains('hidden'), true, 'hideGiftProofForm must hide #gift-proof-form');
});

test('PIC gift proof UI: existing gift proof renders sanitized preview and hides hostile URLs', async () => {
  const harness = createPicHarness({
    initialStorage: { auth_token: 'pic_token_preview', auth_role: 'PIC' },
    dashboardData: {
      campaign: {
        campaign_id: 'C-PREVIEW',
        target_name: 'Preview Target',
        status: 'FINALIZED',
        gift_amount: 500000,
        gift_link: 'javascript:alert(1)',
        gift_image: 'gifts/C-PREVIEW/photo.jpg'
      },
      donors: [],
      summary: { total_donors: 0, total_paid: 0 }
    }
  });

  await harness.context.loadPicDashboard();
  const actionsHtml = harness.elements.get('pic-actions').innerHTML;

  assert.match(actionsHtml, /pic-gift-preview/, 'Existing gift proof must render preview block');
  assert.match(actionsHtml, /https:\/\/supabase\.co\/storage\/v1\/object\/sign\/bukti-transfer\/gifts\/C-PREVIEW\/photo\.jpg/, 'Resolved signed image URL must appear in preview');
  assert.doesNotMatch(actionsHtml, /href="javascript:/i, 'Hostile gift_link must be sanitized out of href');
  assert.match(actionsHtml, /id="gift-edit-form" class="hidden"/, 'Edit form starts collapsed when proof already exists');
});
