import { useState } from "react";
import { T, FONTS, USE_PROXY, PROXY } from "../../lib/theme";
import { Spinner } from "../ui";
import { Dot } from "../ui";

export function ConnectScreen({ onConnect }) {
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
      const { ADOClient } = await import("../../lib/adoClient");
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
