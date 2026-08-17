// API Network Layer with Serial Write Queue and Error Handling

import { SCRIPT_URL } from './config.js';

export function fetchBackend(name, args) {
  return fetch(SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({ action: name, params: args }),
    mode: 'cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    }
  })
    .then(async response => {
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

export function call(name, ...args) {
  return fetchBackend(name, args);
}
