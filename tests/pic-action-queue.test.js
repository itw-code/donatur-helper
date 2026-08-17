const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { getAppScript } = require('./test-harness');
const inlineScript = getAppScript();

function makeElement(id) {
  const classes = new Set();
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
    offsetWidth: 1,
    offsetHeight: 1,
    getClientRects() { return [{}]; },
    appendChild(child) {
      if (child.id) this.children = (this.children || []).concat(child);
    },
    focus() {},
    scrollIntoView() {},
    setAttribute() {},
    getAttribute() { return null; }
  };
}

function createBrowserHarness(detail) {
  const elements = new Map();
  const storage = new Map();

  const getElement = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };

  const document = {
    title: 'Donatur Helper',
    hidden: false,
    body: {
      appendChild(element) {
        if (element.id) elements.set(element.id, element);
      }
    },
    addEventListener() {},
    createElement(tagName) { return makeElement(tagName); },
    getElementById: getElement,
    querySelectorAll(selector) {
      if (selector === '.wrap > div[id^="view-"]') {
        return ['landing', 'user-login', 'user-dashboard', 'token-login', 'pic-dashboard', 'pic-create']
          .map(name => getElement('view-' + name));
      }
      return [];
    }
  };

  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };

  const fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.action !== 'getCampaignForPic') {
      throw new Error('Unexpected backend action: ' + request.action);
    }
    return {
      async text() {
        return JSON.stringify({ status: 'success', data: detail });
      }
    };
  };

  const window = {
    location: { hash: '', search: '', origin: 'http://localhost:4173', pathname: '/' },
    history: { replaceState() {} },
    addEventListener() {},
    matchMedia() { return { matches: false }; },
    setTimeout
  };

  const context = {
    console,
    document,
    fetch,
    localStorage,
    navigator: { clipboard: { writeText: async () => {} } },
    URLSearchParams,
    setTimeout,
    clearTimeout,
    window
  };

  vm.runInNewContext(inlineScript, context, { filename: 'index.html' });
  localStorage.setItem('auth_token', 'pic-token');

  return {
    elements,
    loadPicDashboard: context.loadPicDashboard
  };
}

function donor(name, overrides = {}) {
  return {
    Name: name,
    Alias: '',
    WhatsApp: '628123456789',
    JoinedAt: '2026-08-01T09:00:00.000Z',
    PaidAt: '',
    ModifiedAt: '',
    ModifiedBy: '',
    Paid: 'FALSE',
    Verified: 'FALSE',
    ProofLink: '',
    AmountDue: 100000,
    AmountPaid: 0,
    Refunded: 'FALSE',
    CustomAmount: 0,
    ...overrides
  };
}

