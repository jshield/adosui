import { T } from "../../lib/theme";
import { isInCollection } from "../../lib";

/* ── Pill label ────────────────────────────────────────────────── */
export const Pill = ({ label, color }) => (
  <span style={{ 
    background: `${color}22`, 
    color, 
    border: `1px solid ${color}44`, 
    borderRadius: 3, 
    padding: "1px 7px", 
    fontSize: 10, 
    fontFamily: "'JetBrains Mono'", 
    letterSpacing: "0.05em", 
    textTransform: "uppercase", 
    whiteSpace: "nowrap" 
  }}>
    {label}
  </span>
);

/* ── Status dot ───────────────────────────────────────────────── */
export const Dot = ({ color, pulse }) => (
  <span style={{ 
    width: 7, 
    height: 7, 
    borderRadius: "50%", 
    background: color, 
    flexShrink: 0, 
    display: "inline-block",
    ...(pulse ? { boxShadow: `0 0 6px ${color}` } : {}) 
  }} />
);

/* ── Card with accent border ─────────────────────────────────── */
export const Card = ({ children, accent }) => (
  <div style={{ 
    background: "rgba(255,255,255,0.025)", 
    border: "1px solid rgba(255,255,255,0.06)", 
    borderLeft: `3px solid ${accent || T.dim}`, 
    borderRadius: 6, 
    padding: "10px 14px" 
  }}>
    {children}
  </div>
);

/* ── Section container ──────────────────────────────────────────── */
export const Section = ({ title, icon, count, children }) => (
  <div style={{ marginBottom: 16 }}>
    {(title || icon) && (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        {title && <span style={{ fontSize: 12, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</span>}
        {typeof count === "number" && <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>({count})</span>}
      </div>
    )}
    {children}
  </div>
);

/* ── Loading spinner ──────────────────────────────────────────── */
export const Spinner = ({ size = 16 }) => (
  <span style={{ 
    display: "inline-block", 
    width: size, 
    height: size, 
    border: `2px solid ${T.dim}`, 
    borderTopColor: T.amber, 
    borderRadius: "50%", 
    animation: "spin 0.7s linear infinite" 
  }} />
);

/* ── Button variants ───────────────────────────────────────────── */
export const Btn = ({ children, onClick, variant = "ghost", disabled }) => {
  const s = {
    primary: { background: `${T.amber}18`, border: `1px solid ${T.amber}44`, color: T.amber },
    ghost:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: T.muted },
  }[variant];
  return <button disabled={disabled} onClick={onClick} style={{ ...s, padding: "7px 16px", borderRadius: 5, cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "'Barlow'", fontWeight: 500, opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>{children}</button>;
};

/* ── Proxy banner ─────────────────────────────────────────────── */
export function ProxyBanner({ status }) {
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

/* ── Selectable row with hover + borderLeft highlight ─────────── */
export const SelectableRow = ({ sel, selColor = T.amber, onClick, children, style }) => (
  <div
    onClick={onClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "9px 14px",
      cursor: "pointer",
      borderBottom: `1px solid ${T.border}`,
      borderLeft: `3px solid ${sel ? selColor : "transparent"}`,
      background: sel ? `${selColor}08` : "transparent",
      transition: "background 0.1s",
      ...style,
    }}
    onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
    onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
  >
    {children}
  </div>
);

/* ── Field detail row (label / value) ─────────────────────────── */
export const Field = ({ label, value, valueColor }) => (
  <div style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
    <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", minWidth: 110, flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: 12, color: valueColor || T.text, wordBreak: "break-all" }}>{value || <span style={{ color: T.dimmer }}>—</span>}</span>
  </div>
);

/* ── Section label (uppercase monospace header) ──────────────── */
export const SectionLabel = ({ children, count }) => (
  <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 14px 6px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span>{children}</span>
    {typeof count === "number" && <span style={{ color: T.dimmer }}>{count}</span>}
  </div>
);

/* ── Input field styles ───────────────────────────────────────── */
export const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 5,
  outline: "none",
  color: T.text,
  fontFamily: "'Barlow'",
};

export const inputStyleElevated = {
  ...inputStyle,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
};

export const Input = ({ value, onChange, placeholder, style, elevated, ...props }) => (
  <input
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    style={{ ...(elevated ? inputStyleElevated : inputStyle), padding: "8px 12px", fontSize: 12, boxSizing: "border-box", width: "100%", ...style }}
    {...props}
  />
);

/* ── Empty state placeholder ──────────────────────────────────── */
export const EmptyState = ({ icon, message, children }) => (
  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: T.dim }}>
    {icon && <span style={{ fontSize: 28 }}>{icon}</span>}
    {message && <span style={{ fontSize: 13, fontFamily: "'Barlow Condensed'", letterSpacing: "0.05em" }}>{message}</span>}
    {children}
  </div>
);

