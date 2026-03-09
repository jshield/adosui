import { useState, useCallback, useEffect, useRef } from "react";

/* ─── LOCAL STORAGE HOOK ─────────────────────────────────────── */
function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });
  // Re-read from storage whenever the key changes (e.g. after profile loads and key is scoped)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      setValue(stored ? JSON.parse(stored) : initial);
    } catch { setValue(initial); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = useCallback((v) => {
    setValue(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [value, set];
}

/* ─── CACHE UTILITY ───────────────────────────────────────────── */
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

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&family=JetBrains+Mono:wght@400;500&family=Barlow:wght@300;400;500;600&display=swap');`;

const T = {
  bg: "#0A0B0E", panel: "#0D0F13", border: "rgba(255,255,255,0.06)",
  text: "#E5E7EB", muted: "#6B7280", dim: "#374151", dimmer: "#1F2937",
  amber: "#F59E0B", cyan: "#22D3EE", violet: "#A78BFA", red: "#F87171", green: "#4ADE80",
};

const USE_PROXY = import.meta.env.VITE_USE_PROXY !== "false";
const PROXY = import.meta.env.VITE_PROXY_URL || "http://localhost:3131";

/* ─── ADO CLIENT (PROXY OR DIRECT) ─────────────────────────────── */
class ADOClient {
  constructor(org, pat) {
    this.org = org.trim().replace(/\/$/, "");
    this.pat = pat;
    this.base = `https://dev.azure.com/${encodeURIComponent(this.org)}`;
    this.feedsBase = `https://feeds.dev.azure.com/${encodeURIComponent(this.org)}`;
    this._auth = `Basic ${btoa(":" + pat)}`;
    this._projects = [];
  }

  clearCache() {
    cache.clear();
    this._projects = [];
  }

  _getEndpoint(url) {
    if (USE_PROXY) {
      return PROXY;
    }
    return url;
  }

  _getHeaders(opts = {}) {
    const headers = {
      "Authorization": this._auth,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(opts.headers || {}),
    };
    if (USE_PROXY) {
      headers["X-Target-URL"] = opts.targetUrl || "";
    }
    return headers;
  }

  async _fetch(url, opts = {}) {
    const endpoint = this._getEndpoint(url);
    const fetchOpts = {
      method: opts.method || "GET",
      headers: this._getHeaders({ ...opts, targetUrl: url }),
      body: opts.body || undefined,
    };
    
    const res = await fetch(endpoint, fetchOpts);
    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch {}
      throw new Error(`${res.status}: ${msg}`);
    }
    return res.json();
  }

  async testConnection() {
    return this._fetch(`${this.base}/_apis/projects?api-version=7.1&$top=1`);
  }

  _cachedFetch(key, fetcher, ttl = CACHE_TTL) {
    const cached = cache.get(key);
    if (cached) return Promise.resolve(cached);
    return fetcher().then(data => {
      cache.set(key, data, ttl);
      return data;
    });
  }

  async getProjects(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("projects");
    const r = await this._cachedFetch("projects", () => 
      this._fetch(`${this.base}/_apis/projects?api-version=7.1&$top=200`)
    );
    this._projects = r.value || [];
    return this._projects;
  }

  async searchWorkItems(searchTerm = "", filters = {}) {
    let wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] IN ('Epic','Feature','User Story','Bug','Task') AND [System.State] NOT IN ('Closed','Removed')`;
    
    if (filters.types?.length) {
      const types = filters.types.map(t => `'${t}'`).join(",");
      wiql = wiql.replace(`IN ('Epic','Feature','User Story','Bug','Task')`, `IN (${types})`);
    }
    
    if (filters.states?.length) {
      const states = filters.states.map(s => `'${s}'`).join(",");
      wiql += ` AND [System.State] IN (${states})`;
    }
    
    if (filters.assignee) {
      const a = filters.assignee.replace(/'/g, "''");
      wiql += ` AND [System.AssignedTo] CONTAINS '${a}'`;
    }
    
    if (filters.areaPath) {
      const a = filters.areaPath.replace(/'/g, "''");
      wiql += ` AND [System.AreaPath] UNDER '${a}'`;
    }
    
    if (searchTerm.trim()) {
      const term = searchTerm.replace(/'/g, "''");
      wiql += ` AND ([System.Title] CONTAINS '${term}' OR [System.Description] CONTAINS '${term}')`;
    }
    
    wiql += " ORDER BY [System.ChangedDate] DESC";
    
    const r = await this._fetch(
      `${this.base}/_apis/wit/wiql?api-version=7.1&$top=200`,
      { method: "POST", body: JSON.stringify({ query: wiql }) }
    );
    if (!r.workItems?.length) return [];
    const ids = r.workItems.slice(0, 50).map(w => w.id).join(",");
    const fields = [
      "System.Id","System.Title","System.WorkItemType","System.State",
      "Microsoft.VSTS.Common.Priority","System.Parent","System.AssignedTo",
      "System.ChangedDate","System.AreaPath",
    ].join(",");
    const detail = await this._fetch(
      `${this.base}/_apis/wit/workitems?ids=${ids}&fields=${fields}&api-version=7.1`
    );
    return detail.value || [];
  }

  async getWorkItemsByIds(ids) {
    if (!ids?.length) return [];
    const fields = [
      "System.Id","System.Title","System.WorkItemType","System.State",
      "Microsoft.VSTS.Common.Priority","System.Parent","System.AssignedTo",
      "System.ChangedDate","System.AreaPath",
    ].join(",");
    const detail = await this._fetch(
      `${this.base}/_apis/wit/workitems?ids=${ids.join(",")}&fields=${fields}&api-version=7.1`
    );
    return detail.value || [];
  }

  async getAllRepos(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("repos-");
    return this._cachedFetch("repos-all", async () => {
      if (!this._projects.length) await this.getProjects();
      const all = [];
      for (const p of this._projects.slice(0, 10)) {
        try { all.push(...await this.getRepos(p.name)); } catch {}
      }
      return all;
    });
  }

  async getAllPipelines(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("pipelines-");
    return this._cachedFetch("pipelines-all", async () => {
      if (!this._projects.length) await this.getProjects();
      const all = [];
      for (const p of this._projects.slice(0, 10)) {
        try { all.push(...await this.getPipelines(p.name)); } catch {}
      }
      return all;
    });
  }

  async getAllPullRequests(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("prs-");
    return this._cachedFetch("prs-all", async () => {
      if (!this._projects.length) await this.getProjects();
      const all = [];
      for (const p of this._projects.slice(0, 10)) {
        try { all.push(...await this.getPullRequests(p.name)); } catch {}
      }
      return all;
    });
  }

  async getAllTestRuns(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("tests-");
    return this._cachedFetch("tests-all", async () => {
      if (!this._projects.length) await this.getProjects();
      const all = [];
      for (const p of this._projects.slice(0, 10)) {
        try { all.push(...await this.getTestRuns(p.name)); } catch {}
      }
      return all;
    });
  }

  async getRepos(project) {
    const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`);
    return r.value || [];
  }

  async getPipelines(project) {
    const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/pipelines?api-version=7.1&$top=50`);
    return r.value || [];
  }

  async getPullRequests(project) {
    const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/git/pullrequests?searchCriteria.status=active&$top=30&api-version=7.1`);
    return r.value || [];
  }

  async getTestRuns(project) {
    try {
      const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/test/runs?api-version=7.1&$top=20&includeRunDetails=true`);
      return r.value || [];
    } catch { return []; }
  }

  async getProfile() {
    return this._cachedFetch("profile", () =>
      this._fetch(`https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1`)
    );
  }

  // ── Server-side persistence ──────────────────────────────────────────────

  _patHash() {
    // SHA-256 of the PAT, computed in the browser via SubtleCrypto
    // Returns a promise resolving to a hex string
    const enc = new TextEncoder().encode(this.pat);
    return crypto.subtle.digest("SHA-256", enc).then(buf =>
      Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
    );
  }

  async loadCollections(profileId) {
    if (!USE_PROXY) return null; // persistence requires the server
    try {
      const res = await fetch(`${PROXY}/collections`, {
        method: "GET",
        headers: {
          "Authorization": this._auth,
          "X-Profile-Id": profileId,
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data.collections) ? data.collections : null;
    } catch { return null; }
  }

  async saveCollections(profileId, collections) {
    if (!USE_PROXY) return; // persistence requires the server
    try {
      const patHash = await this._patHash();
      await fetch(`${PROXY}/collections`, {
        method: "PUT",
        headers: {
          "Authorization": this._auth,
          "Content-Type": "application/json",
          "X-Profile-Id": profileId,
          "X-Pat-Hash": patHash,
        },
        body: JSON.stringify({ collections }),
      });
    } catch { /* fire-and-forget — silent failure */ }
  }
}

/* ─── UI ATOMS ───────────────────────────────────────────────── */
const Pill = ({ label, color }) => (
  <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 3, padding: "1px 7px", fontSize: 10, fontFamily: "'JetBrains Mono'", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
);
const Dot = ({ color, pulse }) => (
  <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block", ...(pulse ? { boxShadow: `0 0 6px ${color}` } : {}) }} />
);
const Card = ({ children, accent }) => (
  <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderLeft: `3px solid ${accent || T.dim}`, borderRadius: 6, padding: "10px 14px" }}>{children}</div>
);
const Section = ({ title, icon, count, children }) => (
  <div style={{ marginBottom: 22 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
      <span style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", letterSpacing: "0.1em", textTransform: "uppercase" }}>{icon} {title}</span>
      <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      {count !== undefined && <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>{count}</span>}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
  </div>
);
const Spinner = ({ size = 16 }) => (
  <span style={{ display: "inline-block", width: size, height: size, border: `2px solid ${T.dim}`, borderTopColor: T.amber, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
);

/* ─── FILTER PANEL ────────────────────────────────────────────── */
function FilterPanel({ filters, onChange, onClose }) {
  const [local, setLocal] = useState(filters || { types: [], states: [], assignee: "", areaPath: "" });
  const ALL_TYPES = ["Epic", "Feature", "User Story", "Bug", "Task"];
  const ALL_STATES = ["New", "Active", "In Progress", "In Review", "Resolved", "Done", "Closed"];
  
  const toggle = (arr, val) => {
    const next = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
    return next;
  };
  
  const apply = () => {
    onChange(local);
    onClose();
  };
  
  const clear = () => {
    setLocal({ types: [], states: [], assignee: "", areaPath: "" });
  };
  
  return (
    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, padding: 14, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", letterSpacing: "0.08em", textTransform: "uppercase" }}>Filters</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 14 }}>×</button>
      </div>
      
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {ALL_TYPES.map(t => (
            <span key={t} onClick={() => setLocal(l => ({ ...l, types: toggle(l.types, t) }))}
              style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer", background: local.types.includes(t) ? `${WI_TYPE_COLOR[t]}22` : "rgba(255,255,255,0.04)", color: local.types.includes(t) ? WI_TYPE_COLOR[t] : T.muted, border: `1px solid ${local.types.includes(t) ? WI_TYPE_COLOR[t] + "44" : "transparent"}`, fontFamily: "'JetBrains Mono'" }}>
              {t}
            </span>
          ))}
        </div>
      </div>
      
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>State</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {ALL_STATES.map(s => (
            <span key={s} onClick={() => setLocal(l => ({ ...l, states: toggle(l.states, s) }))}
              style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer", background: local.states.includes(s) ? `${stateColor(s)}22` : "rgba(255,255,255,0.04)", color: local.states.includes(s) ? stateColor(s) : T.muted, border: `1px solid ${local.states.includes(s) ? stateColor(s) + "44" : "transparent"}`, fontFamily: "'JetBrains Mono'" }}>
              {s}
            </span>
          ))}
        </div>
      </div>
      
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Assignee</div>
          <input value={local.assignee} onChange={e => setLocal(l => ({ ...l, assignee: e.target.value }))} placeholder="e.g. John"
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "6px 8px", fontSize: 11, color: T.text, fontFamily: "'JetBrains Mono'", outline: "none" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Area Path</div>
          <input value={local.areaPath} onChange={e => setLocal(l => ({ ...l, areaPath: e.target.value }))} placeholder="e.g. MyProject"
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "6px 8px", fontSize: 11, color: T.text, fontFamily: "'JetBrains Mono'", outline: "none" }} />
        </div>
      </div>
      
      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="ghost" onClick={clear}>Clear</Btn>
        <Btn variant="primary" onClick={apply}>Apply</Btn>
      </div>
    </div>
  );
}

/* ─── COLLECTION DROPDOWN (Add to Collection) ───────────────────── */
function CollectionDropdown({ collections, currentIds, onToggle, onClose, buttonRef, onCreateNew }) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [position, setPosition] = useState({ top: "100%", left: 0 });
  
  useEffect(() => {
    if (!open) return;
    const dropdown = document.getElementById("collection-dropdown");
    if (!dropdown || !buttonRef?.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = dropdownRect.height || 200;
    let newTop = "100%";
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      newTop = -dropdownHeight - 4;
      dropdown.style.transform = "translateY(-100%)";
    } else {
      dropdown.style.transform = "none";
    }
    setPosition({ top: newTop, left: 0 });
  }, [open, buttonRef, collections.length]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (buttonRef?.current && !buttonRef.current.contains(e.target)) {
        const dropdown = document.getElementById("collection-dropdown");
        if (dropdown && !dropdown.contains(e.target)) {
          setOpen(false);
        }
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, buttonRef]);

  useEffect(() => {
    if (!open) {
      setFocusedIndex(-1);
      return;
    }
    const handleKeyDown = (e) => {
      const items = collections;
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef?.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex(i => (i + 1) % (items.length + (onCreateNew ? 1 : 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex(i => (i - 1 + (items.length + (onCreateNew ? 1 : 0))) % (items.length + (onCreateNew ? 1 : 0)));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          handleToggle(items[focusedIndex].id);
        } else if (onCreateNew && focusedIndex === items.length) {
          setOpen(false);
          onCreateNew();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, focusedIndex, collections, onCreateNew, buttonRef]);

  const handleToggle = (colId) => {
    onToggle(colId);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        ref={buttonRef}
        onClick={() => setOpen(true)}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 4,
          padding: "3px 8px",
          cursor: "pointer",
          color: T.muted,
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
        title="Add to collection"
      >
        +
      </button>
    );
  }

  const allItems = onCreateNew ? [...collections, { id: "__create__", name: "Create new collection", icon: "+", isCreateNew: true }] : collections;

  return (
    <div
      id="collection-dropdown"
      role="listbox"
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        zIndex: 200,
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        padding: 8,
        minWidth: 180,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        marginTop: 2,
      }}
    >
      <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 6, padding: "0 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Add to collection
      </div>
      {allItems.length === 0 ? (
        <div style={{ fontSize: 11, color: T.dim, padding: "8px 4px", fontFamily: "'JetBrains Mono'" }}>
          No collections yet
        </div>
      ) : (
        allItems.map((col, idx) => {
          const isIn = !col.isCreateNew && currentIds?.includes(col.id);
          const isFocused = idx === focusedIndex;
          return (
            <div
              key={col.id}
              role="option"
              aria-selected={isIn}
              tabIndex={-1}
              onClick={() => col.isCreateNew ? (setOpen(false), onCreateNew()) : handleToggle(col.id)}
              onMouseEnter={(e) => { setFocusedIndex(idx); e.currentTarget.style.background = isFocused ? "rgba(255,255,255,0.1)" : (isIn ? `${col.color}20` : "rgba(255,255,255,0.04)"); }}
              onMouseLeave={(e) => (e.currentTarget.style.background = isFocused ? "rgba(255,255,255,0.1)" : (isIn ? `${col.color}12` : "transparent"))}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 4,
                cursor: "pointer",
                background: isFocused ? "rgba(255,255,255,0.1)" : (isIn ? `${col.color}12` : "transparent"),
              }}
            >
              <span style={{ color: isIn ? T.green : T.dim, fontSize: 12 }}>{isIn ? "✓" : ""}</span>
              <span style={{ fontSize: 13 }}>{col.icon}</span>
              <span style={{ flex: 1, fontSize: 12, color: col.isCreateNew ? T.amber : T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {col.name}
              </span>
              {!col.isCreateNew && <span style={{ width: 6, height: 6, borderRadius: "50%", background: col.color }} />}
            </div>
          );
        })
      )}
    </div>
  );
}

const Btn = ({ children, onClick, variant = "ghost", disabled }) => {
  const s = {
    primary: { background: `${T.amber}18`, border: `1px solid ${T.amber}44`, color: T.amber },
    ghost:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: T.muted },
  }[variant];
  return <button disabled={disabled} onClick={onClick} style={{ ...s, padding: "7px 16px", borderRadius: 5, cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "'Barlow'", fontWeight: 500, opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>{children}</button>;
};

/* ─── PROXY STATUS BANNER ────────────────────────────────────── */
function ProxyBanner({ status }) {
  if (status === "ok") return null;
  const isChecking = status === "checking";
  return (
    <div style={{ background: isChecking ? `${T.dim}22` : `${T.red}12`, border: `1px solid ${isChecking ? T.dim : T.red}44`, borderRadius: 6, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
      {isChecking ? <Spinner size={13} /> : <span style={{ color: T.red }}>⚠</span>}
      <div>
        <div style={{ fontSize: 12, color: isChecking ? T.muted : T.red, fontWeight: 500 }}>
          {isChecking ? "Checking proxy…" : "Local proxy not reachable"}
        </div>
        {!isChecking && (
          <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginTop: 3 }}>
            Run <code style={{ color: T.amber, background: "rgba(245,158,11,0.08)", padding: "1px 5px", borderRadius: 3 }}>node ado-proxy.js</code> in a terminal, then retry.
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── CONNECT SCREEN ─────────────────────────────────────────── */
function ConnectScreen({ onConnect }) {
  const [org, setOrg] = useState("");
  const [pat, setPat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [proxyStatus, setProxyStatus] = useState(USE_PROXY ? "idle" : "noproxy");

  const checkProxy = async () => {
    if (!USE_PROXY) return;
    setProxyStatus("checking");
    try {
      await fetch(PROXY, { method: "OPTIONS" });
      setProxyStatus("ok");
    } catch {
      setProxyStatus("error");
    }
  };

  const connect = async () => {
    if (!org.trim() || !pat.trim()) return;
    setLoading(true); setError("");
    try {
      const c = new ADOClient(org, pat);
      await c.testConnection();
      const projects = await c.getProjects();
      c._projects = projects;
      onConnect(c, org.trim());
    } catch (e) {
      const msg = e.message;
      if (USE_PROXY && (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed"))) {
        setError(`Cannot reach proxy at ${PROXY} — make sure ado-proxy.js is running, or set VITE_USE_PROXY=false for direct access.`);
        setProxyStatus("error");
      } else if (msg.includes("401") || msg.includes("403")) {
        setError("Authentication failed — verify your PAT has the required scopes.");
      } else if (msg.includes("404")) {
        setError("Organisation not found — check the name matches dev.azure.com/<name>.");
      } else {
        setError(`Connection error: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow'" }}>
      <style>{FONTS + `@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ position: "fixed", inset: 0, backgroundImage: "radial-gradient(circle at 1px 1px, rgba(245,158,11,0.04) 1px, transparent 0)", backgroundSize: "32px 32px", pointerEvents: "none" }} />

      <div style={{ width: 480, position: "relative" }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 36, color: T.amber, letterSpacing: "0.06em" }}>ADO SUPERUI</div>
          <div style={{ fontSize: 12, color: T.dim, fontFamily: "'JetBrains Mono'", marginTop: 5 }}>work-centric azure devops workspace</div>
        </div>

        {/* Setup instructions - show only if proxy mode is enabled */}
        {USE_PROXY && (
          <div style={{ background: `${T.cyan}08`, border: `1px solid ${T.cyan}22`, borderRadius: 8, padding: "16px 18px", marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: T.cyan, fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 10 }}>STEP 1 — START THE PROXY</div>
            <div style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", lineHeight: 1.9 }}>
              Download <span style={{ color: T.text }}>ado-proxy.js</span> (from this repo), then run:<br />
              <span style={{ display: "inline-block", background: "rgba(0,0,0,0.4)", border: `1px solid ${T.border}`, borderRadius: 4, padding: "5px 12px", marginTop: 4, color: T.amber }}>node ado-proxy.js</span>
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <Dot color={proxyStatus === "ok" ? T.green : proxyStatus === "checking" ? T.amber : T.dim} pulse={proxyStatus === "checking"} />
              <span style={{ fontSize: 11, color: proxyStatus === "ok" ? T.green : T.muted, fontFamily: "'JetBrains Mono'" }}>
                {proxyStatus === "ok" ? "Proxy reachable ✓" : proxyStatus === "checking" ? "Checking…" : "Not yet checked"}
              </span>
              <button onClick={checkProxy} style={{ marginLeft: "auto", fontSize: 11, color: T.cyan, background: `${T.cyan}10`, border: `1px solid ${T.cyan}33`, borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontFamily: "'JetBrains Mono'" }}>
                Check proxy
              </button>
            </div>
          </div>
        )}

        {/* Direct mode notice */}
        {!USE_PROXY && (
          <div style={{ background: `${T.green}08`, border: `1px solid ${T.green}22`, borderRadius: 8, padding: "16px 18px", marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: T.green, fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 6 }}>DIRECT MODE</div>
            <div style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", lineHeight: 1.6 }}>
              Connecting directly to dev.azure.com — no proxy required.
            </div>
          </div>
        )}

        <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.muted, marginBottom: 20, fontFamily: "'Barlow Condensed'", letterSpacing: "0.04em" }}>{USE_PROXY ? "STEP 2" : "STEP 1"} — CONNECT</div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Organisation</label>
            <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, overflow: "hidden" }}>
              <span style={{ padding: "0 10px", color: T.dim, fontSize: 11, fontFamily: "'JetBrains Mono'", borderRight: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>dev.azure.com/</span>
              <input value={org} onChange={e => setOrg(e.target.value)} onKeyDown={e => e.key === "Enter" && connect()} placeholder="your-org"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, padding: "10px 12px", fontSize: 13, fontFamily: "'JetBrains Mono'" }} />
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Personal Access Token</label>
            <input type="password" value={pat} onChange={e => setPat(e.target.value)} onKeyDown={e => e.key === "Enter" && connect()} placeholder="••••••••••••••••••••"
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, outline: "none", color: T.text, padding: "10px 14px", fontSize: 13, fontFamily: "'JetBrains Mono'", boxSizing: "border-box" }} />
            <div style={{ fontSize: 10, color: T.dim, marginTop: 6, fontFamily: "'JetBrains Mono'" }}>
              Scopes: <span style={{ color: "#4B5563" }}>Code·Read · Work Items·Read · Build·Read · Test·Read</span>
            </div>
          </div>

          {error && (
            <div style={{ background: `${T.red}10`, border: `1px solid ${T.red}33`, borderRadius: 5, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: T.red, fontFamily: "'JetBrains Mono'", lineHeight: 1.6 }}>{error}</div>
          )}

          <button onClick={connect} disabled={loading || !org || !pat}
            style={{ width: "100%", background: `${T.amber}18`, border: `1px solid ${T.amber}${loading || !org || !pat ? "22" : "44"}`, color: loading || !org || !pat ? `${T.amber}55` : T.amber, padding: "11px", borderRadius: 5, cursor: loading || !org || !pat ? "not-allowed" : "pointer", fontSize: 14, fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            {loading ? <><Spinner size={13} /> CONNECTING…</> : "CONNECT →"}
          </button>
        </div>

        <div style={{ marginTop: 16, fontSize: 11, color: T.dimmer, textAlign: "center", fontFamily: "'JetBrains Mono'", lineHeight: 1.8 }}>
          PAT held in memory only · never stored<br />
          <span style={{ color: T.dim }}>
            {USE_PROXY 
              ? "All traffic goes via local proxy to dev.azure.com" 
              : "Connecting directly to dev.azure.com"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── COLLECTION BUILDER ─────────────────────────────────────── */
function CollectionBuilder({ client, onDone }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState(T.amber);

  const ICONS   = ["📦","💳","🔐","📊","🚀","🔧","⚡","🎯","🌐","🔬","🛡️","🎨"];
  const COLORS  = [T.amber, T.cyan, T.violet, T.red, T.green, "#F472B6", "#FB923C", "#34D399"];

  return (
    <div style={{ padding: "26px 26px", height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.text }}>New Collection</div>
        <div style={{ fontSize: 12, color: T.muted, fontFamily: "'JetBrains Mono'", marginTop: 3 }}>Create a work-centric workspace</div>
      </div>

      <div>
        <label style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Tasks"
          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, outline: "none", color: T.text, padding: "9px 13px", fontSize: 13, fontFamily: "'Barlow'", boxSizing: "border-box" }} />
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Icon</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {ICONS.map(ic => <span key={ic} onClick={() => setIcon(ic)} style={{ fontSize: 18, cursor: "pointer", padding: 5, borderRadius: 5, background: icon === ic ? "rgba(255,255,255,0.08)" : "transparent", border: icon === ic ? "1px solid rgba(255,255,255,0.14)" : "1px solid transparent" }}>{ic}</span>)}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Colour</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COLORS.map(c => <span key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", outline: color === c ? `2px solid ${c}` : "none", outlineOffset: 2 }} />)}
          </div>
        </div>
      </div>

      <Btn variant="primary" onClick={() => onDone({ id: `c-${Date.now()}`, name: name.trim(), icon, color })} disabled={!name.trim()}>
        Create Collection →
      </Btn>
    </div>
  );
}

/* ─── WORK ITEM PANEL ────────────────────────────────────────── */
const WI_TYPE_COLOR = { Epic: T.amber, Feature: T.cyan, "User Story": T.violet, Bug: T.red, Task: "#94A3B8" };
const WI_TYPE_SHORT = { Epic: "EPIC", Feature: "FEAT", "User Story": "STORY", Bug: "BUG", Task: "TASK" };
const stateColor = s => {
  const l = (s || "").toLowerCase();
  if (l.includes("active") || l.includes("progress") || l.includes("doing")) return T.cyan;
  if (l.includes("done") || l.includes("closed") || l.includes("resolved") || l.includes("complete")) return T.green;
  if (l.includes("block")) return T.red;
  return T.muted;
};

function WorkItemPanel({ client, collection, onSelect, selected, onFilterChange, onWorkItemToggle }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(collection?.filters || { types: [], states: [], assignee: "", areaPath: "" });

  useEffect(() => {
    setLoading(true); setError("");
    const fetchItems = async () => {
      if (collection.workItemIds?.length > 0) {
        const ids = collection.workItemIds.map(id => parseInt(id));
        const result = await client.getWorkItemsByIds(ids);
        setItems(result);
      } else {
        const result = await client.searchWorkItems(search, filters);
        setItems(result);
      }
    };
    fetchItems().catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [collection.id, collection.workItemIds, search, filters]);

  useEffect(() => {
    if (onFilterChange) onFilterChange(filters);
  }, [filters]);

  const hasFilters = filters.types.length > 0 || filters.states.length > 0 || filters.assignee || filters.areaPath;
  const hasSavedItems = collection.workItemIds?.length > 0;

  const ORDER = { Epic: 0, Feature: 1, "User Story": 2, Bug: 3, Task: 4 };
  const sorted = [...items].sort((a, b) => (ORDER[a.fields?.["System.WorkItemType"]] ?? 5) - (ORDER[b.fields?.["System.WorkItemType"]] ?? 5));

  const removeFilterType = (type) => {
    setFilters(f => ({ ...f, types: f.types.filter(t => t !== type) }));
  };
  const removeFilterState = (state) => {
    setFilters(f => ({ ...f, states: f.states.filter(s => s !== state) }));
  };

  return (
    <>
      <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>{collection.icon}</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 18, color: T.text }}>{collection.name}</div>
          </div>
          <Dot color={collection.color} />
          {hasSavedItems && <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>({collection.workItemIds.length} saved)</span>}
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={hasSavedItems ? "Search to add more..." : "Search work items..."}
            style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, outline: "none", color: T.text, padding: "7px 11px", fontSize: 12, fontFamily: "'Barlow'", boxSizing: "border-box" }} />
          <button onClick={() => setShowFilters(!showFilters)}
            style={{ background: hasFilters ? `${T.amber}18` : "rgba(255,255,255,0.04)", border: `1px solid ${hasFilters ? T.amber + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 5, padding: "7px 10px", cursor: "pointer", color: hasFilters ? T.amber : T.muted, fontSize: 12, fontFamily: "'Barlow'" }}>
            ⚙ Filters {hasFilters && `(${filters.types.length + filters.states.length + (filters.assignee ? 1 : 0) + (filters.areaPath ? 1 : 0)})`}
          </button>
          {showFilters && <FilterPanel filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />}
        </div>
        {hasFilters && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
            {filters.types.map(t => (
              <span key={t} onClick={() => removeFilterType(t)} style={{ background: `${WI_TYPE_COLOR[t]}18`, color: WI_TYPE_COLOR[t], borderRadius: 3, padding: "2px 6px", fontSize: 9, fontFamily: "'JetBrains Mono'", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {t} ×
              </span>
            ))}
            {filters.states.map(s => (
              <span key={s} onClick={() => removeFilterState(s)} style={{ background: `${stateColor(s)}18`, color: stateColor(s), borderRadius: 3, padding: "2px 6px", fontSize: 9, fontFamily: "'JetBrains Mono'", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {s} ×
              </span>
            ))}
            {filters.assignee && (
              <span onClick={() => setFilters(f => ({ ...f, assignee: "" }))} style={{ background: `${T.violet}18`, color: T.violet, borderRadius: 3, padding: "2px 6px", fontSize: 9, fontFamily: "'JetBrains Mono'", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                @{filters.assignee} ×
              </span>
            )}
            {filters.areaPath && (
              <span onClick={() => setFilters(f => ({ ...f, areaPath: "" }))} style={{ background: `${T.cyan}18`, color: T.cyan, borderRadius: 3, padding: "2px 6px", fontSize: 9, fontFamily: "'JetBrains Mono'", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {filters.areaPath} ×
              </span>
            )}
          </div>
        )}
      </div>

      {loading
        ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> loading…</div>
        : <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
            {sorted.map(wi => {
              const type  = wi.fields?.["System.WorkItemType"] || "Task";
              const state = wi.fields?.["System.State"] || "";
              const isSel = selected?.id === wi.id;
              return (
                <div key={wi.id} onClick={() => onSelect(wi)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer", borderLeft: `2px solid ${isSel ? collection.color : "transparent"}`, background: isSel ? `${collection.color}08` : "transparent", transition: "all 0.12s", position: "relative" }}
                  onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; } }}
                  onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = "transparent"; } }}>
                  <span style={{ fontSize: 9, color: WI_TYPE_COLOR[type] || T.dim, fontFamily: "'JetBrains Mono'", width: 42, flexShrink: 0 }}>{WI_TYPE_SHORT[type] || type.slice(0,5).toUpperCase()}</span>
                  <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", width: 38, flexShrink: 0 }}>#{wi.id}</span>
                  <span style={{ flex: 1, fontSize: 12, color: isSel ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wi.fields?.["System.Title"]}</span>
                  <Pill label={state} color={stateColor(state)} />
                  {(() => {
                    const isInCollection = collection.workItemIds?.includes(String(wi.id));
                    return (
                      <button onClick={(e) => { e.stopPropagation(); onWorkItemToggle(collection.id, wi.id); }}
                        title={isInCollection ? "Remove from collection" : "Add to collection"}
                        style={{ background: isInCollection ? `${collection.color}18` : "rgba(255,255,255,0.04)", border: `1px solid ${isInCollection ? collection.color + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 4, padding: "3px 8px", cursor: "pointer", color: isInCollection ? collection.color : T.muted, fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                        {isInCollection ? "✓" : "+"}
                      </button>
                    );
                  })()}
                </div>
              );
            })}
            {!sorted.length && !loading && (
              <div style={{ padding: "40px 16px", textAlign: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No work items found</div>
            )}
          </div>
      }
    </>
  );
}

/* ─── RESOURCE DETAIL ────────────────────────────────────────── */
const timeAgo = d => {
  if (!d) return "—";
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const pipelineStatus = r => {
  const l = (r || "").toLowerCase();
  if (l === "succeeded") return { color: T.green, label: "passing" };
  if (l === "failed")    return { color: T.red,   label: "failing" };
  if (l === "running" || l === "inprogress") return { color: T.amber, label: "running" };
  if (l === "canceled")  return { color: T.muted, label: "cancelled" };
  return { color: T.dim, label: r || "unknown" };
};

function ResourceDetail({ client, workItem, org, collection, onResourceToggle }) {
  const [repos,     setRepos]     = useState(null);
  const [pipelines, setPipelines] = useState(null);
  const [prs,       setPrs]       = useState(null);
  const [tests,     setTests]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState("details");

  const [selectedRepo, setSelectedRepo] = useState(null);
  const [selectedPipeline, setSelectedPipeline] = useState(null);
  const [selectedPR, setSelectedPR] = useState(null);
  const [selectedTest, setSelectedTest] = useState(null);

  const [repoSearch, setRepoSearch] = useState("");
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [prSearch, setPRSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");

  useEffect(() => {
    setLoading(true); setRepos(null); setPipelines(null); setPrs(null); setTests(null);
    setSelectedRepo(null); setSelectedPipeline(null); setSelectedPR(null); setSelectedTest(null);
    Promise.allSettled([
      client.getAllRepos(),
      client.getAllPipelines(),
      client.getAllPullRequests(),
      client.getAllTestRuns(),
    ]).then(([r, p, pr, t]) => {
      setRepos(     r.status  === "fulfilled" ? r.value  : []);
      setPipelines( p.status  === "fulfilled" ? p.value  : []);
      setPrs(       pr.status === "fulfilled" ? pr.value : []);
      setTests(     t.status  === "fulfilled" ? t.value  : []);
      setLoading(false);
    });
  }, [workItem.id]);

  const type  = workItem.fields?.["System.WorkItemType"] || "";
  const state = workItem.fields?.["System.State"] || "";
  const title = workItem.fields?.["System.Title"] || "Untitled";
  const areaPath = workItem.fields?.["System.AreaPath"]?.split("\\")[0] || "";

  const tabs = [
    { id: "details", label: "Details" },
    { id: "repos", label: "Repositories", count: repos?.length || 0 },
    { id: "pipelines", label: "Pipelines", count: pipelines?.length || 0 },
    { id: "prs", label: "Pull Requests", count: prs?.length || 0 },
    { id: "tests", label: "Test Runs", count: tests?.length || 0 },
  ];

  const isInCollection = (type, id) => {
    if (!collection) return false;
    if (type === "repo") return collection.repoIds?.includes(String(id));
    if (type === "pipeline") return collection.pipelineIds?.includes(String(id));
    if (type === "pr") return collection.prIds?.includes(String(id));
    return false;
  };

  const handleToggle = (type, id) => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle(type, id, collection.id);
  };

  const renderToggleButton = (type, id) => {
    const inCollection = isInCollection(type, id);
    return (
      <button onClick={() => handleToggle(type, id)}
        title={inCollection ? "Remove from collection" : "Add to collection"}
        style={{ background: inCollection ? `${collection.color}18` : "rgba(255,255,255,0.04)", border: `1px solid ${inCollection ? collection.color + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 4, padding: "6px 14px", cursor: "pointer", color: inCollection ? collection.color : T.muted, fontSize: 12, fontFamily: "'Barlow'", fontWeight: 500 }}>
        {inCollection ? "✓ In Collection" : "+ Add to Collection"}
      </button>
    );
  };

  const renderDetailsTab = () => (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
          <Pill label={WI_TYPE_SHORT[type] || type} color={WI_TYPE_COLOR[type] || T.dim} />
          <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{workItem.id}</span>
          <Pill label={state} color={stateColor(state)} />
          {areaPath && <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>↳ {areaPath}</span>}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: "#F9FAFB", lineHeight: 1.2, letterSpacing: "0.02em", marginBottom: 8 }}>{title}</div>
        {workItem.fields?.["System.AssignedTo"]?.displayName && (
          <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
            Assigned to {workItem.fields["System.AssignedTo"].displayName} · Changed {timeAgo(workItem.fields["System.ChangedDate"])}
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
        <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Fields</div>
        {Object.entries(workItem.fields || {}).filter(([k]) => !["System.TeamProject", "System.Rev", "System.AuthorizedAs", "System.StateChangedDate", "System.Watermark", "System.IsDeleted", "System.AcceleratedCardData"].includes(k)).map(([key, value]) => {
          let displayValue = "";
          if (value === null || value === undefined) {
            displayValue = "—";
          } else if (typeof value === "object") {
            if (value.displayName) displayValue = value.displayName;
            else if (value.name) displayValue = value.name;
            else displayValue = JSON.stringify(value).slice(0, 50);
          } else {
            displayValue = String(value);
          }
          const fieldName = key.replace("System.", "").replace("Microsoft.VSTS.", "").replace("SFCC.", "");
          if (displayValue === "" || displayValue === "undefined") return null;
          return (
            <div key={key} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ width: 140, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{fieldName}</span>
              <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'", wordBreak: "break-word" }}>{displayValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderReposTab = () => {
    const filteredRepos = (repos || []).filter(r => 
      !repoSearch || r.name?.toLowerCase().includes(repoSearch.toLowerCase())
    );

    return (
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* List Pane */}
        <div style={{ width: "45%", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${T.border}` }}>
            <input value={repoSearch} onChange={e => setRepoSearch(e.target.value)} placeholder="Search repositories..."
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, outline: "none", color: T.text, padding: "8px 12px", fontSize: 12, fontFamily: "'Barlow'", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 20, display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> Loading...</div>
            ) : filteredRepos.length ? (
              filteredRepos.slice(0, 20).map(r => {
                const isSel = selectedRepo?.id === r.id;
                const inCollection = isInCollection("repo", r.id);
                return (
                  <div key={r.id} onClick={() => setSelectedRepo(r)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer", borderLeft: `2px solid ${isSel ? T.cyan : "transparent"}`, background: isSel ? `${T.cyan}08` : "transparent", transition: "all 0.12s" }}
                    onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; } }}
                    onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = "transparent"; } }}>
                    <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'", color: inCollection ? collection?.color : T.cyan }}>{r.name}</span>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: 20, color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No repositories</div>
            )}
          </div>
        </div>

        {/* Detail Pane */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {selectedRepo ? (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: "#F9FAFB", marginBottom: 8 }}>{selectedRepo.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {renderToggleButton("repo", selectedRepo.id)}
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Details</div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Default Branch</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{selectedRepo.defaultBranch?.replace("refs/heads/", "") || "main"}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Size</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{selectedRepo.size ? `${(selectedRepo.size / 1024).toFixed(0)} KB` : "empty"}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>URL</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'", wordBreak: "break-all", fontSize: 11 }}>{selectedRepo.remoteUrl || "—"}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Last Updated</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{timeAgo(selectedRepo.lastUpdatedTime)}</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: T.dim, fontSize: 13, fontFamily: "'Barlow'" }}>
              Select a repository to view details
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPipelinesTab = () => {
    const filteredPipelines = (pipelines || []).filter(p => 
      !pipelineSearch || p.name?.toLowerCase().includes(pipelineSearch.toLowerCase())
    );

    return (
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* List Pane */}
        <div style={{ width: "45%", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${T.border}` }}>
            <input value={pipelineSearch} onChange={e => setPipelineSearch(e.target.value)} placeholder="Search pipelines..."
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, outline: "none", color: T.text, padding: "8px 12px", fontSize: 12, fontFamily: "'Barlow'", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 20, display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> Loading...</div>
            ) : filteredPipelines.length ? (
              filteredPipelines.slice(0, 20).map(p => {
                const rs = pipelineStatus(p.latestRun?.result || p.latestRun?.state);
                const isSel = selectedPipeline?.id === p.id;
                const inCollection = isInCollection("pipeline", p.id);
                return (
                  <div key={p.id} onClick={() => setSelectedPipeline(p)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer", borderLeft: `2px solid ${isSel ? rs.color : "transparent"}`, background: isSel ? `${rs.color}08` : "transparent", transition: "all 0.12s" }}
                    onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; } }}
                    onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = "transparent"; } }}>
                    <Dot color={rs.color} pulse={rs.label === "running"} />
                    <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'", color: inCollection ? collection?.color : T.text }}>{p.name}</span>
                    <Pill label={rs.label} color={rs.color} />
                  </div>
                );
              })
            ) : (
              <div style={{ padding: 20, color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No pipelines</div>
            )}
          </div>
        </div>

        {/* Detail Pane */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {selectedPipeline ? (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: "#F9FAFB", marginBottom: 8 }}>{selectedPipeline.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {renderToggleButton("pipeline", selectedPipeline.id)}
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Details</div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Folder</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{selectedPipeline.folder || "/"}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Last Run</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>
                    <Pill label={pipelineStatus(selectedPipeline.latestRun?.result || selectedPipeline.latestRun?.state).label} color={pipelineStatus(selectedPipeline.latestRun?.result || selectedPipeline.latestRun?.state).color} />
                    <span style={{ marginLeft: 8 }}>{timeAgo(selectedPipeline.latestRun?.startTime)}</span>
                  </span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Definition ID</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{selectedPipeline.id}</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: T.dim, fontSize: 13, fontFamily: "'Barlow'" }}>
              Select a pipeline to view details
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPRsTab = () => {
    const filteredPRs = (prs || []).filter(pr => 
      !prSearch || pr.title?.toLowerCase().includes(prSearch.toLowerCase()) || String(pr.pullRequestId).includes(prSearch)
    );

    return (
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* List Pane */}
        <div style={{ width: "45%", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${T.border}` }}>
            <input value={prSearch} onChange={e => setPRSearch(e.target.value)} placeholder="Search pull requests..."
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, outline: "none", color: T.text, padding: "8px 12px", fontSize: 12, fontFamily: "'Barlow'", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 20, display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> Loading...</div>
            ) : filteredPRs.length ? (
              filteredPRs.slice(0, 20).map(pr => {
                const ps = { active: { color: T.cyan, label: "open" }, completed: { color: T.green, label: "merged" }, abandoned: { color: T.muted, label: "closed" } }[pr.status] || { color: T.dim, label: pr.status };
                const isSel = selectedPR?.pullRequestId === pr.pullRequestId;
                const inCollection = isInCollection("pr", pr.pullRequestId);
                return (
                  <div key={pr.pullRequestId} onClick={() => setSelectedPR(pr)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer", borderLeft: `2px solid ${isSel ? ps.color : "transparent"}`, background: isSel ? `${ps.color}08` : "transparent", transition: "all 0.12s" }}
                    onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; } }}
                    onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = "transparent"; } }}>
                    <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", width: 30 }}>#{pr.pullRequestId}</span>
                    <span style={{ flex: 1, fontSize: 12, color: inCollection ? collection?.color : T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pr.title}</span>
                    <Pill label={ps.label} color={ps.color} />
                  </div>
                );
              })
            ) : (
              <div style={{ padding: 20, color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No pull requests</div>
            )}
          </div>
        </div>

        {/* Detail Pane */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {selectedPR ? (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: "#F9FAFB", marginBottom: 8 }}>{selectedPR.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Pill label={{ active: "open", completed: "merged", abandoned: "closed" }[selectedPR.status] || selectedPR.status} color={{ active: T.cyan, completed: T.green, abandoned: T.muted }[selectedPR.status] || T.dim} />
                  {renderToggleButton("pr", selectedPR.pullRequestId)}
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Details</div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Author</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{selectedPR.createdBy?.displayName || "—"}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Source</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{selectedPR.sourceRefName?.replace("refs/heads/", "") || "—"}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Target</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{selectedPR.targetRefName?.replace("refs/heads/", "") || "—"}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Created</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{timeAgo(selectedPR.creationDate)}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Reviewers</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{selectedPR.reviewers?.length || 0}</span>
                </div>
                {selectedPR.description && (
                  <div style={{ padding: "6px 0", fontSize: 12 }}>
                    <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11, display: "block", marginBottom: 4 }}>Description</span>
                    <div style={{ color: T.text, fontFamily: "'JetBrains Mono'", fontSize: 11, whiteSpace: "pre-wrap", background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 4 }}>{selectedPR.description}</div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: T.dim, fontSize: 13, fontFamily: "'Barlow'" }}>
              Select a pull request to view details
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTestsTab = () => {
    const filteredTests = (tests || []).filter(t => 
      !testSearch || t.name?.toLowerCase().includes(testSearch.toLowerCase())
    );

    return (
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* List Pane */}
        <div style={{ width: "45%", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${T.border}` }}>
            <input value={testSearch} onChange={e => setTestSearch(e.target.value)} placeholder="Search test runs..."
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, outline: "none", color: T.text, padding: "8px 12px", fontSize: 12, fontFamily: "'Barlow'", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 20, display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> Loading...</div>
            ) : filteredTests.length ? (
              filteredTests.slice(0, 20).map(t => {
                const pass = t.passedTests ?? 0;
                const fail = t.failedTests ?? 0;
                const color = fail > 0 ? T.red : pass > 0 ? T.green : T.dim;
                const isSel = selectedTest?.id === t.id;
                return (
                  <div key={t.id} onClick={() => setSelectedTest(t)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer", borderLeft: `2px solid ${isSel ? color : "transparent"}`, background: isSel ? `${color}08` : "transparent", transition: "all 0.12s" }}
                    onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; } }}
                    onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = "transparent"; } }}>
                    <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'", flex: 1, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                    <span style={{ fontSize: 10, color: T.green, fontFamily: "'JetBrains Mono'" }}>✓ {pass}</span>
                    {fail > 0 && <span style={{ fontSize: 10, color: T.red, fontFamily: "'JetBrains Mono'" }}>✗ {fail}</span>}
                  </div>
                );
              })
            ) : (
              <div style={{ padding: 20, color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No test runs</div>
            )}
          </div>
        </div>

        {/* Detail Pane */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {selectedTest ? (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: "#F9FAFB", marginBottom: 8 }}>{selectedTest.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Pill label={selectedTest.failedTests > 0 ? "failing" : "passing"} color={selectedTest.failedTests > 0 ? T.red : T.green} />
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Results</div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Passed</span>
                  <span style={{ flex: 1, color: T.green, fontFamily: "'JetBrains Mono'" }}>{selectedTest.passedTests ?? 0}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Failed</span>
                  <span style={{ flex: 1, color: T.red, fontFamily: "'JetBrains Mono'" }}>{selectedTest.failedTests ?? 0}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Total</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{(selectedTest.passedTests ?? 0) + (selectedTest.failedTests ?? 0)}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Completed</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{timeAgo(selectedTest.completedDate)}</span>
                </div>
                <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Run ID</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{selectedTest.id}</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: T.dim, fontSize: 13, fontFamily: "'Barlow'" }}>
              Select a test run to view details
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
              <Pill label={WI_TYPE_SHORT[type] || type} color={WI_TYPE_COLOR[type] || T.dim} />
              <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{workItem.id}</span>
              <Pill label={state} color={stateColor(state)} />
              {areaPath && <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>↳ {areaPath}</span>}
            </div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: "#F9FAFB", lineHeight: 1.2, letterSpacing: "0.02em" }}>{title}</div>
          </div>
          <a href={`https://dev.azure.com/${encodeURIComponent(org)}/_workitems/edit/${workItem.id}`}
            target="_blank" rel="noreferrer"
            style={{ background: `${T.amber}12`, border: `1px solid ${T.amber}33`, color: T.amber, padding: "6px 13px", borderRadius: 4, fontSize: 12, fontFamily: "'Barlow'", fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap", marginTop: 2 }}>
            Open in ADO ↗
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}`, padding: "0 24px", background: T.panel }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${activeTab === tab.id ? T.amber : "transparent"}`,
              color: activeTab === tab.id ? T.text : T.dim,
              padding: "10px 16px",
              fontSize: 12,
              fontFamily: "'Barlow'",
              fontWeight: 500,
              cursor: "pointer",
              marginBottom: -1,
            }}>
            {tab.label} {tab.count > 0 && <span style={{ opacity: 0.6 }}>({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "details" && renderDetailsTab()}
      {activeTab === "repos" && renderReposTab()}
      {activeTab === "pipelines" && renderPipelinesTab()}
      {activeTab === "prs" && renderPRsTab()}
      {activeTab === "tests" && renderTestsTab()}
    </div>
  );
}

/* ─── COLLECTION RESOURCES VIEW ───────────────────────────────── */
function CollectionResources({ client, collection, collections, onWorkItemToggle, onResourceToggle, org, onCreateNewCollection }) {
  const [workItems, setWorkItems] = useState([]);
  const [repos, setRepos] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetchData = async () => {
      const promises = [];
      
      if (collection.workItemIds?.length > 0) {
        promises.push(client.getWorkItemsByIds(collection.workItemIds.map(id => parseInt(id))));
      } else {
        promises.push(Promise.resolve([]));
      }
      
      if (collection.repoIds?.length > 0) {
        promises.push(client.getAllRepos().then(allRepos => allRepos.filter(r => collection.repoIds.includes(r.id))));
      } else {
        promises.push(Promise.resolve([]));
      }
      
      if (collection.pipelineIds?.length > 0) {
        promises.push(client.getAllPipelines().then(allPipelines => allPipelines.filter(p => collection.pipelineIds.includes(String(p.id)))));
      } else {
        promises.push(Promise.resolve([]));
      }
      
      if (collection.prIds?.length > 0) {
        promises.push(client.getAllPullRequests().then(allPrs => allPrs.filter(pr => collection.prIds.includes(String(pr.pullRequestId)))));
      } else {
        promises.push(Promise.resolve([]));
      }

      const [wi, r, p, pr] = await Promise.allSettled(promises);
      setWorkItems(wi.status === "fulfilled" ? wi.value : []);
      setRepos(r.status === "fulfilled" ? r.value : []);
      setPipelines(p.status === "fulfilled" ? p.value : []);
      setPrs(pr.status === "fulfilled" ? pr.value : []);
      setLoading(false);
    };
    fetchData();
  }, [collection.id, collection.workItemIds, collection.repoIds, collection.pipelineIds, collection.prIds]);

  const removeFromCollection = (type, id) => {
    if (type === "workitem") {
      onWorkItemToggle(collection.id, id);
    } else {
      onResourceToggle(type, id, collection.id);
    }
  };

  const renderGroup = (title, items, renderItem) => {
    if (!items || items.length === 0) return null;
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10, padding: "0 4px" }}>
          {title} ({items.length})
        </div>
        {items.map(renderItem)}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>{collection.icon}</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: "#F9FAFB" }}>{collection.name}</div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
              {collection.workItemIds?.length || 0} work items · {collection.repoIds?.length || 0} repos · {collection.pipelineIds?.length || 0} pipelines · {collection.prIds?.length || 0} PRs
            </div>
          </div>
          <Dot color={collection.color} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {loading ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> Loading...</div>
        ) : (
          <>
            {renderGroup("Work Items", workItems, wi => {
              const type = wi.fields?.["System.WorkItemType"] || "Task";
              const state = wi.fields?.["System.State"] || "";
              return (
                <Card key={wi.id} accent={WI_TYPE_COLOR[type] || T.dim} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <Pill label={WI_TYPE_SHORT[type] || type} color={WI_TYPE_COLOR[type] || T.dim} />
                        <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{wi.id}</span>
                        <Pill label={state} color={stateColor(state)} />
                      </div>
                      <div style={{ fontSize: 13, color: T.text }}>{wi.fields?.["System.Title"]}</div>
                    </div>
                    <button onClick={() => removeFromCollection("workitem", wi.id)}
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: T.dim, fontSize: 12 }}>
                      × Remove
                    </button>
                  </div>
                </Card>
              );
            })}

            {renderGroup("Repositories", repos, r => (
              <Card key={r.id} accent={T.cyan} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.cyan }}>{r.name}</span>
                    <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginLeft: 8 }}>/{r.defaultBranch?.replace("refs/heads/", "") || "main"}</span>
                  </div>
                  <button onClick={() => removeFromCollection("repo", r.id)}
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: T.dim, fontSize: 12 }}>
                    × Remove
                  </button>
                </div>
              </Card>
            ))}

            {renderGroup("Pipelines", pipelines, p => {
              const rs = pipelineStatus(p.latestRun?.result || p.latestRun?.state);
              return (
                <Card key={p.id} accent={rs.color} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Dot color={rs.color} pulse={rs.label === "running"} />
                      <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.text }}>{p.name}</span>
                      <Pill label={rs.label} color={rs.color} />
                    </div>
                    <button onClick={() => removeFromCollection("pipeline", p.id)}
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: T.dim, fontSize: 12 }}>
                      × Remove
                    </button>
                  </div>
                </Card>
              );
            })}

            {renderGroup("Pull Requests", prs, pr => {
              const ps = { active: { color: T.cyan, label: "open" }, completed: { color: T.green, label: "merged" }, abandoned: { color: T.muted, label: "closed" } }[pr.status] || { color: T.dim, label: pr.status };
              return (
                <Card key={pr.pullRequestId} accent={ps.color} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div>
                        <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{pr.pullRequestId} </span>
                        <span style={{ fontSize: 13, color: T.text }}>{pr.title}</span>
                      </div>
                      <div style={{ marginTop: 4, display: "flex", gap: 12, fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                        <span>{pr.createdBy?.displayName}</span>
                        <span>→ {pr.targetRefName?.replace("refs/heads/", "")}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Pill label={ps.label} color={ps.color} />
                      <button onClick={() => removeFromCollection("pr", pr.pullRequestId)}
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: T.dim, fontSize: 12 }}>
                        × Remove
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}

            {workItems.length === 0 && repos.length === 0 && pipelines.length === 0 && prs.length === 0 && (
              <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'", textAlign: "center", padding: 40 }}>
                No items in this collection.<br />Search for resources to add them.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── SEARCH RESULTS LIST ────────────────────────────────────── */
function SearchResultsList({ results, searching, searchQuery, collection, selectedResult, onSelect, onWorkItemToggle, onResourceToggle }) {
  if (searching) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: T.dim }}>
        <div style={{ width: 22, height: 22, border: `2px solid ${T.border}`, borderTopColor: T.amber, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'" }}>Searching…</span>
      </div>
    );
  }

  if (!results) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: T.dim }}>
        <span style={{ fontSize: 28 }}>🔍</span>
        <span style={{ fontSize: 13, fontFamily: "'Barlow Condensed'", letterSpacing: "0.05em" }}>Type to search all resources</span>
      </div>
    );
  }

  const total = results.workItems.length + results.repos.length + results.pipelines.length + results.prs.length;
  if (total === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: T.dim }}>
        <span style={{ fontSize: 26 }}>∅</span>
        <span style={{ fontSize: 13, fontFamily: "'Barlow Condensed'", letterSpacing: "0.05em" }}>No results for "{searchQuery}"</span>
      </div>
    );
  }

  const isSelected = (type, id) => selectedResult && selectedResult.type === type && String(selectedResult.item?.id || selectedResult.item?.pullRequestId) === String(id);

  const inCol = (type, id) => {
    if (!collection) return false;
    if (type === "workitem") return (collection.workItemIds || []).includes(String(id));
    if (type === "repo") return (collection.repoIds || []).includes(String(id));
    if (type === "pipeline") return (collection.pipelineIds || []).includes(String(id));
    if (type === "pr") return (collection.prIds || []).includes(String(id));
    return false;
  };

  const ToggleBtn = ({ type, id, item }) => {
    if (!collection) return null;
    const added = inCol(type, id);
    return (
      <button
        onClick={e => {
          e.stopPropagation();
          if (type === "workitem") onWorkItemToggle(collection.id, id);
          else onResourceToggle(type, id, collection.id);
        }}
        title={added ? "Remove from collection" : "Add to collection"}
        style={{ background: added ? `${T.green}22` : "rgba(255,255,255,0.06)", border: `1px solid ${added ? T.green : "rgba(255,255,255,0.12)"}`, borderRadius: 4, color: added ? T.green : T.dim, cursor: "pointer", padding: "2px 8px", fontSize: 11, fontFamily: "'JetBrains Mono'", flexShrink: 0, transition: "all 0.15s" }}
      >{added ? "✓" : "+"}</button>
    );
  };

  const SectionHeader = ({ label, count }) => (
    <div style={{ padding: "10px 14px 6px", fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", letterSpacing: "0.12em", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span>{label}</span>
      <span style={{ color: T.dimmer }}>{count}</span>
    </div>
  );

  const wiTypeColor = (type) => {
    if (!type) return T.dim;
    const t = type.toLowerCase();
    if (t.includes("bug")) return T.red;
    if (t.includes("epic")) return T.amber;
    if (t.includes("feature")) return T.purple;
    return T.blue;
  };

  const stateColor = (state) => {
    if (!state) return T.dim;
    const s = state.toLowerCase();
    if (s === "done" || s === "closed" || s === "resolved") return T.green;
    if (s === "active" || s === "in progress") return T.blue;
    if (s === "new") return T.dim;
    return T.muted;
  };

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {results.workItems.length > 0 && (
        <>
          <SectionHeader label="WORK ITEMS" count={results.workItems.length} />
          {results.workItems.map(wi => {
            const sel = isSelected("workitem", wi.id);
            const wiType = wi.fields?.["System.WorkItemType"] || "";
            const wiState = wi.fields?.["System.State"] || "";
            return (
              <div key={wi.id} onClick={() => onSelect({ type: "workitem", item: wi })}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${sel ? T.amber : "transparent"}`, background: sel ? "rgba(245,158,11,0.07)" : "transparent", transition: "background 0.1s" }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: wiTypeColor(wiType), fontFamily: "'JetBrains Mono'", background: `${wiTypeColor(wiType)}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0, whiteSpace: "nowrap", maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis" }}>{wiType || "WI"}</span>
                <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>#{wi.id}</span>
                <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wi.fields?.["System.Title"]}</span>
                <span style={{ fontSize: 10, color: stateColor(wiState), fontFamily: "'JetBrains Mono'", flexShrink: 0, whiteSpace: "nowrap" }}>{wiState}</span>
                <ToggleBtn type="workitem" id={wi.id} item={wi} />
              </div>
            );
          })}
        </>
      )}

      {results.repos.length > 0 && (
        <>
          <SectionHeader label="REPOSITORIES" count={results.repos.length} />
          {results.repos.map(r => {
            const sel = isSelected("repo", r.id);
            return (
              <div key={r.id} onClick={() => onSelect({ type: "repo", item: r })}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${sel ? T.amber : "transparent"}`, background: sel ? "rgba(245,158,11,0.07)" : "transparent", transition: "background 0.1s" }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.cyan, fontFamily: "'JetBrains Mono'", background: `${T.cyan}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>REPO</span>
                <span style={{ fontSize: 12, flex: 1, color: T.cyan, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0, whiteSpace: "nowrap" }}>{r.defaultBranch?.replace("refs/heads/", "")}</span>
                <ToggleBtn type="repo" id={r.id} item={r} />
              </div>
            );
          })}
        </>
      )}

      {results.pipelines.length > 0 && (
        <>
          <SectionHeader label="PIPELINES" count={results.pipelines.length} />
          {results.pipelines.map(p => {
            const sel = isSelected("pipeline", p.id);
            return (
              <div key={p.id} onClick={() => onSelect({ type: "pipeline", item: p })}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${sel ? T.amber : "transparent"}`, background: sel ? "rgba(245,158,11,0.07)" : "transparent", transition: "background 0.1s" }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.amber, fontFamily: "'JetBrains Mono'", background: `${T.amber}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>PIPE</span>
                <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0, whiteSpace: "nowrap" }}>{p.folder !== "\\" ? p.folder : ""}</span>
                <ToggleBtn type="pipeline" id={p.id} item={p} />
              </div>
            );
          })}
        </>
      )}

      {results.prs.length > 0 && (
        <>
          <SectionHeader label="PULL REQUESTS" count={results.prs.length} />
          {results.prs.map(pr => {
            const sel = isSelected("pr", pr.pullRequestId);
            const prState = pr.status || "";
            return (
              <div key={pr.pullRequestId} onClick={() => onSelect({ type: "pr", item: pr })}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${sel ? T.amber : "transparent"}`, background: sel ? "rgba(245,158,11,0.07)" : "transparent", transition: "background 0.1s" }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.purple, fontFamily: "'JetBrains Mono'", background: `${T.purple}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>PR</span>
                <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>#{pr.pullRequestId}</span>
                <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.title}</span>
                <span style={{ fontSize: 10, color: stateColor(prState), fontFamily: "'JetBrains Mono'", flexShrink: 0, whiteSpace: "nowrap" }}>{prState}</span>
                <ToggleBtn type="pr" id={pr.pullRequestId} item={pr} />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ─── SEARCH RESULT DETAIL ───────────────────────────────────── */
function SearchResultDetail({ result, collection, org, onWorkItemToggle, onResourceToggle }) {
  if (!result) return null;
  const { type, item } = result;

  const inCol = () => {
    if (!collection) return false;
    if (type === "workitem") return (collection.workItemIds || []).includes(String(item.id));
    if (type === "repo") return (collection.repoIds || []).includes(String(item.id));
    if (type === "pipeline") return (collection.pipelineIds || []).includes(String(item.id));
    if (type === "pr") return (collection.prIds || []).includes(String(item.pullRequestId));
    return false;
  };
  const added = inCol();

  const handleToggle = () => {
    if (!collection) return;
    if (type === "workitem") onWorkItemToggle(collection.id, item.id);
    else if (type === "repo") onResourceToggle("repo", item.id, collection.id);
    else if (type === "pipeline") onResourceToggle("pipeline", item.id, collection.id);
    else if (type === "pr") onResourceToggle("pr", item.pullRequestId, collection.id);
  };

  const ToggleSection = () => (
    <div style={{ marginBottom: 16 }}>
      {collection ? (
        <button onClick={handleToggle}
          style={{ background: added ? `${T.green}22` : "rgba(255,255,255,0.06)", border: `1px solid ${added ? T.green : "rgba(255,255,255,0.15)"}`, borderRadius: 5, color: added ? T.green : T.muted, cursor: "pointer", padding: "6px 14px", fontSize: 12, fontFamily: "'Barlow'", transition: "all 0.15s" }}>
          {added ? `✓ In "${collection.name}"` : `+ Add to "${collection.name}"`}
        </button>
      ) : (
        <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>Select a collection to add this item</span>
      )}
    </div>
  );

  const Field = ({ label, value }) => (
    <div style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: T.text, wordBreak: "break-all" }}>{value || <span style={{ color: T.dimmer }}>—</span>}</span>
    </div>
  );

  const containerStyle = { flex: 1, overflowY: "auto", padding: 24 };

  if (type === "workitem") {
    const f = item.fields || {};
    const wiType = f["System.WorkItemType"] || "";
    const wiState = f["System.State"] || "";
    const wiTitle = f["System.Title"] || "";
    const areaPath = f["System.AreaPath"] || "";
    const assignee = f["System.AssignedTo"]?.displayName || f["System.AssignedTo"] || "";
    const created = f["System.CreatedDate"] ? new Date(f["System.CreatedDate"]).toLocaleDateString() : "";
    const typeColorMap = { Bug: T.red, Epic: T.amber, Feature: T.purple, "User Story": T.blue, Task: T.cyan };
    const tc = typeColorMap[wiType] || T.blue;
    const adomUrl = org ? `https://dev.azure.com/${org}/_workitems/edit/${item.id}` : null;
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: tc, background: `${tc}22`, borderRadius: 4, padding: "2px 8px", fontFamily: "'JetBrains Mono'" }}>{wiType}</span>
          <span style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>#{item.id}</span>
          <span style={{ fontSize: 11, color: T.text, background: "rgba(255,255,255,0.08)", borderRadius: 4, padding: "1px 7px", fontFamily: "'Barlow Condensed'" }}>{wiState}</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: T.text, marginBottom: 14, lineHeight: 1.35 }}>{wiTitle}</div>
        <ToggleSection />
        {adomUrl && <a href={adomUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: T.blue, textDecoration: "none", display: "inline-block", marginBottom: 18 }}>Open in ADO ↗</a>}
        <div>
          <Field label="State" value={wiState} />
          <Field label="Type" value={wiType} />
          <Field label="Area Path" value={areaPath} />
          <Field label="Assigned To" value={assignee} />
          <Field label="Created" value={created} />
        </div>
      </div>
    );
  }

  if (type === "repo") {
    const remoteUrl = item.remoteUrl || item.sshUrl || "";
    const defaultBranch = item.defaultBranch?.replace("refs/heads/", "") || "";
    const size = item.size != null ? `${Math.round(item.size / 1024)} KB` : "";
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.cyan, background: `${T.cyan}22`, borderRadius: 4, padding: "2px 7px", fontFamily: "'JetBrains Mono'" }}>REPO</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: T.cyan, marginBottom: 14, lineHeight: 1.35 }}>{item.name}</div>
        <ToggleSection />
        <div>
          <Field label="Default Branch" value={defaultBranch} />
          {size && <Field label="Size" value={size} />}
          {remoteUrl && <Field label="URL" value={remoteUrl} />}
          {item.project?.name && <Field label="Project" value={item.project.name} />}
        </div>
      </div>
    );
  }

  if (type === "pipeline") {
    const lastRun = item._links?.["web"]?.href || "";
    const folder = item.folder !== "\\" ? item.folder : "";
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.amber, background: `${T.amber}22`, borderRadius: 4, padding: "2px 7px", fontFamily: "'JetBrains Mono'" }}>PIPELINE</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: T.text, marginBottom: 14, lineHeight: 1.35 }}>{item.name}</div>
        <ToggleSection />
        <div>
          {folder && <Field label="Folder" value={folder} />}
          <Field label="Definition ID" value={String(item.id)} />
          {lastRun && <Field label="Web Link" value={lastRun} />}
        </div>
      </div>
    );
  }

  if (type === "pr") {
    const author = item.createdBy?.displayName || "";
    const source = item.sourceRefName?.replace("refs/heads/", "") || "";
    const target = item.targetRefName?.replace("refs/heads/", "") || "";
    const created = item.creationDate ? new Date(item.creationDate).toLocaleDateString() : "";
    const reviewers = (item.reviewers || []).map(r => r.displayName || r.uniqueName).join(", ");
    const stateColor = (s) => {
      if (!s) return T.dim;
      if (s === "active") return T.blue;
      if (s === "completed") return T.green;
      if (s === "abandoned") return T.red;
      return T.muted;
    };
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.purple, background: `${T.purple}22`, borderRadius: 4, padding: "2px 7px", fontFamily: "'JetBrains Mono'" }}>PR</span>
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: stateColor(item.status), background: `${stateColor(item.status)}22`, borderRadius: 4, padding: "1px 7px" }}>{item.status}</span>
          <span style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>#{item.pullRequestId}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 14, lineHeight: 1.35 }}>{item.title}</div>
        <ToggleSection />
        <div>
          <Field label="Author" value={author} />
          <Field label="Source Branch" value={source} />
          <Field label="Target Branch" value={target} />
          <Field label="Created" value={created} />
          {reviewers && <Field label="Reviewers" value={reviewers} />}
          {item.description && <Field label="Description" value={item.description} />}
        </div>
      </div>
    );
  }

  return null;
}

