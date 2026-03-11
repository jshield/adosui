import { useState, useEffect } from "react";
import { T } from "../../lib/theme";
import { Pill, Dot, Spinner } from "../ui";
import { WI_TYPE_COLOR, WI_TYPE_SHORT, stateColor, timeAgo, pipelineStatus } from "../../lib/wiUtils";

export function ResourceDetail({ client, workItem, org, collection, onResourceToggle }) {
  const [repos,     setRepos]     = useState(null);
  const [pipelines, setPipelines] = useState(null);
  const [prs,       setPrs]       = useState(null);
  const [tests,     setTests]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState("details");

  const [selectedRepo,     setSelectedRepo]     = useState(null);
  const [selectedPipeline, setSelectedPipeline] = useState(null);
  const [selectedPR,       setSelectedPR]       = useState(null);
  const [selectedTest,     setSelectedTest]     = useState(null);

  const [repoSearch,     setRepoSearch]     = useState("");
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [prSearch,       setPRSearch]       = useState("");
  const [testSearch,     setTestSearch]     = useState("");

  useEffect(() => {
    setLoading(true);
    setRepos(null); setPipelines(null); setPrs(null); setTests(null);
    setSelectedRepo(null); setSelectedPipeline(null); setSelectedPR(null); setSelectedTest(null);
    Promise.allSettled([
      client.getAllRepos(),
      client.getAllPipelines(),
      client.getAllPullRequests(),
      client.getAllTestRuns(),
    ]).then(([r, p, pr, t]) => {
      setRepos(     r.status  === "fulfilled" ? r.value  : []);
      setPipelines( p.status  === "fulfilled" ? p.value  : []);
      setPrs(       pr.status === "fulfilled" ? pr.value : []);
      setTests(     t.status  === "fulfilled" ? t.value  : []);
      setLoading(false);
    });
  }, [workItem.id]);

  const type     = workItem.fields?.["System.WorkItemType"] || "";
  const state    = workItem.fields?.["System.State"] || "";
  const title    = workItem.fields?.["System.Title"] || "Untitled";
  const areaPath = workItem.fields?.["System.AreaPath"]?.split("\\")[0] || "";

  const tabs = [
    { id: "details",   label: "Details" },
    { id: "repos",     label: "Repositories", count: repos?.length || 0 },
    { id: "pipelines", label: "Pipelines",    count: pipelines?.length || 0 },
    { id: "prs",       label: "Pull Requests", count: prs?.length || 0 },
    { id: "tests",     label: "Test Runs",    count: tests?.length || 0 },
  ];

  const isInCollection = (resourceType, id) => {
    if (!collection) return false;
    if (resourceType === "repo")     return collection.repoIds?.includes(String(id));
    if (resourceType === "pipeline") return collection.pipelineIds?.includes(String(id));
    if (resourceType === "pr")       return collection.prIds?.includes(String(id));
    return false;
  };

  const handleToggle = (resourceType, id) => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle(resourceType, id, collection.id);
  };

  const ToggleBtn = ({ resourceType, id }) => {
    const inCol = isInCollection(resourceType, id);
    return (
      <button onClick={() => handleToggle(resourceType, id)}
        title={inCol ? "Remove from collection" : "Add to collection"}
        style={{ background: inCol ? `${collection.color}18` : "rgba(255,255,255,0.04)", border: `1px solid ${inCol ? collection.color + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 4, padding: "6px 14px", cursor: "pointer", color: inCol ? collection.color : T.muted, fontSize: 12, fontFamily: "'Barlow'", fontWeight: 500 }}>
        {inCol ? "✓ In Collection" : "+ Add to Collection"}
      </button>
    );
  };

  /* ── Details tab ────────────────────────────────────────────── */
  const renderDetailsTab = () => (
    <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
          <Pill label={WI_TYPE_SHORT[type] || type} color={WI_TYPE_COLOR[type] || T.dim} />
          <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{workItem.id}</span>
          <Pill label={state} color={stateColor(state)} />
          {areaPath && <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>↳ {areaPath}</span>}
        </div>
        <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: "#F9FAFB", lineHeight: 1.2, letterSpacing: "0.02em", marginBottom: 8 }}>{title}</div>
        {workItem.fields?.["System.AssignedTo"]?.displayName && (
          <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
            Assigned to {workItem.fields["System.AssignedTo"].displayName} · Changed {timeAgo(workItem.fields["System.ChangedDate"])}
          </div>
        )}
      </div>

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
    </div>
  );

  /* ── Split-pane helper ──────────────────────────────────────── */
  const SplitPane = ({ search, onSearch, placeholder, loading: l, items, renderItem, detail }) => (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <div style={{ width: "45%", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${T.border}` }}>
          <input value={search} onChange={e => onSearch(e.target.value)} placeholder={placeholder}
            style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 5, outline: "none", color: T.text, padding: "8px 12px", fontSize: 12, fontFamily: "'Barlow'", boxSizing: "border-box" }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {l
            ? <div style={{ padding: 20, display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> Loading...</div>
            : items.length
              ? items.map(renderItem)
              : <div style={{ padding: 20, color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>No items</div>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>{detail}</div>
    </div>
  );

  /* ── Repos tab ──────────────────────────────────────────────── */
  const renderReposTab = () => {
    const filtered = (repos || []).filter(r => !repoSearch || r.name?.toLowerCase().includes(repoSearch.toLowerCase()));
    return (
      <SplitPane
        search={repoSearch} onSearch={setRepoSearch} placeholder="Search repositories..."
        loading={loading} items={filtered.slice(0, 20)}
        renderItem={r => {
          const isSel = selectedRepo?.id === r.id;
          return (
            <div key={r.id} onClick={() => setSelectedRepo(r)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer", borderLeft: `2px solid ${isSel ? T.cyan : "transparent"}`, background: isSel ? `${T.cyan}08` : "transparent" }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
              <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'", color: isInCollection("repo", r.id) ? collection?.color : T.cyan }}>{r.name}</span>
            </div>
          );
        }}
        detail={selectedRepo ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: "#F9FAFB", marginBottom: 8 }}>{selectedRepo.name}</div>
              {collection && <ToggleBtn resourceType="repo" id={selectedRepo.id} />}
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              {[
                ["Default Branch", selectedRepo.defaultBranch?.replace("refs/heads/", "") || "main"],
                ["Size", selectedRepo.size ? `${(selectedRepo.size / 1024).toFixed(0)} KB` : "empty"],
                ["URL", selectedRepo.remoteUrl || "—"],
                ["Last Updated", timeAgo(selectedRepo.lastUpdatedTime)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{label}</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'", wordBreak: "break-all", fontSize: 11 }}>{val}</span>
                </div>
              ))}
            </div>
          </>
        ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: T.dim, fontSize: 13, fontFamily: "'Barlow'" }}>Select a repository</div>}
      />
    );
  };

  /* ── Pipelines tab ──────────────────────────────────────────── */
  const renderPipelinesTab = () => {
    const filtered = (pipelines || []).filter(p => !pipelineSearch || p.name?.toLowerCase().includes(pipelineSearch.toLowerCase()));
    return (
      <SplitPane
        search={pipelineSearch} onSearch={setPipelineSearch} placeholder="Search pipelines..."
        loading={loading} items={filtered.slice(0, 20)}
        renderItem={p => {
          const rs = pipelineStatus(p.latestRun?.result || p.latestRun?.state);
          const isSel = selectedPipeline?.id === p.id;
          return (
            <div key={p.id} onClick={() => setSelectedPipeline(p)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer", borderLeft: `2px solid ${isSel ? rs.color : "transparent"}`, background: isSel ? `${rs.color}08` : "transparent" }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
              <Dot color={rs.color} pulse={rs.label === "running"} />
              <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'", color: isInCollection("pipeline", p.id) ? collection?.color : T.text }}>{p.name}</span>
              <Pill label={rs.label} color={rs.color} />
            </div>
          );
        }}
        detail={selectedPipeline ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: "#F9FAFB", marginBottom: 8 }}>{selectedPipeline.name}</div>
              {collection && <ToggleBtn resourceType="pipeline" id={selectedPipeline.id} />}
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              {[
                ["Folder", selectedPipeline.folder || "/"],
                ["Definition ID", String(selectedPipeline.id)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{label}</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{val}</span>
                </div>
              ))}
              <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Last Run</span>
                <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>
                  <Pill label={pipelineStatus(selectedPipeline.latestRun?.result || selectedPipeline.latestRun?.state).label} color={pipelineStatus(selectedPipeline.latestRun?.result || selectedPipeline.latestRun?.state).color} />
                  <span style={{ marginLeft: 8 }}>{timeAgo(selectedPipeline.latestRun?.startTime)}</span>
                </span>
              </div>
            </div>
          </>
        ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: T.dim, fontSize: 13, fontFamily: "'Barlow'" }}>Select a pipeline</div>}
      />
    );
  };

  /* ── PRs tab ────────────────────────────────────────────────── */
  const renderPRsTab = () => {
    const filtered = (prs || []).filter(pr => !prSearch || pr.title?.toLowerCase().includes(prSearch.toLowerCase()) || String(pr.pullRequestId).includes(prSearch));
    const prColor = s => ({ active: T.cyan, completed: T.green, abandoned: T.muted }[s] || T.dim);
    const prLabel = s => ({ active: "open", completed: "merged", abandoned: "closed" }[s] || s);
    return (
      <SplitPane
        search={prSearch} onSearch={setPRSearch} placeholder="Search pull requests..."
        loading={loading} items={filtered.slice(0, 20)}
        renderItem={pr => {
          const isSel = selectedPR?.pullRequestId === pr.pullRequestId;
          const col = prColor(pr.status);
          return (
            <div key={pr.pullRequestId} onClick={() => setSelectedPR(pr)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer", borderLeft: `2px solid ${isSel ? col : "transparent"}`, background: isSel ? `${col}08` : "transparent" }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
              <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", width: 30 }}>#{pr.pullRequestId}</span>
              <span style={{ flex: 1, fontSize: 12, color: isInCollection("pr", pr.pullRequestId) ? collection?.color : T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pr.title}</span>
              <Pill label={prLabel(pr.status)} color={col} />
            </div>
          );
        }}
        detail={selectedPR ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: "#F9FAFB", marginBottom: 8 }}>{selectedPR.title}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Pill label={prLabel(selectedPR.status)} color={prColor(selectedPR.status)} />
                {collection && <ToggleBtn resourceType="pr" id={selectedPR.pullRequestId} />}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              {[
                ["Author",    selectedPR.createdBy?.displayName || "—"],
                ["Source",    selectedPR.sourceRefName?.replace("refs/heads/", "") || "—"],
                ["Target",    selectedPR.targetRefName?.replace("refs/heads/", "") || "—"],
                ["Created",   timeAgo(selectedPR.creationDate)],
                ["Reviewers", String(selectedPR.reviewers?.length || 0)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{label}</span>
                  <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{val}</span>
                </div>
              ))}
              {selectedPR.description && (
                <div style={{ padding: "6px 0", fontSize: 12 }}>
                  <span style={{ display: "block", color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11, marginBottom: 4 }}>Description</span>
                  <div style={{ color: T.text, fontFamily: "'JetBrains Mono'", fontSize: 11, whiteSpace: "pre-wrap", background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 4 }}>{selectedPR.description}</div>
                </div>
              )}
            </div>
          </>
        ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: T.dim, fontSize: 13, fontFamily: "'Barlow'" }}>Select a pull request</div>}
      />
    );
  };

  /* ── Tests tab ──────────────────────────────────────────────── */
  const renderTestsTab = () => {
    const filtered = (tests || []).filter(t => !testSearch || t.name?.toLowerCase().includes(testSearch.toLowerCase()));
    return (
      <SplitPane
        search={testSearch} onSearch={setTestSearch} placeholder="Search test runs..."
        loading={loading} items={filtered.slice(0, 20)}
        renderItem={t => {
          const pass = t.passedTests ?? 0;
          const fail = t.failedTests ?? 0;
          const color = fail > 0 ? T.red : pass > 0 ? T.green : T.dim;
          const isSel = selectedTest?.id === t.id;
          return (
            <div key={t.id} onClick={() => setSelectedTest(t)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer", borderLeft: `2px solid ${isSel ? color : "transparent"}`, background: isSel ? `${color}08` : "transparent" }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
              <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'", flex: 1, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
              <span style={{ fontSize: 10, color: T.green, fontFamily: "'JetBrains Mono'" }}>✓ {pass}</span>
              {fail > 0 && <span style={{ fontSize: 10, color: T.red, fontFamily: "'JetBrains Mono'" }}>✗ {fail}</span>}
            </div>
          );
        }}
        detail={selectedTest ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: "#F9FAFB", marginBottom: 8 }}>{selectedTest.name}</div>
              <Pill label={selectedTest.failedTests > 0 ? "failing" : "passing"} color={selectedTest.failedTests > 0 ? T.red : T.green} />
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              {[
                ["Passed",    String(selectedTest.passedTests ?? 0)],
                ["Failed",    String(selectedTest.failedTests ?? 0)],
                ["Total",     String((selectedTest.passedTests ?? 0) + (selectedTest.failedTests ?? 0))],
                ["Completed", timeAgo(selectedTest.completedDate)],
                ["Run ID",    String(selectedTest.id)],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                  <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{label}</span>
                  <span style={{ flex: 1, color: label === "Passed" ? T.green : label === "Failed" ? T.red : T.text, fontFamily: "'JetBrains Mono'" }}>{val}</span>
                </div>
              ))}
            </div>
          </>
        ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: T.dim, fontSize: 13, fontFamily: "'Barlow'" }}>Select a test run</div>}
      />
    );
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
              <Pill label={WI_TYPE_SHORT[type] || type} color={WI_TYPE_COLOR[type] || T.dim} />
              <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{workItem.id}</span>
              <Pill label={state} color={stateColor(state)} />
              {areaPath && <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>↳ {areaPath}</span>}
            </div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: "#F9FAFB", lineHeight: 1.2, letterSpacing: "0.02em" }}>{title}</div>
          </div>
          <a href={`https://dev.azure.com/${encodeURIComponent(org)}/_workitems/edit/${workItem.id}`}
            target="_blank" rel="noreferrer"
            style={{ background: `${T.amber}12`, border: `1px solid ${T.amber}33`, color: T.amber, padding: "6px 13px", borderRadius: 4, fontSize: 12, fontFamily: "'Barlow'", fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap", marginTop: 2 }}>
            Open in ADO ↗
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}`, padding: "0 24px", background: T.panel, flexShrink: 0 }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ background: "transparent", border: "none", borderBottom: `2px solid ${activeTab === tab.id ? T.amber : "transparent"}`, color: activeTab === tab.id ? T.text : T.dim, padding: "10px 16px", fontSize: 12, fontFamily: "'Barlow'", fontWeight: 500, cursor: "pointer", marginBottom: -1 }}>
            {tab.label} {tab.count > 0 && <span style={{ opacity: 0.6 }}>({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {activeTab === "details"   && renderDetailsTab()}
        {activeTab === "repos"     && renderReposTab()}
        {activeTab === "pipelines" && renderPipelinesTab()}
        {activeTab === "prs"       && renderPRsTab()}
        {activeTab === "tests"     && renderTestsTab()}
      </div>
    </div>
  );
}
