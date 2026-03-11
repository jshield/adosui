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
