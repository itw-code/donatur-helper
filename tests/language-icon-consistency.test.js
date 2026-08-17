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

function createBrowserHarness(responses) {
  const elements = new Map();
  const storage = new Map();

  const getElement = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };

  const document = {
    title: 'Donatur Helper',
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

  const { getAppScript } = require('./test-harness');
  const script = getAppScript();
  vm.runInNewContext(script, context, { filename: 'bundle.js' });

  return {
    elements,
    context,
    setUser(user) {
      localStorage.setItem('donor_user', JSON.stringify(user));
    },
    setPicToken() {
      localStorage.setItem('auth_role', 'PIC');
      localStorage.setItem('auth_token', 'pic-test');
    }
  };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('Indonesian labels are used across authenticated views and status SVGs include aria-hidden="true"', async () => {
  const harness = createBrowserHarness({
    getUserPicCampaigns: [],
    listActiveCampaigns: [
      {
        campaignId: 'c1',
        targetName: 'Target 1',
        status: 'Finalized',
        joined: true,
        paid: false,
        amountDue: 50000,
        bankName: 'BCA',
        bankAccount: '1234567890',
        accountHolder: 'Penerima'
      },
      {
        campaignId: 'c2',
        targetName: 'Target 2',
        status: 'Finalized',
        joined: true,
        paid: false,
        amountDue: 50000,
        bankName: 'BCA',
        bankAccount: '1234567890',
        accountHolder: 'Penerima'
      }
    ]
  });

  harness.setUser({
    name: 'Budi Test',
    whatsapp: '628123456789',
    verified: true,
    status: 'active'
  });

  harness.context.loadUserDashboard();
  await settle();

  const userDisplayNameHtml = harness.elements.get('u-display-name').innerHTML;
  assert.match(userDisplayNameHtml, /Member terverifikasi/);
  assert.doesNotMatch(userDisplayNameHtml, /Verified Member/);

  const campaignListHtml = harness.elements.get('actual-campaign-list').innerHTML;
  assert.match(campaignListHtml, /Pembayaran Gabungan/);
  assert.doesNotMatch(campaignListHtml, /Combined Payment/);
  assert.match(campaignListHtml, />Salin<\/button>|>📋 Salin<\/span>|>Salin<\/span>/);
  assert.doesNotMatch(campaignListHtml, />Copy<\/button>|>📋 Copy/);

  const { getAppScript } = require('./test-harness');
  const html = getIndexHtml() + getAppScript();
  assert.match(html, /Zona Berbahaya/);
  assert.doesNotMatch(html, /<h3>Danger Zone<\/h3>/);
  assert.match(html, /aria-hidden="true"/);
});

test('High-priority copy, brand header, and action buttons use standardized Indonesian terms', () => {
  const { getAppScript } = require('./test-harness');
  const html = getIndexHtml() + getAppScript();

  // 1. Brand header
  assert.match(html, /<h1>Donatur Helper<\/h1>/);
  assert.doesNotMatch(html, /<h1>Donation Helper<\/h1>/);

  // 2. Toast default
  assert.match(html, /<div id="toast"[^>]*>Teks berhasil disalin!<\/div>/);
  assert.doesNotMatch(html, /Teks berhasil di-copy!/);

  // 3. Admin & SuperAdmin action labels
  assert.match(html, />\+ Buat token PIC baru<\/button>/);
  assert.doesNotMatch(html, />\+ Generate token PIC baru<\/button>/);

  assert.match(html, />Buat token Admin baru<\/button>/);
  assert.doesNotMatch(html, />Generate token Admin baru<\/button>/);

  assert.match(html, />Bersihkan Arsip Data<\/button>/);
  assert.doesNotMatch(html, />Jalankan Sweep Data<\/button>/);

  // 4. Admin detail modal actions
  assert.match(html, /Tinjau sebagai PIC/);
  assert.doesNotMatch(html, /Lihat sebagai PIC \(Deep Dive\)/);

  assert.match(html, /Hitung Ulang Tagihan Donatur/);
  assert.doesNotMatch(html, /Recalculate Donor Split/);

  // 5. Toast & Modal clipboard texts
  assert.doesNotMatch(html, /di-copy/i);
  assert.doesNotMatch(html, /meng-copy/i);
});
