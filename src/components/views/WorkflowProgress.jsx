import { T } from "../../lib/theme";
import { getWorkflowTemplateId } from "../../lib/workflowManager";

/**
 * WorkflowProgress — Compact progress card shown on work item cards
 * in CollectionView when the work item has a workflow tag.
 */
export function WorkflowProgress({ workItem, workflowTemplates }) {
  const templateId = getWorkflowTemplateId(workItem);
  if (!templateId) return null;

  const template = workflowTemplates?.byId?.get(templateId);
  if (!template) return <MiniTag label={`wf:${templateId}`} color={T.dim} />;

  // Count child tasks for rough progress
  const childCount = workItem._childTaskCount;
  const childCompleted = workItem._childTaskCompleted;

  if (childCount == null) {
    // No child data loaded — just show the template tag
    return <MiniTag label={template.name} color={template.color} icon={template.icon} />;
  }

  const percent = childCount > 0 ? Math.round((childCompleted / childCount) * 100) : 0;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 8px", borderRadius: 4,
      background: `${template.color}10`,
      border: `1px solid ${template.color}22`,
    }}>
      <span style={{ fontSize: 11 }}>{template.icon}</span>
      <span style={{ fontSize: 10, color: T.muted, fontFamily: "'JetBrains Mono'" }}>
        {template.name}
      </span>
      <div style={{ width: 40, height: 3, background: T.dimmer, borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          width: `${percent}%`, height: "100%",
          background: template.color, borderRadius: 2,
        }} />
      </div>
      <span style={{ fontSize: 9, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
        {percent}%
      </span>
    </div>
  );
}

function MiniTag({ label, color, icon }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 6px", borderRadius: 3,
      background: `${color}15`, border: `1px solid ${color}30`,
      fontSize: 10, color, fontFamily: "'JetBrains Mono'",
    }}>
      {icon && <span style={{ fontSize: 10 }}>{icon}</span>}
      {label}
    </div>
  );
}