/* ─── ROOT ───────────────────────────────────────────────────── */
export default function App() {
  const [client, setClient]          = useState(null);
  const [org, setOrg]                = useState("");
  const [profile, setProfile]        = useState(null);
  const [collectionKey, setCollectionKey] = useState("ado-superui-collections");
  const [collections, setCollections]= useLocalStorage(collectionKey, []);
  const [activeCol, setActiveCol]    = useState(null);
  const [selectedWI, setSelectedWI]  = useState(null);
  const [view, setView]              = useState("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] = useState(null);
  const [syncStatus, setSyncStatus]  = useState("idle"); // "idle" | "saving" | "saved" | "error"
  const saveTimerRef = useRef(null);

  const handleConnect = useCallback(async (c, o) => {
    setClient(c); setOrg(o); setView("newCollection");
    try {
      const p = await c.getProfile();
      setProfile(p);
      setCollectionKey(`ado-superui-collections-${p.id}`);
      // Load server-side collections — these override localStorage if available
      const serverCols = await c.loadCollections(p.id);
      if (serverCols && serverCols.length > 0) {
        // Write directly to the scoped localStorage key so useLocalStorage picks it up
        try { localStorage.setItem(`ado-superui-collections-${p.id}`, JSON.stringify(serverCols)); } catch {}
      }
    } catch {
      // PAT lacks vso.profile scope or server unreachable — fall back gracefully
    }
  }, []);

  const handleCollectionCreated = useCallback((col) => {
    setCollections(p => [...p, { ...col, filters: { types: [], states: [], assignee: "", areaPath: "" }, workItemIds: [], repoIds: [], pipelineIds: [], prIds: [] }]);
    setActiveCol(col.id);
    setView("resources");
  }, [setCollections]);

  const handleCollectionFilterChange = useCallback((filters) => {
    setCollections(cols => cols.map(c => c.id === activeCol ? { ...c, filters } : c));
  }, [activeCol, setCollections]);

  const handleWorkItemToggle = useCallback((colId, workItemId) => {
    setCollections(cols => cols.map(c => {
      if (c.id !== colId) return c;
      const ids = c.workItemIds || [];
      const newIds = ids.includes(String(workItemId))
        ? ids.filter(id => id !== String(workItemId))
        : [...ids, String(workItemId)];
      return { ...c, workItemIds: newIds };
    }));
  }, [setCollections]);

  const handleResourceToggle = useCallback((type, resourceId, colId) => {
    setCollections(cols => cols.map(c => {
      if (c.id !== colId) return c;
      if (type === "repo") {
        const ids = c.repoIds || [];
        const rid = String(resourceId);
        const newIds = ids.includes(rid)
          ? ids.filter(id => id !== rid)
          : [...ids, rid];
        return { ...c, repoIds: newIds };
      }
      if (type === "pipeline") {
        const ids = c.pipelineIds || [];
        const newIds = ids.includes(String(resourceId))
          ? ids.filter(id => id !== String(resourceId))
          : [...ids, String(resourceId)];
        return { ...c, pipelineIds: newIds };
      }
      if (type === "pr") {
        const ids = c.prIds || [];
        const newIds = ids.includes(String(resourceId))
          ? ids.filter(id => id !== String(resourceId))
          : [...ids, String(resourceId)];
        return { ...c, prIds: newIds };
      }
      return c;
    }));
  }, [setCollections]);

  // Debounced server sync — fires 1.5s after the last collections mutation
  useEffect(() => {
    if (!client || !profile) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus("saving");
      try {
        await client.saveCollections(profile.id, collections);
        setSyncStatus("saved");
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch {
        setSyncStatus("error");
        setTimeout(() => setSyncStatus("idle"), 3000);
      }
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [collections, client, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(async (query) => {
    setSearchQuery(query);
    setSelectedSearchResult(null);
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = { workItems: [], repos: [], pipelines: [], prs: [] };
      const q = query.toLowerCase();
      
      const [wi, repos, pipelines, prs] = await Promise.allSettled([
        client.searchWorkItems(q, { types: [], states: [], assignee: "", areaPath: "" }),
        client.getAllRepos(),
        client.getAllPipelines(),
        client.getAllPullRequests(),
      ]);
      
      results.workItems = wi.status === "fulfilled" ? wi.value.slice(0, 20) : [];
      results.repos = repos.status === "fulfilled" ? repos.value.filter(r => r.name?.toLowerCase().includes(q)).slice(0, 20) : [];
      results.pipelines = pipelines.status === "fulfilled" ? pipelines.value.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 20) : [];
      results.prs = prs.status === "fulfilled" ? prs.value.filter(pr => pr.title?.toLowerCase().includes(q)).slice(0, 20) : [];
      
      setSearchResults(results);
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setSearching(false);
    }
  }, [client]);

  const collection = collections.find(c => c.id === activeCol);

  if (!client) return <ConnectScreen onConnect={handleConnect} />;

  return (
    <>
      <style>{FONTS + `
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #1F2937; border-radius: 2px; }
        input::placeholder { color: #374151; }
      `}</style>

      <div style={{ display: "flex", height: "100vh", background: T.bg, color: T.text, fontFamily: "'Barlow'", overflow: "hidden", paddingTop: 50 }}>

        {/* Header with Global Search */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 50, background: T.panel, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 20px", zIndex: 100 }}>
          <div style={{ flex: 1, maxWidth: 500, position: "relative", display: "flex", alignItems: "center", gap: 0 }}>
            <input value={searchQuery} onChange={e => handleSearch(e.target.value)} placeholder="🔍 Search all resources..."
              style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, outline: "none", color: T.text, padding: "8px 14px", fontSize: 13, fontFamily: "'Barlow'", boxSizing: "border-box" }} />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setSearchResults(null); setSelectedSearchResult(null); }} style={{ position: "absolute", right: 8, background: "none", border: "none", color: T.dim, cursor: "pointer", padding: "0 4px", fontSize: 16, lineHeight: 1 }}>×</button>
            )}
          </div>
          {searching && <span style={{ marginLeft: 12, fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>searching…</span>}
          {syncStatus === "saving" && <span style={{ marginLeft: 12, fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>↑ saving…</span>}
          {syncStatus === "saved"  && <span style={{ marginLeft: 12, fontSize: 10, color: T.green, fontFamily: "'JetBrains Mono'" }}>✓ saved</span>}
          {syncStatus === "error"  && <span style={{ marginLeft: 12, fontSize: 10, color: T.red, fontFamily: "'JetBrains Mono'" }}>⚠ sync failed</span>}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {profile && (
              <>
                <span style={{ fontSize: 12, color: T.muted, fontFamily: "'Barlow'" }}>{profile.displayName}</span>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.amber, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 13, color: "#000", flexShrink: 0 }} title={`${profile.displayName} · ${profile.emailAddress}`}>
                  {(profile.displayName || "?")[0].toUpperCase()}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Rail */}
        <div style={{ width: 215, background: T.panel, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "14px 14px 12px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 15, color: T.amber, letterSpacing: "0.05em", marginBottom: profile ? 8 : 2 }}>ADO SUPERUI</div>
            {profile ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.amber, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 13, color: "#000", flexShrink: 0 }}>
                  {(profile.displayName || "?")[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.displayName}</div>
                  <div style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>{profile.emailAddress}</div>
                  <div style={{ fontSize: 9, color: T.dimmer, fontFamily: "'JetBrains Mono'", marginTop: 1, opacity: 0.6 }}>{org}</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", marginTop: 2 }}>{org}</div>
            )}
          </div>
          <div style={{ flex: 1, overflowY: "auto", paddingTop: 10 }}>
            <div style={{ padding: "0 14px 8px", fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", letterSpacing: "0.1em", textTransform: "uppercase" }}>Collections</div>
            {collections.map(c => (
              <div key={c.id} onClick={() => { setActiveCol(c.id); setSelectedWI(null); setView("resources"); }}
                style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", cursor: "pointer", background: activeCol === c.id ? `${c.color}10` : "transparent", borderLeft: `2px solid ${activeCol === c.id ? c.color : "transparent"}`, transition: "all 0.12s" }}>
                <span style={{ fontSize: 15 }}>{c.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: activeCol === c.id ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                </div>
                <Dot color={c.color} />
                <button onClick={(e) => { e.stopPropagation(); setCollections(cols => cols.filter(x => x.id !== c.id)); if (activeCol === c.id) { setActiveCol(null); setSelectedWI(null); } }} 
                  style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", padding: "2px 5px", fontSize: 12, opacity: 0.4, lineHeight: 1 }} title="Delete collection">×</button>
              </div>
            ))}
            {!collections.length && <div style={{ padding: "14px", fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", lineHeight: 1.6 }}>No collections.<br />Create one to begin.</div>}
          </div>
          <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}` }}>
            <div onClick={() => { setView("newCollection"); setSelectedWI(null); }} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.6, transition: "opacity 0.15s", marginBottom: 9 }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>
              <span style={{ color: T.amber, fontSize: 13 }}>＋</span>
              <span style={{ fontSize: 12, color: T.muted }}>New Collection</span>
            </div>
            <div onClick={() => { client.clearCache(); setSelectedWI(null); setActiveCol(null); setActiveCol(collections[0]?.id || null); }} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.35, transition: "opacity 0.15s", marginBottom: 9 }}
              onMouseEnter={e => e.currentTarget.style.opacity = 0.7} onMouseLeave={e => e.currentTarget.style.opacity = 0.35}>
              <span style={{ fontSize: 11, color: T.dim }}>↻ Clear Cache</span>
            </div>
            <div onClick={() => { setClient(null); setCollections([]); setActiveCol(null); setProfile(null); setCollectionKey("ado-superui-collections"); }} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.35, transition: "opacity 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.opacity = 0.7} onMouseLeave={e => e.currentTarget.style.opacity = 0.35}>
              <span style={{ fontSize: 11, color: T.dim }}>⏻ Disconnect</span>
            </div>
          </div>
        </div>

        {/* Centre */}
        <div style={{ width: 370, background: T.panel, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          {searchQuery.trim()
            ? <SearchResultsList
                results={searchResults}
                searching={searching}
                searchQuery={searchQuery}
                collection={collection}
                selectedResult={selectedSearchResult}
                onSelect={r => { setSelectedSearchResult(r); setSelectedWI(null); }}
                onWorkItemToggle={handleWorkItemToggle}
                onResourceToggle={handleResourceToggle}
              />
            : collection
              ? <WorkItemPanel client={client} collection={collection} onSelect={wi => { setSelectedWI(wi); setSelectedSearchResult(null); setView("resources"); }} selected={selectedWI} onFilterChange={handleCollectionFilterChange} onWorkItemToggle={handleWorkItemToggle} />
              : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: T.dim }}>
                  <span style={{ fontSize: 30 }}>⬡</span>
                  <span style={{ fontSize: 13, fontFamily: "'Barlow Condensed'", letterSpacing: "0.05em" }}>Select a collection</span>
                </div>
          }
        </div>

        {/* Right */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {view === "newCollection"
            ? <CollectionBuilder onDone={handleCollectionCreated} />
            : selectedWI
              ? <ResourceDetail client={client} workItem={selectedWI} org={org} collection={collection} onResourceToggle={handleResourceToggle} />
              : selectedSearchResult
                ? <SearchResultDetail result={selectedSearchResult} collection={collection} org={org} onWorkItemToggle={handleWorkItemToggle} onResourceToggle={handleResourceToggle} />
                : collection
                  ? <CollectionResources client={client} collection={collection} collections={collections} onWorkItemToggle={handleWorkItemToggle} onResourceToggle={handleResourceToggle} org={org} onCreateNewCollection={() => setView("newCollection")} />
                  : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: T.dim }}>
                      <span style={{ fontSize: 38 }}>⬡</span>
                      <span style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, letterSpacing: "0.05em" }}>
                        Create a collection to begin
                      </span>
                      <Btn variant="primary" onClick={() => setView("newCollection")}>+ New Collection</Btn>
                    </div>
          }
        </div>
      </div>
    </>
  );
}
