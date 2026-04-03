import { useState, useEffect, useRef } from "react";
import yaml from "js-yaml";
import { T } from "../../lib/theme";
import { YamlEditor } from "./YamlEditorView";
import { Btn, Spinner, EmptyState } from "../ui";
import { inputStyle } from "../ui/index";

// ── Action type registry ───────────────────────────────────────────────────────

const ACTION_TYPES = [
  { value: "create-task",              label: "Create Task" },
  { value: "gather-pipeline-outputs",  label: "Gather Pipeline Outputs" },
  { value: "merge-vars",               label: "Merge Variables" },
  { value: "edit-file",              label: "Edit File" },
  { value: "raise-pr",               label: "Raise PR" },
  { value: "run-pipeline",           label: "Run Pipeline" },
  { value: "request-approval",      label: "Request Approval" },
];

const PARAM_TYPES = ["string", "number", "boolean", "select", "textarea", "tags", "array"];

// ── Template List ──────────────────────────────────────────────────────────────

/**
 * TemplateList — list of workflow templates with Edit/Delete/New buttons.
 * No own header — rendered inside YamlToolsView's container.
 */
export function TemplateList({ templates = [], onEdit, onDelete, onNew, saving }) {
  return (
    <div>
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>
            {templates.length} template{templates.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button
          onClick={onNew}
          disabled={saving}
          style={{
            background: `${T.amber}18`, border: `1px solid ${T.amber}44`,
            borderRadius: 5, color: T.amber, cursor: "pointer",
            fontSize: 12, fontFamily: "'Barlow'", fontWeight: 500, padding: "6px 14px",
          }}
        >
          + New Template
        </button>
      </div>

      <div style={{ overflowY: "auto", flex: 1 }}>
        {templates.length === 0 ? (
          <EmptyState icon="⚡" message="No workflow templates yet">
            <div style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'", textAlign: "center", maxWidth: 320, lineHeight: 1.6, marginTop: 8 }}>
              Click "+ New Template" to create your first workflow template
            </div>
          </EmptyState>
        ) : (
          templates.map(template => (
            <div key={template.id} style={{
              padding: "12px 20px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              borderLeft: `3px solid ${template.color || T.dim}`,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{template.icon || "⚡"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.heading }}>{template.name}</div>
                <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>
                  {template.tracks?.length || 0} tracks · {countSteps(template)} steps · {template.params?.length || 0} params
                </div>
                {template.description && (
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {template.description}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => onEdit(template)}
                  disabled={saving}
                  style={{
                    background: `${T.amber}15`, border: `1px solid ${T.amber}33`,
                    borderRadius: 4, color: T.amber, cursor: "pointer",
                    fontSize: 11, fontFamily: "'JetBrains Mono'", padding: "3px 10px",
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(template.id)}
                  disabled={saving}
                  style={{
                    background: `${T.red}10`, border: `1px solid ${T.red}33`,
                    borderRadius: 4, color: T.red, cursor: "pointer",
                    fontSize: 11, fontFamily: "'JetBrains Mono'", padding: "3px 10px",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Template Editor ────────────────────────────────────────────────────────────

/**
 * TemplateEditor — accordion card editor for a single template.
 * No own header — rendered inside YamlToolsView's container.
 *
 * @param {object} props
 * @param {object}   props.template - Template being edited
 * @param {boolean}  props.isNew    - Whether this is a new template
 * @param {boolean}  props.saving   - True while saving
 * @param {string}   props.error    - Error message to display
 * @param {(template: object) => void} props.onSave - Called with serialized template
 * @param {() => void} props.onCancel - Return to list
 */
export function TemplateEditor({ template, isNew, saving, error: externalError, onSave, onCancel }) {
  const [tpl, setTpl] = useState(cloneTemplate(template));
  const [expanded, setExpanded] = useState({}); // path -> bool
  const [yamlText, setYamlText] = useState(() => yaml.dump(cloneTemplate(template), { lineWidth: 120, quotingType: '"' }));
  const [yamlError, setYamlError] = useState(null);
  const isYamlEditing = useRef(false);

  const toggle = (path) => setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
  const isOpen = (path) => !!expanded[path];

  const set = (path, val) => setTpl(prev => setIn(prev, path, val));

  const addItem = (path) => {
    setTpl(prev => {
      const arr = getIn(prev, path) || [];
      return setIn(prev, path, [...arr, getDefaultForPath(path)]);
    });
  };

  const removeItem = (path, index) => {
    setTpl(prev => {
      const arr = [...(getIn(prev, path) || [])];
      arr.splice(index, 1);
      return setIn(prev, path, arr);
    });
  };

  const moveItem = (path, index, delta) => {
    setTpl(prev => {
      const arr = [...(getIn(prev, path) || [])];
      const newIndex = index + delta;
      if (newIndex < 0 || newIndex >= arr.length) return prev;
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return setIn(prev, path, arr);
    });
  };

  // tpl → yamlText (serialise on every tpl change, unless user is typing in YAML)
  useEffect(() => {
    if (isYamlEditing.current) return;
    try {
      setYamlText(yaml.dump(cloneTemplate(tpl), { lineWidth: 120, quotingType: '"' }));
      setYamlError(null);
    } catch (e) {
      // Serialisation errors deferred to save time
    }
  }, [tpl]);

  const handleYamlChange = (text) => {
    setYamlText(text);
    isYamlEditing.current = true;
    try {
      const parsed = yaml.load(text);
      setTpl(parsed);
      setYamlError(null);
    } catch (e) {
      setYamlError("YAML parse error: " + e.message);
    }
    setTimeout(() => { isYamlEditing.current = false; }, 300);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Error bar */}
      {(externalError || yamlError) && (
        <div style={{ padding: "8px 20px", background: `${T.red}08`, borderBottom: `1px solid ${T.red}22`, fontSize: 12, color: T.red, flexShrink: 0 }}>
          {externalError || yamlError}
        </div>
      )}

      {/* Side-by-side body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Visual pane */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, borderRight: `1px solid ${T.border}` }}>
          <SectionCard title="Template Properties" color={tpl.color || T.amber} open={isOpen("properties")} onToggle={() => toggle("properties")}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <InlineField label="ID" value={tpl.id} onChange={v => set("id", v)} required disabled={!isNew} />
              <InlineField label="Name" value={tpl.name} onChange={v => set("name", v)} required />
              <InlineField label="Icon (emoji)" value={tpl.icon} onChange={v => set("icon", v)} style={{ width: 80 }} />
              <InlineField label="Color (hex)" value={tpl.color} onChange={v => set("color", v)} style={{ width: 100 }} />
              <InlineSelect label="WI Type" value={tpl.wiType} onChange={v => set("wiType", v)} options={["User Story", "Bug", "Epic", "Feature", "Task"]} />
            </div>
            <InlineField label="Description" value={tpl.description} onChange={v => set("description", v)} />
          </SectionCard>

          <SectionCard title="Parameters" count={tpl.params?.length || 0} color={T.cyan} open={isOpen("params")} onToggle={() => toggle("params")}>
            {(tpl.params || []).map((p, i) => (
              <ParamCard
                key={i} param={p}
                onChange={val => set(`params[${i}]`, val)}
                onMoveUp={() => moveItem("params", i, -1)}
                onMoveDown={() => moveItem("params", i, 1)}
                onDelete={() => removeItem("params", i)}
                isFirst={i === 0} isLast={i === (tpl.params?.length || 0) - 1}
              />
            ))}
            <button onClick={() => addItem("params")} style={addBtnStyle}>+ Add Parameter</button>
          </SectionCard>

          <SectionCard title="Tracks" count={tpl.tracks?.length || 0} color={T.green} open={isOpen("tracks")} onToggle={() => toggle("tracks")}>
            {(tpl.tracks || []).map((tr, i) => (
              <TrackCard
                key={i} track={tr}
                onChange={val => set(`tracks[${i}]`, val)}
                onMoveUp={() => moveItem("tracks", i, -1)}
                onMoveDown={() => moveItem("tracks", i, 1)}
                onDelete={() => removeItem("tracks", i)}
                isFirst={i === 0} isLast={i === (tpl.tracks?.length || 0) - 1}
                allTracks={tpl.tracks || []}
              />
            ))}
            <button onClick={() => addItem("tracks")} style={addBtnStyle}>+ Add Track</button>
          </SectionCard>
        </div>

        {/* YAML pane */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <YamlEditor
            value={yamlText}
            onChange={handleYamlChange}
          />
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Btn>
        <Btn
          variant="primary"
          onClick={() => onSave(tpl)}
          disabled={saving || !!yamlError}
        >
          {saving ? <Spinner size={12} /> : null}
          {saving ? "Saving…" : "Save Template"}
        </Btn>
      </div>
    </div>
  );
}

// ── Section Card ───────────────────────────────────────────────────────────────

function SectionCard({ title, count, color, open, onToggle, children }) {
  return (
    <div style={{
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      borderLeft: `3px solid ${color || T.amber}`,
      overflow: "hidden",
    }}>
      <div
        onClick={onToggle}
        style={{
          padding: "9px 14px",
          background: "rgba(255,255,255,0.02)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", width: 12 }}>
          {open ? "▾" : "▸"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.heading }}>{title}</span>
        {count != null && (
          <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>({count})</span>
        )}
      </div>
      {open && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Track Card ────────────────────────────────────────────────────────────────

function TrackCard({ track, onChange, onMoveUp, onMoveDown, onDelete, isFirst, isLast, allTracks }) {
  const [open, setOpen] = useState(false);
  const trackIds = allTracks.map(t => t.id).filter(id => id !== track.id);

  return (
    <div style={{
      border: `1px solid ${T.border}`, borderRadius: 5,
      borderLeft: `2px solid ${track.color || T.dim}`, overflow: "hidden",
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "7px 10px", background: "rgba(255,255,255,0.02)",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 6, userSelect: "none",
        }}
      >
        <ReorderButtons onUp={onMoveUp} onDown={onMoveDown} isFirst={isFirst} isLast={isLast} />
        <InlineInput value={track.id} onChange={v => onChange({ ...track, id: v })} placeholder="track-id" style={{ width: 100, fontSize: 11 }} />
        <InlineInput value={track.name} onChange={v => onChange({ ...track, name: v })} placeholder="Track Name" style={{ flex: 1, fontSize: 11 }} />
        <InlineInput value={track.color} onChange={v => onChange({ ...track, color: v })} placeholder="#hex" style={{ width: 70, fontSize: 11 }} />
        <DeleteButton onDelete={onDelete} />
      </div>
      {open && (
        <div style={{ padding: "10px 10px 10px 40px", display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>Depends on:</span>
            <MultiSelect value={track.dependsOn || []} options={trackIds} onChange={v => onChange({ ...track, dependsOn: v })} placeholder="none" />
          </div>
          {/* Steps */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: T.muted, fontFamily: "'JetBrains Mono'" }}>Steps:</span>
            </div>
            {(track.steps || []).map((s, i, arr) => (
              <StepCard
                key={i} step={s}
                onChange={val => {
                  const steps = [...(track.steps || [])];
                  steps[i] = val;
                  onChange({ ...track, steps });
                }}
                onMoveUp={() => {
                  const steps = [...(track.steps || [])];
                  [steps[i], steps[i - 1]] = [steps[i - 1], steps[i]];
                  onChange({ ...track, steps });
                }}
                onMoveDown={() => {
                  const steps = [...(track.steps || [])];
                  [steps[i], steps[i + 1]] = [steps[i + 1], steps[i]];
                  onChange({ ...track, steps });
                }}
                onDelete={() => {
                  const steps = [...(track.steps || [])];
                  steps.splice(i, 1);
                  onChange({ ...track, steps });
                }}
                isFirst={i === 0} isLast={i === arr.length - 1}
                stepIds={arr.map((s2, j) => s2.id || `step-${j}`).filter((_, j) => j !== i)}
              />
            ))}
            <button
              onClick={() => onChange({ ...track, steps: [...(track.steps || []), { id: `step-${Date.now()}`, title: "New Step", action: { type: "create-task" } }] })}
              style={addBtnStyle}
            >
              + Add Step
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step Card ─────────────────────────────────────────────────────────────────

function StepCard({ step, onChange, onMoveUp, onMoveDown, onDelete, isFirst, isLast, stepIds }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "5px 8px", background: "rgba(255,255,255,0.02)",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 6, userSelect: "none",
        }}
      >
        <ReorderButtons compact onUp={onMoveUp} onDown={onMoveDown} isFirst={isFirst} isLast={isLast} />
        <InlineInput value={step.id} onChange={v => onChange({ ...step, id: v })} placeholder="step-id" style={{ width: 90, fontSize: 10 }} />
        <InlineInput value={step.title} onChange={v => onChange({ ...step, title: v })} placeholder="Step title" style={{ flex: 1, fontSize: 10 }} />
        <span style={{ fontSize: 9, color: T.dim, fontFamily: "'JetBrains Mono'", background: `${T.cyan}15`, padding: "1px 5px", borderRadius: 2, flexShrink: 0 }}>
          {step.action?.type || "create-task"}
        </span>
        <DeleteButton compact onDelete={onDelete} />
      </div>
      {open && (
        <div style={{ padding: "8px 8px 8px 28px", display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${T.border}` }}>
          <InlineField label="Title" value={step.title} onChange={v => onChange({ ...step, title: v })} />
          <InlineField label="Description" value={step.description} onChange={v => onChange({ ...step, description: v })} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <InlineField label="Repeat ForEach" value={step.repeatForEach || ""} onChange={v => onChange({ ...step, repeatForEach: v || undefined })} placeholder="e.g. {params.environments}" style={{ flex: 1 }} />
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
              <input type="checkbox" checked={step.sequential !== false} onChange={e => onChange({ ...step, sequential: e.target.checked })} />
              <span style={{ fontSize: 10, color: T.muted }}>Sequential</span>
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", width: 70 }}>Depends on:</span>
            <MultiSelect value={step.dependsOn || []} options={stepIds} onChange={v => onChange({ ...step, dependsOn: v })} placeholder="none" />
          </div>
          <ActionConfigCard step={step} onChange={onChange} />
          {/* Gates */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: T.muted, fontFamily: "'JetBrains Mono'" }}>Gates:</span>
              <button
                onClick={() => onChange({ ...step, gates: [...(step.gates || []), { when: "true", action: { type: "create-task" } }] })}
                style={addBtnStyle}
              >
                + Add Gate
              </button>
            </div>
            {(step.gates || []).map((g, i, gates) => (
              <GateCard
                key={i} gate={g}
                onChange={val => {
                  const gates2 = [...gates];
                  gates2[i] = val;
                  onChange({ ...step, gates: gates2 });
                }}
                onMoveUp={() => {
                  const gates2 = [...gates];
                  [gates2[i], gates2[i - 1]] = [gates2[i - 1], gates2[i]];
                  onChange({ ...step, gates: gates2 });
                }}
                onMoveDown={() => {
                  const gates2 = [...gates];
                  [gates2[i], gates2[i + 1]] = [gates2[i + 1], gates2[i]];
                  onChange({ ...step, gates: gates2 });
                }}
                onDelete={() => {
                  const gates2 = [...gates];
                  gates2.splice(i, 1);
                  onChange({ ...step, gates: gates2 });
                }}
                isFirst={i === 0} isLast={i === gates.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Action Config Card ─────────────────────────────────────────────────────────

function ActionConfigCard({ step, onChange }) {
  const action = step.action || { type: "create-task" };
  const type = action.type || "create-task";

  const setType = (newType) => onChange({ ...step, action: { ...action, type: newType } });
  const setField = (key, val) => onChange({ ...step, action: { ...action, [key]: val } });

  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, padding: "8px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: T.muted, fontFamily: "'JetBrains Mono'" }}>Action:</span>
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          style={{ ...inputStyle, padding: "4px 8px", fontSize: 11, flex: 1 }}
        >
          {ACTION_TYPES.map(at => (
            <option key={at.value} value={at.value}>{at.label}</option>
          ))}
        </select>
      </div>

      {type === "create-task" && (
        <>
          <InlineField label="Title" value={action.title || ""} onChange={v => setField("title", v)} />
          <InlineField label="Description" value={action.description || ""} onChange={v => setField("description", v)} />
        </>
      )}

      {type === "gather-pipeline-outputs" && (
        <div>
          {(action.pipelines || []).map((p, i, arr) => (
            <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center" }}>
              <InlineInput value={p.name || ""} onChange={v => { const ps = [...arr]; ps[i] = { ...ps[i], name: v }; setField("pipelines", ps); }} placeholder="display name" style={{ width: 100, fontSize: 10 }} />
              <InlineInput value={p.project || ""} onChange={v => { const ps = [...arr]; ps[i] = { ...ps[i], project: v }; setField("pipelines", ps); }} placeholder="project" style={{ width: 90, fontSize: 10 }} />
              <InlineInput value={p.pipelineId || ""} onChange={v => { const ps = [...arr]; ps[i] = { ...ps[i], pipelineId: v }; setField("pipelines", ps); }} placeholder="pipeline ID" style={{ width: 80, fontSize: 10 }} />
              <InlineInput value={p.tfvarKey || ""} onChange={v => { const ps = [...arr]; ps[i] = { ...ps[i], tfvarKey: v }; setField("pipelines", ps); }} placeholder="tfvar key" style={{ width: 80, fontSize: 10 }} />
              <DeleteButton compact onDelete={() => { const ps = arr.filter((_, j) => j !== i); setField("pipelines", ps); }} />
            </div>
          ))}
          <button onClick={() => setField("pipelines", [...arr, { name: "", project: "", pipelineId: "", tfvarKey: "" }])} style={addBtnStyle}>+ Add Pipeline</button>
        </div>
      )}

      {(type === "merge-vars" || type === "edit-file") && (
        <>
          <InlineField label="Repo" value={action.repo || ""} onChange={v => setField("repo", v)} />
          <InlineField label="File Path" value={action.filePath || ""} onChange={v => setField("filePath", v)} />
          <InlineField label="Branch" value={action.branch || ""} onChange={v => setField("branch", v)} />
          <InlineField label="Commit Message" value={action.commitMessage || ""} onChange={v => setField("commitMessage", v)} />
          {type === "edit-file" && (
            <InlineField label="Content" value={action.content || ""} onChange={v => setField("content", v)} />
          )}
          {type === "merge-vars" && (
            <InlineField label="Vars" value={action.vars || ""} onChange={v => setField("vars", v)} placeholder="{step.gather.outputs}" />
          )}
        </>
      )}

      {type === "raise-pr" && (
        <>
          <InlineField label="Repo" value={action.repo || ""} onChange={v => setField("repo", v)} />
          <InlineField label="Source Branch" value={action.sourceBranch || ""} onChange={v => setField("sourceBranch", v)} />
          <InlineField label="Target Branch" value={action.targetBranch || ""} onChange={v => setField("targetBranch", v)} />
          <InlineField label="Title Template" value={action.titleTemplate || ""} onChange={v => setField("titleTemplate", v)} />
          <InlineField label="Description Template" value={action.descriptionTemplate || ""} onChange={v => setField("descriptionTemplate", v)} />
        </>
      )}

      {type === "run-pipeline" && (
        <>
          <InlineField label="Pipeline" value={action.pipeline || ""} onChange={v => setField("pipeline", v)} />
          <InlineField label="Project" value={action.project || ""} onChange={v => setField("project", v)} />
          <div>
            <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 4 }}>Params (JSON):</div>
            <textarea
              value={JSON.stringify(action.params || {}, null, 2)}
              onChange={e => { try { setField("params", JSON.parse(e.target.value)); } catch {} }}
              style={{ ...inputStyle, width: "100%", minHeight: 60, fontSize: 10, fontFamily: "'JetBrains Mono'", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>
        </>
      )}

      {type === "request-approval" && (
        <>
          <InlineField label="Environment" value={action.environment || ""} onChange={v => setField("environment", v)} />
          <InlineField label="Description" value={action.description || ""} onChange={v => setField("description", v)} />
          <InlineField label="Step Ref" value={action.pipelineRunRef?.step || ""} onChange={v => setField("pipelineRunRef", { ...action.pipelineRunRef, step: v })} />
        </>
      )}
    </div>
  );
}

// ── Gate Card ────────────────────────────────────────────────────────────────

function GateCard({ gate, onChange, onMoveUp, onMoveDown, onDelete, isFirst, isLast }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
      <div style={{ padding: "4px 8px", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", gap: 6 }}>
        <ReorderButtons compact onUp={onMoveUp} onDown={onMoveDown} isFirst={isFirst} isLast={isLast} />
        <InlineInput value={gate.when || "true"} onChange={v => onChange({ ...gate, when: v })} placeholder="when condition" style={{ flex: 1, fontSize: 10 }} />
        <DeleteButton compact onDelete={onDelete} />
      </div>
    </div>
  );
}

// ── Param Card ────────────────────────────────────────────────────────────────

function ParamCard({ param, onChange, onMoveUp, onMoveDown, onDelete, isFirst, isLast }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflow: "hidden" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "5px 8px", background: "rgba(255,255,255,0.02)",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 6, userSelect: "none",
        }}
      >
        <ReorderButtons compact onUp={onMoveUp} onDown={onMoveDown} isFirst={isFirst} isLast={isLast} />
        <InlineInput value={param.key} onChange={v => onChange({ ...param, key: v })} placeholder="param-key" style={{ width: 110, fontSize: 10 }} />
        <span style={{ fontSize: 9, color: T.cyan, fontFamily: "'JetBrains Mono'", background: `${T.cyan}10`, padding: "1px 5px", borderRadius: 2 }}>
          {param.type || "string"}
        </span>
        {param.required && <span style={{ fontSize: 9, color: T.amber, fontFamily: "'JetBrains Mono'" }}>required</span>}
        <DeleteButton compact onDelete={onDelete} />
      </div>
      {open && (
        <div style={{ padding: "8px 8px 8px 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, borderTop: `1px solid ${T.border}` }}>
          <InlineField label="Label" value={param.label} onChange={v => onChange({ ...param, label: v })} />
          <InlineSelect label="Type" value={param.type || "string"} onChange={v => onChange({ ...param, type: v })} options={PARAM_TYPES} />
          <InlineField label="Default" value={param.default || ""} onChange={v => onChange({ ...param, default: v })} />
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
            <input type="checkbox" checked={!!param.required} onChange={e => onChange({ ...param, required: e.target.checked })} />
            <span style={{ fontSize: 10, color: T.muted }}>Required</span>
          </label>
          <div style={{ gridColumn: "1/-1" }}>
            <InlineField label="Description" value={param.description || ""} onChange={v => onChange({ ...param, description: v })} />
          </div>
          {param.type === "select" && (
            <div style={{ gridColumn: "1/-1" }}>
              <InlineField label="Options (comma sep)" value={(param.options || []).join(", ")} onChange={v => onChange({ ...param, options: v.split(",").map(s => s.trim()).filter(Boolean) })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reusable Inline Controls ──────────────────────────────────────────────────

function InlineInput({ value, onChange, placeholder, style }) {
  return (
    <input
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ ...inputStyle, padding: "4px 8px", fontSize: 11, ...style }}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    />
  );
}

function InlineSelect({ value, onChange, options, style }) {
  return (
    <select
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      style={{ ...inputStyle, padding: "4px 8px", fontSize: 11, ...style }}
    >
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

function InlineField({ label, value, onChange, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 9, color: T.dim, fontFamily: "'JetBrains Mono'" }}>{label}</span>
      <InlineInput value={value} onChange={onChange} style={style} />
    </div>
  );
}

function MultiSelect({ value = [], options = [], onChange, placeholder }) {
  const val = Array.isArray(value) ? value : [];
  const toggle = (opt) => {
    if (val.includes(opt)) onChange(val.filter(v => v !== opt));
    else onChange([...val, opt]);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={e => { e.stopPropagation(); toggle(opt); }}
          style={{
            background: val.includes(opt) ? `${T.amber}25` : "rgba(255,255,255,0.03)",
            border: `1px solid ${val.includes(opt) ? T.amber + "55" : T.border}`,
            borderRadius: 3,
            color: val.includes(opt) ? T.amber : T.muted,
            cursor: "pointer", fontSize: 10, fontFamily: "'JetBrains Mono'", padding: "2px 7px",
          }}
        >
          {opt}
        </button>
      ))}
      {val.length === 0 && placeholder && (
        <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>{placeholder}</span>
      )}
    </div>
  );
}

function ReorderButtons({ compact, onUp, onDown, isFirst, isLast }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
      <button
        onClick={e => { e.stopPropagation(); onUp(); }}
        disabled={isFirst}
        style={{ background: "none", border: "none", color: T.dim, cursor: isFirst ? "not-allowed" : "pointer", fontSize: 8, padding: "0 2px", lineHeight: 1, opacity: isFirst ? 0.3 : 1 }}
      >
        ▲
      </button>
      <button
        onClick={e => { e.stopPropagation(); onDown(); }}
        disabled={isLast}
        style={{ background: "none", border: "none", color: T.dim, cursor: isLast ? "not-allowed" : "pointer", fontSize: 8, padding: "0 2px", lineHeight: 1, opacity: isLast ? 0.3 : 1 }}
      >
        ▼
      </button>
    </div>
  );
}

function DeleteButton({ compact, onDelete }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onDelete(); }}
      style={{
        background: "none", border: "none", color: T.dim, cursor: "pointer",
        fontSize: compact ? 10 : 12, padding: "0 2px", flexShrink: 0,
      }}
      onMouseEnter={e => e.currentTarget.style.color = T.red}
      onMouseLeave={e => e.currentTarget.style.color = T.dim}
    >
      ✕
    </button>
  );
}

const addBtnStyle = {
  background: "none",
  border: `1px dashed ${T.border}`,
  borderRadius: 4,
  color: T.muted,
  cursor: "pointer",
  fontSize: 10,
  fontFamily: "'JetBrains Mono'",
  padding: "4px 10px",
  width: "100%",
  textAlign: "left",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getIn(obj, path) {
  if (!path) return obj;
  return path.split(/[.\[\]]/).filter(Boolean).reduce((o, k) => o?.[k], obj);
}

function setIn(obj, path, val) {
  if (!path) return val;
  const parts = path.split(/[.\[\]]/).filter(Boolean);
  const result = JSON.parse(JSON.stringify(obj));
  let cur = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    cur[k] = JSON.parse(JSON.stringify(cur[k] || {}));
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = val;
  return result;
}

function countSteps(template) {
  return (template.tracks || []).reduce((acc, tr) => acc + (tr.steps?.length || 0), 0);
}

function cloneTemplate(tpl) {
  return JSON.parse(JSON.stringify(tpl));
}

function getDefaultForPath(path) {
  if (path.endsWith("params")) return { key: "newParam", label: "New Param", type: "string" };
  if (path.endsWith("tracks")) return { id: `track-${Date.now()}`, name: "New Track", color: "#6B7280", steps: [] };
  return {};
}
