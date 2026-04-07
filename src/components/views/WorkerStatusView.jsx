import { useState, useEffect } from "react";
import { T } from "../../lib/theme";
import backgroundWorker from "../../lib/backgroundWorker";
import { getWorkerTypes } from "../../lib/resourceTypes";

function buildResourceLabels() {
  const labels = {
    repos: "Repos",
    pipelines: "Pipelines",
    pipelineRuns: "Runs",
    pullRequests: "PRs",
    testRuns: "Tests",
    serviceConnections: "SvcConn",
  };
  const workerTypes = getWorkerTypes();
  for (const rt of workerTypes) {
    if (rt.worker?.cacheKey && !labels[rt.worker.cacheKey]) {
      labels[rt.worker.cacheKey] = rt.name;
    }
  }
  return labels;
}

const RESOURCE_LABELS = buildResourceLabels();

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

function ProgressBar({ percent }) {
  return (
    <div style={{ width: 50, height: 3, background: T.dimmer, borderRadius: 2 }}>
      <div style={{ 
        width: `${percent || 0}%`, height: '100%', 
        background: T.cyan, borderRadius: 2, transition: 'width 0.2s' 
      }} />
    </div>
  );
}

function RequestRow({ request, isInFlight }) {
  const { type, params, priority, progress, retry, key } = request;
  
  const priorityBadge = {
    user: { label: 'USER', color: T.cyan },
    background: { label: 'BG', color: T.dim },
  }[priority] || { label: 'BG', color: T.dim };
  
  const isSearch = type.startsWith('search:');
  const displayType = isSearch ? type : type;
  let displayParams = '';
  
  if (params?.query) {
    displayParams = `"${params.query}"`;
  } else if (params?.ids?.length) {
    displayParams = `${params.ids.length} items`;
  } else if (params?.projects?.length) {
    displayParams = params.projects.join(', ');
  } else if (params?.project) {
    displayParams = params.project;
  }
  
  return (
    <div style={{ 
      display: "flex", alignItems: "center", gap: 8, fontSize: 11,
      padding: "4px 16px", borderBottom: `1px solid ${T.border}22`
    }}>
      <span style={{
        fontSize: 8, fontFamily: "'JetBrains Mono'", padding: "1px 4px",
        borderRadius: 2, background: `${priorityBadge.color}18`, color: priorityBadge.color,
      }}>
        {priorityBadge.label}
      </span>
      <span style={{ color: T.text, fontFamily: "'Barlow'", width: 130, flexShrink: 0 }}>
        {displayType}
      </span>
      <span style={{ color: T.dim, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
        {displayParams}
      </span>
      
      {progress?.currentProject && (
        <span style={{ fontSize: 9, color: T.dim, width: 100, overflow: "hidden", textOverflow: "ellipsis" }}>
          {progress.currentProject}
        </span>
      )}
      
      {progress && (
        <ProgressBar percent={progress.percent} />
      )}
      
      {retry > 0 && (
        <span style={{ fontSize: 9, color: T.amber }}>retry {retry}</span>
      )}
      
      {isInFlight && !progress && (
        <span style={{ color: T.dim, fontSize: 10 }}>⟳</span>
      )}
    </div>
  );
}

function RequestSection({ title, requests, isInFlight }) {
  if (!requests?.length) return null;
  
  return (
    <div style={{ borderBottom: `1px solid ${T.border}` }}>
      <div style={{ 
        padding: "8px 16px", fontSize: 9, fontFamily: "'JetBrains Mono'", color: T.dim, 
        letterSpacing: "0.1em", textTransform: "uppercase", background: `${T.dimmer}08`
      }}>
        {title} ({requests.length})
      </div>
      {requests.map((req, i) => (
        <RequestRow key={req.key || i} request={req} isInFlight={isInFlight} />
      ))}
    </div>
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
        <span style={{ width: 160, flexShrink: 0, color: T.heading, fontFamily: "'Barlow'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>

        <span style={{
          fontSize: 9, fontFamily: "'JetBrains Mono'", padding: "1px 5px", borderRadius: 3,
          background: status.scoped ? `${T.violet}18` : `${T.dimmer}20`,
          color: status.scoped ? T.violet : T.dim, flexShrink: 0,
        }}>
          {status.scoped ? "scoped" : "org"}
        </span>

        <span style={{ width: 70, flexShrink: 0, fontSize: 10, fontFamily: "'JetBrains Mono'", color: T.dim, textAlign: "right" }}>
          {timeAgo(status.lastRefresh)}
        </span>

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

        {hasError && (
          <span style={{ fontSize: 9, color: T.dim, marginLeft: "auto", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▶</span>
        )}
      </div>

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
    isLeader: false,
    projectStatus: {},
    projects: [],
    scopedProjectNames: new Set(),
    inFlight: [],
    requestQueue: [],
  });

  useEffect(() => {
    return backgroundWorker.subscribe((workerState) => {
      setState(prev => ({
        ...prev,
        ...workerState,
      }));
    });
  }, []);

  const { 
    projectStatus, isRunning, isLeader, lastRefresh, 
    activityLog, projects, scopedProjectNames, 
    inFlight, requestQueue 
  } = state;

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
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>◉</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.heading, fontFamily: "'Barlow Condensed'", letterSpacing: "0.03em" }}>Background Sync</span>
          <span style={{
            fontSize: 9, fontFamily: "'JetBrains Mono'", padding: "2px 6px", borderRadius: 3,
            background: isRunning ? `${T.green}18` : `${T.dimmer}20`,
            color: isRunning ? T.green : T.dim,
          }}>
            {isRunning ? "running" : isLeader ? "stopped" : "syncing in other tab"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 10, fontFamily: "'JetBrains Mono'", color: T.dim }}>
          <span>{sorted.length} projects · {scopedCount} scoped</span>
          {errorCount > 0 && <span style={{ color: T.red }}>{errorCount} with errors</span>}
          {lastRefresh && <span>Last batch: {timeAgo(lastRefresh)}</span>}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 9, fontFamily: "'JetBrains Mono'", color: T.dim }}>
          {Object.entries(RESOURCE_LABELS).map(([key, label]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <StatusDot status="ok" />
              <span>{label}</span>
            </div>
          ))}
        </div>

        {/* Test buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button 
            onClick={() => backgroundWorker.request('pipelines', { projects: ['test-project'], priority: 'user' })}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "4px 8px", cursor: "pointer", color: T.text, fontSize: 9 }}
          >
            Test: pipelines
          </button>
          <button 
            onClick={() => backgroundWorker.request('repos', { projects: ['test-project'], priority: 'user' })}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "4px 8px", cursor: "pointer", color: T.text, fontSize: 9 }}
          >
            Test: repos
          </button>
          <button 
            onClick={() => backgroundWorker.request('pipelineRuns', { project: 'test-project', pipelineIds: [1,2,3], priority: 'user' })}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "4px 8px", cursor: "pointer", color: T.text, fontSize: 9 }}
          >
            Test: runs
          </button>
          <button 
            onClick={() => backgroundWorker.request('search:workitem', { query: 'test', projects: ['test-project'], priority: 'user' })}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "4px 8px", cursor: "pointer", color: T.text, fontSize: 9 }}
          >
            Test: search
          </button>
        </div>
      </div>

      {/* In-Flight + Queue Section - always visible for debugging */}
      <div style={{ maxHeight: 250, overflowY: "auto", borderBottom: `1px solid ${T.border}`, background: `${T.dimmer}05` }}>
        <RequestSection title="In Flight" requests={inFlight} isInFlight={true} />
        <RequestSection title="Queued" requests={requestQueue} isInFlight={false} />
        {inFlight.length === 0 && requestQueue.length === 0 && (
          <div style={{ padding: "8px 16px", fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
            No active requests (click test buttons above to debug)
          </div>
        )}
      </div>

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