/* ── User avatar (amber circle with initial) ──────────────────── */
export const UserAvatar = ({ profile, size = 28 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: T.amber,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Barlow Condensed'",
      fontWeight: 700,
      fontSize: Math.floor(size * 0.46),
      color: "#000",
      flexShrink: 0,
    }}
    title={profile ? `${profile.displayName} · ${profile.emailAddress}` : undefined}
  >
    {(profile?.displayName || "?")[0].toUpperCase()}
  </div>
);

/* ── Unified collection toggle button ─────────────────────────── */
export function ResourceToggle({ type, item, collection, onResourceToggle, onWorkItemToggle, size = "compact" }) {
  const id = type === "pr" ? item.pullRequestId : type === "workitem" ? item.id : item.id;
  const added = collection && isInCollection(collection, type, id);
  const color = collection?.color || T.amber;

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!collection) return;
    if (type === "workitem") {
      onWorkItemToggle(collection.id, id);
    } else {
      onResourceToggle(type, id, collection.id, type === "wiki" ? item : undefined);
    }
  };

  if (size === "full") {
    return (
      <button onClick={handleToggle}
        style={{
          background: added ? `${color}18` : "rgba(255,255,255,0.04)",
          border: `1px solid ${added ? color + "44" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 5, cursor: "pointer", color: added ? color : T.muted,
          fontSize: 12, fontFamily: "'Barlow'", padding: "6px 14px",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
        {added ? `✓ In "${collection.name}"` : `+ Add to "${collection.name}"`}
      </button>
    );
  }

  return (
    <button onClick={handleToggle}
      style={{
        background: added ? `${color}18` : "rgba(255,255,255,0.04)",
        border: `1px solid ${added ? color + "44" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 4, cursor: "pointer", color: added ? color : T.muted,
        fontSize: 12, fontFamily: "'JetBrains Mono'", padding: "2px 8px",
        display: "inline-flex", alignItems: "center", gap: 4,
        flexShrink: 0,
      }}>
      {added ? "✓" : "+"}
    </button>
  );
}

/* ── Open in ADO link ────────────────────────────────────────── */
export const AdoLink = ({ href, children = "Open in ADO ↗" }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    style={{
      background: `${T.amber}12`,
      border: `1px solid ${T.amber}33`,
      color: T.amber,
      padding: "6px 13px",
      borderRadius: 4,
      fontSize: 12,
      fontFamily: "'Barlow'",
      fontWeight: 500,
      textDecoration: "none",
      whiteSpace: "nowrap",
      display: "inline-block",
    }}
  >
    {children}
  </a>
);

/* ── Popover / dropdown container style ──────────────────────── */
export const popoverStyle = {
  position: "absolute",
  background: T.panel,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  zIndex: 100,
};

/* ── Comment thread ───────────────────────────────────────────── */
export { CommentThread } from "./CommentThread";

/* ── Form label style ─────────────────────────────────────────── */
export const formLabelStyle = {
  fontSize: 11,
  color: T.muted,
  fontFamily: "'JetBrains Mono'",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 7,
};
