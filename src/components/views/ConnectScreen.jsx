import { useState, useEffect } from "react";
import { T, FONTS } from "../../lib/theme";
import { Spinner, formLabelStyle, Input } from "../ui";
import { ADOClient } from "../../lib/adoClient";
import { isPRFAvailable, hasStoredCredentials, getStoredOrg, getStoredAuthMode, registerFIDO2Credential, loadPAT, persistPAT } from "../../lib/credentialStore";

export function ConnectScreen({ onConnect }) {
  const [org, setOrg] = useState("");
  const [pat, setPat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prfSupported, setPrfSupported] = useState(false);
  const [authMode, setAuthMode] = useState("passphrase"); // "prf" | "passphrase"
  const [passphrase, setPassphrase] = useState("");
  const [returning, setReturning] = useState(false);

  // PRF detection and returning user check
  useEffect(() => {
    isPRFAvailable().then(setPrfSupported);

    if (hasStoredCredentials()) {
      setReturning(true);
      const storedOrg = getStoredOrg();
      if (storedOrg) setOrg(storedOrg);
      const storedMode = getStoredAuthMode();
      if (storedMode) setAuthMode(storedMode);
    }
  }, []);

  const connect = async () => {
    if (!org.trim()) return;
    if (returning) {
      // Just needs PAT + passphrase (if passphrase mode)
      if (authMode === "passphrase" && !passphrase.trim()) return;
    } else {
      if (!pat.trim()) return;
      if (authMode === "passphrase" && !passphrase.trim()) return;
    }

    setLoading(true);
    setError("");

    try {
      // If new user, encrypt + persist the PAT first
      if (!returning) {
        if (authMode === "prf") {
          const cred = await registerFIDO2Credential(org.trim());
          await persistPAT(pat.trim(), { ...cred, org: org.trim() });
        } else {
          await persistPAT(pat.trim(), { authMode: "passphrase", org: org.trim(), passphrase: passphrase.trim() });
        }
      }

      // Now retrieve the PAT (from cache or by decrypting)
      const { pat: storedPat } = await loadPAT(authMode === "passphrase" ? passphrase.trim() : undefined);
      if (!storedPat) throw new Error("Could not decrypt PAT");

      // Test connection and proceed
      const c = new ADOClient(org.trim(), storedPat);
      await c.testConnection();
      const projects = await c.getProjects();
      c._projects = projects;

      onConnect(c, org.trim(), {
        authMode,
        passphrase: authMode === "passphrase" ? passphrase.trim() : undefined,
      });
    } catch (e) {
      const msg = e.message;
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
        setError("Cannot reach dev.azure.com — check your network and PAT scope.");
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

  const unlock = async () => {
    if (authMode === "passphrase" && !passphrase.trim()) return;
    setLoading(true);
    setError("");
    try {
      const { pat: storedPat } = await loadPAT(authMode === "passphrase" ? passphrase.trim() : undefined);
      if (!storedPat) throw new Error("Could not decrypt PAT");

      const c = new ADOClient(org.trim(), storedPat);
      await c.testConnection();
      const projects = await c.getProjects();
      c._projects = projects;

      onConnect(c, org.trim(), {
        authMode,
        passphrase: authMode === "passphrase" ? passphrase.trim() : undefined,
      });
    } catch (e) {
      setError("Could not unlock — wrong passphrase or hardware key not available.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow'" }}>
      <style>{FONTS + `@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ position: "fixed", inset: 0, backgroundImage: "radial-gradient(circle at 1px 1px, rgba(245,158,11,0.04) 1px, transparent 0)", backgroundSize: "32px 32px", pointerEvents: "none" }} />

      <div style={{ width: 520, position: "relative" }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 36, color: T.amber, letterSpacing: "0.06em" }}>
            {returning ? `Welcome back` : "ADO SUPERUI"}
          </div>
          <div style={{ fontSize: 12, color: T.dim, fontFamily: "'JetBrains Mono'", marginTop: 5 }}>
            {returning ? org || "..." : "work-centric azure devops workspace"}
          </div>
        </div>

        <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.muted, marginBottom: 20, fontFamily: "'Barlow Condensed'", letterSpacing: "0.04em" }}>
            {returning ? "UNLOCK" : "CONNECT"}
          </div>

          {!returning && (
            <div style={{ marginBottom: 16 }}>
              <label style={formLabelStyle}>Organisation</label>
              <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, overflow: "hidden" }}>
                <span style={{ padding: "0 10px", color: T.dim, fontSize: 11, fontFamily: "'JetBrains Mono'", borderRight: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>dev.azure.com/</span>
                <input value={org} onChange={e => setOrg(e.target.value)} onKeyDown={e => e.key === "Enter" && connect()} placeholder="your-org"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, padding: "10px 12px", fontSize: 13, fontFamily: "'JetBrains Mono'" }} />
              </div>
            </div>
          )}

          {!returning && (
            <div style={{ marginBottom: 22 }}>
              <label style={formLabelStyle}>Personal Access Token</label>
              <Input type="password" value={pat} onChange={e => setPat(e.target.value)} onKeyDown={e => e.key === "Enter" && connect()} placeholder="••••••••••••••••••••" />
              <div style={{ fontSize: 10, color: T.dim, marginTop: 6, fontFamily: "'JetBrains Mono'" }}>
                Scopes: <span style={{ color: "#4B5563" }}>Code·Read · Work Items·Read · Build·Read · Test·Read</span>
              </div>
            </div>
          )}

          {/* Security mode selection */}
          <div style={{ marginBottom: returning ? 16 : 22 }}>
            <label style={formLabelStyle}>Security</label>
            {prfSupported ? (
              <div style={{ display: "flex", gap: 12 }}>
                {["prf", "passphrase"].map(mode => (
                  <button key={mode}
                    onClick={() => setAuthMode(mode)}
                    style={{
                      flex: 1, padding: "10px", borderRadius: 5, cursor: "pointer",
                      background: authMode === mode ? `${T.amber}18` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${authMode === mode ? T.amber + "44" : "rgba(255,255,255,0.08)"}`,
                      color: authMode === mode ? T.amber : T.muted,
                      fontSize: 12, fontFamily: "'JetBrains Mono'"
                    }}
                  >
                    {mode === "prf" ? "🔑 FIDO2 (recommended)" : "🔒 Passphrase"}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'", lineHeight: 1.8 }}>
                Using passphrase encryption (PRF not supported in this browser)
              </div>
            )}
          </div>

          {/* Passphrase input (only if selected or no PRF support) */}
          {(!prfSupported || authMode === "passphrase") && (
            <div style={{ marginBottom: 22 }}>
              <label style={formLabelStyle}>Passphrase</label>
              <Input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} onKeyDown={e => e.key === "Enter" && (returning ? unlock() : connect())} placeholder="••••••••••••••••••••" />
              <div style={{ fontSize: 10, color: T.dim, marginTop: 6, fontFamily: "'JetBrains Mono'" }}>
                Used to encrypt your PAT locally. Never stored.
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: `${T.red}10`, border: `1px solid ${T.red}33`, borderRadius: 5, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: T.red, fontFamily: "'JetBrains Mono'", lineHeight: 1.6 }}>{error}</div>
          )}

          <button onClick={returning ? unlock : connect} disabled={loading}
            style={{ width: "100%", background: `${T.amber}18`, border: `1px solid ${T.amber}${loading ? "22" : "44"}`, color: loading ? `${T.amber}55` : T.amber, padding: "11px", borderRadius: 5, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            {loading ? <><Spinner size={13} /> {returning ? "UNLOCKING…" : "CONNECTING…"}</> : returning ? "UNLOCK →" : "CONNECT →"}
          </button>

          {returning && (
            <button onClick={() => setReturning(false)} style={{ marginTop: 10, width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: T.muted, padding: "8px", borderRadius: 5, cursor: "pointer", fontSize: 11, fontFamily: "'JetBrains Mono'" }}>
              Connect as a different user
            </button>
          )}
        </div>

        <div style={{ marginTop: 16, fontSize: 11, color: T.dimmer, textAlign: "center", fontFamily: "'JetBrains Mono'", lineHeight: 1.8 }}>
          {prfSupported && authMode === "prf" ? (
            <>
              PAT encrypted with your FIDO2 hardware key · never leaves the device
            </>
          ) : (
            <>
              PAT encrypted with your passphrase · never sent to any intermediary
            </>
          )}
        </div>
      </div>
    </div>
  );
}
