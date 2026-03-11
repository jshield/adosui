const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cache = {
  _data: {},
  init() {
    try {
      const stored = localStorage.getItem("ado-superui-cache");
      if (stored) this._data = JSON.parse(stored);
    } catch {}
  },
  save() {
    try {
      localStorage.setItem("ado-superui-cache", JSON.stringify(this._data));
    } catch {}
  },
  get(key) {
    const entry = this._data[key];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      delete this._data[key];
      this.save();
      return null;
    }
    return entry.data;
  },
  set(key, data, ttl = CACHE_TTL) {
    this._data[key] = { data, timestamp: Date.now(), ttl };
    this.save();
  },
  clear() {
    this._data = {};
    this.save();
  },
  invalidate(prefix) {
    for (const key of Object.keys(this._data)) {
      if (key.startsWith(prefix)) {
        delete this._data[key];
      }
    }
    this.save();
  }
};

cache.init();

export default cache;
export { CACHE_TTL };
