import dagre from "dagre";
import { getRecordStatus, getAggregateStatus } from "./timelineUtils";

/**
 * Build graph nodes and edges from pipeline API responses.
 *
 * @param {object}   timeline   Timeline response with .records[]
 * @param {object}   run        Pipeline run response with .resources
 * @param {object[]} artifacts  Artifacts array
 * @returns {{ nodes: object[], edges: object[] }}
 */
export function buildGraphData(timeline, run, artifacts) {
  const nodes = [];
  const edges = [];
  const records = timeline?.records || [];

  const phases = records.filter((r) => r.recordType === "Phase");
  const jobs = records.filter((r) => r.recordType === "Job");

  // Phase nodes
  for (const phase of phases) {
    const phaseJobs = jobs.filter((j) => j.parentId === phase.id);
    nodes.push({
      id: phase.id,
      type: "phase",
      name: phase.name,
      status: getAggregateStatus(phaseJobs),
      data: { jobCount: phaseJobs.length },
      width: 200,
      height: 60,
    });
  }

  // Job nodes + contains edges
  for (const job of jobs) {
    nodes.push({
      id: job.id,
      type: "job",
      name: job.name,
      status: getRecordStatus(job),
      data: {
        startTime: job.startTime,
        finishTime: job.finishTime,
        workerName: job.workerName,
        errorCount: job.errorCount || 0,
        warningCount: job.warningCount || 0,
      },
      width: 160,
      height: 70,
    });

    // Phase contains Job
    if (job.parentId && phases.some((p) => p.id === job.parentId)) {
      edges.push({
        source: job.parentId,
        target: job.id,
        type: "contains",
      });
    }

    // Job dependency edges
    if (job.dependencies?.length) {
      for (const dep of job.dependencies) {
        edges.push({
          source: dep.recordId,
          target: job.id,
          type: "dependsOn",
        });
      }
    }
  }

  // Artifact nodes
  if (artifacts?.length) {
    for (const artifact of artifacts) {
      const artId = `artifact-${artifact.name}`;
      nodes.push({
        id: artId,
        type: "artifact",
        name: artifact.name,
        status: null,
        data: {
          artifactType: artifact.type,
          version: artifact.resource?.version,
        },
        width: 140,
        height: 50,
      });

      // Try to link artifact to the job that produced it
      // Heuristic: match by job name in artifact source
      const producerJob = jobs.find(
        (j) =>
          artifact.source === j.name ||
          artifact.source === j.id
      );
      if (producerJob) {
        edges.push({
          source: producerJob.id,
          target: artId,
          type: "produces",
        });
      }
    }
  }

  // Resource nodes from run.resources
  const resources = run?.resources;
  if (resources) {
    // Repositories
    const repos = resources.repositories;
    if (repos) {
      const repoEntries = Array.isArray(repos)
        ? repos
        : Object.values(repos);
      for (const repo of repoEntries) {
        const repoId = `repo-${repo.alias || repo.id || repo.repository?.id}`;
        nodes.push({
          id: repoId,
          type: "repository",
          name: repo.alias || repo.repository?.fullName || repo.repository?.name || "repo",
          status: null,
          data: {
            refName: repo.refName || repo.ref,
            version: repo.version,
            repoType: repo.repository?.type,
          },
          width: 140,
          height: 50,
        });

        // If self repo, connect to all jobs (primary source)
        if (repo.alias === "self" || repo.self) {
          const firstJob = jobs[0];
          if (firstJob) {
            edges.push({
              source: repoId,
              target: firstJob.id,
              type: "uses",
            });
          }
        }
      }
    }

    // Pipeline resources
    const pipelines = resources.pipelines;
    if (pipelines) {
      const pipeEntries = Array.isArray(pipelines)
        ? pipelines
        : Object.values(pipelines);
      for (const pipe of pipeEntries) {
        const pipeId = `pipeline-res-${pipe.alias || pipe.pipeline?.id}`;
        nodes.push({
          id: pipeId,
          type: "artifact",
          name: pipe.alias || pipe.pipeline?.name || "pipeline",
          status: null,
          data: {
            sourcePipeline: pipe.pipeline?.id,
            version: pipe.version,
          },
          width: 140,
          height: 50,
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Apply dagre layout to nodes and edges.
 * Returns nodes with x/y positions and edges with points[].
 */
export function layoutGraph(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    ranksep: 100,
    nodesep: 50,
    marginx: 30,
    marginy: 30,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, {
      width: node.width || 160,
      height: node.height || 70,
    });
  }

  for (const edge of edges) {
    // Only layout edges whose source and target both exist
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const graphInfo = g.graph();
  const layoutedNodes = nodes.map((node) => {
    const n = g.node(node.id);
    if (!n) return node;
    return {
      ...node,
      x: n.x - n.width / 2,
      y: n.y - n.height / 2,
    };
  });

  const layoutedEdges = edges
    .filter((e) => g.hasNode(e.source) && g.hasNode(e.target))
    .map((edge) => {
      const e = g.edge(edge.source, edge.target);
      return {
        ...edge,
        points: e?.points || [],
      };
    });

  return {
    nodes: layoutedNodes,
    edges: layoutedEdges,
    width: (graphInfo.width || 600) + 60,
    height: (graphInfo.height || 400) + 60,
  };
}

/**
 * Full pipeline: build data + apply layout.
 */
export function buildPipelineGraph(timeline, run, artifacts) {
  const { nodes, edges } = buildGraphData(timeline, run, artifacts);
  return layoutGraph(nodes, edges);
}
