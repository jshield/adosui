import { useState, useEffect } from "react";
import { buildPipelineGraph } from "../lib/pipelineGraphBuilder";

/**
 * Fetches timeline, run, and artifact data, then builds the pipeline graph.
 *
 * @param {object|null} client       ADOClient instance
 * @param {string|null} projectName  ADO project name
 * @param {number|null} pipelineId   Pipeline definition ID
 * @param {number|null} runId        Build/run ID
 * @returns {{ graphData, timeline, loading, error }}
 */
export function usePipelineGraph(client, projectName, pipelineId, runId) {
  const [graphData, setGraphData] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!client || !projectName || !runId) {
      setGraphData(null);
      setTimeline(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Fetch all data in parallel
        const [timelineData, runData, artifacts] = await Promise.all([
          client.getBuildTimeline(projectName, runId),
          pipelineId
            ? client.getPipelineRun(projectName, pipelineId, runId).catch(() => null)
            : Promise.resolve(null),
          pipelineId
            ? client.getPipelineRunArtifacts(projectName, pipelineId, runId).catch(() => [])
            : Promise.resolve([]),
        ]);

        if (cancelled) return;

        setTimeline(timelineData);

        if (timelineData?.records?.length) {
          const graph = buildPipelineGraph(timelineData, runData, artifacts);
          setGraphData(graph);
        } else {
          setGraphData(null);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, projectName, pipelineId, runId]);

  return { graphData, timeline, loading, error };
}
