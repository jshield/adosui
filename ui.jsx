import { useState, useCallback, useEffect } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&family=JetBrains+Mono:wght@400;500&family=Barlow:wght@300;400;500;600&display=swap');`;

const T = {
  bg: "#0A0B0E", panel: "#0D0F13", border: "rgba(255,255,255,0.06)",
  text: "#E5E7EB", muted: "#6B7280", dim: "#374151", dimmer: "#1F2937",
  amber: "#F59E0B", cyan: "#22D3EE", violet: "#A78BFA", red: "#F87171", green: "#4ADE80",
};

const PROXY = "http://localhost:3131";

/* ─── PROXY-AWARE ADO CLIENT ─────────────────────────────────── */
class ADOClient {
  constructor(org, pat) {
    this.org = org.trim().replace(/\/$/, "");
    this.pat = pat;
    this.base = `https://dev.azure.com/${encodeURIComponent(this.org)}`;
    this.feedsBase = `https://feeds.dev.azure.com/${encodeURIComponent(this.org)}`;
    this._auth = `Basic ${btoa(":" + pat)}`;
    this._projects = [];
  }

  async _fetch(url, opts = {}) {
    const res = await fetch(PROXY, {
      method: opts.method || "GET",
      headers: {
        "Authorization": this._auth,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Target-URL": url,
        ...(opts.headers || {}),
      },
      body: opts.body || undefined,
    });
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

  async getProjects() {
    const r = await this._fetch(`${this.base}/_apis/projects?api-version=7.1&$top=200`);
    this._projects = r.value || [];
    return this._projects;
  }

  async queryWorkItems(projectName) {
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectName.replace("'", "''")}' AND [System.WorkItemType] IN ('Epic','Feature','User Story','Bug','Task') AND [System.State] NOT IN ('Closed','Removed') ORDER BY [System.ChangedDate] DESC`;
    const r = await this._fetch(
      `${this.base}/${encodeURIComponent(projectName)}/_apis/wit/wiql?api-version=7.1&$top=200`,
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
    return (detail.value || []).map(wi => ({ ...wi, _project: projectName }));
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
          {isChecking ? "Checking proxy…" : "Local proxy not reachable on port 3131"}
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
  const [proxyStatus, setProxyStatus] = useState("idle");

  const checkProxy = async () => {
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
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
        setError("Cannot reach proxy on localhost:3131 — make sure ado-proxy.js is running.");
        setProxyStatus("error");
      } else if (msg.includes("401")) {
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

        {/* Setup instructions */}
        <div style={{ background: `${T.cyan}08`, border: `1px solid ${T.cyan}22`, borderRadius: 8, padding: "16px 18px", marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: T.cyan, fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 10 }}>STEP 1 — START THE PROXY</div>
          <div style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", lineHeight: 1.9 }}>
            Download <span style={{ color: T.text }}>ado-proxy.js</span> (linked below), then run:<br />
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

        <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, marginBottom: 20, fontFamily: "'Barlow Condensed'", fontSize: 16, letterSpacing: "0.04em" }}>STEP 2 — CONNECT</div>

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
          PAT held in memory only · never stored · proxy runs on 127.0.0.1 only<br />
          <span style={{ color: T.dim }}>All traffic goes directly from your machine to dev.azure.com</span>
        </div>
      </div>
    </div>
  );
}

