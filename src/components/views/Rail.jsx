import { T } from "../../lib/theme";
import { Dot } from "../ui";

export function Rail({ profile, org, collections, activeCol, activeView, onSelectCollection, onNewCollection, onClearCache, onDisconnect, onShowPipelines }) {
  return (
    <div style={{ width: 215, background: T.panel, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* Header */}
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

      {/* Collections list */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 10 }}>
        <div style={{ padding: "0 14px 8px", fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", letterSpacing: "0.1em", textTransform: "uppercase" }}>Collections</div>
        {collections.map(c => (
          <div key={c.id} onClick={() => onSelectCollection(c.id)}
            style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", cursor: "pointer", background: activeCol === c.id && activeView !== "pipelines" ? `${c.color}10` : "transparent", borderLeft: `2px solid ${activeCol === c.id && activeView !== "pipelines" ? c.color : "transparent"}`, transition: "all 0.12s" }}
            onMouseEnter={e => { if (activeCol !== c.id) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
            onMouseLeave={e => { if (activeCol !== c.id) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ fontSize: 15 }}>{c.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: activeCol === c.id && activeView !== "pipelines" ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
            </div>
            <Dot color={c.color} />
            <button
              onClick={e => { e.stopPropagation(); onSelectCollection(null, c.id); }}
              style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", padding: "2px 5px", fontSize: 12, opacity: 0.4, lineHeight: 1 }}
              title="Delete collection"
            >×</button>
          </div>
        ))}
        {!collections.length && (
          <div style={{ padding: "14px", fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", lineHeight: 1.6 }}>No collections.<br />Create one to begin.</div>
        )}
      </div>

      {/* Footer actions */}
      <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}` }}>
        <div onClick={onNewCollection} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.6, transition: "opacity 0.15s", marginBottom: 9 }}
          onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>
          <span style={{ color: T.amber, fontSize: 13 }}>＋</span>
          <span style={{ fontSize: 12, color: T.muted }}>New Collection</span>
        </div>
        <div onClick={onClearCache} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.35, transition: "opacity 0.15s", marginBottom: 9 }}
          onMouseEnter={e => e.currentTarget.style.opacity = 0.7} onMouseLeave={e => e.currentTarget.style.opacity = 0.35}>
          <span style={{ fontSize: 11, color: T.dim }}>↻ Clear Cache</span>
        </div>
        <div onClick={onDisconnect} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", opacity: 0.35, transition: "opacity 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.opacity = 0.7} onMouseLeave={e => e.currentTarget.style.opacity = 0.35}>
          <span style={{ fontSize: 11, color: T.dim }}>⏻ Disconnect</span>
        </div>
      </div>
    </div>
  );
}
