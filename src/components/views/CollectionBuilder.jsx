import { useState, useEffect } from "react";
import { T } from "../../lib/theme";
import { Btn, formLabelStyle, Input, Spinner } from "../ui";

export function CollectionBuilder({ onDone, client }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState(T.amber);
  const [projects, setProjects] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [showProjects, setShowProjects] = useState(false);

  const ICONS   = ["📦","💳","🔐","📊","🚀","🔧","⚡","🎯","🌐","🔬","🛡️","🎨"];
  const COLORS  = [T.amber, T.cyan, T.violet, T.red, T.green, "#F472B6", "#FB923C", "#34D399"];

  useEffect(() => {
    if (!client) return;
    setLoadingProjects(true);
    client.getProjects()
      .then(ps => setProjects(ps.map(p => p.name).sort()))
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, [client]);

  const toggleProject = (projName) => {
    setSelectedProjects(prev =>
      prev.includes(projName)
        ? prev.filter(p => p !== projName)
        : [...prev, projName]
    );
  };

  return (
    <div style={{ padding: "26px 26px", height: "100%", overflowY: "auto", display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.text }}>New Collection</div>
        <div style={{ fontSize: 12, color: T.muted, fontFamily: "'JetBrains Mono'", marginTop: 3 }}>Create a work-centric workspace</div>
      </div>

      <div>
        <label style={formLabelStyle}>Name</label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My Tasks" />
      </div>

      <div style={{ display: "flex", gap: 20 }}>
        <div style={{ flex: 1 }}>
          <label style={formLabelStyle}>Icon</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {ICONS.map(ic => <span key={ic} onClick={() => setIcon(ic)} style={{ fontSize: 18, cursor: "pointer", padding: 5, borderRadius: 5, background: icon === ic ? "rgba(255,255,255,0.08)" : "transparent", border: icon === ic ? "1px solid rgba(255,255,255,0.14)" : "1px solid transparent" }}>{ic}</span>)}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <label style={formLabelStyle}>Colour</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COLORS.map(c => <span key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", outline: color === c ? `2px solid ${c}` : "none", outlineOffset: 2 }} />)}
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <label style={{ ...formLabelStyle, marginBottom: 0 }}>Projects</label>
          <button
            onClick={() => setShowProjects(!showProjects)}
            style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 11, fontFamily: "'JetBrains Mono'", padding: 0 }}
          >
            {showProjects ? "▲ hide" : "▼ scope"}
          </button>
        </div>
        {selectedProjects.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            {selectedProjects.map(p => (
              <span key={p} onClick={() => toggleProject(p)}
                style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", background: `${T.cyan}18`, border: `1px solid ${T.cyan}44`, color: T.cyan, borderRadius: 3, padding: "2px 7px", cursor: "pointer" }}>
                {p} ×
              </span>
            ))}
          </div>
        )}
        {showProjects && (
          <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: 4 }}>
            {loadingProjects ? (
              <div style={{ padding: 12, textAlign: "center" }}><Spinner size={14} /></div>
            ) : projects.length === 0 ? (
              <div style={{ padding: 12, fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>No projects found</div>
            ) : (
              projects.map(p => {
                const sel = selectedProjects.includes(p);
                return (
                  <div key={p} onClick={() => toggleProject(p)}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 4, cursor: "pointer", background: sel ? `${T.cyan}12` : "transparent" }}>
                    <span style={{ fontSize: 11, color: sel ? T.cyan : T.dim, width: 14 }}>{sel ? "✓" : ""}</span>
                    <span style={{ fontSize: 12, color: sel ? T.text : T.muted }}>{p}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
        <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginTop: 4 }}>
          {selectedProjects.length ? `Search scoped to ${selectedProjects.length} project${selectedProjects.length > 1 ? "s" : ""}` : "All projects (unscoped)"}
        </div>
      </div>

      <Btn variant="primary" onClick={() => onDone({ id: `c-${Date.now()}`, name: name.trim(), icon, color, projects: selectedProjects })} disabled={!name.trim()}>
        Create Collection →
      </Btn>
    </div>
  );
}