/* ─── COLLECTION BUILDER ─────────────────────────────────────── */
function CollectionBuilder({ client, onDone }) {
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState(T.amber);
  const [loading, setLoading] = useState(true);

  const ICONS   = ["📦","💳","🔐","📊","🚀","🔧","⚡","🎯","🌐","🔬","🛡️","🎨"];
  const COLORS  = [T.amber, T.cyan, T.violet, T.red, T.green, "#F472B6", "#FB923C", "#34D399"];

  useEffect(() => {
    client.getProjects().then(p => { setProjects(p); setLoading(false); });
  }, []);

  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  return (
    <div style={{ padding: "26px 26px", height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.text }}>New Collection</div>
        <div style={{ fontSize: 12, color: T.muted, fontFamily: "'JetBrains Mono'", marginTop: 3 }}>Group ADO projects under a single work-centric workspace</div>
      </div>

      <div>
        <label style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 7 }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Payments Platform"
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

      <div>
        <label style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 9 }}>Include ADO Projects</label>
        {loading
          ? <div style={{ display: "flex", gap: 8, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner size={13} /> Loading…</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 260, overflowY: "auto" }}>
              {projects.map(p => {
                const sel = selected.includes(p.id);
                return (
                  <div key={p.id} onClick={() => toggle(p.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 5, cursor: "pointer", background: sel ? `${color}10` : "rgba(255,255,255,0.02)", border: `1px solid ${sel ? color + "44" : "rgba(255,255,255,0.05)"}`, transition: "all 0.12s" }}>
                    <span style={{ width: 16, height: 16, borderRadius: 3, border: `2px solid ${sel ? color : T.dim}`, background: sel ? color : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: T.bg, fontWeight: 700 }}>{sel ? "✓" : ""}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: sel ? T.text : T.muted }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.description || p.id}</div>
                    </div>
                  </div>
                );
              })}
            </div>
        }
      </div>

      <Btn variant="primary" onClick={() => onDone({ id: `c-${Date.now()}`, name: name.trim(), icon, color, projectIds: selected, projectNames: selected.map(id => projects.find(p => p.id === id)?.name).filter(Boolean) })} disabled={!name.trim() || !selected.length}>
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

