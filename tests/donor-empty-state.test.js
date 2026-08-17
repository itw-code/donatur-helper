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

test('Donor dashboard empty state renders reassuring message and next-step CTA', async () => {
  const harness = createBrowserHarness({
    getUserPicCampaigns: [],
    listActiveCampaigns: [
      campaign('c-open', 'Active Campaign', { status: 'Open', joined: false })
    ]
  });
  harness.setUser({
    name: 'Quiet Donor',
    whatsapp: '628123456789',
    verified: true,
    status: 'active'
  });

  harness.loadUserDashboard();
  await settle();

  const html = harness.elements.get('actual-campaign-list').innerHTML;

  // Has reassurance copy
  assert.match(html, /Tidak ada tagihan tertunda/);
  // Has next step CTA
  assert.match(html, /Lihat campaign yang masih terbuka/);
});
