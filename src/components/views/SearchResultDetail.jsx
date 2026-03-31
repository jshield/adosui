import { useState, useEffect } from "react";
import { marked } from "marked";
import { T } from "../../lib/theme";
import { Field, AdoLink, Spinner, ResourceToggle } from "../ui";
import { timeAgo, branchName, workItemUrl, serviceConnectionUrl, wikiPageUrl } from "../../lib";

export function SearchResultDetail({ result, collection, org, client, onWorkItemToggle, onResourceToggle }) {
  if (!result) return null;
  const { type, item } = result;

  const containerStyle = { flex: 1, overflowY: "auto", padding: 24 };

  const Toggle = () => (
    <div style={{ marginBottom: 16 }}>
      {collection
        ? <ResourceToggle type={type} item={item} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} size="full" />
        : <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>Select a collection to add this item</span>
      }
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
        <Toggle />
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
        <Toggle />
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
        <Toggle />
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
        <Toggle />
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

  if (type === "serviceconnection") {
    const project = item._projectName || item.project || "";
    const authScheme = item.authorization?.scheme || item.type || "Unknown";
    return (
      <div style={containerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.cyan, background: `${T.cyan}22`, borderRadius: 4, padding: "2px 7px", fontFamily: "'JetBrains Mono'" }}>SVC</span>
          <span style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>{item.type || "service"}</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: T.cyan, marginBottom: 14, lineHeight: 1.35 }}>{item.name}</div>
        <Toggle />
        {project && <AdoLink href={serviceConnectionUrl(org, project, item.id)} />}
        <div>
          <Field label="ID"          value={item.id || "—"} />
          <Field label="Type"       value={item.type || "—"} />
          <Field label="Authorization" value={authScheme} />
          <Field label="Project"    value={project || "—"} />
          {item.description && <Field label="Description" value={item.description} />}
        </div>
      </div>
    );
  }

  if (type === "wiki") {
    return <WikiDetail
      item={item}
      org={org}
      collection={collection}
      client={client}
      onResourceToggle={onResourceToggle}
      onWorkItemToggle={onWorkItemToggle}
      containerStyle={containerStyle}
    />;
  }

  return null;
}

function WikiDetail({ item, org, collection, client, onResourceToggle, onWorkItemToggle, containerStyle }) {
  const wikiId = item._wikiId || item.wikiId || "";
  const wikiName = item._wikiName || item.wikiName || "";
  const project = item._projectName || item.project || "";
  const pagePath = item.path || item.name || "";
  const url = wikiPageUrl(org, project, wikiId, pagePath);

  const [content, setContent] = useState("");
  const [rendered, setRendered] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!client || !wikiId || !pagePath) return;
    let cancelled = false;
    setLoading(true);
    client.getWikiPageContent(wikiId, pagePath, project, item._pageId)
      .then(md => {
        if (cancelled) return;
        setContent(md);
        if (md) setRendered(marked.parse(md));
        else setRendered("");
      })
      .catch(() => { if (!cancelled) { setContent(""); setRendered(""); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [client, wikiId, pagePath]);

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: T.green, background: `${T.green}22`, borderRadius: 4, padding: "2px 7px", fontFamily: "'JetBrains Mono'" }}>WIKI</span>
        <span style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>{wikiName}</span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, color: T.green, marginBottom: 14, lineHeight: 1.35 }}>{pagePath}</div>
      <div style={{ marginBottom: 16 }}>
        {collection
          ? <ResourceToggle type="wiki" item={item} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} size="full" />
          : <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>Select a collection to add this item</span>
        }
      </div>
      {url && <AdoLink href={url} />}
      {loading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.dim, fontSize: 12, marginTop: 12 }}><Spinner size={14} /> Loading…</div>}
      {rendered && (
        <div
          style={{ marginTop: 12, fontSize: 13, color: T.text, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )}
    </div>
  );
}
