import { useState, useEffect } from "react";
import { T } from "../../lib/theme";
import { Pill, Dot, Card, Spinner } from "../ui";
import { WI_TYPE_COLOR, WI_TYPE_SHORT, stateColor, pipelineStatus } from "../../lib/wiUtils";

export function CollectionResources({ client, collection, onWorkItemToggle, onResourceToggle }) {
  const [workItems,  setWorkItems]  = useState([]);
  const [repos,      setRepos]      = useState([]);
  const [pipelines,  setPipelines]  = useState([]);
  const [prs,        setPrs]        = useState([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetchData = async () => {
      const wiPromise = collection.workItemIds?.length > 0
        ? client.getWorkItemsByIds(collection.workItemIds.map(id => parseInt(id)))
        : Promise.resolve([]);

      const reposPromise = collection.repoIds?.length > 0
        ? client.getAllRepos().then(all => all.filter(r => collection.repoIds.includes(r.id)))
        : Promise.resolve([]);

      const pipesPromise = collection.pipelineIds?.length > 0
        ? client.getAllPipelines().then(all => all.filter(p => collection.pipelineIds.includes(String(p.id))))
        : Promise.resolve([]);

      const prsPromise = collection.prIds?.length > 0
        ? client.getAllPullRequests().then(all => all.filter(pr => collection.prIds.includes(String(pr.pullRequestId))))
        : Promise.resolve([]);

      const [wi, r, p, pr] = await Promise.allSettled([wiPromise, reposPromise, pipesPromise, prsPromise]);
      setWorkItems( wi.status === "fulfilled" ? wi.value : []);
      setRepos(     r.status  === "fulfilled" ? r.value  : []);
      setPipelines( p.status  === "fulfilled" ? p.value  : []);
      setPrs(       pr.status === "fulfilled" ? pr.value : []);
      setLoading(false);
    };
    fetchData();
  }, [collection.id, collection.workItemIds, collection.repoIds, collection.pipelineIds, collection.prIds]);

  const removeItem = (type, id) => {
    if (type === "workitem") onWorkItemToggle(collection.id, id);
    else onResourceToggle(type, id, collection.id);
  };

  const RemoveBtn = ({ type, id }) => (
    <button onClick={() => removeItem(type, id)}
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: T.dim, fontSize: 12 }}>
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

  const empty = workItems.length === 0 && repos.length === 0 && pipelines.length === 0 && prs.length === 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>{collection.icon}</span>
          <div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: "#F9FAFB" }}>{collection.name}</div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
              {collection.workItemIds?.length || 0} work items · {collection.repoIds?.length || 0} repos · {collection.pipelineIds?.length || 0} pipelines · {collection.prIds?.length || 0} PRs
            </div>
          </div>
          <Dot color={collection.color} />
        </div>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.cyan }}>{r.name}</span>
                      <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginLeft: 8 }}>/{r.defaultBranch?.replace("refs/heads/", "") || "main"}</span>
                    </div>
                    <RemoveBtn type="repo" id={r.id} />
                  </div>
                </Card>
              </div>
            )} />

            <Group title="Pipelines" items={pipelines} renderItem={p => {
              const rs = pipelineStatus(p.latestRun?.result || p.latestRun?.state);
              return (
                <div key={p.id} style={{ marginBottom: 8 }}>
                  <Card accent={rs.color}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Dot color={rs.color} pulse={rs.label === "running"} />
                        <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono'", color: T.text }}>{p.name}</span>
                        <Pill label={rs.label} color={rs.color} />
                      </div>
                      <RemoveBtn type="pipeline" id={p.id} />
                    </div>
                  </Card>
                </div>
              );
            }} />

            <Group title="Pull Requests" items={prs} renderItem={pr => {
              const prColor = { active: T.cyan, completed: T.green, abandoned: T.muted }[pr.status] || T.dim;
              const prLabel = { active: "open", completed: "merged", abandoned: "closed" }[pr.status] || pr.status;
              return (
                <div key={pr.pullRequestId} style={{ marginBottom: 8 }}>
                  <Card accent={prColor}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div>
                          <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{pr.pullRequestId} </span>
                          <span style={{ fontSize: 13, color: T.text }}>{pr.title}</span>
                        </div>
                        <div style={{ marginTop: 4, display: "flex", gap: 12, fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                          <span>{pr.createdBy?.displayName}</span>
                          <span>→ {pr.targetRefName?.replace("refs/heads/", "")}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Pill label={prLabel} color={prColor} />
                        <RemoveBtn type="pr" id={pr.pullRequestId} />
                      </div>
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
