import { useState } from "react";
import { T } from "../../lib/theme";
import { Btn, formLabelStyle, Input, ProjectScopeSelector } from "../ui";

export function CollectionBuilder({ onDone, client }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState(T.amber);
  const [selectedProjects, setSelectedProjects] = useState([]);

  const ICONS   = ["📦","💳","🔐","📊","🚀","🔧","⚡","🎯","🌐","🔬","🛡️","🎨"];
  const COLORS  = [T.amber, T.cyan, T.violet, T.red, T.green, "#F472B6", "#FB923C", "#34D399"];

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

      <ProjectScopeSelector
        client={client}
        selectedProjects={selectedProjects}
        onChange={setSelectedProjects}
        toggleLabel="scope"
      />

      <Btn variant="primary" onClick={() => onDone({ id: `c-${Date.now()}`, name: name.trim(), icon, color, projects: selectedProjects })} disabled={!name.trim()}>
        Create Collection →
      </Btn>
    </div>
  );
}
