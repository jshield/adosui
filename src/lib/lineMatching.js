/**
 * Line ID utilities for deterministic references.
 *
 * Line IDs use the format "{recordId}-{lineNumber}" which is identical
 * whether the line came from SignalR or REST, since both sources use
 * the same timelineRecordId and positional line numbers.
 */

export function buildLineId(recordId, lineNumber) {
  return `${recordId}-${lineNumber}`;
}

export function buildLineIdsForRange(recordId, startLine, endLine) {
  const ids = [];
  for (let i = startLine; i <= endLine; i++) {
    ids.push(buildLineId(recordId, i));
  }
  return ids;
}

export function parseLineId(lineId) {
  if (!lineId || typeof lineId !== "string") return null;
  const lastDash = lineId.lastIndexOf("-");
  if (lastDash < 0) return null;
  const recordId = lineId.substring(0, lastDash);
  const lineNumber = parseInt(lineId.substring(lastDash + 1), 10);
  if (isNaN(lineNumber)) return null;
  return { recordId, lineNumber };
}
