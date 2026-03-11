import { useState } from "react";
import { T } from "../../lib/theme";

export const ALL_TYPES = ["Epic", "Feature", "User Story", "Bug", "Task"];
export const ALL_STATES = ["New", "Active", "In Progress", "In Review", "Resolved", "Done", "Closed"];

const WI_TYPE_COLOR = { Epic: T.amber, Feature: T.cyan, "User Story": T.violet, Bug: T.red, Task: "#94A3B8" };
const stateColor = s => {
  const l = (s || "").toLowerCase();
  if (l.includes("active") || l.includes("progress") || l.includes("doing")) return T.cyan;
  if (l.includes("done") || l.includes("closed") || l.includes("resolved") || l.includes("complete")) return T.green;
  if (l.includes("block")) return T.red;
  return T.muted;
};

export function FilterPanel({ filters, onChange, onClose }) {
  const [local, setLocal] = useState(filters || { types: [], states: [], assignee: "", areaPath: "" });
  
  const toggle = (arr, val) => {
    const next = arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
    return next;
  };
  
  const apply = () => {
    onChange(local);
    onClose();
  };
  
  const clear = () => {
    setLocal({ types: [], states: [], assignee: "", areaPath: "" });
  };
  
  return (
    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6, padding: 14, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", marginTop: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'", letterSpacing: "0.08em", textTransform: "uppercase" }}>Filters</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 14 }}>×</button>
      </div>
      
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {ALL_TYPES.map(t => (
            <span key={t} onClick={() => setLocal(l => ({ ...l, types: toggle(l.types, t) }))}
              style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer", background: local.types.includes(t) ? `${WI_TYPE_COLOR[t]}22` : "rgba(255,255,255,0.04)", color: local.types.includes(t) ? WI_TYPE_COLOR[t] : T.muted, border: `1px solid ${local.types.includes(t) ? WI_TYPE_COLOR[t] + "44" : "transparent"}`, fontFamily: "'JetBrains Mono'" }}>
              {t}
            </span>
          ))}
        </div>
      </div>
      
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>State</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {ALL_STATES.map(s => (
            <span key={s} onClick={() => setLocal(l => ({ ...l, states: toggle(l.states, s) }))}
              style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer", background: local.states.includes(s) ? `${stateColor(s)}22` : "rgba(255,255,255,0.04)", color: local.states.includes(s) ? stateColor(s) : T.muted, border: `1px solid ${local.states.includes(s) ? stateColor(s) + "44" : "transparent"}`, fontFamily: "'JetBrains Mono'" }}>
              {s}
            </span>
          ))}
        </div>
      </div>
      
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Assignee</div>
          <input value={local.assignee} onChange={e => setLocal(l => ({ ...l, assignee: e.target.value }))} placeholder="e.g. John"
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "6px 8px", fontSize: 11, color: T.text, fontFamily: "'JetBrains Mono'", outline: "none" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Area Path</div>
          <input value={local.areaPath} onChange={e => setLocal(l => ({ ...l, areaPath: e.target.value }))} placeholder="e.g. MyProject"
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "6px 8px", fontSize: 11, color: T.text, fontFamily: "'JetBrains Mono'", outline: "none" }} />
        </div>
      </div>
      
      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="ghost" onClick={clear}>Clear</Btn>
        <Btn variant="primary" onClick={apply}>Apply</Btn>
      </div>
    </div>
  );
}

const Btn = ({ children, onClick, variant = "ghost", disabled }) => {
  const s = {
    primary: { background: `${T.amber}18`, border: `1px solid ${T.amber}44`, color: T.amber },
    ghost:   { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: T.muted },
  }[variant];
  return <button disabled={disabled} onClick={onClick} style={{ ...s, padding: "7px 16px", borderRadius: 5, cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "'Barlow'", fontWeight: 500, opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}>{children}</button>;
};
