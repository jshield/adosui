import { useState, useEffect } from "react";
import { T } from "../../lib/theme";
import backgroundWorker from "../../lib/backgroundWorker";

const RESOURCE_LABELS = {
  repos: "Repos",
  pipelines: "Pipelines",
  pipelineRuns: "Runs",
  pullRequests: "PRs",
  testRuns: "Tests",
  serviceConnections: "SvcConn",
};

function timeAgo(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function StatusDot({ status }) {
  const colors = { ok: T.green, error: T.red, pending: T.dimmer };
  const color = colors[status] || T.dimmer;
  return (
    <span style={{
      width: 5, height: 5, borderRadius: "50%", background: color,
      display: "inline-block", flexShrink: 0,
    }} />
  );
}

function ProjectRow({ name, status }) {
  const [expanded, setExpanded] = useState(false);
  const resources = status.resources || {};
  const hasError = Object.values(resources).some(r => r.status === "error");

  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <div
        onClick={() => hasError && setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
          cursor: hasError ? "pointer" : "default", fontSize: 12,
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { if (hasError) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
      >
        {/* Project name */}
        <span style={{ width: 160, flexShrink: 0, color: T.heading, fontFamily: "'Barlow'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>

        {/* Scoped badge */}
        <span style={{
          fontSize: 9, fontFamily: "'JetBrains Mono'", padding: "1px 5px", borderRadius: 3,
          background: status.scoped ? `${T.violet}18` : `${T.dimmer}20`,
          color: status.scoped ? T.violet : T.dim, flexShrink: 0,
        }}>
          {status.scoped ? "scoped" : "org"}
        </span>

        {/* Last refresh */}
        <span style={{ width: 70, flexShrink: 0, fontSize: 10, fontFamily: "'JetBrains Mono'", color: T.dim, textAlign: "right" }}>
          {timeAgo(status.lastRefresh)}
        </span>

        {/* Resource status dots */}
        <div style={{ display: "flex", gap: 10, flexShrink: 0, marginLeft: 8 }}>
          {Object.entries(RESOURCE_LABELS).map(([key, label]) => {
            const r = resources[key];
            return (
              <div key={key} title={`${label}: ${r?.status || "pending"}${r?.error ? ` — ${r.error}` : ""}`} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <StatusDot status={r?.status || "pending"} />
              </div>
            );
          })}
        </div>

        {/* Expand indicator */}
        {hasError && (
          <span style={{ fontSize: 9, color: T.dim, marginLeft: "auto", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▶</span>
        )}
      </div>

      {/* Expanded error details */}
      {expanded && hasError && (
        <div style={{ padding: "2px 16px 8px 196px", fontSize: 10, fontFamily: "'JetBrains Mono'" }}>
          {Object.entries(RESOURCE_LABELS).map(([key, label]) => {
            const r = resources[key];
            if (!r || r.status !== "error") return null;
            return (
              <div key={key} style={{ display: "flex", gap: 6, padding: "2px 0", color: T.red }}>
                <span style={{ color: T.dim, width: 60, flexShrink: 0 }}>{label}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.error}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WorkerStatusView({ collections }) {
  const [state, setState] = useState({
    activityLog: [],
    lastRefresh: null,
    lastPipelineRunsRefresh: null,
    isRunning: false,
    projectStatus: {},
    projects: [],
    scopedProjectNames: new Set(),
  });

  useEffect(() => {
    return backgroundWorker.subscribe(setState);
  }, []);

  const { projectStatus, isRunning, lastRefresh, lastPipelineRunsRefresh, activityLog, projects, scopedProjectNames } = state;

  // Merge all projects with status data; unsynced projects show as pending
  const EMPTY_RESOURCES = {
    repos: { status: "pending", error: null, timestamp: null },
    pipelines: { status: "pending", error: null, timestamp: null },
    pipelineRuns: { status: "pending", error: null, timestamp: null },
    pullRequests: { status: "pending", error: null, timestamp: null },
    testRuns: { status: "pending", error: null, timestamp: null },
    serviceConnections: { status: "pending", error: null, timestamp: null },
  };

  const allEntries = projects.map(p => {
    const name = p.name || p.id;
    const existing = projectStatus[name];
    if (existing) return [name, existing];
    return [name, {
      scoped: scopedProjectNames instanceof Set ? scopedProjectNames.has(name) : false,
      lastRefresh: null,
      resources: EMPTY_RESOURCES,
    }];
  });

  // Sort: scoped first, then by last refresh desc, then alphabetically
  const sorted = allEntries.sort(([aName, a], [bName, b]) => {
    if (a.scoped !== b.scoped) return a.scoped ? -1 : 1;
    const aTime = a.lastRefresh ? new Date(a.lastRefresh).getTime() : 0;
    const bTime = b.lastRefresh ? new Date(b.lastRefresh).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return aName.localeCompare(bName);
  });

  const scopedCount = sorted.filter(([, s]) => s.scoped).length;
  const errorCount = sorted.filter(([, s]) =>
    Object.values(s.resources || {}).some(r => r.status === "error")
  ).length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>◉</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.heading, fontFamily: "'Barlow Condensed'", letterSpacing: "0.03em" }}>Background Sync</span>
          <span style={{
            fontSize: 9, fontFamily: "'JetBrains Mono'", padding: "2px 6px", borderRadius: 3,
            background: isRunning ? `${T.green}18` : `${T.dimmer}20`,
            color: isRunning ? T.green : T.dim,
          }}>
            {isRunning ? "running" : "stopped"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 10, fontFamily: "'JetBrains Mono'", color: T.dim }}>
          <span>{sorted.length} projects · {scopedCount} scoped</span>
          {errorCount > 0 && <span style={{ color: T.red }}>{errorCount} with errors</span>}
          {lastRefresh && <span>Last batch: {timeAgo(lastRefresh)}</span>}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 9, fontFamily: "'JetBrains Mono'", color: T.dim }}>
          {Object.entries(RESOURCE_LABELS).map(([key, label]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <StatusDot status="ok" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Project list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: T.dimmer, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>
            No projects loaded yet.
          </div>
        ) : (
          sorted.map(([name, status]) => (
            <ProjectRow key={name} name={name} status={status} />
          ))
        )}
      </div>

      {/* Activity log */}
      <div style={{ borderTop: `1px solid ${T.border}`, maxHeight: 120, overflowY: "auto", flexShrink: 0 }}>
        <div style={{ padding: "6px 16px", fontSize: 9, fontFamily: "'JetBrains Mono'", color: T.dim, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Activity Log
        </div>
        {activityLog.slice(0, 20).map((entry, i) => (
          <div key={i} style={{
            padding: "3px 16px", fontSize: 10, fontFamily: "'JetBrains Mono'",
            color: entry.message.includes("error") || entry.message.includes("Error") ? T.red : T.muted,
            opacity: 1 - i * 0.04, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            <span style={{ color: T.dimmer, marginRight: 8 }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
}
