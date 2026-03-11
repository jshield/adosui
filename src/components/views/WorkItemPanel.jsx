import { useState, useEffect } from "react";
import { T, WI_TYPE_COLOR, WI_TYPE_SHORT, stateColor, isInCollection } from "../../lib";
import { Pill, Dot, Spinner, Input, SelectableRow, ToggleBtn } from "../ui";
import { FilterPanel } from "./FilterPanel";

export function WorkItemPanel({ client, collection, onSelect, selected, onFilterChange, onWorkItemToggle }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(collection?.filters || { types: [], states: [], assignee: "", areaPath: "" });

  useEffect(() => {
    setLoading(true); setError("");
    const fetchItems = async () => {
      if (collection.workItemIds?.length > 0) {
        const ids = collection.workItemIds.map(id => parseInt(id));
        const result = await client.getWorkItemsByIds(ids);
        setItems(result);
      } else {
        const result = await client.searchWorkItems(search, filters);
        setItems(result);
      }
    };
    fetchItems().catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [collection.id, collection.workItemIds, search, filters]);

  useEffect(() => {
    if (onFilterChange) onFilterChange(filters);
  }, [filters]);

  const hasFilters = filters.types.length > 0 || filters.states.length > 0 || filters.assignee || filters.areaPath;
  const hasSavedItems = collection.workItemIds?.length > 0;

  const ORDER = { Epic: 0, Feature: 1, "User Story": 2, Bug: 3, Task: 4 };
  const sorted = [...items].sort((a, b) => (ORDER[a.fields?.["System.WorkItemType"]] ?? 5) - (ORDER[b.fields?.["System.WorkItemType"]] ?? 5));

  const removeFilterType = (type) => {
    setFilters(f => ({ ...f, types: f.types.filter(t => t !== type) }));
  };
  const removeFilterState = (state) => {
    setFilters(f => ({ ...f, states: f.states.filter(s => s !== state) }));
  };

  return (
    <>
      <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <span style={{ fontSize: 18 }}>{collection.icon}</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 18, color: T.text }}>{collection.name}</div>
          </div>
          <Dot color={collection.color} />
          {hasSavedItems && <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>({collection.workItemIds.length} saved)</span>}
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={hasSavedItems ? "Search to add more..." : "Search work items..."}
            style={{ flex: 1, padding: "7px 11px" }}
          />
          <button onClick={() => setShowFilters(!showFilters)}
            style={{ background: hasFilters ? `${T.amber}18` : "rgba(255,255,255,0.04)", border: `1px solid ${hasFilters ? T.amber + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 5, padding: "7px 10px", cursor: "pointer", color: hasFilters ? T.amber : T.muted, fontSize: 12, fontFamily: "'Barlow'" }}>
            ⚙ Filters {hasFilters && `(${filters.types.length + filters.states.length + (filters.assignee ? 1 : 0) + (filters.areaPath ? 1 : 0)})`}
          </button>
          {showFilters && <FilterPanel filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />}
        </div>
        {hasFilters && (
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

      {loading
        ? <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> loading…</div>
        : <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
            {sorted.map(wi => {
              const type  = wi.fields?.["System.WorkItemType"] || "Task";
              const state = wi.fields?.["System.State"] || "";
              const isSel = selected?.id === wi.id;
              const isInCol = isInCollection(collection, "workitem", wi.id);
              return (
                <SelectableRow key={wi.id} sel={isSel} selColor={collection.color} onClick={() => onSelect(wi)}>
                  <span style={{ fontSize: 9, color: WI_TYPE_COLOR[type] || T.dim, fontFamily: "'JetBrains Mono'", width: 42, flexShrink: 0 }}>{WI_TYPE_SHORT[type] || type.slice(0,5).toUpperCase()}</span>
                  <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", width: 38, flexShrink: 0 }}>#{wi.id}</span>
                  <span style={{ flex: 1, fontSize: 12, color: isSel ? T.text : T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wi.fields?.["System.Title"]}</span>
                  <Pill label={state} color={stateColor(state)} />
                  <ToggleBtn added={isInCol} color={collection.color} onClick={(e) => { e.stopPropagation(); onWorkItemToggle(collection.id, wi.id); }} label={isInCol ? "✓" : "+"} />
                </SelectableRow>
              );
            })}
            {!sorted.length && !loading && (
              <div style={{ padding: "40px 16px", textAlign: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No work items found</div>
            )}
          </div>
      }
    </>
  );
}
