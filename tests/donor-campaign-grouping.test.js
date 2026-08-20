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
    appendChild(child) {
      if (child.id) this.children = (this.children || []).concat(child);
    },
    focus() {},
    setAttribute() {},
    getAttribute() { return null; }
  };
}

function createBrowserHarness(responses) {
  const elements = new Map();
  const calls = [];
  const storage = new Map();

  const getElement = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };

  const document = {
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
        return ['landing', 'user-login', 'user-dashboard', 'token-login', 'pic-dashboard']
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
    calls.push(request);
    const response = responses[request.action];
    return {
      async text() {
        return JSON.stringify({
          status: 'success',
          data: typeof response === 'function' ? response(request.params) : response
        });
      }
    };
  };

  const window = {
    location: { hash: '', search: '' },
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

  return {
    calls,
    elements,
    loadUserDashboard: context.loadUserDashboard,
    setUser(user) {
      localStorage.setItem('donor_user', JSON.stringify(user));
    }
  };
}

function campaign(campaignId, targetName, overrides = {}) {
  return {
    campaignId,
    targetName,
    reason: '',
    giftAmount: 1000000,
    status: 'Open',
    deadline: '2099-01-01',
    createdAt: 1,
    donorCount: 1,
    joined: false,
    ...overrides
  };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('Donor campaign list separates Bisa Diikuti, Sudah Diikuti, and Selesai disclosure', async () => {
  const harness = createBrowserHarness({
    getUserPicCampaigns: [],
    listActiveCampaigns: [
      campaign('c-joinable', 'Joinable Open Campaign', { status: 'Open', joined: false }),
      campaign('c-joined', 'Already Joined Campaign', { status: 'Open', joined: true }),
      campaign('c-archived', 'Archived Old Campaign', { status: 'Archived', joined: false })
    ]
  });
  harness.setUser({
    name: 'Grouping Donor',
    whatsapp: '628123456789',
    verified: true,
    status: 'active'
  });

  harness.loadUserDashboard();
  await settle();

  const html = harness.elements.get('actual-campaign-list').innerHTML;

  // Group headings
  assert.match(html, /Bisa Diikuti|Bisa diikuti/);
  assert.match(html, /Sudah Diikuti|Campaign yang Diikuti/);
  assert.match(html, /donor-history-disclosure|Riwayat/);

  // Position assertions: Open joinable comes before history disclosure
  const joinableIdx = html.indexOf('Joinable Open Campaign');
  const historyIdx = html.indexOf('Archived Old Campaign');
  assert.ok(joinableIdx !== -1 && historyIdx !== -1);
  assert.ok(joinableIdx < historyIdx, 'Bisa Diikuti should appear before History disclosure');
});

test('Donor pending payments only include Finalized campaigns and merge only when bank details match', async () => {
  const harness = createBrowserHarness({
    getUserPicCampaigns: [],
    listActiveCampaigns: [
      // 2 Open joined campaigns (MUST NOT be in Menunggu Pembayaran)
      campaign('c-open-1', 'Open Pledged Campaign 1', { status: 'Open', joined: true, paid: false, amountDue: 0 }),
      campaign('c-open-2', 'Open Pledged Campaign 2', { status: 'Open', joined: true, paid: false, amountDue: 25000 }),
      // 2 Finalized campaigns sharing BCA 0101971057 a.n. Pindy (SHOULD be merged)
      campaign('c-fin-bca1', 'Target Alpha', {
        status: 'Finalized', joined: true, paid: false, amountDue: 35000,
        bankName: 'BCA', bankAccount: '0101971057', accountHolder: 'Pindy Leliany'
      }),
      campaign('c-fin-bca2', 'Target Beta', {
        status: 'Finalized', joined: true, paid: false, amountDue: 33333,
        bankName: 'BCA', bankAccount: '0101971057', accountHolder: 'Pindy Leliany'
      }),
      // 1 Finalized campaign with Mandiri 987654321 a.n. Budi (SHOULD be standalone)
      campaign('c-fin-mandiri', 'Target Gamma', {
        status: 'Finalized', joined: true, paid: false, amountDue: 50000,
        bankName: 'Mandiri', bankAccount: '987654321', accountHolder: 'Budi Santoso'
      })
    ]
  });
  harness.setUser({
    name: 'Multi Campaign Donor',
    whatsapp: '628123456789',
    verified: true,
    status: 'active'
  });

  harness.loadUserDashboard();
  await settle();

  const html = harness.elements.get('actual-campaign-list').innerHTML;

  // Verify Menunggu Pembayaran heading exists
  assert.match(html, /Menunggu Pembayaran/);

  // Verify BCA campaigns are merged into 1 card with 2 campaigns
  assert.match(html, /Pembayaran Gabungan \(2 Campaign\)/);
  assert.match(html, /Target Alpha/);
  assert.match(html, /Target Beta/);
  assert.match(html, /Rp68\.333/); // 35000 + 33333 = 68333

  // Verify Mandiri is separate standalone card
  assert.match(html, /Target Gamma/);
  assert.match(html, /Mandiri 987654321/);

  // Verify Open campaigns are NOT in Menunggu Pembayaran and are under Campaign yang Diikuti
  assert.match(html, /Campaign yang Diikuti/);
  assert.match(html, /Open Pledged Campaign 1/);
  assert.match(html, /Open Pledged Campaign 2/);
  assert.match(html, /Menunggu finalisasi oleh PIC/);
});
