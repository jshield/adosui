import { T } from "../../lib/theme";
import { Spinner } from "../ui";

export function AppHeader({ searchQuery, onSearch, onClearSearch, searching, syncStatus, profile }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 50, background: T.panel, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 20px", zIndex: 100 }}>
      {/* Global search */}
      <div style={{ flex: 1, maxWidth: 500, position: "relative", display: "flex", alignItems: "center" }}>
        <input
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
          placeholder="🔍 Search all resources..."
          style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, outline: "none", color: T.text, padding: "8px 14px", fontSize: 13, fontFamily: "'Barlow'", boxSizing: "border-box" }}
        />
        {searchQuery && (
          <button onClick={onClearSearch} style={{ position: "absolute", right: 8, background: "none", border: "none", color: T.dim, cursor: "pointer", padding: "0 4px", fontSize: 16, lineHeight: 1 }}>×</button>
        )}
      </div>

      {/* Status indicators */}
      {searching && <span style={{ marginLeft: 12, fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>searching…</span>}
      {syncStatus === "saving" && <span style={{ marginLeft: 12, fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>↑ saving…</span>}
      {syncStatus === "saved"  && <span style={{ marginLeft: 12, fontSize: 10, color: T.green, fontFamily: "'JetBrains Mono'" }}>✓ saved</span>}
      {syncStatus === "error"  && <span style={{ marginLeft: 12, fontSize: 10, color: T.red, fontFamily: "'JetBrains Mono'" }}>⚠ sync failed</span>}

      {/* User avatar */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {profile && (
          <>
            <span style={{ fontSize: 12, color: T.muted, fontFamily: "'Barlow'" }}>{profile.displayName}</span>
            <div
              style={{ width: 28, height: 28, borderRadius: "50%", background: T.amber, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 13, color: "#000", flexShrink: 0 }}
              title={`${profile.displayName} · ${profile.emailAddress}`}
            >
              {(profile.displayName || "?")[0].toUpperCase()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
