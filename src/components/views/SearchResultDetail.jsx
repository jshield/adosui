import { T } from "../../lib/theme";
import { Field, AdoLink } from "../ui";
import { isInCollection, timeAgo, branchName, workItemUrl } from "../../lib";

export function SearchResultDetail({ result, collection, org, onWorkItemToggle, onResourceToggle }) {
  if (!result) return null;
  const { type, item } = result;

  const getInCollection = () => {
    if (!collection) return false;
    if (type === "workitem") return isInCollection(collection, "workitem", item.id);
    if (type === "repo")     return isInCollection(collection, "repo", item.id);
    if (type === "pipeline") return isInCollection(collection, "pipeline", item.id);
    if (type === "pr")       return isInCollection(collection, "pr", item.pullRequestId);
    return false;
  };
  const added = getInCollection();

  const handleToggle = () => {
    if (!collection) return;
    if (type === "workitem") onWorkItemToggle(collection.id, item.id);
    else if (type === "repo")      onResourceToggle("repo",     item.id,              collection.id);
    else if (type === "pipeline")  onResourceToggle("pipeline", item.id,              collection.id);
    else if (type === "pr")        onResourceToggle("pr",       item.pullRequestId,   collection.id);
  };

  const containerStyle = { flex: 1, overflowY: "auto", padding: 24 };

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
    const adoUrl  = workItemUrl(org, item.id);
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: tc, background: `${tc}22`, borderRadius: 4, padding: "2px 8px", fontFamily: "'JetBrains Mono'" }}>{wiType}</span>
          <span style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>#{item.id}</span>
          <span style={{ fontSize: 11, color: T.text, background: "rgba(255,255,255,0.08)", borderRadius: 4, padding: "1px 7px", fontFamily: "'Barlow Condensed'" }}>{wiState}</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: T.text, marginBottom: 14, lineHeight: 1.35 }}>{wiTitle}</div>
        <ToggleSection />
        {adoUrl && <AdoLink href={adoUrl} />}
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
    const defaultBranch = branchName(item.defaultBranch) || "";
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
    const source   = branchName(item.sourceRefName) || "";
    const target   = branchName(item.targetRefName) || "";
    const created  = timeAgo(item.creationDate);
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
