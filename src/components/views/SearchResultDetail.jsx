import { T } from "../../lib/theme";

export function SearchResultDetail({ result, collection, org, onWorkItemToggle, onResourceToggle }) {
  if (!result) return null;
  const { type, item } = result;

  const inCol = () => {
    if (!collection) return false;
    if (type === "workitem") return (collection.workItemIds || []).includes(String(item.id));
    if (type === "repo")     return (collection.repoIds || []).includes(String(item.id));
    if (type === "pipeline") return (collection.pipelineIds || []).includes(String(item.id));
    if (type === "pr")       return (collection.prIds || []).includes(String(item.pullRequestId));
    return false;
  };
  const added = inCol();

  const handleToggle = () => {
    if (!collection) return;
    if (type === "workitem") onWorkItemToggle(collection.id, item.id);
    else if (type === "repo")      onResourceToggle("repo",     item.id,              collection.id);
    else if (type === "pipeline")  onResourceToggle("pipeline", item.id,              collection.id);
    else if (type === "pr")        onResourceToggle("pr",       item.pullRequestId,   collection.id);
  };

  const containerStyle = { flex: 1, overflowY: "auto", padding: 24 };

  const Field = ({ label, value }) => (
    <div style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: T.text, wordBreak: "break-all" }}>{value || <span style={{ color: T.dimmer }}>—</span>}</span>
    </div>
  );

  const ToggleSection = () => (
    <div style={{ marginBottom: 16 }}>
      {collection ? (
        <button onClick={handleToggle}
          style={{ background: added ? `${T.green}22` : "rgba(255,255,255,0.06)", border: `1px solid ${added ? T.green : "rgba(255,255,255,0.15)"}`, borderRadius: 5, color: added ? T.green : T.muted, cursor: "pointer", padding: "6px 14px", fontSize: 12, fontFamily: "'Barlow'" }}>
          {added ? `✓ In "${collection.name}"` : `+ Add to "${collection.name}"`}
        </button>
      ) : (
        <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>Select a collection to add this item</span>
      )}
    </div>
  );

  if (type === "workitem") {
    const f        = item.fields || {};
    const wiType   = f["System.WorkItemType"] || "";
    const wiState  = f["System.State"] || "";
    const wiTitle  = f["System.Title"] || "";
    const areaPath = f["System.AreaPath"] || "";
    const assignee = f["System.AssignedTo"]?.displayName || f["System.AssignedTo"] || "";
    const created  = f["System.CreatedDate"] ? new Date(f["System.CreatedDate"]).toLocaleDateString() : "";
    const tcMap    = { Bug: T.red, Epic: T.amber, Feature: T.purple, "User Story": T.blue, Task: T.cyan };
    const tc       = tcMap[wiType] || T.blue;
    const adomUrl  = org ? `https://dev.azure.com/${org}/_workitems/edit/${item.id}` : null;
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: tc, background: `${tc}22`, borderRadius: 4, padding: "2px 8px", fontFamily: "'JetBrains Mono'" }}>{wiType}</span>
          <span style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>#{item.id}</span>
          <span style={{ fontSize: 11, color: T.text, background: "rgba(255,255,255,0.08)", borderRadius: 4, padding: "1px 7px", fontFamily: "'Barlow Condensed'" }}>{wiState}</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: T.text, marginBottom: 14, lineHeight: 1.35 }}>{wiTitle}</div>
        <ToggleSection />
        {adomUrl && <a href={adomUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: T.blue, textDecoration: "none", display: "inline-block", marginBottom: 18 }}>Open in ADO ↗</a>}
        <div>
          <Field label="State"       value={wiState} />
          <Field label="Type"        value={wiType} />
          <Field label="Area Path"   value={areaPath} />
          <Field label="Assigned To" value={assignee} />
          <Field label="Created"     value={created} />
        </div>
      </div>
    );
  }

  if (type === "repo") {
    const remoteUrl    = item.remoteUrl || item.sshUrl || "";
    const defaultBranch = item.defaultBranch?.replace("refs/heads/", "") || "";
    const size         = item.size != null ? `${Math.round(item.size / 1024)} KB` : "";
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.cyan, background: `${T.cyan}22`, borderRadius: 4, padding: "2px 7px", fontFamily: "'JetBrains Mono'" }}>REPO</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: T.cyan, marginBottom: 14, lineHeight: 1.35 }}>{item.name}</div>
        <ToggleSection />
        <div>
          <Field label="Default Branch" value={defaultBranch} />
          {size      && <Field label="Size"    value={size} />}
          {remoteUrl && <Field label="URL"     value={remoteUrl} />}
          {item.project?.name && <Field label="Project" value={item.project.name} />}
        </div>
      </div>
    );
  }

  if (type === "pipeline") {
    const folder = item.folder !== "\\" ? item.folder : "";
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.amber, background: `${T.amber}22`, borderRadius: 4, padding: "2px 7px", fontFamily: "'JetBrains Mono'" }}>PIPELINE</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: T.text, marginBottom: 14, lineHeight: 1.35 }}>{item.name}</div>
        <ToggleSection />
        <div>
          {folder && <Field label="Folder"        value={folder} />}
          <Field label="Definition ID" value={String(item.id)} />
        </div>
      </div>
    );
  }

  if (type === "pr") {
    const author   = item.createdBy?.displayName || "";
    const source   = item.sourceRefName?.replace("refs/heads/", "") || "";
    const target   = item.targetRefName?.replace("refs/heads/", "") || "";
    const created  = item.creationDate ? new Date(item.creationDate).toLocaleDateString() : "";
    const reviewers = (item.reviewers || []).map(r => r.displayName || r.uniqueName).join(", ");
    const statusColor = s => ({ active: T.blue, completed: T.green, abandoned: T.red }[s] || T.muted);
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.purple, background: `${T.purple}22`, borderRadius: 4, padding: "2px 7px", fontFamily: "'JetBrains Mono'" }}>PR</span>
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", color: statusColor(item.status), background: `${statusColor(item.status)}22`, borderRadius: 4, padding: "1px 7px" }}>{item.status}</span>
          <span style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>#{item.pullRequestId}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 14, lineHeight: 1.35 }}>{item.title}</div>
        <ToggleSection />
        <div>
          <Field label="Author"        value={author} />
          <Field label="Source Branch" value={source} />
          <Field label="Target Branch" value={target} />
          <Field label="Created"       value={created} />
          {reviewers && <Field label="Reviewers" value={reviewers} />}
          {item.description && <Field label="Description" value={item.description} />}
        </div>
      </div>
    );
  }

  return null;
}
