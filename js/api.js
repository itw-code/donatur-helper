// API Network Layer with Serial Write Queue, Timeout Hardening and Error Handling

import { fetchBackend as adapterFetchBackend } from './services/backendAdapter.js';

export const DEFAULT_TIMEOUT_MS = 15000;

export function fetchBackend(name, args, options = {}) {
  const runner = (typeof adapterFetchBackend === 'function')
    ? adapterFetchBackend
    : (typeof window !== 'undefined' && window.__dhBackendAdapter && typeof window.__dhBackendAdapter.fetchBackend === 'function' ? window.__dhBackendAdapter.fetchBackend : null);

  if (runner) {
    return runner(name, args, options);
  }
  throw new Error('Backend adapter is not available.');
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
