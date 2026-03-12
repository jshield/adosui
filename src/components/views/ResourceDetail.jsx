import { useState, useEffect } from "react";
import { T } from "../../lib/theme";
import { Pill, Dot, Spinner, Field, AdoLink, ToggleBtn, CommentThread } from "../ui";
import { WI_TYPE_COLOR, WI_TYPE_SHORT, stateColor, timeAgo, pipelineStatus, isInCollection, prStatus, branchName, workItemUrl, serviceConnectionUrl } from "../../lib";

export function ResourceDetail({ client, resource, org, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  const { type, data } = resource;

  if (type === "workitem") {
    return <WorkItemDetail client={client} workItem={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }
  if (type === "repo") {
    return <RepoDetail client={client} repo={data} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }
  if (type === "pipeline") {
    return <PipelineDetail client={client} pipeline={data} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }
  if (type === "pr") {
    return <PRDetail client={client} pr={data} collection={collection} org={org} profile={profile} onResourceToggle={onResourceToggle} syncStatus={syncStatus} />;
  }
  if (type === "serviceconnection") {
    return <ServiceConnectionDetail client={client} serviceConnection={data} org={org} collection={collection} profile={profile} onResourceToggle={onResourceToggle} onAddComment={onAddComment} syncStatus={syncStatus} />;
  }
  return null;
}

function WorkItemDetail({ client, workItem, org, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  const [wiComments, setWiComments] = useState([]);
  const [wiCommentsLoading, setWiCommentsLoading] = useState(false);

  const type = workItem.fields?.["System.WorkItemType"] || "";
  const state = workItem.fields?.["System.State"] || "";
  const title = workItem.fields?.["System.Title"] || "Untitled";
  const areaPath = workItem.fields?.["System.AreaPath"]?.split("\\")[0] || "";
  const project = workItem.fields?.["System.TeamProject"] || areaPath;
  const projectId = client._projects?.find(p => p.name === project)?.id || project;

  useEffect(() => {
    if (projectId) {
      setWiCommentsLoading(true);
      client.getWorkItemComments(workItem.id, projectId)
        .then(setWiComments)
        .catch(() => setWiComments([]))
        .finally(() => setWiCommentsLoading(false));
    }
  }, [workItem.id, projectId]);

  const handleToggle = (resourceType, id) => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle(resourceType, id, collection.id);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
            {workItem.fields?.["System.AssignedTo"]?.displayName && (
              <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                Assigned to {workItem.fields["System.AssignedTo"].displayName} · Changed {timeAgo(workItem.fields["System.ChangedDate"])}
              </div>
            )}
          </div>
          <AdoLink href={workItemUrl(org, workItem.id)} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
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
    </div>
  );
}

function RepoDetail({ client, repo, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  const handleToggle = () => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle("repo", repo.id, collection.id);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading, marginBottom: 8 }}>{repo.name}</div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
              {branchName(repo.defaultBranch) || "main"} branch
            </div>
          </div>
          {collection && <ToggleBtn added={isInCollection(collection, "repo", repo.id)} color={collection.color} onClick={handleToggle} />}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          {[
            ["Default Branch", branchName(repo.defaultBranch) || "main"],
            ["Size", repo.size ? `${(repo.size / 1024).toFixed(0)} KB` : "empty"],
            ["URL", repo.remoteUrl || "—"],
            ["Last Updated", timeAgo(repo.lastUpdatedTime)],
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
              comments={(collection.repos || []).find(r => r.id === repo.id)?.comments || []}
              onAdd={(text) => onAddComment(collection.id, "repo", repo.id, text)}
              authorName={profile?.displayName || ""}
              disabled={syncStatus === "saving"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineDetail({ client, pipeline, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  const rs = pipelineStatus(pipeline.latestRun?.result || pipeline.latestRun?.state);

  const handleToggle = () => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle("pipeline", pipeline.id, collection.id);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <Dot color={rs.color} pulse={rs.label === "running"} />
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading }}>{pipeline.name}</div>
              <Pill label={rs.label} color={rs.color} />
            </div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
              {pipeline.folder || "/"} · Last run: {timeAgo(pipeline.latestRun?.startTime)}
            </div>
          </div>
          {collection && <ToggleBtn added={isInCollection(collection, "pipeline", pipeline.id)} color={collection.color} onClick={handleToggle} />}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          {[
            ["Folder", pipeline.folder || "/"],
            ["Definition ID", String(pipeline.id)],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{label}</span>
              <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{val}</span>
            </div>
          ))}
          <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
            <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>Last Run</span>
            <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>
              <Pill label={pipelineStatus(pipeline.latestRun?.result || pipeline.latestRun?.state).label} color={pipelineStatus(pipeline.latestRun?.result || pipeline.latestRun?.state).color} />
              <span style={{ marginLeft: 8 }}>{timeAgo(pipeline.latestRun?.startTime)}</span>
            </span>
          </div>
        </div>
        {collection && onAddComment && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <CommentThread
              comments={(collection.pipelines || []).find(p => String(p.id) === String(pipeline.id))?.comments || []}
              onAdd={(text) => onAddComment(collection.id, "pipeline", pipeline.id, text)}
              authorName={profile?.displayName || ""}
              disabled={syncStatus === "saving"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PRDetail({ client, pr, collection, org, profile, onResourceToggle, syncStatus }) {
  const status = prStatus(pr.status);

  const handleToggle = () => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle("pr", pr.pullRequestId, collection.id);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>#{pr.pullRequestId}</span>
              <Pill label={status.label} color={status.color} />
            </div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading, marginBottom: 8 }}>{pr.title}</div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
              {pr.createdBy?.displayName} · {branchName(pr.sourceRefName)} → {branchName(pr.targetRefName)}
            </div>
          </div>
          {collection && <ToggleBtn added={isInCollection(collection, "pr", pr.pullRequestId)} onClick={handleToggle} />}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          {[
            ["Author", pr.createdBy?.displayName || "—"],
            ["Source", branchName(pr.sourceRefName) || "—"],
            ["Target", branchName(pr.targetRefName) || "—"],
            ["Created", timeAgo(pr.creationDate)],
            ["Reviewers", String(pr.reviewers?.length || 0)],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <span style={{ width: 120, flexShrink: 0, color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>{label}</span>
              <span style={{ flex: 1, color: T.text, fontFamily: "'JetBrains Mono'" }}>{val}</span>
            </div>
          ))}
          {pr.description && (
            <div style={{ padding: "6px 0", fontSize: 12 }}>
              <span style={{ display: "block", color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11, marginBottom: 4 }}>Description</span>
              <div style={{ color: T.text, fontFamily: "'JetBrains Mono'", fontSize: 11, whiteSpace: "pre-wrap", background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 4 }}>{pr.description}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceConnectionDetail({ client, serviceConnection, org, collection, profile, onResourceToggle, onAddComment, syncStatus }) {
  const project = serviceConnection._projectName || serviceConnection.project || "";

  const handleToggle = () => {
    if (!collection || !onResourceToggle) return;
    onResourceToggle("serviceconnection", serviceConnection.id, collection.id);
  };

  const authScheme = serviceConnection.authorization?.scheme || serviceConnection.type || "Unknown";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <Pill label={serviceConnection.type || "service"} color={T.cyan} />
            </div>
            <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading, marginBottom: 8 }}>{serviceConnection.name}</div>
            {serviceConnection.description && (
              <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                {serviceConnection.description}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {project && <AdoLink href={serviceConnectionUrl(org, project, serviceConnection.id)} />}
            {collection && <ToggleBtn added={isInCollection(collection, "serviceconnection", serviceConnection.id)} color={collection.color} onClick={handleToggle} />}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          {[
            ["ID", serviceConnection.id || "—"],
            ["Type", serviceConnection.type || "—"],
            ["Authorization", authScheme],
            ["Project", project || "—"],
            ["URL", serviceConnection.url || "—"],
            ["Created", serviceConnection.createdBy ? (serviceConnection.createdBy.displayName + " · " + timeAgo(serviceConnection.createdOn)) : timeAgo(serviceConnection.createdOn)],
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
              comments={(collection.serviceConnections || []).find(sc => String(sc.id) === String(serviceConnection.id))?.comments || []}
              onAdd={(text) => onAddComment(collection.id, "serviceconnection", serviceConnection.id, text)}
              authorName={profile?.displayName || ""}
              disabled={syncStatus === "saving"}
            />
          </div>
        )}
      </div>
    </div>
  );
}
