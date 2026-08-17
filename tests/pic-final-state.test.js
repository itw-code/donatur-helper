const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function getIndexHtml() {
  return fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
}

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

  const { getAppScript } = require('./test-harness');
  const script = getAppScript();
  vm.runInNewContext(script, context, { filename: 'bundle.js' });
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

test('Finalized/settled donor card has calm settled styling, Indonesian label, and no reminder buttons', async () => {
  const harness = createBrowserHarness({
    campaign: {
      CampaignID: 'C-FINAL-SETTLED',
      TargetName: 'Settled Campaign',
      Reason: '',
      Status: 'Finalized',
      GiftAmount: 200000,
      Deadline: '2026-08-15'
    },
    donors: [
      donor('Pending Donor'),
      donor('Settled Donor', {
        Paid: 'TRUE',
        PaidAt: '2026-08-02T09:00:00.000Z',
        AmountPaid: 100000,
        ProofLink: 'https://example.test/proof.jpg',
        Verified: 'TRUE',
        ModifiedAt: '2026-08-03T09:00:00.000Z',
        ModifiedBy: 'PIC Test'
      })
    ]
  });

  harness.loadPicDashboard();
  await flushDashboardRender();

  const listHtml = harness.elements.get('pic-donor-list').innerHTML;

  // Settled card has .donor-card-settled
  assert.match(listHtml, /donor-card-settled/);

  // Status badge uses Indonesian label 'Terverifikasi'
  assert.match(listHtml, />Terverifikasi<\/span>/);

  // Verification area contains settled explanation text
  assert.match(listHtml, /Selesai/);
  assert.match(listHtml, /Tidak ada tindakan lanjutan untuk donatur ini/);

  // Does NOT contain reminder link for settled donor card
  const settledCardIndex = listHtml.indexOf('Settled Donor');
  const settledCardEnd = listHtml.indexOf('donor-card-total', settledCardIndex);
  const settledCardSlice = listHtml.slice(settledCardIndex, settledCardEnd !== -1 ? settledCardEnd : undefined);
  assert.doesNotMatch(settledCardSlice, /Kirim pengingat WA/);
});

test('When all donors are finalized, show a reassuring settled empty/complete state', async () => {
  const harness = createBrowserHarness({
    campaign: {
      CampaignID: 'C-ALL-SETTLED',
      TargetName: 'All Settled Campaign',
      Reason: '',
      Status: 'Finalized',
      GiftAmount: 100000,
      Deadline: '2026-08-15'
    },
    donors: [
      donor('Sole Verified Donor', {
        Paid: 'TRUE',
        PaidAt: '2026-08-02T09:00:00.000Z',
        AmountPaid: 100000,
        ProofLink: 'https://example.test/proof.jpg',
        Verified: 'TRUE',
        ModifiedAt: '2026-08-03T09:00:00.000Z'
      })
    ]
  });

  harness.loadPicDashboard();
  await flushDashboardRender();

  const listHtml = harness.elements.get('pic-donor-list').innerHTML;
  const infoHtml = harness.elements.get('pic-campaign-info').innerHTML;

  assert.match(listHtml, /Semua donor selesai/);
  assert.match(listHtml, /Semua pembayaran terverifikasi/);
  assert.match(infoHtml, /Semua pembayaran terverifikasi/);
});
