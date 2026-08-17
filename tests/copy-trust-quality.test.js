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

function createBrowserHarness(state = {}) {
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
    const resp = (state.mockResponses && state.mockResponses[request.action]) || [];
    return {
      async text() {
        return JSON.stringify({ status: 'success', data: resp });
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

  const script = getIndexHtml().match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, context, { filename: 'index.html' });

  return {
    elements,
    context
  };
}

test('HTML and JS strings do not contain legacy non-standard copy or English jargon', () => {
  const html = getIndexHtml();

  // Legacy copy checks
  assert.doesNotMatch(html, />\+ Generate token PIC baru</);
  assert.doesNotMatch(html, />Generate token Admin baru</);
  assert.doesNotMatch(html, />Jalankan Sweep Data</);
  assert.doesNotMatch(html, /Lihat sebagai PIC \(Deep Dive\)/);
  assert.doesNotMatch(html, />Recalculate Donor Split</);
  assert.doesNotMatch(html, /Teks berhasil di-copy!/);
  assert.doesNotMatch(html, /Pesan berhasil di-copy!/);
  assert.doesNotMatch(html, /Gagal meng-copy pesan/);
  assert.doesNotMatch(html, /Laporan berhasil di-copy/);
  assert.doesNotMatch(html, /Sweeping database\.\.\./);
});

test('Donor empty state renders welcoming, reassuring Indonesian copy', async () => {
  const harness = createBrowserHarness({
    mockResponses: {
      getUserPicCampaigns: [],
      listActiveCampaigns: [
        {
          campaignId: 'c-1',
          targetName: 'Budi Target',
          status: 'Open',
          joined: false,
          giftAmount: 500000,
          deadline: '2026-08-30',
          donorCount: 2
        }
      ]
    }
  });

  harness.context.safeSet('donor_user', JSON.stringify({ name: 'Budi', whatsapp: '628123456789', verified: true, status: 'active' }));
  harness.context.loadUserDashboard();

  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  const emptyHtml = harness.elements.get('actual-campaign-list').innerHTML;
  assert.match(emptyHtml, /Tidak ada tagihan tertunda/);
  assert.match(emptyHtml, /Lihat campaign yang masih terbuka/);
});

test('Admin summary displays scoped Indonesian labels for members, campaigns, and tokens', () => {
  const harness = createBrowserHarness();
  const { renderSummaryCard } = harness.context;

  const html = renderSummaryCard({
    campaignsByStatus: { Open: 3, Closed: 1, Finalized: 2 },
    totalDonors: 15,
    totalPending: 500000,
    totalCollected: 1500000,
    picTokens: { unused: 2, active: 4, expired: 1 },
    totalMembers: 50,
    activeMembers: 45
  });

  assert.match(html, /Ringkasan Operasional/);
  assert.match(html, /Campaign Terbuka/);
  assert.match(html, /Menunggu Finalisasi/);
  assert.match(html, /Total donatur/);
  assert.match(html, /Belum dibayar/);
  assert.match(html, /Terkumpul/);
  assert.match(html, /Token PIC: 2 belum dipakai, 4 aktif, 1 kedaluwarsa/);
  assert.match(html, /Members: 50 total di database \(45 aktif\)/);
});

test('PIC action priority headings and settled states maintain clear Indonesian grammar', () => {
  const harness = createBrowserHarness();
  const { getPicDonorQueueLabel } = harness.context;

  assert.equal(getPicDonorQueueLabel('reminder'), 'Pengingat pembayaran');
  assert.equal(getPicDonorQueueLabel('review'), 'Bukti Transfer perlu ditinjau');
  assert.equal(getPicDonorQueueLabel('refund'), 'Refund perlu diselesaikan');
  assert.equal(getPicDonorQueueLabel('missing-proof'), 'Bukti Transfer belum tersedia');
  assert.equal(getPicDonorQueueLabel('complete'), 'Terverifikasi');
  assert.equal(getPicDonorQueueLabel('participant'), 'Peserta terdaftar');
});
