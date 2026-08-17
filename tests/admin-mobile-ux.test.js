const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function getIndexHtml() {
  return fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
}

function makeElement(id, tagName = 'div') {
  const classes = new Set();
  const attributes = new Map();
  const children = [];

  const elem = {
    id,
    tagName: tagName.toUpperCase(),
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
    focus() {},
    setAttribute(k, v) { attributes.set(k, String(v)); },
    getAttribute(k) { return attributes.get(k) || null; },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const results = [];
      const check = el => {
        if (!el) return;
        if (sel.startsWith('.') && el.classList && el.classList.contains(sel.slice(1))) {
          results.push(el);
        } else if (sel.startsWith('#') && el.id === sel.slice(1)) {
          results.push(el);
        } else if (sel.startsWith('[') && sel.endsWith(']')) {
          const attr = sel.slice(1, -1);
          if (el.getAttribute && el.getAttribute(attr) !== null) results.push(el);
        }
        if (el.children) el.children.forEach(check);
      };
      children.forEach(check);
      return results;
    }
  };
  return elem;
}

function createBrowserHarness(responses = {}) {
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
    createElement(tagName) {
      return makeElement('', tagName);
    },
    getElementById: getElement,
    querySelectorAll(selector) {
      if (selector === '.wrap > div[id^="view-"]') {
        return ['landing', 'user-login', 'user-dashboard', 'token-login', 'pic-dashboard', 'admin-dashboard', 'superadmin-dashboard']
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
    location: { hash: '', search: '', pathname: '/' },
    history: { replaceState() {} },
    addEventListener() {},
    matchMedia() { return { matches: false }; },
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {}
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
    setInterval: () => 1,
    clearInterval: () => {},
    window
  };

  const { getAppScript } = require('./test-harness');
  const script = getAppScript();
  vm.runInNewContext(script, context, { filename: 'bundle.js' });

  return {
    calls,
    elements,
    context,
    setRole(role, token = 'ADMIN_TOKEN_123') {
      localStorage.setItem('auth_role', role);
      localStorage.setItem('auth_token', token);
    }
  };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('Admin sticky navigation bar and section anchors are present in HTML', () => {
  const html = getIndexHtml();
  const viewsCssPath = path.join(__dirname, '..', 'css', 'views.css');
  const viewsCss = fs.existsSync(viewsCssPath) ? fs.readFileSync(viewsCssPath, 'utf8') : '';
  const allStyles = html + '\n' + viewsCss;

  assert.match(html, /class="admin-nav-bar"/);
  assert.match(html, /href="#admin-summary" class="admin-nav-link"/);
  assert.match(html, /href="#admin-section-campaigns" class="admin-nav-link"/);
  assert.match(html, /href="#admin-section-members" class="admin-nav-link"/);
  assert.match(html, /href="#admin-section-tools" class="admin-nav-link"/);
  assert.match(html, /class="admin-nav-link admin-nav-logout"/);
  assert.match(html, /id="admin-section-campaigns" class="card admin-section"/);
  assert.match(html, /id="admin-section-members" class="card admin-section"/);
  assert.match(html, /id="admin-section-tools" class="card admin-section"/);
  assert.match(allStyles, /scroll-margin-top:\s*72px/);
});

test('SuperAdmin sticky navigation bar and section anchors are present in HTML', () => {
  const html = getIndexHtml();
  assert.match(html, /aria-label="Navigasi super admin"/);
  assert.match(html, /href="#sa-summary" class="admin-nav-link"/);
  assert.match(html, /href="#sa-section-campaigns" class="admin-nav-link"/);
  assert.match(html, /href="#sa-section-admins" class="admin-nav-link"/);
  assert.match(html, /href="#sa-section-members" class="admin-nav-link"/);
  assert.match(html, /href="#sa-section-settings" class="admin-nav-link"/);
  assert.match(html, /id="sa-summary" class="card admin-section"/);
  assert.match(html, /id="sa-section-campaigns" class="card admin-section"/);
  assert.match(html, /id="sa-section-admins" class="card admin-section"/);
  assert.match(html, /id="sa-section-members" class="card admin-section"/);
});

test('Admin and SuperAdmin sticky navigation bar has solid opaque background styling', () => {
  const html = getIndexHtml();
  const viewsCssPath = path.join(__dirname, '..', 'css', 'views.css');
  const viewsCss = fs.existsSync(viewsCssPath) ? fs.readFileSync(viewsCssPath, 'utf8') : '';
  const allStyles = html + '\n' + viewsCss;
  assert.match(allStyles, /\.admin-nav-bar\s*\{[^}]*background:\s*(#ffffff|var\(--card\)|#fff)/i);
});

test('Admin member list paginates to maximum 20 initial records with Load More affordance', async () => {
  const dummyMembers = [];
  for (let i = 1; i <= 92; i++) {
    dummyMembers.push({
      Name: 'Member ' + i,
      WhatsApp: '6281234567' + (10 + i),
      Role: 'Member',
      Status: 'Active',
      ModifiedAt: '2026-08-01T10:00:00.000Z',
      ModifiedBy: 'Admin'
    });
  }

  const harness = createBrowserHarness({
    fetchAllMembers: dummyMembers,
    getPendingMembers: [],
    getPendingLateRequests: [],
    listAllCampaigns: [],
    getDashboardSummary: {
      campaignsByStatus: { Open: 2, Closed: 1, Finalized: 3, Archived: 0 },
      totalDonors: 50,
      totalPending: 500000,
      totalCollected: 1500000,
      totalMembers: 94,
      activeMembers: 90,
      picTokens: { unused: 2, active: 3, expired: 1 }
    }
  });

  harness.setRole('Admin');
  harness.context.loadAdminDashboard();
  await settle();

  const memberListEl = harness.elements.get('admin-member-list');
  const summaryEl = harness.elements.get('admin-member-filter-summary');

  assert.ok(memberListEl.innerHTML.includes('Member 1'), 'should show first member');
  assert.ok(memberListEl.innerHTML.includes('Member 20'), 'should show 20th member');
  assert.ok(!memberListEl.innerHTML.includes('Member 21'), 'should NOT show 21st member initially');
  assert.match(memberListEl.innerHTML, /Muat lebih banyak/);
  assert.match(memberListEl.innerHTML, /Menampilkan 20 dari 92 member/);
  assert.match(summaryEl.textContent, /Menampilkan 20 dari 92 member/);

  // Trigger load more
  harness.context.loadMoreMembers('admin');
  assert.ok(memberListEl.innerHTML.includes('Member 40'), 'should show 40th member after load more');
  assert.ok(!memberListEl.innerHTML.includes('Member 41'), 'should NOT show 41st member after 1 load more');
  assert.match(memberListEl.innerHTML, /Menampilkan 40 dari 92 member/);

  // Search filter resets pagination
  const searchInput = harness.context.document.getElementById('admin-search-member');
  searchInput.value = 'Member 9';
  harness.context.filterMembers('admin-member-list', 'admin-search-member', 'admin-member-status-filter', 'admin-member-filter-summary');
  // Matching: Member 9, Member 90, Member 91, Member 92
  assert.ok(memberListEl.innerHTML.includes('Member 9'), 'should show matched search items');
  assert.match(summaryEl.textContent, /Menampilkan/);
});

test('Admin summary clarifies scopes: total vs active members and pic token status', async () => {
  const summaryData = {
    campaignsByStatus: { Open: 2, Closed: 1, Finalized: 3, Archived: 0 },
    totalDonors: 50,
    totalPending: 500000,
    totalCollected: 1500000,
    totalMembers: 94,
    activeMembers: 90,
    picTokens: { unused: 2, active: 3, expired: 1 }
  };

  const harness = createBrowserHarness({
    getDashboardSummary: summaryData,
    fetchAllMembers: [],
    getPendingMembers: [],
    getPendingLateRequests: [],
    listAllCampaigns: []
  });

  harness.setRole('Admin');
  harness.context.refreshSummary('admin-summary');
  await settle();

  const summaryHtml = harness.elements.get('admin-summary').innerHTML;
  assert.match(summaryHtml, /Ringkasan Operasional/);
  assert.match(summaryHtml, /Campaign Terbuka/);
  assert.match(summaryHtml, /Menunggu Finalisasi/);
  assert.match(summaryHtml, /94 total di database/);
  assert.match(summaryHtml, /90 aktif/);
  assert.match(summaryHtml, /Token PIC:/);
  assert.match(summaryHtml, /2 belum dipakai/);
});

test('Overdue campaign communication shows absolute deadline date and next step callout', async () => {
  const campaigns = [
    {
      CampaignID: 'c-overdue-open',
      TargetName: 'Overdue Colleague',
      picName: 'Budi PIC',
      Status: 'Open',
      Deadline: '2020-01-15',
      paidCount: 0,
      donorCount: 5,
      CreatedAt: '2020-01-01'
    }
  ];

  const harness = createBrowserHarness({
    listAllCampaigns: campaigns,
    fetchAllMembers: [],
    getPendingMembers: [],
    getPendingLateRequests: [],
    getDashboardSummary: {}
  });

  harness.setRole('Admin');
  harness.context.refreshAdminCampaigns();
  await settle();

  const campaignListHtml = harness.elements.get('admin-campaign-list').innerHTML;
  assert.match(campaignListHtml, /Terlewat/);
  assert.match(campaignListHtml, /15 Jan 2020/);
  assert.match(campaignListHtml, /Campaign terlewat:/);
  assert.match(campaignListHtml, /Hubungi PIC untuk menutup pendaftaran atau perbarui deadline/);
});
