import { useState, useCallback, useEffect } from "react";
import { T } from "../../lib/theme";
import { Dot, SelectableRow, Field } from "../ui";
import { timeAgo, pipelineStatus, branchName, pipelineUrl, cache, getLatestRun, getRunBranch, getRunStatusVal } from "../../lib";
import backgroundWorker from "../../lib/backgroundWorker";
import { ResourceDetail } from "./ResourceDetail";

/**
 * PipelinesView
 *
 * Props:
 *   client            – ADOClient
 *   org               – string
 *   pinnedCollection  – the personal "pinned-pipelines" collection object
 *                       ({ pipelines: [{ id, name, project, folder, configurationType, comments }] })
 *   onTogglePin       – (pipeline) => void  called with the full ADO pipeline object
 */
export function PipelinesView({ client, org, pinnedCollection, onTogglePin, profile, onResourceToggle, onAddComment, onSaveLogComments, syncStatus }) {
  // Derive the pinned list from the collection's pipelines array
  const pinnedPipelines = pinnedCollection?.pipelines || [];

  const [allPipelines, setAllPipelines] = useState([]);
  const [pipelineRuns, setPipelineRuns] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastRunsRefresh, setLastRunsRefresh] = useState(null);

  const fetchPipelines = useCallback(async () => {
    setLoading(true);
    try {
      const pipelines = await client.getAllPipelines();
      setAllPipelines(pipelines);
    } catch (e) {
      console.error("Failed to fetch pipelines:", e);
    } finally {
      setLoading(false);
    }
  }, [client]);

  const fetchRuns = useCallback(async () => {
    if (!allPipelines.length || !pinnedPipelines.length) return;
    setRefreshing(true);
    try {
      // Read cached runs produced by the background worker for each pipeline's project
      const runsMap = { ...pipelineRuns };
      await Promise.all(pinnedPipelines.map(async (p) => {
        try {
          const pipeline = allPipelines.find(pl => String(pl.id) === String(p.id));
          const projectName = p.project || pipeline?._projectName;
          if (!projectName) { runsMap[String(p.id)] = []; return; }

          const cached = cache.get(`project:${projectName}:pipelineRuns`) || {};
          // Normalize key lookup to strings
          if (cached && Object.prototype.hasOwnProperty.call(cached, String(p.id))) {
            runsMap[String(p.id)] = cached[String(p.id)] || [];
            return;
          }

          // Fallback: fetch builds directly (prefer builds endpoint)
          let runs = [];
          try {
            runs = await client.getBuildRuns(projectName, p.id);
          } catch (err) {
            try { runs = await client.getPipelineRuns(projectName, p.id); } catch { runs = []; }
          }
          runsMap[String(p.id)] = runs || [];
        } catch (err) {
          runsMap[String(p.id)] = [];
        }
      }));
      setPipelineRuns(runsMap);
    } catch (e) {
      console.error("Failed to fetch runs:", e);
    } finally {
      setRefreshing(false);
    }
  }, [client, pinnedPipelines, allPipelines]);

  useEffect(() => { fetchPipelines(); }, [fetchPipelines]);

  // Manual refresh that batches builds requests for visible (pinned) pipelines
  const handleManualRefresh = useCallback(async () => {
    if (!pinnedPipelines.length || !allPipelines.length) return;
    setRefreshing(true);
    try {
      // Group pinned pipelines by project so we can batch per-project requests
      const byProject = {};
      for (const p of pinnedPipelines) {
        const pipeline = allPipelines.find(pl => String(pl.id) === String(p.id));
        const projectName = p.project || pipeline?._projectName;
        if (!projectName) continue;
        byProject[projectName] = byProject[projectName] || [];
        byProject[projectName].push(String(p.id));
      }

      const CHUNK_DEFS = 20;
      const PER_DEF = 3;
      const MANUAL_TTL = 60 * 1000; // match worker RUNS_TTL

      for (const [projectName, defIds] of Object.entries(byProject)) {
        const projectRunsMap = {};
        for (let i = 0; i < defIds.length; i += CHUNK_DEFS) {
          const chunk = defIds.slice(i, i + CHUNK_DEFS);
          try {
            const map = await client.getBuildRunsForDefinitions(projectName, chunk, PER_DEF);
            for (const k of Object.keys(map)) projectRunsMap[String(k)] = map[k] || [];
          } catch (e) {
            // Fallback per-definition if batched call fails
            await Promise.all(chunk.map(async (defId) => {
              try {
                let runs = await client.getBuildRuns(projectName, defId);
                if (!runs || !runs.length) {
                  runs = await client.getPipelineRuns(projectName, defId);
                }
                projectRunsMap[String(defId)] = runs || [];
              } catch (err) {
                projectRunsMap[String(defId)] = [];
              }
            }));
          }
        }
        // Persist per-project pipeline runs into cache with same key the worker uses
        cache.set(`project:${projectName}:pipelineRuns`, projectRunsMap, MANUAL_TTL);
        // Merge newly cached runs into local state
        const cached = cache.get(`project:${projectName}:pipelineRuns`) || {};
        setPipelineRuns(prev => ({ ...prev, ...Object.fromEntries(Object.entries(cached).map(([k,v]) => [String(k), v || []])) }));
      }

      // Signal a refresh time so UI shows "Runs refreshed:"
      try {
        backgroundWorker.lastPipelineRunsRefresh = new Date().toISOString();
        backgroundWorker.notify();
      } catch (e) {}
    } catch (e) {
      console.error("Manual refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  }, [client, pinnedPipelines, allPipelines]);

  // Subscribe to background worker: on runs refresh re-load cached runs for visible projects
  useEffect(() => {
    const unsub = backgroundWorker.subscribe((st) => {
      setLastRunsRefresh(st.lastPipelineRunsRefresh || null);
      // Re-read cache for projects present in allPipelines
      const projects = Array.from(new Set(allPipelines.map(p => p._projectName).filter(Boolean)));
      for (const projectName of projects) {
        const cached = cache.get(`project:${projectName}:pipelineRuns`) || {};
        // Merge into local state
        setPipelineRuns(prev => ({ ...prev, ...Object.fromEntries(Object.entries(cached).map(([k,v]) => [String(k), v || []])) }));
      }
    });
    return unsub;
  }, [allPipelines]);

  useEffect(() => {
    if (allPipelines.length) {
      fetchRuns();
      const interval = setInterval(fetchRuns, 30000);
      return () => clearInterval(interval);
    }
  }, [allPipelines.length, pinnedPipelines.length, fetchRuns]);

  const filteredPipelines = allPipelines.filter(p =>
    !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const pinnedIds = new Set(pinnedPipelines.map(p => String(p.id)));

  const getPipelineRun = (pipeline) => {
    const cached = pipelineRuns[String(pipeline.id)];
    if (cached) return getLatestRun(cached);
    return pipeline.latestRun || null;
  };

  const renderList = () => {
    if (loading) return <div style={{ padding: 20, color: T.dim }}>Loading...</div>;
    return (
      <div style={{ flex: 1, overflowY: "auto" }}>
        {lastRunsRefresh && (
          <div style={{ padding: "6px 14px", fontSize: 10, color: T.dim, borderBottom: `1px solid ${T.border}` }}>
            Runs refreshed: {timeAgo(lastRunsRefresh)}
          </div>
        )}
        {pinnedPipelines.length > 0 && (
          <>
            <div style={{ padding: "8px 14px", fontSize: 10, color: T.amber, background: "rgba(245,158,11,0.05)", borderBottom: `1px solid ${T.border}` }}>
              Pinned ({pinnedPipelines.length})
              <button onClick={fetchRuns} disabled={refreshing} style={{ background: "none", border: "none", color: T.cyan, cursor: "pointer", float: "right" }}>
                {refreshing ? "..." : "↻"}
              </button>
            </div>
            {pinnedPipelines.map((p) => {
               const pipeline = allPipelines.find(x => String(x.id) === String(p.id)) || p;
               const runObj = getPipelineRun(pipeline);
               const status = pipelineStatus(getRunStatusVal(runObj));
              const sel    = selectedPipeline && String(selectedPipeline.id) === String(p.id);
              return (
                <div key={p.id}
                  onClick={() => setSelectedPipeline(pipeline)}
                  style={{ display: "flex", alignItems: "center", padding: "8px 14px", cursor: "pointer", borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${sel ? T.amber : "transparent"}`, background: sel ? `${T.amber}08` : "transparent" }}>
                  <Dot color={status.color} pulse={status.pulse} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12 }}>{p.name}</span>
                {runObj && (
                  <span style={{ fontSize: 10, color: T.dim }}>
                    {getRunBranch(runObj)} · {timeAgo(runObj.startTime || runObj.queueTime)}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 10, color: status.color, marginRight: 8 }}>{status.label}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onTogglePin(p); }}
                    style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "2px 6px", cursor: "pointer", color: T.muted, fontSize: 11 }}>
                    ×
                  </button>
                </div>
              );
            })}
          </>
        )}
        <div style={{ padding: "8px 14px", fontSize: 10, color: T.dim, borderBottom: `1px solid ${T.border}`, borderTop: pinnedPipelines.length ? `1px solid ${T.border}` : "none" }}>
          All Pipelines ({filteredPipelines.length})
        </div>
          {filteredPipelines.slice(0, 50).map((p) => {
           const pinned = pinnedIds.has(String(p.id));
           const pipeline = p;
           const runObj = getPipelineRun(pipeline);
           const status = pipelineStatus(getRunStatusVal(runObj));
          const sel    = selectedPipeline && String(selectedPipeline.id) === String(p.id);
          return (
            <div key={p.id} onClick={() => setSelectedPipeline(p)}
              style={{ display: "flex", alignItems: "center", padding: "8px 14px", cursor: "pointer", borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${sel ? T.amber : "transparent"}`, background: sel ? `${T.amber}08` : "transparent" }}>
              {pinned && <Dot color={status.color} />}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: pinned ? 0 : 12 }}>
                <span style={{ fontSize: 11 }}>{p.name}</span>
                {runObj && (
                  <span style={{ fontSize: 10, color: T.dim }}>
                    {getRunBranch(runObj)} · {timeAgo(runObj.startTime || runObj.queueTime)}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 10, color: T.dim, marginRight: 8 }}>{p._projectName}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin({
                    id: p.id,
                    name: p.name,
                    project: p._projectName || "",
                    folder: p.folder || "",
                    configurationType: p.configuration?.type || "",
                  });
                }}
                style={{ background: pinned ? `${T.amber}18` : "rgba(255,255,255,0.04)", border: `1px solid ${pinned ? T.amber + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 4, padding: "2px 6px", cursor: "pointer", color: pinned ? T.amber : T.dim, fontSize: 10 }}>
                {pinned ? "✓" : "📌"}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const pipelineForDetail = selectedPipeline
    ? { ...selectedPipeline, latestRun: getPipelineRun(selectedPipeline) }
    : null;

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{ width: "40%", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 10, borderBottom: `1px solid ${T.border}` }}>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..."
            style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, outline: "none", color: T.text, padding: "8px 12px", fontSize: 12, boxSizing: "border-box" }} />
        </div>
        {renderList()}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!pipelineForDetail
          ? <div style={{ padding: 20, color: T.dim, textAlign: "center", marginTop: 50 }}>Select a pipeline</div>
          : <ResourceDetail
              client={client}
              resource={{ type: "pipeline", data: pipelineForDetail }}
              org={org}
              collection={pinnedCollection}
              profile={profile}
              onResourceToggle={onResourceToggle}
              onAddComment={onAddComment}
              onSaveLogComments={onSaveLogComments}
              syncStatus={syncStatus}
            />
        }
      </div>
    </div>
  );
}
