import { T } from "./theme";
import { isInCollection as registryIsInCollection } from "./resourceTypes";

/* ── Work item type colours / short labels ────────────────────── */
export const WI_TYPE_COLOR = {
  Epic: T.amber,
  Feature: T.cyan,
  "User Story": T.violet,
  Bug: T.red,
  Task: "#94A3B8",
};

export const WI_TYPE_SHORT = {
  Epic: "EPIC",
  Feature: "FEAT",
  "User Story": "STORY",
  Bug: "BUG",
  Task: "TASK",
};

/* ── State colour ─────────────────────────────────────────────── */
export const stateColor = s => {
  const l = (s || "").toLowerCase();
  if (l.includes("active") || l.includes("progress") || l.includes("doing")) return T.cyan;
  if (l.includes("done") || l.includes("closed") || l.includes("resolved") || l.includes("complete")) return T.green;
  if (l.includes("block")) return T.red;
  return T.muted;
};

/* ── Relative time ────────────────────────────────────────────── */
export const timeAgo = d => {
  if (!d) return "—";
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/* ── Pipeline run status ──────────────────────────────────────── */
export const pipelineStatus = r => {
  // Accept either a status string or a run object. For run objects look for
  // common fields where ADO returns status/result values.
  let v = r;
  if (r && typeof r === "object") {
    v = r.result || r.state || r.status || "";
  }
  const l = (v || "").toString().toLowerCase();
  if (l === "succeeded") return { color: T.green, label: "passing" };
  if (l === "failed")    return { color: T.red,   label: "failing" };
  if (l === "running" || l === "inprogress") return { color: T.amber, label: "running" };
  if (l === "canceled" || l === "cancelled")  return { color: T.muted, label: "cancelled" };
  return { color: T.dim, label: v || "unknown" };
};

/* ── Branch name cleaning ──────────────────────────────────────── */
export const branchName = ref => (ref || "").replace("refs/heads/", "");

/* ── PR status ─────────────────────────────────────────────────── */
export const prStatus = s => {
  const l = (s || "").toLowerCase();
  if (l === "active")    return { color: T.cyan, label: "open" };
  if (l === "completed") return { color: T.green, label: "merged" };
  if (l === "abandoned") return { color: T.muted, label: "closed" };
  return { color: T.dim, label: s || "unknown" };
};

/* ── Collection membership check ────────────────────────────────── */
export const isInCollection = (collection, type, id) => {
  if (!collection) return false;
  const sid = String(id);

  // Delegate to registry-based check
  if (registryIsInCollection) {
    return registryIsInCollection(type, collection, sid);
  }

  // Fallback: hardcoded checks
  if (type === "workitem") {
    return (collection.workItemIds || []).includes(sid);
  }
  if (type === "repo") {
    return (collection.repos || []).some(r => r.id === sid);
  }
  if (type === "pipeline") {
    return (collection.pipelines || []).some(p => String(p.id) === sid);
  }
  if (type === "pr") {
    return (collection.prIds || []).includes(sid);
  }
  if (type === "serviceconnection") {
    return (collection.serviceConnections || []).some(sc => String(sc.id) === sid);
  }
  if (type === "wiki") {
    return (collection.wikiPages || []).some(wp => String(wp.id) === sid);
  }
  if (type === "yamltool") {
    return (collection.yamlTools || []).some(yt => String(yt.id) === sid);
  }
  if (type === "link") {
    return (collection.links || []).some(l => l.url === sid);
  }
  return false;
};

/* ── ADO URL helpers ───────────────────────────────────────────── */
export const workItemUrl = (org, id) => `https://dev.azure.com/${encodeURIComponent(org)}/_workitems/edit/${id}`;
export const pipelineUrl = (org, project, id) => `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_build?definitionId=${id}`;
export const serviceConnectionUrl = (org, project, id) => `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_settings/adminservices?resourceId=${id}`;
export const wikiPageUrl = (org, project, wikiId, pagePath) => {
  const projPart = project ? `/${encodeURIComponent(project)}` : "";
  const pathPart = pagePath ? `%2F${encodeURIComponent(pagePath.replace(/^\//, "").replace(/\//g, "%2F"))}` : "";
  return `https://dev.azure.com/${encodeURIComponent(org)}${projPart}/_wiki/wikis/${encodeURIComponent(wikiId)}${pathPart ? `?path=${pathPart}` : ""}`;
};

export const repoUrl = (org, project, repoName) => `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repoName)}`;

export const prUrl = (org, project, pullRequestId) => `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_git/pullrequests/${pullRequestId}`;

/* ── Run helpers ─────────────────────────────────────────────────────────── */
export const getLatestRun = (val) => {
  if (!val) return null;
  if (Array.isArray(val)) return val[0] || null;
  return val;
};

export const getRunBranch = (run) => {
  if (!run) return "";
  return branchName(
    run.sourceBranch ||
    run.sourceRefName ||
    run.triggerInfo?.sourceBranch ||
    run.triggerInfo?.prSourceBranch ||
    run.resources?.repositories?.self?.refName ||
    run.repository?.refName ||
    run.repository?.branch ||
    run.repository?.defaultBranch ||
    ""
  );
};

export const getRunStatusVal = (run) => {
  if (!run) return "";
  if (Array.isArray(run)) run = run[0] || null;
  return (run && (run.result || run.state || run.status)) || "";
};

/* ── Group runs by branch and return arrays sorted newest-first ── */
export const getLatestPerBranch = (runs = []) => {
  const map = {};
  if (!Array.isArray(runs)) return map;
  for (const r of runs) {
    if (!r) continue;
    const br = getRunBranch(r) || "unknown";
    map[br] = map[br] || [];
    map[br].push(r);
  }
  // Sort each branch list newest-first
  for (const [k, arr] of Object.entries(map)) {
    arr.sort((a, b) => {
      const ta = new Date(a.startTime || a.queueTime || 0).getTime();
      const tb = new Date(b.startTime || b.queueTime || 0).getTime();
      return tb - ta;
    });
  }
  return map;
};
