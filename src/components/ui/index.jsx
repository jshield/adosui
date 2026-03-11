import { T } from "../lib/theme";

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
