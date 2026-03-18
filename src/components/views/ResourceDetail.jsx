import { marked } from "marked";
import { useState, useEffect } from "react";
import { T } from "../../lib/theme";
import { Pill, Dot, Spinner, Field, AdoLink, ToggleBtn, CommentThread } from "../ui";
import { WI_TYPE_COLOR, WI_TYPE_SHORT, stateColor, timeAgo, pipelineStatus, isInCollection, prStatus, branchName, workItemUrl, pipelineUrl, serviceConnectionUrl, wikiPageUrl, repoUrl, prUrl, getLatestRun, getRunBranch, getRunStatusVal, getLatestPerBranch } from "../../lib";
import { PipelineLogsViewer } from "./PipelineLogsViewer";

// Configure marked with custom renderer for v17 API
const renderer = new marked.Renderer();

// Style headings to match theme - marked v17 receives token object
renderer.heading = function(token) {
  const fontSize = token.depth === 1 ? 20 : token.depth === 2 ? 18 : 16;
  const text = this.parser.parseInline(token.tokens);
  return `<h${token.depth} style="color: ${T.text}; font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: ${fontSize}px; margin: 16px 0 8px 0;">${text}</h${token.depth}>`;
};

// Style paragraphs - marked v17 receives token object
renderer.paragraph = function(token) {
  const text = this.parser.parseInline(token.tokens);
  return `<p style="color: ${T.muted}; margin: 12px 0; line-height: 1.6;">${text}</p>`;
};

// Style inline code
renderer.codespan = function(token) {
  return `<code style="color: ${T.cyan}; background: rgba(255,255,255,0.06); font-family: 'JetBrains Mono', monospace; padding: 2px 6px; border-radius: 3px;">${token.text}</code>`;
};

// Style code blocks
renderer.code = function(token) {
  return `<pre style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 12px; overflow-x: auto; margin: 12px 0;"><code style="font-family: 'JetBrains Mono', monospace; color: ${T.text};">${token.text}</code></pre>`;
};

// Style links
renderer.link = function(token) {
  const text = this.parser.parseInline(token.tokens);
  return `<a href="${token.href}" style="color: ${T.blue}; text-decoration: underline;" ${token.title ? `title="${token.title}"` : ""}>${text}</a>`;
};

// Style blockquotes
renderer.blockquote = function(token) {
  const text = this.parser.parse(token.tokens);
  return `<blockquote style="border-left: 3px solid ${T.amber}; padding-left: 16px; margin: 12px 0; color: ${T.dim};">${text}</blockquote>`;
};

// Style lists
renderer.list = function(token) {
  const tag = token.ordered ? "ol" : "ul";
  const body = token.items.map(item => this.listitem(item)).join("");
  return `<${tag} style="margin: 12px 0; padding-left: 20px; color: ${T.muted};">${body}</${tag}>`;
};

// Style list items
renderer.listitem = function(token) {
  const text = this.parser.parse(token.tokens);
  return `<li style="margin: 4px 0; color: ${T.muted};">${text}</li>`;
};

// Style horizontal rules
renderer.hr = function() {
  return `<hr style="border: none; border-top: 1px solid ${T.border}; margin: 24px 0;" />`;
};

// Style tables
renderer.table = function(token) {
  const header = this.parser.parse(token.header);
  const body = this.parser.parse(token.rows);
  return `<table style="border-collapse: collapse; width: 100%; margin: 12px 0;"><thead>${header}</thead><tbody>${body}</tbody></table>`;
};

renderer.tablerow = function(token) {
  const text = this.parser.parse(token.cells);
  return `<tr style="border-bottom: 1px solid ${T.border};">${text}</tr>`;
};

renderer.tablecell = function(token) {
  const tag = token.header ? "th" : "td";
  const text = this.parser.parseInline(token.tokens);
  return `<${tag} style="padding: 8px 12px; text-align: ${token.align || "left"}; color: ${T.text};">${text}</${tag}>`;
};

marked.setOptions({
  renderer: renderer,
  gfm: true,
  breaks: true
});

