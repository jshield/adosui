import { T } from "../../lib/theme";
import { Spinner } from "../ui";

export function SearchResultsList({ results, searching, searchQuery, collection, selectedResult, onSelect, onWorkItemToggle, onResourceToggle }) {
  if (searching) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: T.dim }}>
        <Spinner size={22} />
        <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'" }}>Searching…</span>
      </div>
    );
  }

  if (!results) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: T.dim }}>
        <span style={{ fontSize: 28 }}>🔍</span>
        <span style={{ fontSize: 13, fontFamily: "'Barlow Condensed'", letterSpacing: "0.05em" }}>Type to search all resources</span>
      </div>
    );
  }

  const total = results.workItems.length + results.repos.length + results.pipelines.length + results.prs.length;
  if (total === 0) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: T.dim }}>
        <span style={{ fontSize: 26 }}>∅</span>
        <span style={{ fontSize: 13, fontFamily: "'Barlow Condensed'", letterSpacing: "0.05em" }}>No results for "{searchQuery}"</span>
      </div>
    );
  }

  const isSelected = (type, id) =>
    selectedResult && selectedResult.type === type &&
    String(selectedResult.item?.id || selectedResult.item?.pullRequestId) === String(id);

  const inCol = (type, id) => {
    if (!collection) return false;
    if (type === "workitem") return (collection.workItemIds || []).includes(String(id));
    if (type === "repo")     return (collection.repoIds || []).includes(String(id));
    if (type === "pipeline") return (collection.pipelineIds || []).includes(String(id));
    if (type === "pr")       return (collection.prIds || []).includes(String(id));
    return false;
  };

  const ToggleBtn = ({ type, id }) => {
    if (!collection) return null;
    const added = inCol(type, id);
    return (
      <button
        onClick={e => {
          e.stopPropagation();
          if (type === "workitem") onWorkItemToggle(collection.id, id);
          else onResourceToggle(type, id, collection.id);
        }}
        title={added ? "Remove from collection" : "Add to collection"}
        style={{ background: added ? `${T.green}22` : "rgba(255,255,255,0.06)", border: `1px solid ${added ? T.green : "rgba(255,255,255,0.12)"}`, borderRadius: 4, color: added ? T.green : T.dim, cursor: "pointer", padding: "2px 8px", fontSize: 11, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}
      >{added ? "✓" : "+"}</button>
    );
  };

  const SectionHeader = ({ label, count }) => (
    <div style={{ padding: "10px 14px 6px", fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", letterSpacing: "0.12em", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span>{label}</span><span style={{ color: T.dimmer }}>{count}</span>
    </div>
  );

  const Row = ({ sel, children }) => (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", cursor: "pointer", borderBottom: `1px solid ${T.border}`, borderLeft: `3px solid ${sel ? T.amber : "transparent"}`, background: sel ? "rgba(245,158,11,0.07)" : "transparent", transition: "background 0.1s" }}
      onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
      onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </div>
  );

  const wiTypeColor = t => {
    if (!t) return T.dim;
    const s = t.toLowerCase();
    if (s.includes("bug"))     return T.red;
    if (s.includes("epic"))    return T.amber;
    if (s.includes("feature")) return T.purple;
    return T.blue;
  };

  const wiStateColor = s => {
    if (!s) return T.dim;
    const l = s.toLowerCase();
    if (l === "done" || l === "closed" || l === "resolved") return T.green;
    if (l === "active" || l === "in progress") return T.blue;
    return T.muted;
  };

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {results.workItems.length > 0 && (
        <>
          <SectionHeader label="WORK ITEMS" count={results.workItems.length} />
          {results.workItems.map(wi => {
            const sel     = isSelected("workitem", wi.id);
            const wiType  = wi.fields?.["System.WorkItemType"] || "";
            const wiState = wi.fields?.["System.State"] || "";
            const tc      = wiTypeColor(wiType);
            return (
              <Row key={wi.id} sel={sel}>
                <div onClick={() => onSelect({ type: "workitem", item: wi })} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: tc, fontFamily: "'JetBrains Mono'", background: `${tc}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>{wiType || "WI"}</span>
                  <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>#{wi.id}</span>
                  <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wi.fields?.["System.Title"]}</span>
                  <span style={{ fontSize: 10, color: wiStateColor(wiState), fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{wiState}</span>
                </div>
                <ToggleBtn type="workitem" id={wi.id} />
              </Row>
            );
          })}
        </>
      )}

      {results.repos.length > 0 && (
        <>
          <SectionHeader label="REPOSITORIES" count={results.repos.length} />
          {results.repos.map(r => {
            const sel = isSelected("repo", r.id);
            return (
              <Row key={r.id} sel={sel}>
                <div onClick={() => onSelect({ type: "repo", item: r })} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: T.cyan, fontFamily: "'JetBrains Mono'", background: `${T.cyan}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>REPO</span>
                  <span style={{ fontSize: 12, flex: 1, color: T.cyan, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{r.defaultBranch?.replace("refs/heads/", "")}</span>
                </div>
                <ToggleBtn type="repo" id={r.id} />
              </Row>
            );
          })}
        </>
      )}

      {results.pipelines.length > 0 && (
        <>
          <SectionHeader label="PIPELINES" count={results.pipelines.length} />
          {results.pipelines.map(p => {
            const sel = isSelected("pipeline", p.id);
            return (
              <Row key={p.id} sel={sel}>
                <div onClick={() => onSelect({ type: "pipeline", item: p })} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: T.amber, fontFamily: "'JetBrains Mono'", background: `${T.amber}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>PIPE</span>
                  <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{p.folder !== "\\" ? p.folder : ""}</span>
                </div>
                <ToggleBtn type="pipeline" id={p.id} />
              </Row>
            );
          })}
        </>
      )}

      {results.prs.length > 0 && (
        <>
          <SectionHeader label="PULL REQUESTS" count={results.prs.length} />
          {results.prs.map(pr => {
            const sel     = isSelected("pr", pr.pullRequestId);
            const prState = pr.status || "";
            return (
              <Row key={pr.pullRequestId} sel={sel}>
                <div onClick={() => onSelect({ type: "pr", item: pr })} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: T.purple, fontFamily: "'JetBrains Mono'", background: `${T.purple}22`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>PR</span>
                  <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>#{pr.pullRequestId}</span>
                  <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pr.title}</span>
                  <span style={{ fontSize: 10, color: wiStateColor(prState), fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{prState}</span>
                </div>
                <ToggleBtn type="pr" id={pr.pullRequestId} />
              </Row>
            );
          })}
        </>
      )}
    </div>
  );
}
