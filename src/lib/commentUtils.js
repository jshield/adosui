import { buildLineIdsForRange } from "./lineMatching";

/**
 * Create a new log comment object.
 */
export function createLogComment({
  runId,
  pipelineId,
  recordId,
  startLine,
  endLine,
  author,
  authorId,
  text,
}) {
  return {
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lineRefs: buildLineIdsForRange(recordId, startLine, endLine),
    author: author || "",
    authorId: authorId || "",
    text: text || "",
    resolved: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get the set of line indices (0-based) that have comments.
 * Used for rendering comment gutter dots in LogViewer.
 *
 * @param {object[]} comments  Comments for this run
 * @param {string}   recordId  Current task record ID
 * @param {object[]} lines     Current log lines array (with lineNumber)
 * @returns {Set<number>} Set of 0-based line indices
 */
export function getCommentedLineIndices(comments, recordId, lines) {
  const indices = new Set();
  if (!comments?.length || !recordId || !lines?.length) return indices;

  // Build a lineNumber -> index map
  const lineNumToIndex = new Map();
  lines.forEach((line, idx) => {
    lineNumToIndex.set(line.lineNumber, idx);
  });

  const prefix = `${recordId}-`;
  for (const comment of comments) {
    if (comment.resolved) continue;
    for (const ref of comment.lineRefs || []) {
      if (ref.startsWith(prefix)) {
        const lineNum = parseInt(ref.substring(prefix.length), 10);
        const idx = lineNumToIndex.get(lineNum);
        if (idx !== undefined) indices.add(idx);
      }
    }
  }
  return indices;
}

/**
 * Get the line range description for a comment (e.g., "Lines 5-10" or "Line 42").
 */
export function getCommentLineRange(comment) {
  const refs = comment.lineRefs || [];
  if (!refs.length) return "General";

  // Extract line numbers
  const nums = refs
    .map((ref) => {
      const lastDash = ref.lastIndexOf("-");
      return lastDash >= 0 ? parseInt(ref.substring(lastDash + 1), 10) : NaN;
    })
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);

  if (!nums.length) return "General";
  if (nums.length === 1) return `Line ${nums[0]}`;
  return `Lines ${nums[0]}-${nums[nums.length - 1]}`;
}

/**
 * Upsert comments for a specific run within a pipeline's runs array.
 * Returns the updated runs array. Caps at 5 runs with comments.
 */
export function upsertRunComments(runs, runId, comments) {
  const updated = [...(runs || [])];
  const idx = updated.findIndex((r) => r.id === runId);

  if (idx >= 0) {
    updated[idx] = { ...updated[idx], comments };
  } else {
    updated.push({ id: runId, comments });
  }

  // Cap at 5 most recent runs
  if (updated.length > 5) {
    updated.splice(0, updated.length - 5);
  }

  return updated;
}

/**
 * Get comments for a specific run from the collection pipeline.
 */
export function getRunComments(collection, pipelineId, runId) {
  const pipeline = (collection?.pipelines || []).find(
    (p) => String(p.id) === String(pipelineId)
  );
  if (!pipeline) return [];

  const run = (pipeline.runs || []).find((r) => r.id === runId);
  return run?.comments || [];
}
