import { useState, useEffect } from "react";
import { T } from "../../lib/theme";
import { Pill, Dot, Spinner, SelectableRow, Field, AdoLink, ToggleBtn, CommentThread } from "../ui";
import { WI_TYPE_COLOR, WI_TYPE_SHORT, stateColor, timeAgo, pipelineStatus, isInCollection, prStatus, branchName, workItemUrl } from "../../lib";

export function ResourceDetail({ client, workItem, org, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  const [repos,         setRepos]         = useState(null);
  const [pipelines,     setPipelines]     = useState(null);
  const [prs,           setPrs]           = useState(null);
  const [tests,         setTests]         = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState("details");
  const [wiComments,    setWiComments]    = useState([]);
  const [wiCommentsLoading, setWiCommentsLoading] = useState(false);

  const [selectedRepo,     setSelectedRepo]     = useState(null);
  const [selectedPipeline, setSelectedPipeline] = useState(null);
  const [selectedPR,       setSelectedPR]       = useState(null);
  const [selectedTest,     setSelectedTest]     = useState(null);

  const [repoSearch,     setRepoSearch]     = useState("");
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [prSearch,       setPRSearch]       = useState("");
  const [testSearch,     setTestSearch]     = useState("");

  const type     = workItem.fields?.["System.WorkItemType"] || "";
  const state    = workItem.fields?.["System.State"] || "";
  const title    = workItem.fields?.["System.Title"] || "Untitled";
  const areaPath = workItem.fields?.["System.AreaPath"]?.split("\\")[0] || "";
  const project  = workItem.fields?.["System.TeamProject"] || areaPath;
  const projectId = client._projects?.find(p => p.name === project)?.id || project;

  useEffect(() => {
    if (activeTab === "details" && projectId) {
      setWiCommentsLoading(true);
      client.getWorkItemComments(workItem.id, projectId)
        .then(setWiComments)
        .catch(() => setWiComments([]))
        .finally(() => setWiCommentsLoading(false));
    }
  }, [workItem.id, activeTab, projectId]);

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

  const tabs = [
    { id: "details",   label: "Details" },
    { id: "repos",     label: "Repositories", count: repos?.length || 0 },
    { id: "pipelines", label: "Pipelines",    count: pipelines?.length || 0 },
    { id: "prs",       label: "Pull Requests", count: prs?.length || 0 },
    { id: "tests",     label: "Test Runs",    count: tests?.length || 0 },
  ];

  const handleToggle = (resourceType, id) => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle(resourceType, id, collection.id);
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
        <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading, lineHeight: 1.2, letterSpacing: "0.02em", marginBottom: 8 }}>{title}</div>
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

      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16, marginTop: 16 }}>
        <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Comments</div>
        {!projectId ? (
          <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>Project not available</div>
        ) : wiCommentsLoading ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> Loading...</div>
        ) : (
          <CommentThread
            comments={wiComments.map(c => ({
              author: c.createdBy?.displayName || "Unknown",
              createdAt: c.createdDate,
              text: c.text || "",
            }))}
            onAdd={async (text) => {
              await client.addWorkItemComment(workItem.id, text, projectId);
              const updated = await client.getWorkItemComments(workItem.id, projectId);
              setWiComments(updated);
            }}
            authorName={profile?.displayName || ""}
            disabled={syncStatus === "saving"}
          />
        )}
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
              <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'", color: isInCollection(collection, "repo", r.id) ? collection?.color : T.cyan }}>{r.name}</span>
            </div>
          );
        }}
        detail={selectedRepo ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: T.heading, marginBottom: 8 }}>{selectedRepo.name}</div>
              {collection && <ToggleBtn added={isInCollection(collection, "repo", selectedRepo.id)} color={collection.color} onClick={() => handleToggle("repo", selectedRepo.id)} />}
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              {[
                ["Default Branch", branchName(selectedRepo.defaultBranch) || "main"],
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
            {collection && onAddComment && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                <CommentThread
                  comments={(collection.repos || []).find(r => r.id === selectedRepo.id)?.comments || []}
                  onAdd={(text) => onAddComment(collection.id, "repo", selectedRepo.id, text)}
                  authorName={profile?.displayName || ""}
                  disabled={syncStatus === "saving"}
                />
              </div>
            )}
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
              <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono'", color: isInCollection(collection, "pipeline", p.id) ? collection?.color : T.text }}>{p.name}</span>
              <Pill label={rs.label} color={rs.color} />
            </div>
          );
        }}
        detail={selectedPipeline ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: T.heading, marginBottom: 8 }}>{selectedPipeline.name}</div>
              {collection && <ToggleBtn added={isInCollection(collection, "pipeline", selectedPipeline.id)} color={collection.color} onClick={() => handleToggle("pipeline", selectedPipeline.id)} />}
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
            {collection && onAddComment && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                <CommentThread
                  comments={(collection.pipelines || []).find(p => String(p.id) === String(selectedPipeline.id))?.comments || []}
                  onAdd={(text) => onAddComment(collection.id, "pipeline", selectedPipeline.id, text)}
                  authorName={profile?.displayName || ""}
                  disabled={syncStatus === "saving"}
                />
              </div>
            )}
          </>
        ) : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: T.dim, fontSize: 13, fontFamily: "'Barlow'" }}>Select a pipeline</div>}
      />
    );
  };

  /* ── PRs tab ────────────────────────────────────────────────── */
  const renderPRsTab = () => {
    const filtered = (prs || []).filter(pr => !prSearch || pr.title?.toLowerCase().includes(prSearch.toLowerCase()) || String(pr.pullRequestId).includes(prSearch));
    return (
      <SplitPane
        search={prSearch} onSearch={setPRSearch} placeholder="Search pull requests..."
        loading={loading} items={filtered.slice(0, 20)}
        renderItem={pr => {
          const isSel = selectedPR?.pullRequestId === pr.pullRequestId;
          const status = prStatus(pr.status);
          return (
            <div key={pr.pullRequestId} onClick={() => setSelectedPR(pr)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: "pointer", borderLeft: `2px solid ${isSel ? status.color : "transparent"}`, background: isSel ? `${status.color}08` : "transparent" }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
              <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", width: 30 }}>#{pr.pullRequestId}</span>
              <span style={{ flex: 1, fontSize: 12, color: isInCollection(collection, "pr", pr.pullRequestId) ? collection?.color : T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pr.title}</span>
              <Pill label={status.label} color={status.color} />
            </div>
          );
        }}
        detail={selectedPR ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: T.heading, marginBottom: 8 }}>{selectedPR.title}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Pill label={prStatus(selectedPR.status).label} color={prStatus(selectedPR.status).color} />
                {collection && <ToggleBtn added={isInCollection(collection, "pr", selectedPR.pullRequestId)} onClick={() => handleToggle("pr", selectedPR.pullRequestId)} />}
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              {[
                ["Author",    selectedPR.createdBy?.displayName || "—"],
                ["Source",    branchName(selectedPR.sourceRefName) || "—"],
                ["Target",    branchName(selectedPR.targetRefName) || "—"],
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
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 20, color: T.heading, marginBottom: 8 }}>{selectedTest.name}</div>
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
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading, lineHeight: 1.2, letterSpacing: "0.02em" }}>{title}</div>
          </div>
            <AdoLink href={workItemUrl(org, workItem.id)} />
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
