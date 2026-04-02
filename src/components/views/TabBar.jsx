import { T } from "../../lib/theme";

/**
 * Horizontal tab bar for open resource detail tabs.
 * Each tab shows a short label and a close button.
 * Clicking a tab makes it active; clicking × closes it.
 */
export function TabBar({ openTabs, activeTabId, onSelect, onClose }) {
  if (!openTabs?.length) return null;

  return (
    <div style={{
      display: "flex", gap: 0, flexShrink: 0,
      borderBottom: `1px solid ${T.border}`,
      background: T.panel,
      overflowX: "auto",
    }}>
      {openTabs.map(tab => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap",
              fontSize: 12, fontFamily: "'Barlow'",
              borderBottom: `2px solid ${active ? T.amber : "transparent"}`,
              color: active ? T.text : T.dim,
              background: active ? "rgba(255,255,255,0.03)" : "transparent",
              maxWidth: 220,
            }}
          >
            <span style={{
              overflow: "hidden", textOverflow: "ellipsis",
              flex: 1, minWidth: 0,
            }}>
              {tab.label}
            </span>
            <button
              onClick={e => { e.stopPropagation(); onClose(tab.id); }}
              style={{
                background: "none", border: "none",
                color: active ? T.muted : T.dim, cursor: "pointer",
                fontSize: 14, padding: "0 2px", lineHeight: 1, flexShrink: 0,
              }}
              title="Close tab"
            >×</button>
          </div>
        );
      })}
    </div>
  );
}