export function ResourceDetail({ client, resource, org, collection, profile, onResourceToggle, onAddComment, onSaveLogComments, syncStatus }) {
  const { type, data } = resource;

  if (type === "workitem") {
    return <WorkItemDetail client={client} workItem={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }
  if (type === "repo") {
    return <RepoDetail client={client} repo={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }
  if (type === "pipeline") {
    return <PipelineDetail client={client} pipeline={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onAddComment={onAddComment} onSaveLogComments={onSaveLogComments} syncStatus={syncStatus} />;
  }
  if (type === "pr") {
    return <PRDetail client={client} pr={data} collection={collection} org={org} profile={profile} onResourceToggle={onResourceToggle} syncStatus={syncStatus} />;
  }
  if (type === "serviceconnection") {
    return <ServiceConnectionDetail client={client} serviceConnection={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }
  if (type === "wiki") {
    return <WikiPageDetail client={client} wikiPage={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }
  return null;
}

function WorkItemDetail({ client, workItem, org, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  const [wiComments, setWiComments] = useState([]);
  const [wiCommentsLoading, setWiCommentsLoading] = useState(false);

  const type = workItem.fields?.["System.WorkItemType"] || "";
  const state = workItem.fields?.["System.State"] || "";
  const title = workItem.fields?.["System.Title"] || "Untitled";
  const areaPath = workItem.fields?.["System.AreaPath"]?.split("\\")[0] || "";
  const project = workItem.fields?.["System.TeamProject"] || areaPath;
  const projectId = client._projects?.find(p => p.name === project)?.id || project;

  useEffect(() => {
    if (projectId) {
      setWiCommentsLoading(true);
      client.getWorkItemComments(workItem.id, projectId)
        .then(setWiComments)
        .catch(() => setWiComments([]))
        .finally(() => setWiCommentsLoading(false));
    }
  }, [workItem.id, projectId]);

  const handleToggle = (resourceType, id) => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle(resourceType, id, collection.id);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
              <Pill label={WI_TYPE_SHORT[type] || type} color={WI_TYPE_COLOR[type] || T.dim} />
              <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{workItem.id}</span>
              <Pill label={state} color={stateColor(state)} />
              {areaPath && <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>↳ {areaPath}</span>}
            </div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading, lineHeight: 1.2, letterSpacing: "0.02em" }}>{title}</div>
            {workItem.fields?.["System.AssignedTo"]?.displayName && (
              <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                Assigned to {workItem.fields["System.AssignedTo"].displayName} · Changed {timeAgo(workItem.fields["System.ChangedDate"])}
              </div>
            )}
          </div>
          <AdoLink href={workItemUrl(org, workItem.id)} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Fields</div>
          {Object.entries(workItem.fields || {})
            .filter(([k]) => !["System.TeamProject","System.Rev","System.AuthorizedAs","System.StateChangedDate","System.Watermark","System.IsDeleted","System.AcceleratedCardData"].includes(k))
            .map(([key, value]) => {
              let displayValue = "";
              if (value === null || value === undefined) {
                displayValue = "—";
              } else if (typeof value === "object") {
                if (value.displayName) displayValue = value.displayName;
                else if (value.name) displayValue = value.name;
                else displayValue = JSON.stringify(value).slice(0, 50);
              } else {
                displayValue = String(value);
              }
              const fieldName = key.replace("System.", "").replace("Microsoft.VSTS.", "").replace("SFCC.", "");
              if (displayValue === "" || displayValue === "undefined") return null;
              return (
                <div key={key} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 140, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{fieldName}</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'", wordBreak: "break-word" }}>{displayValue}</span>
                </div>
              );
            })}
        </div>

        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 16 }}>
          <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Comments</div>
          {!projectId ? (
            <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>Project not available</div>
          ) : wiCommentsLoading ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> Loading...</div>
          ) : (
            <CommentThread
              comments={wiComments.map(c => ({
                author: c.createdBy?.displayName || "Unknown",
                createdAt: c.createdDate,
                text: c.text || "",
              }))}
              onAdd={async (text) => {
                await client.addWorkItemComment(workItem.id, text, projectId);
                const updated = await client.getWorkItemComments(workItem.id, projectId);
                setWiComments(updated);
              }}
              authorName={profile?.displayName || ""}
              disabled={syncStatus === "saving"}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RepoDetail({ client, repo, org, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  const handleToggle = () => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle("repo", repo.id, collection.id);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading, marginBottom: 8 }}>{repo.name}</div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
              {branchName(repo.defaultBranch) || "main"} branch
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {org && repo._projectName && <AdoLink href={repoUrl(org, repo._projectName, repo.name)} />}
            {collection && <ToggleBtn added={isInCollection(collection, "repo", repo.id)} color={collection.color} onClick={handleToggle} />}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          {[
            ["Default Branch", branchName(repo.defaultBranch) || "main"],
            ["Size", repo.size ? `${(repo.size / 1024).toFixed(0)} KB` : "empty"],
            ["URL", repo.remoteUrl || "—"],
            ["Last Updated", timeAgo(repo.lastUpdatedTime)],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{label}</span>
              <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'", wordBreak: "break-all", fontSize: 11 }}>{val}</span>
            </div>
          ))}
        </div>
        {collection && onAddComment && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <CommentThread
              comments={(collection.repos || []).find(r => r.id === repo.id)?.comments || []}
              onAdd={(text) => onAddComment(collection.id, "repo", repo.id, text)}
              authorName={profile?.displayName || ""}
              disabled={syncStatus === "saving"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineDetail({ client, pipeline, org, collection, profile, onResourceToggle, onAddComment, onSaveLogComments, syncStatus }) {
  const rs = pipelineStatus(pipeline.latestRun?.result || pipeline.latestRun?.state);

  const handleToggle = () => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle("pipeline", pipeline.id, collection.id);
  };

  const [showLogs, setShowLogs] = useState(false);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);

  useEffect(() => {
    if (!pipeline?._projectName || !pipeline?.id) return;
    setRunsLoading(true);
    // Prefer cached runs from background worker to avoid duplicate network calls
    try {
      const cached = cache.get(`project:${pipeline._projectName}:pipelineRuns`) || {};
      const key = String(pipeline.id);
      if (cached && Array.isArray(cached[key]) && cached[key].length) {
        setRuns(cached[key]);
        setRunsLoading(false);
        return;
      }
    } catch (e) {
      // fall through to direct fetch
    }

    const configType = pipeline.configuration?.type || "yaml";
    const fetch = configType === "yaml"
      ? client.getPipelineRuns(pipeline._projectName, pipeline.id)
      : client.getBuildRuns(pipeline._projectName, pipeline.id);
    fetch
      .then(r => setRuns(r || []))
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false));
  }, [pipeline, client]);

  // Prefer cached run helpers when available; fall back to local extraction.
  // We intentionally avoid importing wiUtils here to keep this file self-contained
  // but use a resilient branch extraction when a run object is available.
  const getRunBranch = (run) => {
    if (!run) return "unknown";
    return (
      branchName(run.sourceBranch) ||
      branchName(run.sourceRefName) ||
      branchName(run.triggerInfo?.sourceBranch) ||
      branchName(run.triggerInfo?.prSourceBranch) ||
      branchName(run.resources?.repositories?.self?.refName) ||
      branchName(run.repository?.defaultBranch) ||
      "unknown"
    );
  };

  const runsByBranch = getLatestPerBranch(runs || []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <Dot color={rs.color} pulse={rs.label === "running"} />
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading }}>{pipeline.name}</div>
              <Pill label={rs.label} color={rs.color} />
            </div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
              {pipeline.folder || "/"} · Last run: {timeAgo(pipeline.latestRun?.startTime)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setShowLogs(!showLogs)}
              style={{
                background: showLogs ? "rgba(245,158,11,0.1)" : "none",
                border: `1px solid ${showLogs ? "rgba(245,158,11,0.3)" : T.dim}`,
                color: showLogs ? T.amber : T.muted,
                fontSize: 10,
                padding: "4px 10px",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              {showLogs ? "View Details" : "View Logs"}
            </button>
            {org && pipeline._projectName && <AdoLink href={pipelineUrl(org, pipeline._projectName, pipeline.id)} />}
            {collection && <ToggleBtn added={isInCollection(collection, "pipeline", pipeline.id)} color={collection.color} onClick={handleToggle} />}
          </div>
        </div>
      </div>

      {showLogs ? (
        <PipelineLogsViewer
          client={client}
          pipeline={pipeline}
          runs={runs}
          collection={collection}
          profile={profile}
          onSaveComments={onSaveLogComments}
          syncStatus={syncStatus}
        />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
            {[
              ["Folder", pipeline.folder || "/"],
              ["Definition ID", String(pipeline.id)],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{label}</span>
                <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{val}</span>
              </div>
            ))}
            <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Last Run</span>
              <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>
                <Pill label={pipelineStatus(pipeline.latestRun?.result || pipeline.latestRun?.state).label} color={pipelineStatus(pipeline.latestRun?.result || pipeline.latestRun?.state).color} />
                <span style={{ marginLeft: 8 }}>{timeAgo(pipeline.latestRun?.startTime)}</span>
              </span>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 16 }}>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Runs by Branch
            </div>
            {runsLoading ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>
                <Spinner /> Loading...
              </div>
              ) : Object.keys(runsByBranch).length > 0 ? (
              Object.entries(runsByBranch).map(([branch, branchRuns]) => {
                const latest = getLatestRun(branchRuns);
                const st = pipelineStatus(getRunStatusVal(latest));
                const branchLabel = getRunBranch(latest) || branch;
                return (
                  <div key={branch} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                    <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{branchLabel}</span>
                    <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono'" }}>
                      <Pill label={st.label} color={st.color} />
                      <span style={{ color: T.dim, fontSize: 11 }}>{timeAgo(latest?.startTime || latest?.queueTime)}</span>
                    </span>
                  </div>
                );
              })
            ) : (
              <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No runs found</div>
            )}
          </div>

          {collection && onAddComment && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
              <CommentThread
                comments={(collection.pipelines || []).find(p => String(p.id) === String(pipeline.id))?.comments || []}
                onAdd={(text) => onAddComment(collection.id, "pipeline", pipeline.id, text)}
                authorName={profile?.displayName || ""}
                disabled={syncStatus === "saving"}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PRDetail({ client, pr, collection, org, profile, onResourceToggle, syncStatus }) {
  const status = prStatus(pr.status);

  const handleToggle = () => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle("pr", pr.pullRequestId, collection.id);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{pr.pullRequestId}</span>
              <Pill label={status.label} color={status.color} />
            </div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading, marginBottom: 8 }}>{pr.title}</div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
              {pr.createdBy?.displayName} · {branchName(pr.sourceRefName)} → {branchName(pr.targetRefName)}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {org && pr._projectName && <AdoLink href={prUrl(org, pr._projectName, pr.pullRequestId)} />}
            {collection && <ToggleBtn added={isInCollection(collection, "pr", pr.pullRequestId)} onClick={handleToggle} />}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          {[
            ["Author", pr.createdBy?.displayName || "—"],
            ["Source", branchName(pr.sourceRefName) || "—"],
            ["Target", branchName(pr.targetRefName) || "—"],
            ["Created", timeAgo(pr.creationDate)],
            ["Reviewers", String(pr.reviewers?.length || 0)],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{label}</span>
              <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{val}</span>
            </div>
          ))}
          {pr.description && (
            <div style={{ padding: "6px 0", fontSize: 12 }}>
              <span style={{ display: "block", color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11, marginBottom: 4 }}>Description</span>
              <div style={{ color: T.text, fontFamily: "'JetBrains Mono'", fontSize: 11, whiteSpace: "pre-wrap", background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 4 }}>{pr.description}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceConnectionDetail({ client, serviceConnection, org, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  const project = serviceConnection._projectName || serviceConnection.project || "";

  const handleToggle = () => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle("serviceconnection", serviceConnection.id, collection.id);
  };

  const authScheme = serviceConnection.authorization?.scheme || serviceConnection.type || "Unknown";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <Pill label={serviceConnection.type || "service"} color={T.cyan} />
            </div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading, marginBottom: 8 }}>{serviceConnection.name}</div>
            {serviceConnection.description && (
              <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                {serviceConnection.description}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {project && <AdoLink href={serviceConnectionUrl(org, project, serviceConnection.id)} />}
            {collection && <ToggleBtn added={isInCollection(collection, "serviceconnection", serviceConnection.id)} color={collection.color} onClick={handleToggle} />}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          {[
            ["ID", serviceConnection.id || "—"],
            ["Type", serviceConnection.type || "—"],
            ["Authorization", authScheme],
            ["Project", project || "—"],
            ["URL", serviceConnection.url || "—"],
            ["Created", serviceConnection.createdBy ? (serviceConnection.createdBy.displayName + " · " + timeAgo(serviceConnection.createdOn)) : timeAgo(serviceConnection.createdOn)],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{label}</span>
              <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'", wordBreak: "break-all", fontSize: 11 }}>{val}</span>
            </div>
          ))}
        </div>
        {collection && onAddComment && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <CommentThread
              comments={(collection.serviceConnections || []).find(sc => String(sc.id) === String(serviceConnection.id))?.comments || []}
              onAdd={(text) => onAddComment(collection.id, "serviceconnection", serviceConnection.id, text)}
              authorName={profile?.displayName || ""}
              disabled={syncStatus === "saving"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function WikiPageDetail({ client, wikiPage, org, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  const wikiId = wikiPage._wikiId || wikiPage.wikiId || "";
  const wikiName = wikiPage._wikiName || wikiPage.wikiName || "";
  const project = wikiPage._projectName || wikiPage.project || "";
  const path = wikiPage.path || wikiPage.name || "/";

  const [content, setContent] = useState("");
  const [renderedContent, setRenderedContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = (resourceType, id) => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle(resourceType, id, collection.id);
  };
  
  // Style tables
  renderer.table = (header, body) => `<table style="border-collapse: collapse; width: 100%; margin: 12px 0;"><thead>${header}</thead><tbody>${body}</tbody></table>`;
  renderer.tablerow = (content) => `<tr style="border-bottom: 1px solid ${T.border};">${content}</tr>`;
  renderer.tablecell = (content, flags) => {
    const tag = flags.header ? "th" : "td";
    return `<${tag} style="padding: 8px 12px; text-align: ${flags.align || "left"}; color: ${T.text};">${content}</${tag}>`;
  };
  
  marked.setOptions({
    renderer: renderer,
    gfm: true,
    breaks: true
  });

  // Fetch and render content on demand when wiki page changes
  useEffect(() => {
    const fetchAndRender = async () => {
      if (wikiPage?._wikiId && (wikiPage?.path || wikiPage?._pageId)) {
        setIsLoading(true);
        try {
          const markdown = await client.getWikiPageContent(
            wikiPage._wikiId, 
            wikiPage.path, 
            wikiPage._projectName || wikiPage.project,
            wikiPage._pageId
          );
          setContent(markdown);
          if (markdown) {
            console.log("Raw markdown:", JSON.stringify(markdown));
            console.log("Markdown type:", typeof markdown);
            console.log("Markdown length:", markdown.length);
            const html = marked.parse(markdown);
            setRenderedContent(html);
          } else {
            setRenderedContent("");
          }
        } catch (e) {
          console.error("Wiki content error:", e);
          setContent("");
          setRenderedContent("");
        } finally {
          setIsLoading(false);
        }
      }
    };
    fetchAndRender();
  }, [wikiPage, client]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.green, background: `${T.green}22`, borderRadius: 4, padding: "2px 8px", fontFamily: "'JetBrains Mono'" }}>WIKI</span>
          {wikiName && <Pill label={wikiName} color={T.green} />}
          {project && <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>{project}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {wikiId && <AdoLink href={wikiPageUrl(org, project, wikiId, path)} />}
          {collection && <ToggleBtn added={isInCollection(collection, "wiki", wikiPage.id)} color={collection.color} onClick={() => handleToggle("wiki", wikiPage.id)} />}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading, marginBottom: 8, wordBreak: "break-all" }}>{path}</div>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          {[
            ["Page ID", wikiPage.id || "—"],
            ["Wiki", wikiName || "—"],
            ["Project", project || "—"],
            ["URL", wikiPage.url || wikiPage.remoteUrl || "—"],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{label}</span>
              <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'", wordBreak: "break-all", fontSize: 11 }}>{val}</span>
            </div>
          ))}
        </div>
        
        {/* Wiki Content Section */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Content</div>
          {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
              <Spinner size={24} />
            </div>
          ) : renderedContent ? (
            <div 
              style={{
                color: T.text,
                fontSize: 13,
                lineHeight: 1.6,
                fontFamily: "'Barlow', sans-serif",
              }}
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          ) : (
            <div style={{ color: T.dim, fontSize: 12, textAlign: "center", padding: 20 }}>
              No content available
            </div>
          )}
        </div>

        {collection && onAddComment && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <CommentThread
              comments={(collection.wikiPages || []).find(wp => String(wp.id) === String(wikiPage.id))?.comments || []}
              onAdd={(text) => onAddComment(collection.id, "wiki", wikiPage.id, text)}
              authorName={profile?.displayName || ""}
              disabled={syncStatus === "saving"}
            />
          </div>
        )}
      </div>
    </div>
  );
}
