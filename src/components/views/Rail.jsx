import { useState } from "react";
import { T } from "../../lib/theme";
import { Dot, UserAvatar, Spinner } from "../ui";
import { PINNED_PIPELINES_ID } from "../../lib/adoStorage";
import { updatePAT as updateStoredPAT } from "../../lib/credentialStore";

const SYNC_LABEL = {
  idle:   null,
  saving: { text: "Saving…",  color: T.amber },
  saved:  { text: "Saved ✓",  color: T.green },
  error:  { text: "Save failed", color: T.red },
};

export function Rail({ profile, org, collections, activeCol, activeView, syncStatus, workerActivity, onSelectCollection, onNewCollection, onClearCache, onDisconnect, onShowPipelines, onShowWorkerStatus, onShowYamlTools, client, onUpdatePat, onReconfigure }) {
  // Split into shared and personal, hiding the reserved pinned-pipelines collection
  const shared   = collections.filter(c => c.scope !== "personal");
  const personal = collections.filter(c => c.scope === "personal" && c.id !== PINNED_PIPELINES_ID);

  const syncInfo = SYNC_LABEL[syncStatus] || null;

  // PAT swap inline state
  const [showPatForm, setShowPatForm] = useState(false);
  const [newPat, setNewPat] = useState("");
  const [patUpdating, setPatUpdating] = useState(false);
  const [patError, setPatError] = useState("");

  const handleUpdatePat = async () => {
    if (!newPat.trim()) return;
    setPatUpdating(true);
    setPatError("");
    try {
      // 1. Persist encrypted PAT in storage
      await updateStoredPAT(newPat.trim());
      // 2. Update the ADOClient instance in-place
      client.updatePat(newPat.trim());
      // 3. Verify it works (quick check)
      await client.testConnection();
      setNewPat("");
      setShowPatForm(false);
      // Show a brief success sync indicator
      onUpdatePat?.();
    } catch (e) {
      setPatError(e.message || "Failed to update PAT");
    } finally {
      setPatUpdating(false);
    }
  };

  const renderCollection = (c) => (
    <div key={c.id} onClick={() => onSelectCollection(c.id)}
      style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", cursor: "pointer", background: activeCol === c.id && activeView !== "pipelines" && activeView !== "workerStatus" ? `${c.color}10` : "transparent", borderLeft: `2px solid ${activeCol === c.id && activeView !== "pipelines" && activeView !== "workerStatus" ? c.color : "transparent"}`, transition: "all 0.12s" }}
      onMouseEnter={e => { if (activeCol !== c.id) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
      onMouseLeave={e => { if (activeCol !== c.id) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 15 }}>{c.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: activeCol === c.id && activeView !== "pipelines" && activeView !== "workerStatus" ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
      </div>
      <Dot color={c.color} />
      <button
        onClick={e => { e.stopPropagation(); onSelectCollection(null, c.id); }}
        style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", padding: "2px 5px", fontSize: 12, opacity: 0.4, lineHeight: 1 }}
        title="Delete collection"
      >×</button>
    </div>
  );

  return (
    <div style={{ width: 215, background: T.panel, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: "14px 14px 12px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 15, color: T.amber, letterSpacing: "0.05em", marginBottom: profile ? 8 : 2 }}>ADO SUPERUI</div>
        {profile ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserAvatar profile={profile} />
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

      {/* Pipelines shortcut */}
      <div
        onClick={onShowPipelines}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", background: activeView === "pipelines" ? `${T.violet}10` : "transparent", borderLeft: `2px solid ${activeView === "pipelines" ? T.violet : "transparent"}`, transition: "all 0.12s", borderBottom: `1px solid ${T.border}` }}
        onMouseEnter={e => { if (activeView !== "pipelines") e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
        onMouseLeave={e => { if (activeView !== "pipelines") e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 14 }}>⚡</span>
        <span style={{ fontSize: 12, color: activeView === "pipelines" ? T.violet : T.muted, fontWeight: 500 }}>Pipelines</span>
      </div>

      {/* Worker Status shortcut */}
      <div
        onClick={onShowWorkerStatus}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", background: activeView === "workerStatus" ? `${T.cyan}10` : "transparent", borderLeft: `2px solid ${activeView === "workerStatus" ? T.cyan : "transparent"}`, transition: "all 0.12s", borderBottom: `1px solid ${T.border}` }}
        onMouseEnter={e => { if (activeView !== "workerStatus") e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
        onMouseLeave={e => { if (activeView !== "workerStatus") e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 12 }}>◉</span>
        <span style={{ fontSize: 12, color: activeView === "workerStatus" ? T.cyan : T.muted, fontWeight: 500 }}>Sync Status</span>
      </div>

      {/* YAML Tools shortcut */}
      <div
        onClick={onShowYamlTools}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", background: activeView === "yamlTools" ? `${T.amber}10` : "transparent", borderLeft: `2px solid ${activeView === "yamlTools" ? T.amber : "transparent"}`, transition: "all 0.12s", borderBottom: `1px solid ${T.border}` }}
        onMouseEnter={e => { if (activeView !== "yamlTools") e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
        onMouseLeave={e => { if (activeView !== "yamlTools") e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 13 }}>🛠️</span>
        <span style={{ fontSize: 12, color: activeView === "yamlTools" ? T.amber : T.muted, fontWeight: 500 }}>YAML Tools</span>
      </div>

      {/* Collections list */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 8 }}>

        {/* SHARED section */}
        <div style={{ padding: "6px 14px 4px", fontSize: 9, color: T.dim, fontFamily: "'JetBrains Mono'", letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Shared</span>
          <span style={{ color: T.dimmer }}>{shared.length}</span>
        </div>
        {shared.map(renderCollection)}
        {!shared.length && (
          <div style={{ padding: "6px 14px 10px", fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>No shared collections.</div>
        )}

        {/* PERSONAL section */}
        <div style={{ padding: "10px 14px 4px", fontSize: 9, color: T.violet, fontFamily: "'JetBrains Mono'", letterSpacing: "0.12em", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1px solid ${T.border}`, marginTop: 6 }}>
          <span style={{ color: T.dim }}>Personal</span>
          <span style={{ color: T.dimmer }}>{personal.length}</span>
        </div>
        {personal.map(renderCollection)}
        {!personal.length && (
          <div style={{ padding: "6px 14px 10px", fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>No personal collections.</div>
        )}
      </div>

      {/* Footer actions */}
      <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}` }}>
        {/* Sync status */}
        {syncInfo && (
          <div style={{ fontSize: 10, color: syncInfo.color, fontFamily: "'JetBrains Mono'", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: syncInfo.color, display: "inline-block" }} />
            {syncInfo.text}
          </div>
        )}

        {/* Background worker activity */}
        {workerActivity?.isRunning && (
          <div style={{ marginBottom: 8, padding: "6px 8px", background: "rgba(0,0,0,0.2)", borderRadius: 4, fontSize: 9, fontFamily: "'JetBrains Mono'" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, animation: "pulse 1s infinite" }} />
              <span style={{ color: T.dimmer }}>Background sync active</span>
            </div>
            {workerActivity.lastRefresh && (
              <div style={{ color: T.dimmer, opacity: 0.7 }}>
                Last refresh: {new Date(workerActivity.lastRefresh).toLocaleTimeString()}
              </div>
            )}
            {workerActivity.activityLog[0] && (
              <div style={{ color: T.dim, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {workerActivity.activityLog[0].message}
              </div>
            )}
          </div>
        )}

        <div onClick={onNewCollection} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.6, transition: "opacity 0.15s", marginBottom: 9 }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>
          <span style={{ color: T.amber, fontSize: 13 }}>＋</span>
          <span style={{ fontSize: 12, color: T.muted }}>New Collection</span>
        </div>
        <div onClick={onClearCache} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.35, transition: "opacity 0.15s", marginBottom: 9 }}
          onMouseEnter={e => e.currentTarget.style.opacity = 0.7} onMouseLeave={e => e.currentTarget.style.opacity = 0.35}>
          <span style={{ fontSize: 11, color: T.dim }}>↻ Clear Cache</span>
        </div>
        <div onClick={onReconfigure} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.35, transition: "opacity 0.15s", marginBottom: 9 }}
          onMouseEnter={e => e.currentTarget.style.opacity = 0.7} onMouseLeave={e => e.currentTarget.style.opacity = 0.35}>
          <span style={{ fontSize: 11, color: T.dim }}>⚙ Config</span>
        </div>

        {/* PAT Swap */}
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => setShowPatForm(!showPatForm)} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: showPatForm ? 1 : 0.35, transition: "opacity 0.15s", background: "none", border: "none", padding: 0, width: "100%", textAlign: "left", marginBottom: 9 }}
            onMouseEnter={e => { if (!showPatForm) e.currentTarget.style.opacity = 0.7; }}
            onMouseLeave={e => { if (!showPatForm) e.currentTarget.style.opacity = 0.35; }}>
            <span style={{ fontSize: 11, color: T.dim }}>🔑 Update PAT</span>
          </button>
          {showPatForm && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input value={newPat} onChange={e => setNewPat(e.target.value)} placeholder="New PAT..."
                style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: `1px solid ${patError ? T.red + "55" : "rgba(255,255,255,0.12)"}`, borderRadius: 4, outline: "none", color: T.text, padding: "6px 10px", fontSize: 11, fontFamily: "'JetBrains Mono'" }}
                onKeyDown={e => e.key === "Enter" && handleUpdatePat()} />
              {patUpdating ? <Spinner size={13} /> :
                <button onClick={handleUpdatePat} disabled={!newPat.trim()} style={{ padding: "0 10px", background: `${T.amber}18`, border: `1px solid ${T.amber}44`, borderRadius: 4, color: T.amber, fontSize: 11, cursor: "pointer" }}>Apply</button>
              }
            </div>
          )}
          {patError && <div style={{ fontSize: 9, color: T.red, fontFamily: "'JetBrains Mono'", marginBottom: 6 }}>{patError}</div>}
        </div>

        <div onClick={onDisconnect} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.35, transition: "opacity 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.opacity = 0.7} onMouseLeave={e => e.currentTarget.style.opacity = 0.35}>
          <span style={{ fontSize: 11, color: T.dim }}>⏻ Disconnect</span>
        </div>
      </div>
    </div>
  );
}
