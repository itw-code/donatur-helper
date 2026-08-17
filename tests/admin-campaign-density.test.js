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

function createBrowserHarness(responses) {
  const elements = new Map();
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
    createElement(tagName) { return makeElement('', tagName); },
    getElementById: getElement,
    querySelectorAll() { return []; }
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

test('Admin campaign mobile cards display primary metrics first and demote secondary audit info into disclosure', async () => {
  const campaigns = [
    {
      CampaignID: 'c-admin-density',
      TargetName: 'Density Target',
      picName: 'Audit PIC',
      Status: 'Open',
      Deadline: '2026-09-01',
      paidCount: 5,
      donorCount: 10,
      CreatedAt: '2026-08-01',
      ModifiedBy: 'Super Admin',
      ModifiedAt: '2026-08-02T10:00:00.000Z'
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

  // Primary metrics
  assert.match(campaignListHtml, /Density Target/);
  assert.match(campaignListHtml, /5\/10 sudah bayar/);
  assert.match(campaignListHtml, /Sisa waktu/);
  assert.match(campaignListHtml, /Lihat detail/);

  // Secondary audit info in disclosure
  assert.match(campaignListHtml, /admin-card-more/);
  assert.match(campaignListHtml, /Info PIC &amp; Log|Info PIC & Log/);
});