function WorkItemPanel({ client, collection, onSelect, selected }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setLoading(true); setError(""); setItems([]);
    (async () => {
      const all = [];
      for (const name of collection.projectNames) {
        try {
          const wis = await client.queryWorkItems(name);
          all.push(...wis);
        } catch (e) {
          console.warn(`Failed ${name}:`, e);
        }
      }
      setItems(all);
      setLoading(false);
    })();
  }, [collection.id]);

  const ORDER = { Epic: 0, Feature: 1, "User Story": 2, Bug: 3, Task: 4 };
  const filtered = items
    .filter(wi => !filter.trim() || wi.fields?.["System.Title"]?.toLowerCase().includes(filter.toLowerCase()) || String(wi.id).includes(filter))
    .sort((a, b) => (ORDER[a.fields?.["System.WorkItemType"]] ?? 5) - (ORDER[b.fields?.["System.WorkItemType"]] ?? 5));

  return (
    <>
      <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>{collection.icon}</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 18, color: T.text }}>{collection.name}</div>
            <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>{collection.projectNames.join(" · ")}</div>
          </div>
          <Dot color={collection.color} />
        </div>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter work items…"
          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, outline: "none", color: T.text, padding: "7px 11px", fontSize: 12, fontFamily: "'Barlow'", boxSizing: "border-box" }} />
      </div>

      {loading
        ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> loading…</div>
        : <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
            {filtered.map(wi => {
              const type  = wi.fields?.["System.WorkItemType"] || "Task";
              const state = wi.fields?.["System.State"] || "";
              const isSel = selected?.id === wi.id;
              return (
                <div key={wi.id} onClick={() => onSelect(wi)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer", borderLeft: `2px solid ${isSel ? collection.color : "transparent"}`, background: isSel ? `${collection.color}08` : "transparent", transition: "all 0.12s" }}
                  onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = "rgba(255,255,255,0.025)"; } }}
                  onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = "transparent"; } }}>
                  <span style={{ fontSize: 9, color: WI_TYPE_COLOR[type] || T.dim, fontFamily: "'JetBrains Mono'", width: 42, flexShrink: 0 }}>{WI_TYPE_SHORT[type] || type.slice(0,5).toUpperCase()}</span>
                  <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", width: 38, flexShrink: 0 }}>#{wi.id}</span>
                  <span style={{ flex: 1, fontSize: 12, color: isSel ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wi.fields?.["System.Title"]}</span>
                  <Pill label={state} color={stateColor(state)} />
                </div>
              );
            })}
            {!filtered.length && !loading && (
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

function ResourceDetail({ client, workItem, org }) {
  const [repos,     setRepos]     = useState(null);
  const [pipelines, setPipelines] = useState(null);
  const [prs,       setPrs]       = useState(null);
  const [tests,     setTests]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const project = workItem._project;

  useEffect(() => {
    setLoading(true); setRepos(null); setPipelines(null); setPrs(null); setTests(null);
    Promise.allSettled([
      client.getRepos(project),
      client.getPipelines(project),
      client.getPullRequests(project),
      client.getTestRuns(project),
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
              <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>↳ {project}</span>
            </div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: "#F9FAFB", lineHeight: 1.2, letterSpacing: "0.02em" }}>{title}</div>
            {workItem.fields?.["System.AssignedTo"]?.displayName && (
              <div style={{ marginTop: 5, fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                Assigned to {workItem.fields["System.AssignedTo"].displayName} · Changed {timeAgo(workItem.fields["System.ChangedDate"])}
              </div>
            )}
          </div>
          <a href={`https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_workitems/edit/${workItem.id}`}
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
                  ? repos.slice(0, 10).map(r => (
                      <Card key={r.id} accent={T.cyan}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.cyan }}>{r.name}</span>
                            <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginLeft: 8 }}>/{r.defaultBranch?.replace("refs/heads/", "") || "main"}</span>
                          </div>
                          <span style={{ fontSize: 10, color: T.green, background: `${T.green}10`, padding: "2px 7px", borderRadius: 3, fontFamily: "'JetBrains Mono'" }}>
                            {r.size ? `${(r.size / 1024).toFixed(0)} KB` : "empty"}
                          </span>
                        </div>
                      </Card>
                    ))
                  : <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No repositories</div>
                }
              </Section>

              <Section title="Pipelines" icon="⚡" count={pipelines?.length}>
                {pipelines?.length
                  ? pipelines.slice(0, 10).map(p => {
                      const rs = pipelineStatus(p.latestRun?.result || p.latestRun?.state);
                      return (
                        <Card key={p.id} accent={rs.color}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                              <Dot color={rs.color} pulse={rs.label === "running"} />
                              <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.text }}>{p.name}</span>
                            </div>
                            <Pill label={rs.label} color={rs.color} />
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
                      return (
                        <Card key={pr.pullRequestId} accent={ps.color}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ flex: 1, paddingRight: 12 }}>
                              <div>
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
                            <Pill label={ps.label} color={ps.color} />
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

/* ─── ROOT ───────────────────────────────────────────────────── */
export default function App() {
  const [client, setClient]          = useState(null);
  const [org, setOrg]                = useState("");
  const [collections, setCollections]= useState([]);
  const [activeCol, setActiveCol]    = useState(null);
  const [selectedWI, setSelectedWI]  = useState(null);
  const [view, setView]              = useState("resources");

  const handleConnect = useCallback((c, o) => {
    setClient(c); setOrg(o); setView("newCollection");
  }, []);

  const handleCollectionCreated = useCallback((col) => {
    setCollections(p => [...p, col]);
    setActiveCol(col.id);
    setView("resources");
  }, []);

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
                  <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>{c.projectNames.length} project{c.projectNames.length !== 1 ? "s" : ""}</div>
                </div>
                <Dot color={c.color} />
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
            <div onClick={() => { setClient(null); setCollections([]); setActiveCol(null); }} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.35, transition: "opacity 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.opacity = 0.7} onMouseLeave={e => e.currentTarget.style.opacity = 0.35}>
              <span style={{ fontSize: 11, color: T.dim }}>⏻ Disconnect</span>
            </div>
          </div>
        </div>

        {/* Centre */}
        <div style={{ width: 370, background: T.panel, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          {collection
            ? <WorkItemPanel client={client} collection={collection} onSelect={wi => { setSelectedWI(wi); setView("resources"); }} selected={selectedWI} />
            : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: T.dim }}>
                <span style={{ fontSize: 30 }}>⬡</span>
                <span style={{ fontSize: 13, fontFamily: "'Barlow Condensed'", letterSpacing: "0.05em" }}>Select a collection</span>
              </div>
          }
        </div>

        {/* Right */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {view === "newCollection"
            ? <CollectionBuilder client={client} onDone={handleCollectionCreated} />
            : selectedWI
              ? <ResourceDetail client={client} workItem={selectedWI} org={org} />
              : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: T.dim }}>
                  <span style={{ fontSize: 38 }}>⬡</span>
                  <span style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, letterSpacing: "0.05em" }}>
                    {collection ? "Select a work item" : "Create a collection to begin"}
                  </span>
                  {!collection && <Btn variant="primary" onClick={() => setView("newCollection")}>+ New Collection</Btn>}
                </div>
          }
        </div>
      </div>
    </>
  );
}

