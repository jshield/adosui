import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getLogLines,
  saveLogLines,
  pipelineLogsDB,
} from "../lib/pipelineLogsDB";

/**
 * Fetches and caches log lines for a specific task/record.
 *
 * Uses Dexie live queries so lines appended by SignalR automatically
 * appear in the returned array.
 *
 * @param {object|null}  client      ADOClient instance
 * @param {string|null}  projectName ADO project name
 * @param {number|null}  runId       Build/run ID
 * @param {string|null}  recordId    Timeline record ID (task/step)
 * @param {number|null}  logId       Log file ID from timeline record
 * @param {boolean}      isCompleted Whether this record has finished
 * @returns {{ lines, loading, error }}
 */
export function useLogLines(
  client,
  projectName,
  runId,
  recordId,
  logId,
  isCompleted
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fetchedKey, setFetchedKey] = useState(null);

  // Live query — reacts to Dexie changes (e.g. SignalR appends)
  const lines = useLiveQuery(
    async () => {
      if (!runId || !recordId) return [];
      return getLogLines(runId, recordId);
    },
    [runId, recordId],
    []
  );

  // Fetch from REST if not yet cached
  useEffect(() => {
    const key = `${runId}-${recordId}-${logId}`;
    if (!client || !projectName || !runId || !recordId || !logId) return;
    if (fetchedKey === key) return; // Already fetched this exact record

    let cancelled = false;

    (async () => {
      // Check if we already have lines in Dexie
      const existing = await pipelineLogsDB.logLines
        .where("[runId+recordId]")
        .equals([runId, recordId])
        .count();

      // If record is completed and we have lines, no need to refetch
      if (existing > 0 && isCompleted) {
        setFetchedKey(key);
        return;
      }

      // If record is still running and we have some lines (from SignalR),
      // don't fetch REST — SignalR is the primary source
      if (existing > 0 && !isCompleted) {
        setFetchedKey(key);
        return;
      }

      // Fetch from REST
      setLoading(true);
      setError(null);
      try {
        const text = await client.getBuildLog(projectName, runId, logId);
        if (cancelled) return;

        const logLines = text
          ? text.split("\n").filter((l) => l.length > 0)
          : [];

        // Clear existing lines for this record and save fresh ones
        await pipelineLogsDB.logLines
          .where("[runId+recordId]")
          .equals([runId, recordId])
          .delete();

        await saveLogLines(runId, recordId, logLines);
        setFetchedKey(key);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, projectName, runId, recordId, logId, isCompleted, fetchedKey]);

  return { lines, loading, error };
}
