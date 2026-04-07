const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const PREFIX = "ado-cache:";

const cache = {
  _data: {},
  _listeners: new Set(),

  init() {
    // Migrate legacy single-blob cache
    try {
      localStorage.removeItem("ado-superui-cache");
    } catch {}

    // Hydrate from individual localStorage keys
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const lsKey = localStorage.key(i);
        if (!lsKey.startsWith(PREFIX)) continue;
        const cacheKey = lsKey.slice(PREFIX.length);
        try {
          this._data[cacheKey] = JSON.parse(localStorage.getItem(lsKey));
        } catch {}
      }
    } catch {}

    // Listen for cross-tab changes
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (!e.key || !e.key.startsWith(PREFIX)) return;
        const cacheKey = e.key.slice(PREFIX.length);
        if (e.newValue === null) {
          delete this._data[cacheKey];
        } else {
          try {
            this._data[cacheKey] = JSON.parse(e.newValue);
          } catch {}
        }
      });
    }
  },

  _persist(key) {
    const entry = this._data[key];
    if (entry) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(entry));
      } catch {}
    } else {
      try {
        localStorage.removeItem(PREFIX + key);
      } catch {}
    }
  },

  get(key) {
    const entry = this._data[key];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      delete this._data[key];
      this._persist(key);
      return null;
    }
    return entry.data;
  },

  set(key, data, ttl = CACHE_TTL) {
    this._data[key] = { data, timestamp: Date.now(), ttl };
    this._persist(key);
    this._notify(key, this._data[key]);
  },

  subscribe(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  },

  _notify(key, entry) {
    this._listeners.forEach(cb => cb(key, entry));
  },

  clear() {
    for (const key of Object.keys(this._data)) {
      try {
        localStorage.removeItem(PREFIX + key);
      } catch {}
    }
    this._data = {};
  },

  invalidate(prefix) {
    for (const key of Object.keys(this._data)) {
      if (key.startsWith(prefix)) {
        delete this._data[key];
        try {
          localStorage.removeItem(PREFIX + key);
        } catch {}
      }
    }
  }
};

cache.init();

export default cache;
export { CACHE_TTL };
