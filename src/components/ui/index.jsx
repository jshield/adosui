import { T } from "../../lib/theme";

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

export const Btn = ({ children, onClick, variant = "ghost", disabled }) => {
  const s = {
    primary: { background: `${T.amber}18`, border: `1px solid ${T.amber}44`, color: T.amber },
    ghost:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: T.muted },
  }[variant];
  return <button disabled={disabled} onClick={onClick} style={{ ...s, padding: "7px 16px", borderRadius: 5, cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "'Barlow'", fontWeight: 500, opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>{children}</button>;
};

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
