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

function createBrowserHarness() {
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

  const fetch = async () => ({
    async text() {
      return JSON.stringify({ status: 'success', data: {} });
    }
  });

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

test('formatUserErrorMessage converts network, timeout, and raw errors into calm, helpful Indonesian messages', () => {
  const harness = createBrowserHarness();
  const { formatUserErrorMessage } = harness.context;

  assert.equal(typeof formatUserErrorMessage, 'function', 'formatUserErrorMessage function must be defined');

  // Network failures
  assert.equal(
    formatUserErrorMessage(new Error('Failed to fetch')),
    'Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.'
  );
  assert.equal(
    formatUserErrorMessage('NetworkError when attempting to fetch resource'),
    'Koneksi terputus. Periksa jaringan internet Anda dan coba lagi.'
  );

  // Timeout / abort
  assert.equal(
    formatUserErrorMessage(new Error('Request timeout after 15000ms')),
    'Waktu permintaan habis. Silakan coba beberapa saat lagi.'
  );

  // Session / unauthorized
  assert.equal(
    formatUserErrorMessage(new Error('Unauthorized token expired')),
    'Sesi akses Anda telah berakhir. Silakan masuk kembali.'
  );

  // Sanitized regular errors
  assert.equal(
    formatUserErrorMessage(new Error('Pendaftaran ditolak oleh server')),
    'Pendaftaran ditolak oleh server'
  );

  // Null or undefined
  assert.equal(
    formatUserErrorMessage(null),
    'Terjadi kendala saat memproses permintaan. Silakan coba lagi.'
  );
});

test('Privacy callout and upload microcopy use reassuring, transparent Indonesian wording', () => {
  const html = getIndexHtml();

  // Reassuring privacy notice on login
  assert.match(html, /Kami menjaga privasi Anda/);
  assert.match(html, /verifikasi login dan pengingat patungan/);

  // Payment proof microcopy
  assert.match(html, /format JPG, PNG, atau PDF maks 2MB/);
  assert.match(html, /Bukti hanya digunakan oleh PIC untuk verifikasi/);
});
