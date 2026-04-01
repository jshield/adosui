import { T, WI_TYPE_COLOR, stateColor, branchName } from "../../lib";
import { Spinner, SectionLabel, SelectableRow, EmptyState, ResourceToggle } from "../ui";

export function SearchResultsList({ results, searching, searchQuery, searchProgress, collection, selectedResult, onSelect, onWorkItemToggle, onResourceToggle }) {
  const total = results ? results.workItems.length + results.repos.length + results.pipelines.length + results.prs.length + results.serviceConnections.length + results.wikiPages.length : 0;
  const progressText = searchProgress && searchProgress.total > 0
    ? `${searchProgress.searched}/${searchProgress.total} projects searched`
    : null;

  if (searching && total === 0) {
    return <EmptyState icon={<Spinner size={22} />} message={progressText || "Searching…"} />;
  }

  if (!searching && !results) {
    return <EmptyState icon="🔍" message="Type to search all resources" />;
  }

  if (!searching && total === 0) {
    return <EmptyState icon="∅" message={`No results for "${searchQuery}"`} />;
  }

  const isSelected = (type, id) =>
    selectedResult && selectedResult.type === type &&
    String(selectedResult.item?.id || selectedResult.item?.pullRequestId) === String(id);

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {searching && progressText && (
        <div style={{ padding: "6px 14px", fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", borderBottom: `1px solid ${T.border}` }}>
          {progressText}
        </div>
      )}
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
                {collection && <ResourceToggle type="workitem" item={wi} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} />}
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
                {collection && <ResourceToggle type="repo" item={r} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} />}
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
                {collection && <ResourceToggle type="pipeline" item={p} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} />}
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
                {collection && <ResourceToggle type="pr" item={pr} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} />}
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
                {collection && <ResourceToggle type="serviceconnection" item={sc} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} />}
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
                {collection && <ResourceToggle type="wiki" item={wp} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} />}
              </SelectableRow>
            );
          })}
        </>
      )}
    </div>
  );
}
