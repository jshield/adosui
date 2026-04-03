import { useState, useCallback } from "react";
import { T } from "../../lib/theme";
import { Pill, Btn, Spinner } from "../ui";
import { SchemaForm } from "../ui/SchemaForm";
import { createWorkflowInstance, tagWorkItemWithTemplate, interpolate } from "../../lib/workflowManager";

/**
 * WorkflowTemplateSelector — Modal for selecting a workflow template
 * and filling its parameters, then creating or associating a workflow
 * instance with a work item.
 *
 * Modes:
 *   "create"  — create a new work item from the template
 *   "associate" — attach workflow to an existing work item
 */
export function WorkflowTemplateSelector({
  client,
  profile,
  project,
  workflowTemplates,
  workItem,           // null for "create" mode, existing WI for "associate"
  onComplete,
  onCancel,
  showToast,
}) {
  const [selected, setSelected] = useState(null);
  const [params, setParams] = useState({});
  const [phase, setPhase] = useState("select"); // select | params | creating
  const [error, setError] = useState(null);

  const templates = workflowTemplates?.templates || [];

  const handleSelect = useCallback((template) => {
    setSelected(template);
    if (template.params?.length > 0) {
      setPhase("params");
      // Build default param values
      const defaults = {};
      for (const p of template.params) {
        if (p.default !== undefined) defaults[p.key] = p.default;
      }
      setParams(defaults);
    } else {
      setPhase("params");
      setParams({});
    }
  }, []);

  const handleParamsSubmit = useCallback(async (values) => {
    if (!selected || !client) return;
    setPhase("creating");
    setError(null);

    try {
      let wi = workItem;

      // If no existing work item, create one
      if (!wi) {
        const title = interpolate(
          selected.name + ": {params.releaseVersion}",
          values, {}, {}, null
        ).replace(/\{[^}]+\}/g, "").replace(/:\s*$/, "") || selected.name;

        wi = await client.createChildWorkItem(
          project,
          null, // no parent
          selected.wiType || "User Story",
          title,
          selected.description || "",
          {}
        );
        // Since createChildWorkItem requires a parent, use createWorkItem pattern instead
        // Fall back to creating a bare WI via the same PATCH API without parent relation
        const ops = [
          { op: "add", path: "/fields/System.Title", value: title },
          { op: "add", path: "/fields/System.Description", value: selected.description || "" },
        ];
        wi = await client._fetch(
          `${client.base}/${encodeURIComponent(project)}/_apis/wit/workitems/$${encodeURIComponent(selected.wiType || "User Story")}?api-version=7.1`,
          { method: "PATCH", contentType: "application/json-patch+json", body: JSON.stringify(ops) }
        );
      }

      // Create all child tasks and tag
      const taskMap = await createWorkflowInstance(client, selected, values, project, wi);

      showToast(`Workflow "${selected.name}" created with ${Object.keys(taskMap).length} steps`, T.green);
      onComplete(wi, selected, values);
    } catch (e) {
      setError(e.message || "Failed to create workflow");
      setPhase("params");
    }
  }, [selected, client, project, workItem, showToast, onComplete]);

  // ── Render: select template ─────────────────────────────────────────────

  if (phase === "select") {
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9000,
        display: "flex", alignItems: "center", justifyContent: "center",
      }} onClick={onCancel}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8,
            padding: 24, minWidth: 400, maxWidth: 560, maxHeight: "80vh", overflowY: "auto",
          }}
        >
          <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: T.heading, marginBottom: 4 }}>
            Apply Workflow
          </div>
          <div style={{ fontSize: 12, color: T.dim, marginBottom: 16 }}>
            Select a workflow template{workItem ? " to associate" : " to create"}
          </div>

          {templates.length === 0 ? (
            <div style={{ fontSize: 12, color: T.dim, padding: 20, textAlign: "center" }}>
              No workflow templates found. Add templates to collections/workflow-templates.yaml in your config repo.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {templates.map(t => (
                <div
                  key={t.id}
                  onClick={() => handleSelect(t)}
                  style={{
                    padding: "12px 16px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`,
                    borderLeft: `3px solid ${t.color}`,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{t.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.heading }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: T.dim, marginTop: 2 }}>{t.description}</div>
                    </div>
                    <Pill label={t.wiType} color={t.color} />
                  </div>
                  {t.tracks?.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                      {t.tracks.map(tr => (
                        <Pill key={tr.id} label={`${tr.name} (${tr.steps?.length || 0})`} color={tr.color} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <Btn onClick={onCancel}>Cancel</Btn>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: fill parameters ─────────────────────────────────────────────

  if (phase === "params" || phase === "creating") {
    const fields = (selected?.params || []).map(p => ({
      key:         p.key,
      label:       p.label,
      type:        p.type || "string",
      required:    p.required,
      default:     p.default,
      description: p.description,
      options:     p.options,
      itemFields:  p.itemFields,
    }));

    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9000,
        display: "flex", alignItems: "center", justifyContent: "center",
      }} onClick={phase === "creating" ? undefined : onCancel}>
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8,
            padding: 24, minWidth: 400, maxWidth: 560, maxHeight: "80vh", overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 22 }}>{selected?.icon}</span>
            <div>
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 18, color: T.heading }}>
                {selected?.name}
              </div>
              <div style={{ fontSize: 11, color: T.dim }}>{selected?.description}</div>
            </div>
          </div>

          {phase === "creating" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 20, justifyContent: "center" }}>
              <Spinner size={18} />
              <span style={{ fontSize: 13, color: T.muted }}>Creating workflow instance…</span>
            </div>
          ) : fields.length > 0 ? (
            <>
              {error && (
                <div style={{ padding: "8px 12px", background: `${T.red}15`, borderRadius: 6, marginBottom: 12, fontSize: 12, color: T.red }}>
                  {error}
                </div>
              )}
              <SchemaForm
                fields={fields}
                onSubmit={handleParamsSubmit}
                onCancel={onCancel}
                submitLabel="Create Workflow"
                disabled={phase === "creating"}
              />
            </>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>
                No parameters required. Click create to start the workflow.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="primary" onClick={() => handleParamsSubmit({})}>Create Workflow</Btn>
                <Btn onClick={onCancel}>Cancel</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
