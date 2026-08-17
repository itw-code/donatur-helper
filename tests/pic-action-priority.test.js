const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { getAppScript } = require('./test-harness');
const inlineScript = getAppScript();

function makeElement(id) {
  const classes = new Set();
  const attributes = new Map();
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
    setAttribute(k, v) { attributes.set(k, String(v)); },
    getAttribute(k) { return attributes.get(k) || null; }
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
    body: {
      appendChild(element) {
        if (element.id) elements.set(element.id, element);
      }
    },
    addEventListener() {},
    createElement(tagName) { return makeElement(tagName); },
    getElementById: getElement,
    querySelectorAll() { return []; }
  };

  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };

  const fetch = async () => ({
    async text() {
      return JSON.stringify({ status: 'success', data: detail });
    }
  });

  const window = {
    location: { hash: '', search: '', pathname: '/' },
    history: { replaceState() {} },
    addEventListener() {},
    matchMedia() { return { matches: false }; },
    setTimeout,
    clearTimeout
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
    elements,
    context,
    setPicToken(token = 'PIC_TOKEN_123') {
      localStorage.setItem('auth_role', 'PIC');
      localStorage.setItem('auth_token', token);
    }
  };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('PIC Open Campaign: has 1 primary CTA, demoted secondary share box, and separated closing action', async () => {
  const detail = {
    campaign: {
      CampaignID: 'c-open',
      TargetName: 'Budi Resign',
      Reason: 'Resign per 1 Sept',
      Status: 'Open',
      GiftAmount: 0,
      Deadline: '2026-09-01'
    },
    donors: []
  };

  const harness = createBrowserHarness(detail);
  harness.setPicToken();
  harness.context.loadPicDashboard();
  await settle();

  const infoHtml = harness.elements.get('pic-campaign-info').innerHTML;
  const actionsHtml = harness.elements.get('pic-actions').innerHTML;

  // Zero-state reassurance callout
  assert.match(infoHtml, /pic-state-callout/);
  assert.match(infoHtml, /Tentukan total hadiah dan rekening sebelum menagih donatur/);

  // Demoted share box with secondary styling
  assert.match(actionsHtml, /class="pic-share-box"/);
  assert.match(actionsHtml, /class="btn secondary btn-auto"/);
  assert.match(actionsHtml, /Salin Undangan Patungan/);

  // Primary action is finalize / input rekening
  assert.match(actionsHtml, /class="btn blue"/);
  assert.match(actionsHtml, /Selesaikan &amp; input rekening|Selesaikan & input rekening/);

  // Closing action is secondary and distinct
  assert.match(actionsHtml, /class="btn secondary" onclick="closeList\(\)"/);
  assert.match(actionsHtml, /Tutup pendaftaran/);
});

test('PIC Closed Campaign: has primary finalize action and secondary reopen action', async () => {
  const detail = {
    campaign: {
      CampaignID: 'c-closed',
      TargetName: 'Ani Nikahan',
      Reason: '',
      Status: 'Closed',
      GiftAmount: 2000000,
      Deadline: '2026-08-30'
    },
    donors: []
  };

  const harness = createBrowserHarness(detail);
  harness.setPicToken();
  harness.context.loadPicDashboard();
  await settle();

  const actionsHtml = harness.elements.get('pic-actions').innerHTML;
  assert.match(actionsHtml, /class="btn blue" onclick="showFinalizeForm\(2000000\)"/);
  assert.match(actionsHtml, /class="btn secondary" onclick="reopenList\(\)"/);
});
