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
  let clipboardText = '';

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
    navigator: {
      clipboard: {
        writeText: async (text) => { clipboardText = text; }
      }
    },
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
    context,
    getClipboardText: () => clipboardText,
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

test('PIC donor queue groups donors into distinct action sections and offers bulk reminder recap', async () => {
  const harness = createBrowserHarness({
    campaign: {
      CampaignID: 'C-QUEUE-TEST',
      TargetName: 'Usability Campaign',
      Reason: '',
      Status: 'Finalized',
      GiftAmount: 300000,
      Deadline: '2026-08-15'
    },
    donors: [
      donor('Donatur A', { WhatsApp: '628111111111' }),
      donor('Donatur B', { WhatsApp: '628222222222' }),
      donor('Donatur C (Verified)', {
        Paid: 'TRUE',
        PaidAt: '2026-08-02T09:00:00.000Z',
        AmountPaid: 100000,
        ProofLink: 'https://example.test/proof-c.jpg',
        Verified: 'TRUE',
        ModifiedAt: '2026-08-03T09:00:00.000Z'
      })
    ]
  });

  harness.loadPicDashboard();
  await flushDashboardRender();

  const listHtml = harness.elements.get('pic-donor-list').innerHTML;

  // Queue heading exists
  assert.match(listHtml, /Pengingat pembayaran/);
  assert.match(listHtml, /Terverifikasi/);

  // Bulk reminder button is present in reminder section
  assert.match(listHtml, /Salin Rekap Pengingat|Salin Pengingat/);

  // Trigger bulk reminder copy
  harness.context.copyUnpaidDonorsRecap();
  const copied = harness.getClipboardText();
  assert.ok(copied.includes('Donatur A'), 'copied text includes unpaid Donatur A');
  assert.ok(copied.includes('Donatur B'), 'copied text includes unpaid Donatur B');
  assert.ok(!copied.includes('Donatur C'), 'copied text should NOT include verified Donatur C');
});
