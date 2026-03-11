import { useState, useCallback, useEffect } from "react";
import { T } from "../../lib/theme";
import { Dot, SelectableRow, Field } from "../ui";
import { timeAgo, pipelineStatus, branchName, pipelineUrl } from "../../lib";

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
export function PipelinesView({ client, org, pinnedCollection, onTogglePin }) {
  // Derive the pinned list from the collection's pipelines array
  const pinnedPipelines = pinnedCollection?.pipelines || [];

  const [allPipelines, setAllPipelines] = useState([]);
  const [pipelineRuns, setPipelineRuns] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPipeline, setSelectedPipeline] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

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
    const runsMap = {};
    try {
      await Promise.all(
        pinnedPipelines.map(async (p) => {
          try {
            const pipeline = allPipelines.find(pl => String(pl.id) === String(p.id));
            const configType  = p.configurationType || pipeline?.configuration?.type;
            const projectName = p.project || pipeline?._projectName;

            if (!projectName) { runsMap[p.id] = null; return; }

            let runs = [];
            if (configType === "yaml") {
              runs = await client.getPipelineRuns(projectName, p.id);
            } else {
              runs = await client.getBuildRuns(projectName, p.id);
            }
            runsMap[p.id] = runs[0] || null;
          } catch {
            runsMap[p.id] = null;
          }
        })
      );
      setPipelineRuns(runsMap);
    } catch (e) {
      console.error("Failed to fetch runs:", e);
    } finally {
      setRefreshing(false);
    }
  }, [client, pinnedPipelines, allPipelines]);

  useEffect(() => { fetchPipelines(); }, [fetchPipelines]);

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

  const getPipelineRun = (pipeline) => pipelineRuns[String(pipeline.id)] || pipeline.latestRun || null;

  const renderList = () => {
    if (loading) return <div style={{ padding: 20, color: T.dim }}>Loading...</div>;
    return (
      <div style={{ flex: 1, overflowY: "auto" }}>
        {pinnedPipelines.length > 0 && (
          <>
            <div style={{ padding: "8px 14px", fontSize: 10, color: T.amber, background: "rgba(245,158,11,0.05)", borderBottom: `1px solid ${T.border}` }}>
              Pinned ({pinnedPipelines.length})
              <button onClick={fetchRuns} disabled={refreshing} style={{ background: "none", border: "none", color: T.cyan, cursor: "pointer", float: "right" }}>
                {refreshing ? "..." : "↻"}
              </button>
            </div>
            {pinnedPipelines.map((p) => {
              const run    = pipelineRuns[p.id];
              const status = pipelineStatus(run);
              const sel    = selectedPipeline && String(selectedPipeline.id) === String(p.id);
              return (
                <div key={p.id}
                  onClick={() => setSelectedPipeline(allPipelines.find(x => String(x.id) === String(p.id)) || p)}
                  style={{ display: "flex", alignItems: "center", padding: "8px 14px", cursor: "pointer", borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${sel ? T.amber : "transparent"}`, background: sel ? `${T.amber}08` : "transparent" }}>
                  <Dot color={status.color} pulse={status.pulse} />
                  <span style={{ flex: 1, fontSize: 12 }}>{p.name}</span>
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
          const run    = getPipelineRun(p);
          const status = pipelineStatus(run);
          const sel    = selectedPipeline && String(selectedPipeline.id) === String(p.id);
          return (
            <div key={p.id} onClick={() => setSelectedPipeline(p)}
              style={{ display: "flex", alignItems: "center", padding: "8px 14px", cursor: "pointer", borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${sel ? T.amber : "transparent"}`, background: sel ? `${T.amber}08` : "transparent" }}>
              {pinned && <Dot color={status.color} />}
              <span style={{ flex: 1, fontSize: 11, marginLeft: pinned ? 0 : 12 }}>{p.name}</span>
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

  const renderDetail = () => {
    if (!selectedPipeline) return <div style={{ padding: 20, color: T.dim, textAlign: "center", marginTop: 50 }}>Select a pipeline</div>;
    const run     = getPipelineRun(selectedPipeline);
    const status  = pipelineStatus(run);
    const pinned  = pinnedIds.has(String(selectedPipeline.id));
    const projectName = selectedPipeline._projectName
      || pinnedPipelines.find(p => String(p.id) === String(selectedPipeline.id))?.project;
    return (
      <div style={{ padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{selectedPipeline.name}</div>
          <div style={{ fontSize: 11, color: T.dim }}>{projectName}</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => onTogglePin({
              id: selectedPipeline.id,
              name: selectedPipeline.name,
              project: projectName || "",
              folder: selectedPipeline.folder || "",
              configurationType: selectedPipeline.configuration?.type || "",
            })}
            style={{ background: pinned ? `${T.amber}22` : "rgba(255,255,255,0.06)", border: `1px solid ${pinned ? T.amber + "44" : "rgba(255,255,255,0.15)"}`, borderRadius: 5, padding: "8px 16px", cursor: "pointer", color: pinned ? T.amber : T.muted, marginRight: 8 }}>
            {pinned ? "✓ Pinned" : "📌 Pin"}
          </button>
          {org && projectName && (
            <a href={`https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(projectName)}/_build?definitionId=${selectedPipeline.id}`} target="_blank" rel="noopener"
              style={{ background: `${T.amber}12`, border: `1px solid ${T.amber}33`, color: T.amber, padding: "7px 13px", borderRadius: 4, textDecoration: "none", fontSize: 12 }}>
              Open in ADO ↗
            </a>
          )}
        </div>
        {run && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
            <div style={{ fontSize: 10, color: T.dim, marginBottom: 12, textTransform: "uppercase" }}>Latest Run</div>
            {[
              ["Status",  <span style={{ color: status.color }}>{status.label}</span>],
              ["ID",      run.id],
              ["Started", run.startTime ? new Date(run.startTime).toLocaleString() : "-"],
              ["Branch",  branchName(run.sourceBranch) || "-"],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                <span style={{ width: 80, color: T.dim }}>{label}</span>
                <span>{val}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 16 }}>
          <div style={{ fontSize: 10, color: T.dim, marginBottom: 12, textTransform: "uppercase" }}>Definition</div>
          {[
            ["ID", selectedPipeline.id],
            ...(selectedPipeline.folder && selectedPipeline.folder !== "\\" ? [["Folder", selectedPipeline.folder]] : []),
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ width: 80, color: T.dim }}>{label}</span>
              <span>{val}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{ width: "40%", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 10, borderBottom: `1px solid ${T.border}` }}>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..."
            style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, outline: "none", color: T.text, padding: "8px 12px", fontSize: 12, boxSizing: "border-box" }} />
        </div>
        {renderList()}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>{renderDetail()}</div>
    </div>
  );
}
