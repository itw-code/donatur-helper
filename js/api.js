// API Network Layer with Serial Write Queue, Timeout Hardening and Error Handling

import { SCRIPT_URL } from './config.js';

export const DEFAULT_TIMEOUT_MS = 15000;

export function fetchBackend(name, args, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = null;
  if (controller && timeoutMs > 0) {
    timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
  }

  const fetchOptions = {
    method: 'POST',
    body: JSON.stringify({ action: name, params: args }),
    mode: 'cors',
    credentials: 'omit',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    }
  };

  if (controller) {
    fetchOptions.signal = controller.signal;
  }

  return fetch(SCRIPT_URL, fetchOptions)
    .then(async response => {
      if (timer) clearTimeout(timer);
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error("Respons server bukan JSON (mungkin error atau diblokir). Detail: " + text.substring(0, 80));
      }
    })
    .then(res => {
      if (res.status === 'error') throw new Error(res.message);
      if (res.data && typeof res.data === 'object' && res.data.error) {
        throw new Error(res.data.error);
      }
      return res.data;
    })
    .catch(err => {
      if (timer) clearTimeout(timer);
      if (err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort'))) {
        const timeoutErr = new Error('Permintaan memakan waktu lebih lama dari biasanya. Silakan coba lagi.');
        timeoutErr.isTimeout = true;
        throw timeoutErr;
      }
      throw err;
    });
}

export function run(fn) {
  if (!fn || !fn.name) {
    return Promise.reject(new Error('Backend function is missing or invalid.'));
  }
  return fetchBackend(fn.name, fn.args || []);
}

// --- API WRITE QUEUE SYSTEM ---
const writeQueue = [];
let isWriting = false;

function processWriteQueue() {
  if (isWriting || writeQueue.length === 0) return;

  isWriting = true;
  const task = writeQueue.shift();

  fetchBackend(task.name, task.args)
    .then(res => {
      isWriting = false;
      task.resolve(res);
      processWriteQueue();
    })
    .catch(e => {
      isWriting = false;
      task.reject(e);
      processWriteQueue();
    });
}

export function callQueued(name, ...args) {
  return new Promise((resolve, reject) => {
    writeQueue.push({ name, args, resolve, reject });
    processWriteQueue();
  });
}

export const inFlightRequests = new Map();

const MUTATING_ACTION_PREFIXES = [
  'create',
  'update',
  'delete',
  'record',
  'admin',
  'pic',
  'submit',
  'toggle',
  'sweep',
  'archive',
  'approve',
  'save',
  'userlogin',
  'tokenlogin'
];

function isMutatingAction(name) {
  if (!name) return true;
  const lower = name.toLowerCase();
  return MUTATING_ACTION_PREFIXES.some(prefix => lower.startsWith(prefix));
}

export function call(name, ...args) {
  if (isMutatingAction(name)) {
    return fetchBackend(name, args);
  }

  const key = name + ':' + JSON.stringify(args);
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const reqPromise = fetchBackend(name, args)
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, reqPromise);
  return reqPromise;
}