async function flushDashboardRender() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('PIC Finalized donor list exposes action queues and Refund precedence', async () => {
  const harness = createBrowserHarness({
    campaign: {
      CampaignID: 'C-QUEUE',
      TargetName: 'Campaign Queue',
      Reason: '',
      Status: 'Finalized',
      GiftAmount: 1000000,
      Deadline: '2026-08-15'
    },
    donors: [
      donor('Unpaid Donor'),
      donor('Review Donor', {
        Paid: 'TRUE',
        PaidAt: '2026-08-02T09:00:00.000Z',
        AmountPaid: 100000,
        ProofLink: 'https://example.test/review-proof',
        ModifiedAt: ''
      }),
      donor('Refund Donor', {
        Paid: 'TRUE',
        PaidAt: '2026-08-03T09:00:00.000Z',
        AmountPaid: 120000,
        ProofLink: 'https://example.test/refund-proof'
      }),
      donor('Verified Donor', {
        Paid: 'TRUE',
        PaidAt: '2026-08-04T09:00:00.000Z',
        AmountPaid: 100000,
        ProofLink: 'https://example.test/verified-proof',
        Verified: 'TRUE',
        ModifiedAt: '2026-08-05T09:00:00.000Z',
        ModifiedBy: 'PIC Test'
      }),
      donor('Missing Proof Donor', {
        Paid: 'TRUE',
        PaidAt: '2026-08-04T10:00:00.000Z',
        AmountPaid: 100000
      })
    ]
  });

  harness.loadPicDashboard();
  await flushDashboardRender();

  const html = harness.elements.get('pic-donor-list').innerHTML;
  assert.match(html, /Pengingat pembayaran/);
  assert.match(html, /Bukti Transfer perlu ditinjau/);
  assert.match(html, /Refund perlu diselesaikan/);
  assert.match(html, /Terverifikasi/);
  assert.match(html, /Bukti Transfer belum tersedia/);
  assert.match(html, /1 pengingat/);
  assert.match(html, /1 tinjau/);
  assert.match(html, /1 refund/);
  assert.match(html, /1 data perlu dicek/);
  assert.match(html, /Terverifikasi \(1\)/);

  assert.ok(
    html.indexOf('Pengingat pembayaran') < html.indexOf('Bukti Transfer perlu ditinjau'),
    'reminder queue should precede proof review'
  );
  assert.ok(
    html.indexOf('Bukti Transfer perlu ditinjau') < html.indexOf('Refund perlu diselesaikan'),
    'proof review should precede the Refund queue heading'
  );
  assert.ok(
    html.indexOf('Refund perlu diselesaikan') < html.indexOf('Terverifikasi ('),
    'active queues should precede completed Donors'
  );

  const refundCardStart = html.indexOf('Refund Donor');
  const refundCardEnd = html.indexOf('Missing Proof Donor');
  const refundCard = html.slice(refundCardStart, refundCardEnd === -1 ? html.length : refundCardEnd);
  assert.match(refundCard, /Refund perlu diselesaikan/);
  assert.match(refundCard, /Selesaikan refund dulu sebelum verifikasi/);
  assert.doesNotMatch(refundCard, /data-pic-action="review"/);

  const missingProofStart = html.indexOf('Missing Proof Donor');
  const missingProof = html.slice(missingProofStart, html.indexOf('Terverifikasi ('));
  assert.match(missingProof, /Bukti Transfer belum tersedia/);
  assert.doesNotMatch(missingProof, /data-pic-action="reminder"|data-pic-action="review"/);

  const actionHtml = harness.elements.get('pic-campaign-info').innerHTML;
  assert.match(actionHtml, /Kirim pengingat WA/);
  assert.match(actionHtml, /Tinjau Bukti Transfer/);
  assert.match(actionHtml, /Refund/);
});

test('PIC Finalized donor list shows an explicit all-complete state', async () => {
  const harness = createBrowserHarness({
    campaign: {
      CampaignID: 'C-COMPLETE',
      TargetName: 'Completed Queue',
      Reason: '',
      Status: 'Finalized',
      GiftAmount: 1000000,
      Deadline: '2026-08-15'
    },
    donors: [
      donor('Completed Donor', {
        Paid: 'TRUE',
        PaidAt: '2026-08-02T09:00:00.000Z',
        AmountPaid: 100000,
        ProofLink: 'https://example.test/completed-proof',
        Verified: 'TRUE',
        ModifiedAt: '2026-08-03T09:00:00.000Z'
      })
    ]
  });

  harness.loadPicDashboard();
  await flushDashboardRender();

  const listHtml = harness.elements.get('pic-donor-list').innerHTML;
  const actionHtml = harness.elements.get('pic-campaign-info').innerHTML;
  assert.match(listHtml, /Semua donor selesai/);
  assert.match(listHtml, /Terverifikasi \(1\)/);
  assert.doesNotMatch(listHtml, /data-pic-action=/);
  assert.match(actionHtml, /Semua pembayaran terverifikasi/);
});

test('PIC Refund settlement refresh moves a Donor into proof review', async () => {
  const detail = {
    campaign: {
      CampaignID: 'C-REFRESH',
      TargetName: 'Refund Refresh',
      Reason: '',
      Status: 'Finalized',
      GiftAmount: 1000000,
      Deadline: '2026-08-15'
    },
    donors: [
      donor('Refund Then Review', {
        Paid: 'TRUE',
        PaidAt: '2026-08-02T09:00:00.000Z',
        AmountPaid: 120000,
        ProofLink: 'https://example.test/refund-refresh-proof'
      })
    ]
  };
  const harness = createBrowserHarness(detail);

  harness.loadPicDashboard();
  await flushDashboardRender();
  let listHtml = harness.elements.get('pic-donor-list').innerHTML;
  assert.match(listHtml, /Refund perlu diselesaikan/);
  assert.doesNotMatch(listHtml, /data-pic-action="review"/);

  detail.donors[0].Refunded = 'TRUE';
  harness.loadPicDashboard();
  await flushDashboardRender();
  listHtml = harness.elements.get('pic-donor-list').innerHTML;
  assert.match(listHtml, /Bukti Transfer perlu ditinjau/);
  assert.match(listHtml, /data-pic-action="review"/);
  assert.doesNotMatch(listHtml, /data-pic-action="refund"/);
});
