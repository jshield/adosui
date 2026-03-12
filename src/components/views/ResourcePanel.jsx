import { useState, useEffect } from "react";
import { T, WI_TYPE_COLOR, WI_TYPE_SHORT, stateColor, isInCollection, pipelineStatus, prStatus, branchName } from "../../lib";
import { Pill, Dot, Spinner, Input, SelectableRow, ToggleBtn } from "../ui";
import { FilterPanel } from "./FilterPanel";

export function ResourcePanel({ client, collection, selectedResource, onSelect, onFilterChange, onWorkItemToggle, onResourceToggle }) {
  const [items, setItems] = useState({ workItems: [], repos: [], pipelines: [], prs: [], serviceConnections: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("workitems");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(collection?.filters || { types: [], states: [], assignee: "", areaPath: "" });

  const repoIds = (collection.repos || []).map(r => r.id);
  const pipelineIds = (collection.pipelines || []).map(p => String(p.id));
  const prIds = collection.prIds || [];
  const serviceConnectionIds = (collection.serviceConnections || []).map(sc => String(sc.id));

  useEffect(() => {
    setLoading(true); setError("");
    const fetchItems = async () => {
      try {
        const promises = [];
        
        if (collection.workItemIds?.length > 0) {
          const ids = collection.workItemIds.map(id => parseInt(id));
          promises.push(client.searchWorkItems("", {}).then(all => all.filter(wi => ids.includes(wi.id))));
        } else if (search || filters.types.length > 0 || filters.states.length > 0 || filters.assignee || filters.areaPath) {
          promises.push(client.searchWorkItems(search, filters));
        } else {
          promises.push(Promise.resolve([]));
        }

        if (repoIds.length > 0) {
          promises.push(client.getAllRepos().then(all => all.filter(r => repoIds.includes(r.id))));
        } else {
          promises.push(Promise.resolve([]));
        }

        if (pipelineIds.length > 0) {
          promises.push(client.getAllPipelines().then(all => all.filter(p => pipelineIds.includes(String(p.id)))));
        } else {
          promises.push(Promise.resolve([]));
        }

        if (prIds.length > 0) {
          promises.push(client.getAllPullRequests().then(all => all.filter(pr => prIds.includes(String(pr.pullRequestId)))));
        } else {
          promises.push(Promise.resolve([]));
        }

        if (serviceConnectionIds.length > 0) {
          promises.push(client.getAllServiceConnections().then(all => all.filter(sc => serviceConnectionIds.includes(String(sc.id)))));
        } else {
          promises.push(Promise.resolve([]));
        }

        const [wi, repos, pipelines, prs, scs] = await Promise.all(promises);
        setItems({ workItems: wi || [], repos: repos || [], pipelines: pipelines || [], prs: prs || [], serviceConnections: scs || [] });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [collection.id, collection.workItemIds, search, filters, repoIds.join(","), pipelineIds.join(","), prIds.join(","), serviceConnectionIds.join(",")]);

  useEffect(() => {
    if (onFilterChange) onFilterChange(filters);
  }, [filters]);

  const hasFilters = filters.types.length > 0 || filters.states.length > 0 || filters.assignee || filters.areaPath;
  const hasSavedItems = collection.workItemIds?.length > 0 || repoIds.length > 0 || pipelineIds.length > 0 || prIds.length > 0 || serviceConnectionIds.length > 0;

  const ORDER = { Epic: 0, Feature: 1, "User Story": 2, Bug: 3, Task: 4 };
  const sortedWorkItems = [...items.workItems].sort((a, b) => (ORDER[a.fields?.["System.WorkItemType"]] ?? 5) - (ORDER[b.fields?.["System.WorkItemType"]] ?? 5));

  const removeFilterType = (type) => {
    setFilters(f => ({ ...f, types: f.types.filter(t => t !== type) }));
  };
  const removeFilterState = (state) => {
    setFilters(f => ({ ...f, states: f.states.filter(s => s !== state) }));
  };

  const tabs = [
    { id: "workitems", label: "Work Items", count: items.workItems.length },
    { id: "repos", label: "Repos", count: items.repos.length },
    { id: "pipelines", label: "Pipelines", count: items.pipelines.length },
    { id: "prs", label: "PRs", count: items.prs.length },
    { id: "serviceconnections", label: "Svc Conn.", count: items.serviceConnections.length },
  ];

  const isSelected = (type, id) => {
    if (!selectedResource) return false;
    if (type === "workitem") return selectedResource.type === "workitem" && selectedResource.data.id === id;
    if (type === "repo") return selectedResource.type === "repo" && selectedResource.data.id === id;
    if (type === "pipeline") return selectedResource.type === "pipeline" && String(selectedResource.data.id) === String(id);
    if (type === "pr") return selectedResource.type === "pr" && String(selectedResource.data.pullRequestId) === String(id);
    if (type === "serviceconnection") return selectedResource.type === "serviceconnection" && String(selectedResource.data.id) === String(id);
    return false;
  };

  const renderWorkItems = () => (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
      {sortedWorkItems.map(wi => {
        const type = wi.fields?.["System.WorkItemType"] || "Task";
        const state = wi.fields?.["System.State"] || "";
        const sel = isSelected("workitem", wi.id);
        return (
          <SelectableRow key={wi.id} sel={sel} selColor={collection.color} onClick={() => onSelect("workitem", wi)}>
            <span style={{ fontSize: 9, color: WI_TYPE_COLOR[type] || T.dim, fontFamily: "'JetBrains Mono'", width: 42, flexShrink: 0 }}>{WI_TYPE_SHORT[type] || type.slice(0,5).toUpperCase()}</span>
            <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", width: 38, flexShrink: 0 }}>#{wi.id}</span>
            <span style={{ flex: 1, fontSize: 12, color: sel ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wi.fields?.["System.Title"]}</span>
            <Pill label={state} color={stateColor(state)} />
            <ToggleBtn added={isInCollection(collection, "workitem", wi.id)} color={collection.color} onClick={(e) => { e.stopPropagation(); onWorkItemToggle(collection.id, wi.id); }} label={isInCollection(collection, "workitem", wi.id) ? "✓" : "+"} />
          </SelectableRow>
        );
      })}
      {!sortedWorkItems.length && !loading && (
        <div style={{ padding: "40px 16px", textAlign: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No work items found</div>
      )}
    </div>
  );

  const renderRepos = () => (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
      {items.repos.map(r => {
        const sel = isSelected("repo", r.id);
        return (
          <SelectableRow key={r.id} sel={sel} selColor={T.cyan} onClick={() => onSelect("repo", r)}>
            <span style={{ fontSize: 12, color: T.cyan, fontFamily: "'JetBrains Mono'", width: 60, flexShrink: 0 }}>repo</span>
            <span style={{ flex: 1, fontSize: 12, color: sel ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
            <ToggleBtn added={isInCollection(collection, "repo", r.id)} color={collection.color} onClick={(e) => { e.stopPropagation(); onResourceToggle("repo", r.id, collection.id); }} label={isInCollection(collection, "repo", r.id) ? "✓" : "+"} />
          </SelectableRow>
        );
      })}
      {!items.repos.length && !loading && (
        <div style={{ padding: "40px 16px", textAlign: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No repositories</div>
      )}
    </div>
  );

  const renderPipelines = () => (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
      {items.pipelines.map(p => {
        const rs = pipelineStatus(p.latestRun?.result || p.latestRun?.state);
        const sel = isSelected("pipeline", p.id);
        return (
          <SelectableRow key={p.id} sel={sel} selColor={rs.color} onClick={() => onSelect("pipeline", p)}>
            <Dot color={rs.color} pulse={rs.label === "running"} />
            <span style={{ flex: 1, fontSize: 12, color: sel ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
            <ToggleBtn added={isInCollection(collection, "pipeline", p.id)} color={collection.color} onClick={(e) => { e.stopPropagation(); onResourceToggle("pipeline", p.id, collection.id); }} label={isInCollection(collection, "pipeline", p.id) ? "✓" : "+"} />
          </SelectableRow>
        );
      })}
      {!items.pipelines.length && !loading && (
        <div style={{ padding: "40px 16px", textAlign: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No pipelines</div>
      )}
    </div>
  );

  const renderPRs = () => (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
      {items.prs.map(pr => {
        const status = prStatus(pr.status);
        const sel = isSelected("pr", pr.pullRequestId);
        return (
          <SelectableRow key={pr.pullRequestId} sel={sel} selColor={status.color} onClick={() => onSelect("pr", pr)}>
            <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", width: 30 }}>#{pr.pullRequestId}</span>
            <span style={{ flex: 1, fontSize: 12, color: sel ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pr.title}</span>
            <ToggleBtn added={isInCollection(collection, "pr", pr.pullRequestId)} color={collection.color} onClick={(e) => { e.stopPropagation(); onResourceToggle("pr", pr.pullRequestId, collection.id); }} label={isInCollection(collection, "pr", pr.pullRequestId) ? "✓" : "+"} />
          </SelectableRow>
        );
      })}
      {!items.prs.length && !loading && (
        <div style={{ padding: "40px 16px", textAlign: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No pull requests</div>
      )}
    </div>
  );

  const renderServiceConnections = () => (
    <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
      {items.serviceConnections.map(sc => {
        const sel = isSelected("serviceconnection", sc.id);
        return (
          <SelectableRow key={sc.id} sel={sel} selColor={T.cyan} onClick={() => onSelect("serviceconnection", sc)}>
            <span style={{ fontSize: 10, color: T.cyan, fontFamily: "'JetBrains Mono'", width: 40, flexShrink: 0 }}>{sc.type?.slice(0, 6) || "svc"}</span>
            <span style={{ flex: 1, fontSize: 12, color: sel ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sc.name}</span>
            <ToggleBtn added={isInCollection(collection, "serviceconnection", sc.id)} color={collection.color} onClick={(e) => { e.stopPropagation(); onResourceToggle("serviceconnection", sc.id, collection.id); }} label={isInCollection(collection, "serviceconnection", sc.id) ? "✓" : "+"} />
          </SelectableRow>
        );
      })}
      {!items.serviceConnections.length && !loading && (
        <div style={{ padding: "40px 16px", textAlign: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No service connections</div>
      )}
    </div>
  );

  return (
    <>
      <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>{collection.icon}</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 18, color: T.text }}>{collection.name}</div>
          </div>
          <Dot color={collection.color} />
          {hasSavedItems && <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>({collection.workItemIds?.length || 0} WI · {repoIds.length} repos · {pipelineIds.length} pipes · {prIds.length} PRs · {serviceConnectionIds.length} SCs)</span>}
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={hasSavedItems ? "Search to add more..." : "Search..."}
            style={{ flex: 1, padding: "7px 11px" }}
          />
          <button onClick={() => setShowFilters(!showFilters)}
            style={{ background: hasFilters ? `${T.amber}18` : "rgba(255,255,255,0.04)", border: `1px solid ${hasFilters ? T.amber + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 5, padding: "7px 10px", cursor: "pointer", color: hasFilters ? T.amber : T.muted, fontSize: 12, fontFamily: "'Barlow'" }}>
            ⚙ Filters {hasFilters && `(${filters.types.length + filters.states.length + (filters.assignee ? 1 : 0) + (filters.areaPath ? 1 : 0)})`}
          </button>
          {showFilters && <FilterPanel filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />}
        </div>
        {hasFilters && activeTab === "workitems" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
            {filters.types.map(t => (
              <span key={t} onClick={() => removeFilterType(t)} style={{ background: `${WI_TYPE_COLOR[t]}18`, color: WI_TYPE_COLOR[t], borderRadius: 3, padding: "2px 6px", fontSize: 9, fontFamily: "'JetBrains Mono'", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {t} ×
              </span>
            ))}
            {filters.states.map(s => (
              <span key={s} onClick={() => removeFilterState(s)} style={{ background: `${stateColor(s)}18`, color: stateColor(s), borderRadius: 3, padding: "2px 6px", fontSize: 9, fontFamily: "'JetBrains Mono'", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {s} ×
              </span>
            ))}
            {filters.assignee && (
              <span onClick={() => setFilters(f => ({ ...f, assignee: "" }))} style={{ background: `${T.violet}18`, color: T.violet, borderRadius: 3, padding: "2px 6px", fontSize: 9, fontFamily: "'JetBrains Mono'", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                @{filters.assignee} ×
              </span>
            )}
            {filters.areaPath && (
              <span onClick={() => setFilters(f => ({ ...f, areaPath: "" }))} style={{ background: `${T.cyan}18`, color: T.cyan, borderRadius: 3, padding: "2px 6px", fontSize: 9, fontFamily: "'JetBrains Mono'", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                {filters.areaPath} ×
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${T.border}`, padding: "0 8px", flexShrink: 0 }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ background: "transparent", border: "none", borderBottom: `2px solid ${activeTab === tab.id ? T.amber : "transparent"}`, color: activeTab === tab.id ? T.text : T.dim, padding: "8px 12px", fontSize: 11, fontFamily: "'Barlow'", fontWeight: 500, cursor: "pointer", marginBottom: -1 }}>
            {tab.label} <span style={{ opacity: 0.6 }}>({tab.count})</span>
          </button>
        ))}
      </div>

      {loading
        ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> loading…</div>
        : activeTab === "workitems"          ? renderWorkItems()
        : activeTab === "repos"             ? renderRepos()
        : activeTab === "pipelines"         ? renderPipelines()
        : activeTab === "prs"               ? renderPRs()
        : activeTab === "serviceconnections" ? renderServiceConnections()
        : null
      }
    </>
  );
}
