import Dexie from "dexie";

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

class PipelineLogsDB extends Dexie {
  constructor() {
    super("PipelineLogsDB");

    this.version(1).stores({
      timelines: "runId, projectId, fetchedAt",
      logLines: "++id, [runId+recordId], runId, recordId, lineNumber, createdAt",
    });
  }
}

export const pipelineLogsDB = new PipelineLogsDB();

// ── Timeline operations ─────────────────────────────────────────────────────

export async function saveTimeline(runId, projectId, timeline) {
  await pipelineLogsDB.timelines.put({
    runId,
    projectId,
    data: timeline,
    fetchedAt: Date.now(),
  });
}

export async function getTimeline(runId) {
  const cached = await pipelineLogsDB.timelines.get(runId);
  return cached?.data || null;
}

export async function isTimelineFresh(runId, maxAgeMs = 300000) {
  const cached = await pipelineLogsDB.timelines.get(runId);
  if (!cached) return false;
  return Date.now() - cached.fetchedAt < maxAgeMs;
}

// ── Log line operations ─────────────────────────────────────────────────────

export async function saveLogLines(runId, recordId, lines) {
  if (!lines?.length) return;
  const timestamp = Date.now();
  await pipelineLogsDB.logLines.bulkAdd(
    lines.map((content, idx) => ({
      runId,
      recordId,
      lineNumber: idx + 1,
      content,
      createdAt: timestamp,
    }))
  );
}

export async function getLogLines(runId, recordId) {
  return pipelineLogsDB.logLines
    .where("[runId+recordId]")
    .equals([runId, recordId])
    .sortBy("lineNumber");
}

/**
 * Append lines received from SignalR, auto-incrementing lineNumber
 * from the last known line for this run+record.
 */
export async function appendSignalRLines(runId, recordId, lines) {
  if (!lines?.length) return;

  // Find the current max lineNumber for this record.
  // NOTE: sortBy() always sorts ascending in-memory regardless of .reverse(),
  // so use the last element to get the maximum lineNumber.
  const existing = await pipelineLogsDB.logLines
    .where("[runId+recordId]")
    .equals([runId, recordId])
    .sortBy("lineNumber");

  const startLine = existing.length > 0 ? existing[existing.length - 1].lineNumber + 1 : 1;
  const timestamp = Date.now();

  await pipelineLogsDB.logLines.bulkAdd(
    lines.map((content, idx) => ({
      runId,
      recordId,
      lineNumber: startLine + idx,
      content,
      createdAt: timestamp,
    }))
  );
}

export async function getLogLineCount(runId) {
  return pipelineLogsDB.logLines.where("runId").equals(runId).count();
}

// ── Cache management ────────────────────────────────────────────────────────

export async function clearRunData(runId) {
  await pipelineLogsDB.transaction(
    "rw",
    pipelineLogsDB.timelines,
    pipelineLogsDB.logLines,
    async () => {
      await pipelineLogsDB.timelines.where("runId").equals(runId).delete();
      await pipelineLogsDB.logLines.where("runId").equals(runId).delete();
    }
  );
}

export async function clearAllData() {
  await pipelineLogsDB.timelines.clear();
  await pipelineLogsDB.logLines.clear();
}

export async function cleanupOldData(maxAgeMs = MAX_AGE_MS) {
  const cutoff = Date.now() - maxAgeMs;

  await pipelineLogsDB.transaction(
    "rw",
    pipelineLogsDB.timelines,
    pipelineLogsDB.logLines,
    async () => {
      const oldTimelineKeys = await pipelineLogsDB.timelines
        .where("fetchedAt")
        .below(cutoff)
        .primaryKeys();
      if (oldTimelineKeys.length) {
        await pipelineLogsDB.timelines.bulkDelete(oldTimelineKeys);
      }

      const oldLogLineKeys = await pipelineLogsDB.logLines
        .where("createdAt")
        .below(cutoff)
        .primaryKeys();
      if (oldLogLineKeys.length) {
        await pipelineLogsDB.logLines.bulkDelete(oldLogLineKeys);
      }
    }
  );
}

// Run cleanup on module load
cleanupOldData().catch(() => {});
