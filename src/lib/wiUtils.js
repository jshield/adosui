import { T } from "./theme";

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
  const l = (r || "").toLowerCase();
  if (l === "succeeded") return { color: T.green, label: "passing" };
  if (l === "failed")    return { color: T.red,   label: "failing" };
  if (l === "running" || l === "inprogress") return { color: T.amber, label: "running" };
  if (l === "canceled")  return { color: T.muted, label: "cancelled" };
  return { color: T.dim, label: r || "unknown" };
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
  return false;
};

/* ── ADO URL helpers ───────────────────────────────────────────── */
export const workItemUrl = (org, id) => `https://dev.azure.com/${encodeURIComponent(org)}/_workitems/edit/${id}`;
export const pipelineUrl = (org, project, id) => `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_build?definitionId=${id}`;
