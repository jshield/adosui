import { T, WI_TYPE_COLOR, stateColor, branchName, isInCollection } from "../../lib";
import { Spinner, SectionLabel, SelectableRow, EmptyState } from "../ui";

export function SearchResultsList({ results, searching, searchQuery, collection, selectedResult, onSelect, onWorkItemToggle, onResourceToggle }) {
  if (searching) {
    return <EmptyState icon={<Spinner size={22} />} message="Searching…" />;
  }

  if (!results) {
    return <EmptyState icon="🔍" message="Type to search all resources" />;
  }

  const total = results.workItems.length + results.repos.length + results.pipelines.length + results.prs.length + results.serviceConnections.length + results.wikiPages.length;
  if (total === 0) {
    return <EmptyState icon="∅" message={`No results for "${searchQuery}"`} />;
  }

  const isSelected = (type, id) =>
    selectedResult && selectedResult.type === type &&
    String(selectedResult.item?.id || selectedResult.item?.pullRequestId) === String(id);

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {results.workItems.length > 0 && (
        <>
          <SectionLabel count={results.workItems.length}>WORK ITEMS</SectionLabel>
          {results.workItems.map(wi => {
            const sel     = isSelected("workitem", wi.id);
            const wiType  = wi.fields?.["System.WorkItemType"] || "";
            const wiState = wi.fields?.["System.State"] || "";
            const tc      = WI_TYPE_COLOR[wiType] || T.dim;
            return (
              <SelectableRow key={wi.id} sel={sel} onClick={() => onSelect({ type: "workitem", item: wi })}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: tc, fontFamily: "'JetBrains Mono'", background: `${tc}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>{wiType || "WI"}</span>
                  <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>#{wi.id}</span>
                  <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wi.fields?.["System.Title"]}</span>
                  <span style={{ fontSize: 10, color: stateColor(wiState), fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{wiState}</span>
                </div>
                {collection && (
                  <button
                    onClick={e => { e.stopPropagation(); onWorkItemToggle(collection.id, wi.id); }}
                    style={{ background: isInCollection(collection, "workitem", wi.id) ? `${T.green}22` : "rgba(255,255,255,0.06)", border: `1px solid ${isInCollection(collection, "workitem", wi.id) ? T.green : "rgba(255,255,255,0.12)"}`, borderRadius: 4, color: isInCollection(collection, "workitem", wi.id) ? T.green : T.dim, cursor: "pointer", padding: "2px 8px", fontSize: 11, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}
                  >{isInCollection(collection, "workitem", wi.id) ? "✓" : "+"}</button>
                )}
              </SelectableRow>
            );
          })}
        </>
      )}

      {results.repos.length > 0 && (
        <>
          <SectionLabel count={results.repos.length}>REPOSITORIES</SectionLabel>
          {results.repos.map(r => {
            const sel = isSelected("repo", r.id);
            return (
              <SelectableRow key={r.id} sel={sel} onClick={() => onSelect({ type: "repo", item: r })}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: T.cyan, fontFamily: "'JetBrains Mono'", background: `${T.cyan}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>REPO</span>
                  <span style={{ fontSize: 12, flex: 1, color: T.cyan, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{branchName(r.defaultBranch)}</span>
                </div>
                {collection && (
                  <button
                    onClick={e => { e.stopPropagation(); onResourceToggle("repo", r.id, collection.id); }}
                    style={{ background: isInCollection(collection, "repo", r.id) ? `${T.green}22` : "rgba(255,255,255,0.06)", border: `1px solid ${isInCollection(collection, "repo", r.id) ? T.green : "rgba(255,255,255,0.12)"}`, borderRadius: 4, color: isInCollection(collection, "repo", r.id) ? T.green : T.dim, cursor: "pointer", padding: "2px 8px", fontSize: 11, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}
                  >{isInCollection(collection, "repo", r.id) ? "✓" : "+"}</button>
                )}
              </SelectableRow>
            );
          })}
        </>
      )}

      {results.pipelines.length > 0 && (
        <>
          <SectionLabel count={results.pipelines.length}>PIPELINES</SectionLabel>
          {results.pipelines.map(p => {
            const sel = isSelected("pipeline", p.id);
            return (
              <SelectableRow key={p.id} sel={sel} onClick={() => onSelect({ type: "pipeline", item: p })}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: T.amber, fontFamily: "'JetBrains Mono'", background: `${T.amber}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>PIPE</span>
                  <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{p.folder !== "\\" ? p.folder : ""}</span>
                </div>
                {collection && (
                  <button
                    onClick={e => { e.stopPropagation(); onResourceToggle("pipeline", p.id, collection.id); }}
                    style={{ background: isInCollection(collection, "pipeline", p.id) ? `${T.green}22` : "rgba(255,255,255,0.06)", border: `1px solid ${isInCollection(collection, "pipeline", p.id) ? T.green : "rgba(255,255,255,0.12)"}`, borderRadius: 4, color: isInCollection(collection, "pipeline", p.id) ? T.green : T.dim, cursor: "pointer", padding: "2px 8px", fontSize: 11, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}
                  >{isInCollection(collection, "pipeline", p.id) ? "✓" : "+"}</button>
                )}
              </SelectableRow>
            );
          })}
        </>
      )}

      {results.prs.length > 0 && (
        <>
          <SectionLabel count={results.prs.length}>PULL REQUESTS</SectionLabel>
          {results.prs.map(pr => {
            const sel     = isSelected("pr", pr.pullRequestId);
            const prState = pr.status || "";
            return (
              <SelectableRow key={pr.pullRequestId} sel={sel} onClick={() => onSelect({ type: "pr", item: pr })}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: T.purple, fontFamily: "'JetBrains Mono'", background: `${T.purple}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>PR</span>
                  <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>#{pr.pullRequestId}</span>
                  <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.title}</span>
                  <span style={{ fontSize: 10, color: stateColor(prState), fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{prState}</span>
                </div>
                {collection && (
                  <button
                    onClick={e => { e.stopPropagation(); onResourceToggle("pr", pr.pullRequestId, collection.id); }}
                    style={{ background: isInCollection(collection, "pr", pr.pullRequestId) ? `${T.green}22` : "rgba(255,255,255,0.06)", border: `1px solid ${isInCollection(collection, "pr", pr.pullRequestId) ? T.green : "rgba(255,255,255,0.12)"}`, borderRadius: 4, color: isInCollection(collection, "pr", pr.pullRequestId) ? T.green : T.dim, cursor: "pointer", padding: "2px 8px", fontSize: 11, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}
                  >{isInCollection(collection, "pr", pr.pullRequestId) ? "✓" : "+"}</button>
                )}
              </SelectableRow>
            );
          })}
        </>
      )}

      {results.serviceConnections.length > 0 && (
        <>
          <SectionLabel count={results.serviceConnections.length}>SERVICE CONNECTIONS</SectionLabel>
          {results.serviceConnections.map(sc => {
            const sel = isSelected("serviceconnection", sc.id);
            return (
              <SelectableRow key={sc.id} sel={sel} onClick={() => onSelect({ type: "serviceconnection", item: sc })}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: T.cyan, fontFamily: "'JetBrains Mono'", background: `${T.cyan}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>SVC</span>
                  <span style={{ fontSize: 12, flex: 1, color: T.cyan, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sc.name}</span>
                  <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{sc.type || ""}</span>
                </div>
                {collection && (
                  <button
                    onClick={e => { e.stopPropagation(); onResourceToggle("serviceconnection", sc.id, collection.id); }}
                    style={{ background: isInCollection(collection, "serviceconnection", sc.id) ? `${T.green}22` : "rgba(255,255,255,0.06)", border: `1px solid ${isInCollection(collection, "serviceconnection", sc.id) ? T.green : "rgba(255,255,255,0.12)"}`, borderRadius: 4, color: isInCollection(collection, "serviceconnection", sc.id) ? T.green : T.dim, cursor: "pointer", padding: "2px 8px", fontSize: 11, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}
                  >{isInCollection(collection, "serviceconnection", sc.id) ? "✓" : "+"}</button>
                )}
              </SelectableRow>
            );
          })}
        </>
      )}

      {results.wikiPages.length > 0 && (
        <>
          <SectionLabel count={results.wikiPages.length}>WIKI PAGES</SectionLabel>
          {results.wikiPages.map(wp => {
            const sel = isSelected("wiki", wp.id);
            const displayPath = wp.path || wp.name || "/";
            const wikiLabel = wp._wikiName || wp.wikiName || "";
            return (
              <SelectableRow key={wp.id} sel={sel} onClick={() => onSelect({ type: "wiki", item: wp })}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: T.green, fontFamily: "'JetBrains Mono'", background: `${T.green}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>WIKI</span>
                  <span style={{ fontSize: 12, flex: 1, color: T.green, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayPath}</span>
                  <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{wikiLabel}</span>
                </div>
                {collection && (
                  <button
                    onClick={e => { e.stopPropagation(); onResourceToggle("wiki", wp.id, collection.id, wp); }}
                    style={{ background: isInCollection(collection, "wiki", wp.id) ? `${T.green}22` : "rgba(255,255,255,0.06)", border: `1px solid ${isInCollection(collection, "wiki", wp.id) ? T.green : "rgba(255,255,255,0.12)"}`, borderRadius: 4, color: isInCollection(collection, "wiki", wp.id) ? T.green : T.dim, cursor: "pointer", padding: "2px 8px", fontSize: 11, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}
                  >{isInCollection(collection, "wiki", wp.id) ? "✓" : "+"}</button>
                )}
              </SelectableRow>
            );
          })}
        </>
      )}
    </div>
  );
}
