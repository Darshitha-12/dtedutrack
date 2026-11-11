const store = typeof localStorage !== "undefined" ? localStorage : new Map();
class LocalStorage {
  constructor() {}
  getItem(k) {
    return typeof localStorage !== "undefined" ? localStorage.getItem(k) : (store.get(k) ?? null);
  }
  setItem(k, v) {
    if (typeof localStorage !== "undefined") localStorage.setItem(k, v); else store.set(k, v);
  }
  removeItem(k) {
    if (typeof localStorage !== "undefined") localStorage.removeItem(k); else store.delete(k);
  }
  clear() {
    if (typeof localStorage !== "undefined") localStorage.clear(); else store.clear();
  }
}
module.exports = { LocalStorage };