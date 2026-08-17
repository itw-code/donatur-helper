const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS_FILES = [
  'js/config.js',
  'js/storage.js',
  'js/utils.js',
  'js/state.js',
  'js/api.js',
  'js/views/auth.js',
  'js/views/donor.js',
  'js/views/pic.js',
  'js/views/admin.js',
  'js/views/superadmin.js',
  'js/app.js'
];

function getAppScript() {
  const rootDir = path.join(__dirname, '..');
  let combined = '';

  for (const relPath of JS_FILES) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Module file missing: ${relPath}`);
    }
    let code = fs.readFileSync(fullPath, 'utf8');

    // Remove import statements
    code = code.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
    code = code.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');

    // Convert export default to regular expression or remove
    code = code.replace(/^\s*export\s+default\s+[\s\S]*?;?\s*$/gm, '');

    // Convert export const/let/var/function to regular declarations
    code = code.replace(/^\s*export\s+(async\s+)?(function\s+\w+)/gm, '$1$2');
    code = code.replace(/^\s*export\s+(const|let|var)\s+/gm, 'var ');

    combined += `\n/* --- ${relPath} --- */\n` + code;
  }

  return combined;
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

function createBrowserHarness(options = {}) {
  const detail = options.detail || null;
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
      if (selector === '#admin-action-queue [id^="admin-queue-"]') {
        return ['admin-queue-pending', 'admin-queue-late'].map(name => getElement(name));
      }
      return [];
    }
  };

  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };

  const fetch = async (_url, fetchOpts) => {
    if (options.customFetch) {
      return options.customFetch(_url, fetchOpts);
    }
    const request = JSON.parse(fetchOpts.body);
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
    window,
    ...options.extraContext
  };

  const script = getAppScript();
  vm.runInNewContext(script, context, { filename: 'bundle.js' });
  localStorage.setItem('auth_token', 'pic-token');

  return {
    elements,
    context,
    script
  };
}

module.exports = {
  JS_FILES,
  getAppScript,
  makeElement,
  createBrowserHarness
};
