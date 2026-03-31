import { useState, useEffect } from "react";
import { T } from "../../lib/theme";
import { Pill, Dot, Card, Spinner, CommentThread, Spinner as SpinnerUI } from "../ui";
import { WI_TYPE_COLOR, WI_TYPE_SHORT, stateColor, pipelineStatus, prStatus, branchName, getLatestRun, getRunBranch, getRunStatusVal, cache } from "../../lib";

export function CollectionResources({
  client,
  collection,
  profile,
  onWorkItemToggle,
  onResourceToggle,
  onAddComment,       // (collectionId, resourceType, resourceId, text) => void
  onAddCollectionNote, // (collectionId, text) => void
  onProjectChange,     // (collectionId, projects) => void
  syncStatus,
}) {
  const [workItems,  setWorkItems]  = useState([]);
  const [repos,      setRepos]      = useState([]);
  const [pipelines,  setPipelines]  = useState([]);
  const [prs,        setPrs]        = useState([]);
  const [serviceConnections, setServiceConnections] = useState([]);
  const [wikiPages, setWikiPages] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showProjects, setShowProjects] = useState(false);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Derive the repo/pipeline/service connection IDs from the structured objects
  const repoIds     = (collection.repos     || []).map(r => r.id);
  const pipelineIds = (collection.pipelines || []).map(p => String(p.id));
  const prIds       = collection.prIds || [];
  const serviceConnectionIds = (collection.serviceConnections || []).map(sc => String(sc.id));
  const wikiPageIds = (collection.wikiPages || []).map(wp => String(wp.id));

  useEffect(() => {
    setLoading(true);
    const fetchData = async () => {
      const wiPromise = collection.workItemIds?.length > 0
        ? client.getWorkItemsByIds(collection.workItemIds.map(id => parseInt(id)))
        : Promise.resolve([]);

      const reposPromise = repoIds.length > 0
        ? client.getAllRepos().then(all => all.filter(r => repoIds.includes(r.id)))
        : Promise.resolve([]);

      const pipesPromise = pipelineIds.length > 0
        ? client.getAllPipelines().then(all => all.filter(p => pipelineIds.includes(String(p.id))))
        : Promise.resolve([]);

      const prsPromise = prIds.length > 0
        ? client.getAllPullRequests().then(all => all.filter(pr => prIds.includes(String(pr.pullRequestId))))
        : Promise.resolve([]);

      const scsPromise = serviceConnectionIds.length > 0
        ? client.getAllServiceConnections().then(all => all.filter(sc => serviceConnectionIds.includes(String(sc.id))))
        : Promise.resolve([]);

      const wikiPromise = wikiPageIds.length > 0
        ? Promise.resolve(collection.wikiPages || [])
        : Promise.resolve([]);

      const [wi, r, p, pr, scs, wikis] = await Promise.allSettled([wiPromise, reposPromise, pipesPromise, prsPromise, scsPromise, wikiPromise]);
      setWorkItems(         wi.status === "fulfilled" ? wi.value : []);
      setRepos(             r.status  === "fulfilled" ? r.value  : []);
      setPipelines(         p.status  === "fulfilled" ? p.value  : []);
      setPrs(               pr.status === "fulfilled" ? pr.value : []);
      setServiceConnections(scs.status === "fulfilled" ? scs.value : []);
      setWikiPages(         wikis.status === "fulfilled" ? wikis.value : []);
      setLoading(false);
    };
    fetchData();
  }, [collection.id, JSON.stringify(repoIds), JSON.stringify(pipelineIds), JSON.stringify(prIds), JSON.stringify(serviceConnectionIds), JSON.stringify(wikiPageIds), collection.workItemIds?.join(",")]);

  const removeItem = (type, id) => {
    if (type === "workitem") onWorkItemToggle(collection.id, id);
    else onResourceToggle(type, id, collection.id);
  };

  useEffect(() => {
    if (!showProjects || !client) return;
    setLoadingProjects(true);
    client.getProjects()
      .then(ps => setAvailableProjects(ps.map(p => p.name).sort()))
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, [showProjects, client]);

  const toggleProjectScope = (projName) => {
    const current = collection.projects || [];
    const next = current.includes(projName)
      ? current.filter(p => p !== projName)
      : [...current, projName];
    if (onProjectChange) onProjectChange(collection.id, next);
  };

  const RemoveBtn = ({ type, id }) => (
    <button onClick={() => removeItem(type, id)}
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: T.dim, fontSize: 12, flexShrink: 0 }}>
      × Remove
    </button>
  );

  const Group = ({ title, items, renderItem }) => {
    if (!items?.length) return null;
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10, padding: "0 4px" }}>
          {title} ({items.length})
        </div>
        {items.map(renderItem)}
      </div>
    );
  };

  // Lookup comment objects from collection for a given resource type + id
  const getRepoComments     = (id) => (collection.repos     || []).find(r => r.id === String(id))?.comments || [];
  const getPipelineComments = (id) => (collection.pipelines || []).find(p => String(p.id) === String(id))?.comments || [];
  const getServiceConnectionComments = (id) => (collection.serviceConnections || []).find(sc => String(sc.id) === String(id))?.comments || [];

  const empty = workItems.length === 0 && repos.length === 0 && pipelines.length === 0 && prs.length === 0 && serviceConnections.length === 0 && wikiPages.length === 0;
  const authorName = profile?.displayName || "";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>{collection.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading }}>{collection.name}</div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
              {collection.workItemIds?.length || 0} work items · {repoIds.length} repos · {pipelineIds.length} pipelines · {prIds.length} PRs · {serviceConnectionIds.length} SVCs
              {collection.scope && (
                <span style={{ marginLeft: 10, color: collection.scope === "shared" ? T.cyan : T.violet, opacity: 0.7 }}>
                  · {collection.scope}
                </span>
              )}
            </div>
          </div>
          <Dot color={collection.color} />
        </div>

        {/* Collection-level notes thread */}
        {onAddCollectionNote && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <CommentThread
              comments={collection.comments || []}
              onAdd={(text) => onAddCollectionNote(collection.id, text)}
              authorName={authorName}
              disabled={syncStatus === "saving"}
            />
          </div>
        )}

        {/* Project scope editor */}
        {onProjectChange && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Project Scope
              </span>
              <button
                onClick={() => setShowProjects(!showProjects)}
                style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 11, fontFamily: "'JetBrains Mono'", padding: 0 }}
              >
                {showProjects ? "▲ done" : "▼ edit"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: collection.projects?.length ? T.cyan : T.dim, fontFamily: "'JetBrains Mono'" }}>
              {collection.projects?.length
                ? `Scoped to ${collection.projects.length} project${collection.projects.length > 1 ? "s" : ""}`
                : "All projects (unscoped)"}
            </div>
            {collection.projects?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {collection.projects.map(p => (
                  <span key={p} onClick={() => toggleProjectScope(p)}
                    style={{ fontSize: 10, fontFamily: "'JetBrains Mono'", background: `${T.cyan}18`, border: `1px solid ${T.cyan}44`, color: T.cyan, borderRadius: 3, padding: "2px 7px", cursor: "pointer" }}>
                    {p} ×
                  </span>
                ))}
              </div>
            )}
            {showProjects && (
              <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, padding: 4, marginTop: 8 }}>
                {loadingProjects ? (
                  <div style={{ padding: 12, textAlign: "center" }}><Spinner size={14} /></div>
                ) : (
                  availableProjects.map(p => {
                    const sel = (collection.projects || []).includes(p);
                    return (
                      <div key={p} onClick={() => toggleProjectScope(p)}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", borderRadius: 4, cursor: "pointer", background: sel ? `${T.cyan}12` : "transparent" }}>
                        <span style={{ fontSize: 11, color: sel ? T.cyan : T.dim, width: 14 }}>{sel ? "✓" : ""}</span>
                        <span style={{ fontSize: 12, color: sel ? T.text : T.muted }}>{p}</span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {loading ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}><Spinner /> Loading...</div>
        ) : (
          <>
            <Group title="Work Items" items={workItems} renderItem={wi => {
              const wiType  = wi.fields?.["System.WorkItemType"] || "Task";
              const wiState = wi.fields?.["System.State"] || "";
              return (
                <div key={wi.id} style={{ marginBottom: 8 }}>
                  <Card accent={WI_TYPE_COLOR[wiType] || T.dim}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <Pill label={WI_TYPE_SHORT[wiType] || wiType} color={WI_TYPE_COLOR[wiType] || T.dim} />
                          <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{wi.id}</span>
                          <Pill label={wiState} color={stateColor(wiState)} />
                        </div>
                        <div style={{ fontSize: 13, color: T.text }}>{wi.fields?.["System.Title"]}</div>
                      </div>
                      <RemoveBtn type="workitem" id={wi.id} />
                    </div>
                  </Card>
                </div>
              );
            }} />

            <Group title="Repositories" items={repos} renderItem={r => (
              <div key={r.id} style={{ marginBottom: 8 }}>
                <Card accent={T.cyan}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.cyan }}>{r.name}</span>
                      <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginLeft: 8 }}>/{branchName(r.defaultBranch) || "main"}</span>
                      {onAddComment && (
                        <CommentThread
                          comments={getRepoComments(r.id)}
                          onAdd={(text) => onAddComment(collection.id, "repo", r.id, text)}
                          authorName={authorName}
                          disabled={syncStatus === "saving"}
                        />
                      )}
                    </div>
                    <RemoveBtn type="repo" id={r.id} />
                  </div>
                </Card>
              </div>
            )} />

            <Group title="Pipelines" items={pipelines} renderItem={p => {
              const runObj = getLatestRun((cache.get(`project:${p._projectName}:pipelineRuns`) || {})[String(p.id)] || p.latestRun || null) || null;
              const rs = pipelineStatus(getRunStatusVal(runObj));
              const branch = getRunBranch(runObj) || branchName(p.latestRun?.sourceBranch || p.latestRun?.sourceRefName || p.latestRun?.repository?.refName) || "";
              return (
                <div key={p.id} style={{ marginBottom: 8 }}>
                  <Card accent={rs.color}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Dot color={rs.color} pulse={rs.label === "running"} />
                          <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.text }}>{p.name}</span>
                          <Pill label={rs.label} color={rs.color} />
                        </div>
                        <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginTop: 6 }}>{branch}</div>
                        {onAddComment && (
                          <CommentThread
                            comments={getPipelineComments(p.id)}
                            onAdd={(text) => onAddComment(collection.id, "pipeline", p.id, text)}
                            authorName={authorName}
                            disabled={syncStatus === "saving"}
                          />
                        )}
                      </div>
                      <RemoveBtn type="pipeline" id={p.id} />
                    </div>
                  </Card>
                </div>
              );
            }} />

            <Group title="Pull Requests" items={prs} renderItem={pr => {
              const status = prStatus(pr.status);
              return (
                <div key={pr.pullRequestId} style={{ marginBottom: 8 }}>
                  <Card accent={status.color}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div>
                          <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{pr.pullRequestId} </span>
                          <span style={{ fontSize: 13, color: T.text }}>{pr.title}</span>
                        </div>
                        <div style={{ marginTop: 4, display: "flex", gap: 12, fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                          <span>{pr.createdBy?.displayName}</span>
                          <span>→ {branchName(pr.targetRefName)}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Pill label={status.label} color={status.color} />
                        <RemoveBtn type="pr" id={pr.pullRequestId} />
                      </div>
                    </div>
                  </Card>
                </div>
              );
            }} />

            <Group title="Service Connections" items={serviceConnections} renderItem={sc => (
              <div key={sc.id} style={{ marginBottom: 8 }}>
                <Card accent={T.cyan}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.text }}>{sc.name}</span>
                        <Pill label={sc.type || "service"} color={T.cyan} />
                      </div>
                      {sc.description && (
                        <div style={{ marginTop: 4, fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>{sc.description}</div>
                      )}
                      {onAddComment && (
                        <CommentThread
                          comments={getServiceConnectionComments(sc.id)}
                          onAdd={(text) => onAddComment(collection.id, "serviceconnection", sc.id, text)}
                          authorName={authorName}
                          disabled={syncStatus === "saving"}
                        />
                      )}
                    </div>
                    <RemoveBtn type="serviceconnection" id={sc.id} />
                  </div>
                </Card>
              </div>
            )
          }/>

            <Group title="Wiki Pages" items={wikiPages} renderItem={wp => {
              const path = wp.path || wp.name || "/";
              return (
                <div key={wp.id} style={{ marginBottom: 8 }}>
                  <Card accent={T.green}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.text }}>{path}</span>
                          {wp.wikiName && <Pill label={wp.wikiName} color={T.green} />}
                        </div>
                        {onAddComment && (
                          <CommentThread
                            comments={(collection.wikiPages || []).find(wpItem => String(wpItem.id) === String(wp.id))?.comments || []}
                            onAdd={(text) => onAddComment(collection.id, "wiki", wp.id, text)}
                            authorName={authorName}
                            disabled={syncStatus === "saving"}
                          />
                        )}
                      </div>
                      <RemoveBtn type="wiki" id={wp.id} />
                    </div>
                  </Card>
                </div>
              );
            }} />

            {empty && (
              <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'", textAlign: "center", padding: 40 }}>
                No items in this collection.<br />Search for resources to add them.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
