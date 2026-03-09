import { useState, useCallback, useEffect, useRef } from "react";

/* ─── LOCAL STORAGE HOOK ─────────────────────────────────────── */
function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });
  const set = useCallback((v) => {
    setValue(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
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

function ResourceDetail({ client, workItem, org, collections, onResourceToggle, onCreateNewCollection }) {
  const [repos,     setRepos]     = useState(null);
  const [pipelines, setPipelines] = useState(null);
  const [prs,       setPrs]       = useState(null);
  const [tests,     setTests]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [activeDropdown, setActiveDropdown] = useState(null);

  useEffect(() => {
    setLoading(true); setRepos(null); setPipelines(null); setPrs(null); setTests(null);
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

  const getCollectionsContainingRepo = (repoId) => collections.filter(col => col.repoIds?.includes(repoId));
  const getCollectionsContainingPipeline = (pipelineId) => collections.filter(col => col.pipelineIds?.includes(String(pipelineId)));
  const getCollectionsContainingPR = (prId) => collections.filter(col => col.prIds?.includes(String(prId)));

  const handleToggleCollection = (type, id, colId) => {
    if (onResourceToggle) onResourceToggle(type, id, colId);
    setActiveDropdown(null);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
              <Pill label={WI_TYPE_SHORT[type] || type} color={WI_TYPE_COLOR[type] || T.dim} />
              <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{workItem.id}</span>
              <Pill label={state} color={stateColor(state)} />
              {areaPath && <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>↳ {areaPath}</span>}
            </div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: "#F9FAFB", lineHeight: 1.2, letterSpacing: "0.02em" }}>{title}</div>
            {workItem.fields?.["System.AssignedTo"]?.displayName && (
              <div style={{ marginTop: 5, fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                Assigned to {workItem.fields["System.AssignedTo"].displayName} · Changed {timeAgo(workItem.fields["System.ChangedDate"])}
              </div>
            )}
          </div>
          <a href={`https://dev.azure.com/${encodeURIComponent(org)}/_workitems/edit/${workItem.id}`}
            target="_blank" rel="noreferrer"
            style={{ background: `${T.amber}12`, border: `1px solid ${T.amber}33`, color: T.amber, padding: "6px 13px", borderRadius: 4, fontSize: 12, fontFamily: "'Barlow'", fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap", marginTop: 2 }}>
            Open in ADO ↗
          </a>
        </div>
      </div>

      {/* Resources */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {loading
          ? <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> Loading resources…</div>
          : <>
              <Section title="Repositories" icon="⎇" count={repos?.length}>
                {repos?.length
                  ? repos.slice(0, 10).map(r => {
                      const containingCols = getCollectionsContainingRepo(r.id);
                      return (
                        <Card key={r.id} accent={T.cyan}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ display: "flex", gap: 3 }}>
                                {containingCols.map(col => (
                                  <span key={col.id} style={{ width: 5, height: 5, borderRadius: "50%", background: col.color }} title={col.name} />
                                ))}
                              </div>
                              <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.cyan }}>{r.name}</span>
                              <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>/{r.defaultBranch?.replace("refs/heads/", "") || "main"}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 10, color: T.green, background: `${T.green}10`, padding: "2px 7px", borderRadius: 3, fontFamily: "'JetBrains Mono'" }}>
                                {r.size ? `${(r.size / 1024).toFixed(0)} KB` : "empty"}
                              </span>
                              <div style={{ position: "relative" }}>
                                <button onClick={() => setActiveDropdown(activeDropdown === `repo-${r.id}` ? null : `repo-${r.id}`)}
                                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "3px 8px", cursor: "pointer", color: T.muted, fontSize: 12 }}>
                                  +
                                </button>
                                {activeDropdown === `repo-${r.id}` && (
                                  <CollectionDropdown
                                    collections={collections}
                                    currentIds={containingCols.map(c => c.id)}
                                    onToggle={(colId) => handleToggleCollection("repo", r.id, colId)}
                                    onClose={() => setActiveDropdown(null)}
                                    onCreateNew={onCreateNewCollection}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  : <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No repositories</div>
                }
              </Section>

              <Section title="Pipelines" icon="⚡" count={pipelines?.length}>
                {pipelines?.length
                  ? pipelines.slice(0, 10).map(p => {
                      const rs = pipelineStatus(p.latestRun?.result || p.latestRun?.state);
                      const containingCols = getCollectionsContainingPipeline(p.id);
                      return (
                        <Card key={p.id} accent={rs.color}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                              <div style={{ display: "flex", gap: 3 }}>
                                {containingCols.map(col => (
                                  <span key={col.id} style={{ width: 5, height: 5, borderRadius: "50%", background: col.color }} title={col.name} />
                                ))}
                              </div>
                              <Dot color={rs.color} pulse={rs.label === "running"} />
                              <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.text }}>{p.name}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Pill label={rs.label} color={rs.color} />
                              <div style={{ position: "relative" }}>
                                <button onClick={() => setActiveDropdown(activeDropdown === `pipeline-${p.id}` ? null : `pipeline-${p.id}`)}
                                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "3px 8px", cursor: "pointer", color: T.muted, fontSize: 12 }}>
                                  +
                                </button>
                                {activeDropdown === `pipeline-${p.id}` && (
                                  <CollectionDropdown
                                    collections={collections}
                                    currentIds={containingCols.map(c => c.id)}
                                    onToggle={(colId) => handleToggleCollection("pipeline", p.id, colId)}
                                    onClose={() => setActiveDropdown(null)}
                                    onCreateNew={onCreateNewCollection}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  : <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No pipelines</div>
                }
              </Section>

              <Section title="Pull Requests" icon="⟲" count={prs?.length}>
                {prs?.length
                  ? prs.slice(0, 8).map(pr => {
                      const ps = { active: { color: T.cyan, label: "open" }, completed: { color: T.green, label: "merged" }, abandoned: { color: T.muted, label: "closed" } }[pr.status] || { color: T.dim, label: pr.status };
                      const containingCols = getCollectionsContainingPR(pr.pullRequestId);
                      return (
                        <Card key={pr.pullRequestId} accent={ps.color}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ flex: 1, paddingRight: 12 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ display: "flex", gap: 3 }}>
                                  {containingCols.map(col => (
                                    <span key={col.id} style={{ width: 5, height: 5, borderRadius: "50%", background: col.color }} title={col.name} />
                                  ))}
                                </div>
                                <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{pr.pullRequestId} </span>
                                <span style={{ fontSize: 13, color: T.text }}>{pr.title}</span>
                              </div>
                              <div style={{ marginTop: 5, display: "flex", gap: 12, fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                                <span>{pr.createdBy?.displayName}</span>
                                <span>→ {pr.targetRefName?.replace("refs/heads/", "")}</span>
                                <span>{timeAgo(pr.creationDate)}</span>
                                <span>{pr.reviewers?.length || 0} reviewer{pr.reviewers?.length !== 1 ? "s" : ""}</span>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Pill label={ps.label} color={ps.color} />
                              <div style={{ position: "relative" }}>
                                <button onClick={() => setActiveDropdown(activeDropdown === `pr-${pr.pullRequestId}` ? null : `pr-${pr.pullRequestId}`)}
                                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "3px 8px", cursor: "pointer", color: T.muted, fontSize: 12 }}>
                                  +
                                </button>
                                {activeDropdown === `pr-${pr.pullRequestId}` && (
                                  <CollectionDropdown
                                    collections={collections}
                                    currentIds={containingCols.map(c => c.id)}
                                    onToggle={(colId) => handleToggleCollection("pr", pr.pullRequestId, colId)}
                                    onClose={() => setActiveDropdown(null)}
                                    onCreateNew={onCreateNewCollection}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  : <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No active pull requests</div>
                }
              </Section>

              <Section title="Test Runs" icon="✓" count={tests?.length}>
                {tests?.length
                  ? tests.slice(0, 8).map(t => {
                      const pass = t.passedTests ?? 0;
                      const fail = t.failedTests ?? 0;
                      const total = t.totalTests ?? pass + fail;
                      const color = fail > 0 ? T.red : pass > 0 ? T.green : T.dim;
                      return (
                        <Card key={t.id} accent={color}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'", color: T.text }}>{t.name}</span>
                              <div style={{ marginTop: 3, fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>{timeAgo(t.completedDate)}</div>
                            </div>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: T.green, fontFamily: "'JetBrains Mono'" }}>✓ {pass}</span>
                              {fail > 0 && <span style={{ fontSize: 11, color: T.red, fontFamily: "'JetBrains Mono'" }}>✗ {fail}</span>}
                              <Pill label={fail > 0 ? "failing" : "passing"} color={color} />
                            </div>
                          </div>
                        </Card>
                      );
                    })
                  : <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No test runs</div>
                }
              </Section>
            </>
        }
      </div>
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
  const [activeTab, setActiveTab] = useState("workitems");

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

  const tabs = [
    { id: "workitems", label: "Work Items", count: collection.workItemIds?.length || 0 },
    { id: "repos", label: "Repositories", count: collection.repoIds?.length || 0 },
    { id: "pipelines", label: "Pipelines", count: collection.pipelineIds?.length || 0 },
    { id: "prs", label: "Pull Requests", count: collection.prIds?.length || 0 },
  ];

  const removeFromCollection = (type, id) => {
    if (type === "workitem") {
      onWorkItemToggle(collection.id, id);
    } else {
      onResourceToggle(type, id, collection.id);
    }
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
        
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}`, paddingBottom: 0 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? `${collection.color}15` : "transparent",
                border: "none",
                borderBottom: `2px solid ${activeTab === tab.id ? collection.color : "transparent"}`,
                color: activeTab === tab.id ? T.text : T.dim,
                padding: "8px 16px",
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
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {loading ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> Loading...</div>
        ) : (
          <>
            {activeTab === "workitems" && (
              <>
                {workItems.length > 0 ? workItems.map(wi => {
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
                }) : (
                  <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'", textAlign: "center", padding: 40 }}>
                    No work items saved in this collection.<br />Click + on a work item to add it.
                  </div>
                )}
              </>
            )}

            {activeTab === "repos" && (
              <>
                {repos.length > 0 ? repos.map(r => (
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
                )) : (
                  <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'", textAlign: "center", padding: 40 }}>
                    No repositories saved. Click + on a repo to add it.
                  </div>
                )}
              </>
            )}

            {activeTab === "pipelines" && (
              <>
                {pipelines.length > 0 ? pipelines.map(p => {
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
                }) : (
                  <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'", textAlign: "center", padding: 40 }}>
                    No pipelines saved. Click + on a pipeline to add it.
                  </div>
                )}
              </>
            )}

            {activeTab === "prs" && (
              <>
                {prs.length > 0 ? prs.map(pr => {
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
                }) : (
                  <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'", textAlign: "center", padding: 40 }}>
                    No pull requests saved. Click + on a PR to add it.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── ROOT ───────────────────────────────────────────────────── */
export default function App() {
  const [client, setClient]          = useState(null);
  const [org, setOrg]                = useState("");
  const [collections, setCollections]= useLocalStorage("ado-superui-collections", []);
  const [activeCol, setActiveCol]    = useState(null);
  const [selectedWI, setSelectedWI]  = useState(null);
  const [view, setView]              = useState("resources");

  const handleConnect = useCallback((c, o) => {
    setClient(c); setOrg(o); setView("newCollection");
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

      <div style={{ display: "flex", height: "100vh", background: T.bg, color: T.text, fontFamily: "'Barlow'", overflow: "hidden" }}>

        {/* Rail */}
        <div style={{ width: 215, background: T.panel, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 17, color: T.amber, letterSpacing: "0.05em" }}>ADO SUPERUI</div>
            <div style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", marginTop: 2 }}>{org}</div>
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
            <div onClick={() => { setClient(null); setCollections([]); setActiveCol(null); }} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.35, transition: "opacity 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.opacity = 0.7} onMouseLeave={e => e.currentTarget.style.opacity = 0.35}>
              <span style={{ fontSize: 11, color: T.dim }}>⏻ Disconnect</span>
            </div>
          </div>
        </div>

        {/* Centre */}
        <div style={{ width: 370, background: T.panel, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          {collection
            ? <WorkItemPanel client={client} collection={collection} onSelect={wi => { setSelectedWI(wi); setView("resources"); }} selected={selectedWI} onFilterChange={handleCollectionFilterChange} onWorkItemToggle={handleWorkItemToggle} />
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
              ? <ResourceDetail client={client} workItem={selectedWI} org={org} collections={collections} onResourceToggle={handleResourceToggle} onCreateNewCollection={() => setView("newCollection")} />
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
