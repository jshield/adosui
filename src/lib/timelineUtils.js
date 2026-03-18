/**
 * Build a hierarchical tree from a flat array of timeline records.
 *
 * ADO timeline hierarchy: Stage > Phase > Job > Task (+ Checkpoint)
 *
 * Returns { stages: [{ ...stage, phases: [{ ...phase, jobs: [{ ...job, tasks: [...] }] }] }] }
 *
 * For pipelines without explicit stages, a synthetic wrapper is created
 * so the tree shape is always consistent.
 */
export function buildTimelineTree(records) {
  if (!records?.length) return { stages: [] };

  const stages = records.filter((r) => r.type === "Stage");
  const phases = records.filter((r) => r.type === "Phase");
  const jobs = records.filter((r) => r.type === "Job");
  const tasks = records.filter((r) => r.type === "Task");

  // If there are stages, build the full hierarchy
  if (stages.length) {
    return {
      stages: stages.map((stage) => {
        const stagePhases = phases
          .filter((p) => p.parentId === stage.id)
          .map((phase) => buildPhaseNode(phase, jobs, tasks));
        return { ...stage, phases: stagePhases };
      }),
    };
  }

  // No stages — wrap phases in a synthetic stage
  if (phases.length) {
    return {
      stages: [
        {
          id: "__synthetic_stage",
          type: "Stage",
          name: "Pipeline",
          state: "completed",
          _synthetic: true,
          phases: phases.map((phase) => buildPhaseNode(phase, jobs, tasks)),
        },
      ],
    };
  }

  // No stages or phases — wrap jobs directly
  if (jobs.length) {
    return {
      stages: [
        {
          id: "__synthetic_stage",
          type: "Stage",
          name: "Pipeline",
          state: "completed",
          _synthetic: true,
          phases: [
            {
              id: "__synthetic_phase",
              type: "Phase",
              name: "Default",
              state: "completed",
              _synthetic: true,
              jobs: jobs.map((job) => ({
                ...job,
                tasks: tasks
                  .filter((t) => t.parentId === job.id)
                  .sort((a, b) => (a.order || 0) - (b.order || 0)),
              })),
            },
          ],
        },
      ],
    };
  }

  return { stages: [] };
}

function buildPhaseNode(phase, allJobs, allTasks) {
  const phaseJobs = allJobs
    .filter((j) => j.parentId === phase.id)
    .map((job) => ({
      ...job,
      tasks: allTasks
        .filter((t) => t.parentId === job.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    }));
  return { ...phase, jobs: phaseJobs };
}

/**
 * Normalise a timeline record's state/result into a single status string.
 */
export function getRecordStatus(record) {
  if (!record) return "pending";
  if (record.state === "completed") {
    return record.result || "succeeded";
  }
  if (record.state === "inProgress") return "inProgress";
  return record.state || "pending";
}

/**
 * Derive an aggregate status from child records.
 */
export function getAggregateStatus(children) {
  if (!children?.length) return "pending";
  if (children.some((c) => getRecordStatus(c) === "failed")) return "failed";
  if (children.some((c) => getRecordStatus(c) === "inProgress"))
    return "inProgress";
  if (children.some((c) => getRecordStatus(c) === "cancelled"))
    return "cancelled";
  if (children.some((c) => getRecordStatus(c) === "succeededWithIssues"))
    return "succeededWithIssues";
  if (children.every((c) => getRecordStatus(c) === "succeeded"))
    return "succeeded";
  if (children.every((c) => getRecordStatus(c) === "skipped"))
    return "skipped";
  return "pending";
}

export function getJobsForPhase(records, phaseId) {
  return records.filter(
    (r) => r.type === "Job" && r.parentId === phaseId
  );
}

export function getTasksForJob(records, jobId) {
  return records.filter(
    (r) => r.type === "Task" && r.parentId === jobId
  );
}

export function findRecordById(records, id) {
  return records.find((r) => r.id === id) || null;
}
