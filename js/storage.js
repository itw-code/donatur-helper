// Safe LocalStorage Wrappers

export function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

export function safeSet(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch (e) {
    console.warn("Storage blocked");
  }
}

export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}
