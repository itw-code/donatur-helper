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
    appendChild(child) {
      if (child.id) this.children = (this.children || []).concat(child);
    },
    focus() {},
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
    if (request.action === 'getCampaignForPic') {
      return {
        async text() {
          return JSON.stringify({ status: 'success', data: detail });
        }
      };
    }
    return {
      async text() {
        return JSON.stringify({ status: 'success', data: [] });
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
    context
  };
}

test('statusBadge returns standardized Indonesian labels for all campaign statuses', () => {
  const harness = createBrowserHarness();
  const { statusBadge } = harness.context;

  assert.match(statusBadge('Open'), />Terbuka<\/span>/);
  assert.match(statusBadge('Closed'), />Menunggu finalisasi<\/span>/);
  assert.match(statusBadge('Finalized'), />Final<\/span>/);
  assert.match(statusBadge('Archived'), />Selesai<\/span>/);
});

test('renderAdminCampaignDeadline includes absolute date and correct semantic urgency', () => {
  const harness = createBrowserHarness();
  const { renderAdminCampaignDeadline } = harness.context;

  const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const overdueHtml = renderAdminCampaignDeadline({ Deadline: pastDate, Status: 'Open' });

  assert.match(overdueHtml, /Terlewat \d+ hari/);
  assert.match(overdueHtml, /\(\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\)/);
  assert.match(overdueHtml, /class="semantic-status danger"/);

  const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const activeHtml = renderAdminCampaignDeadline({ Deadline: futureDate, Status: 'Open' });
  assert.match(activeHtml, /\d+ hari lagi/);
  assert.match(activeHtml, /\(\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\)/);
});

test('PIC donor queue badges use standardized Indonesian terminology (Perlu Ditinjau, Bukti Belum Diunggah, Terverifikasi, Belum Bayar)', async () => {
  const harness = createBrowserHarness({
    campaign: {
      CampaignID: 'C-SEMANTICS',
      TargetName: 'Semantics Test Target',
      Status: 'Finalized',
      GiftAmount: 400000,
      Deadline: '2026-08-20'
    },
    donors: [
      {
        Name: 'Donor Unpaid',
        WhatsApp: '628111111111',
        JoinedAt: '2026-08-01T09:00:00.000Z',
        Paid: 'FALSE',
        Verified: 'FALSE',
        AmountDue: 100000
      },
      {
        Name: 'Donor Need Review',
        WhatsApp: '628222222222',
        JoinedAt: '2026-08-01T09:00:00.000Z',
        Paid: 'TRUE',
        ProofLink: 'https://example.test/proof.jpg',
        Verified: 'FALSE',
        AmountDue: 100000,
        AmountPaid: 100000
      },
      {
        Name: 'Donor Missing Proof',
        WhatsApp: '628333333333',
        JoinedAt: '2026-08-01T09:00:00.000Z',
        Paid: 'TRUE',
        ProofLink: '',
        Verified: 'FALSE',
        AmountDue: 100000,
        AmountPaid: 100000
      },
      {
        Name: 'Donor Verified',
        WhatsApp: '628444444444',
        JoinedAt: '2026-08-01T09:00:00.000Z',
        Paid: 'TRUE',
        ProofLink: 'https://example.test/proof.jpg',
        Verified: 'TRUE',
        AmountDue: 100000,
        AmountPaid: 100000
      }
    ]
  });

  harness.context.loadPicDashboard();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  const listHtml = harness.elements.get('pic-donor-list').innerHTML;

  // Assert standardized badges
  assert.match(listHtml, />Perlu Ditinjau<\/span>/);
  assert.doesNotMatch(listHtml, />Perlu Cek<\/span>/);

  assert.match(listHtml, />Bukti Belum Diunggah<\/span>/);
  assert.doesNotMatch(listHtml, />Bukti Belum Ada<\/span>/);

  assert.match(listHtml, />Terverifikasi<\/span>/);
  assert.match(listHtml, />Belum Bayar<\/span>/);
});
