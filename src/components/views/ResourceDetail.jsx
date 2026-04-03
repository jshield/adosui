import { marked } from "marked";
import { useState, useEffect } from "react";
import { T } from "../../lib/theme";
import { Pill, Dot, Spinner, Field, AdoLink, ResourceToggle, CommentThread } from "../ui";
import { WI_TYPE_COLOR, WI_TYPE_SHORT, stateColor, timeAgo, pipelineStatus, prStatus, branchName, workItemUrl, pipelineUrl, serviceConnectionUrl, wikiPageUrl, repoUrl, prUrl, getLatestRun, getRunBranch, getRunStatusVal, getLatestPerBranch } from "../../lib";
import { PipelineLogsViewer } from "./PipelineLogsViewer";
import { parsePipeline, parsePipelineLogs, mergeTargets, TARGET_TYPE_META } from "../../lib/pipelineParser";

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

import { getType } from "../../lib/resourceTypes";
import { WorkflowSection } from "./WorkflowSection";
import { getWorkflowTemplateId } from "../../lib/workflowManager";

export function ResourceDetail({ client, resource, org, collection, profile, onResourceToggle, onWorkItemToggle, onAddComment, onSaveLogComments, syncStatus, workflowTemplates }) {
  const { type, data } = resource;

  // Custom detail components for built-in types
  if (type === "workitem") {
    return <WorkItemDetail client={client} workItem={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} onAddComment={onAddComment} syncStatus={syncStatus} workflowTemplates={workflowTemplates} />;
  }
  if (type === "repo") {
    return <RepoDetail client={client} repo={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }
  if (type === "pipeline") {
    return <PipelineDetail client={client} pipeline={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} onAddComment={onAddComment} onSaveLogComments={onSaveLogComments} syncStatus={syncStatus} />;
  }
  if (type === "pr") {
    return <PRDetail client={client} pr={data} collection={collection} org={org} profile={profile} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} syncStatus={syncStatus} />;
  }
  if (type === "serviceconnection") {
    return <ServiceConnectionDetail client={client} serviceConnection={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }
  if (type === "wiki") {
    return <WikiPageDetail client={client} wikiPage={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }
  if (type === "yamltool") {
    return <YamlToolDetail tool={data} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }

  // Generic detail for registry-defined types without custom component
  const rt = getType(type);
  if (rt) {
    return <GenericResourceDetail rt={rt} item={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }

  return null;
}

function GenericResourceDetail({ rt, item, org, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  const dp = rt.display ? {
    title: item[rt.display.titleField] || item[rt.idField] || "Untitled",
    subtitle: rt.display.subtitleField ? item[rt.display.subtitleField] : null,
    icon: rt.icon,
    color: rt.color,
  } : { title: String(item[rt.idField] || "Untitled"), icon: rt.icon, color: rt.color };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 22 }}>{dp.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: T.heading }}>{dp.title}</div>
            {dp.subtitle && <div style={{ fontSize: 12, color: T.dim, fontFamily: "'JetBrains Mono'" }}>{dp.subtitle}</div>}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 13, color: T.muted }}>No detail view configured for this resource type.</div>
        {/* Show all fields as key-value pairs */}
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden" }}>
          {Object.entries(item).filter(([k]) => !k.startsWith("_")).map(([key, val]) => (
            <div key={key} style={{ display: "flex", padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", width: 160, flexShrink: 0 }}>{key}</span>
              <span style={{ fontSize: 12, color: T.text, flex: 1, wordBreak: "break-all" }}>{typeof val === "object" ? JSON.stringify(val) : String(val ?? "")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkItemDetail({ client, workItem, org, collection, profile, onResourceToggle, onWorkItemToggle, onAddComment, syncStatus, workflowTemplates }) {
  const [wiComments, setWiComments] = useState([]);
  const [wiCommentsLoading, setWiCommentsLoading] = useState(false);

  const type = workItem.fields?.["System.WorkItemType"] || "";
  const state = workItem.fields?.["System.State"] || "";
  const title = workItem.fields?.["System.Title"] || "Untitled";
  const areaPath = workItem.fields?.["System.AreaPath"]?.split("\\")[0] || "";
  const project = workItem.fields?.["System.TeamProject"] || areaPath;
  const projectId = client._projects?.find(p => p.name === project)?.id || project;

  useEffect(() => {
    if (projectId && collection) {
      setWiCommentsLoading(true);
      client.getWorkItemComments(workItem.id, projectId)
        .then(setWiComments)
        .catch(() => setWiComments([]))
        .finally(() => setWiCommentsLoading(false));
    }
  }, [workItem.id, projectId, collection]);

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

        {collection && (
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
        )}

        {workflowTemplates && getWorkflowTemplateId(workItem) && (
          <WorkflowSection
            client={client}
            workItem={workItem}
            profile={profile}
            org={org}
            workflowTemplates={workflowTemplates}
            showToast={() => {}}
          />
        )}
      </div>
    </div>
  );
}

function RepoDetail({ client, repo, org, collection, profile, onResourceToggle, onWorkItemToggle, onAddComment, syncStatus }) {

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
            {collection && <ResourceToggle type="repo" item={repo} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} size="full" />}
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

/* ─── Deployment Targets sub-component ────────────────────────── */

const SOURCE_COLORS = { yaml: T.cyan, log: T.green, both: T.amber };

function DeploymentTargetsSection({ client, pipeline, runs }) {
  const [targets, setTargets]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    if (!pipeline?._projectName || !pipeline?.id || !runs?.length) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const latest = runs.find(r =>
          r.state === "completed" || r.result === "succeeded" ||
          r.result === "failed"  || r.result === "cancelled"
        ) || runs[0];

        let yamlTargets = [];
        let logTargets  = [];

        // YAML analysis (only for yaml-type pipelines)
        if (pipeline.configuration?.type === "yaml") {
          try {
            const raw = await client.getPipelineYaml(pipeline._projectName, pipeline.id);
            // The $expand=finalYaml endpoint returns JSON with a finalYaml property
            let yamlText = raw;
            try { const parsed = JSON.parse(raw); yamlText = parsed.finalYaml || raw; } catch {}
            yamlTargets = parsePipeline(yamlText);
          } catch { /* YAML may not be available */ }
        }

        // Log analysis
        try {
          const buildId = latest.id;
          const logText = await client.getFullBuildLog(pipeline._projectName, buildId);
          logTargets = parsePipelineLogs(logText);
        } catch { /* logs may not be available */ }

        if (!cancelled) setTargets(mergeTargets(yamlTargets, logTargets));
      } catch (e) {
        if (!cancelled) setError("Failed to detect deployment targets");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [pipeline?.id, runs?.length]);

  if (loading) {
    return (
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 16 }}>
        <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Deployment Targets</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>
          <Spinner /> Analysing pipeline...
      </div>
    </div>
  );
}

// ── YAML Tool Detail ─────────────────────────────────────────────────────────

function YamlToolDetail({ tool, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: 20, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>{tool.icon || "📄"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading }}>{tool.name || tool.id}</div>
            {tool.description && (
              <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>{tool.description}</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Pill label={tool.target?.file || "—"} color={T.amber} />
          {tool.target?.arrayPath && <Pill label={`.${tool.target.arrayPath}`} color={T.dimmer} />}
        </div>
        {collection && (
          <ResourceToggle type="yamltool" item={tool} collection={collection} onResourceToggle={onResourceToggle} size="full" />
        )}
      </div>
      {collection && onAddComment && (
        <div style={{ padding: 16 }}>
          <CommentThread
            comments={(collection.yamlTools || []).find(yt => String(yt.id) === String(tool.id))?.comments || []}
            onAdd={(text) => onAddComment(collection.id, "yamltool", tool.id, text)}
            authorName={profile?.displayName || ""}
            disabled={syncStatus === "saving"}
          />
        </div>
      )}
    </div>
  );
}

  if (error) {
    return (
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 16 }}>
        <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Deployment Targets</div>
        <div style={{ color: T.red, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>{error}</div>
      </div>
    );
  }

  if (!targets.length) return null; // nothing to show

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 16 }}>
      <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Deployment Targets
        <span style={{ marginLeft: 8, color: T.dim, fontSize: 10 }}>{targets.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {targets.map((t, i) => {
          const meta   = TARGET_TYPE_META[t.type] || { label: t.type, icon: "DEP" };
          const srcClr = SOURCE_COLORS[t.source] || T.muted;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, borderLeft: `3px solid ${srcClr}`, borderRadius: 5 }}>
              <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: srcClr, width: 28, textAlign: "center", flexShrink: 0, fontWeight: 700 }}>{meta.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'", color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.name || "unnamed"}
                  </span>
                  <Pill label={meta.label} color={srcClr} />
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 3, fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                  {t.resourceGroup && <span>rg: {t.resourceGroup}</span>}
                  {t.slot && <span>slot: {t.slot}</span>}
                  {t.namespace && <span>ns: {t.namespace}</span>}
                  {t.subscription && <span>sub: {t.subscription}</span>}
                </div>
              </div>
              <span style={{ fontSize: 9, fontFamily: "'JetBrains Mono'", color: srcClr, textTransform: "uppercase", flexShrink: 0 }}>{t.source}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineDetail({ client, pipeline, org, collection, profile, onResourceToggle, onWorkItemToggle, onAddComment, onSaveLogComments, syncStatus }) {
  const rs = pipelineStatus(pipeline.latestRun?.result || pipeline.latestRun?.state);

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
            {collection && <ResourceToggle type="pipeline" item={pipeline} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} size="full" />}
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

          <DeploymentTargetsSection client={client} pipeline={pipeline} runs={runs} />

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

function PRDetail({ client, pr, collection, org, profile, onResourceToggle, onWorkItemToggle, syncStatus }) {
  const status = prStatus(pr.status);

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
            {collection && <ResourceToggle type="pr" item={pr} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} size="full" />}
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

function ServiceConnectionDetail({ client, serviceConnection, org, collection, profile, onResourceToggle, onWorkItemToggle, onAddComment, syncStatus }) {
  const project = serviceConnection._projectName || serviceConnection.project || "";

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
            {collection && <ResourceToggle type="serviceconnection" item={serviceConnection} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} size="full" />}
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

function WikiPageDetail({ client, wikiPage, org, collection, profile, onResourceToggle, onWorkItemToggle, onAddComment, syncStatus }) {
  const wikiId = wikiPage._wikiId || wikiPage.wikiId || "";
  const wikiName = wikiPage._wikiName || wikiPage.wikiName || "";
  const project = wikiPage._projectName || wikiPage.project || "";
  const path = wikiPage.path || wikiPage.name || "/";

  const [content, setContent] = useState("");
  const [renderedContent, setRenderedContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
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
          {collection && <ResourceToggle type="wiki" item={wikiPage} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} size="full" />}
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
