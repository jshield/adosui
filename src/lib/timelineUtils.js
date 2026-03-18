/**
 * Build a hierarchical tree from a flat array of timeline records.
 * Returns { phases: [{ ...phase, jobs: [{ ...job, tasks: [...] }] }] }
 */
export function buildTimelineTree(records) {
  if (!records?.length) return { phases: [] };

  const phases = records.filter((r) => r.recordType === "Phase");
  const jobs = records.filter((r) => r.recordType === "Job");
  const tasks = records.filter((r) => r.recordType === "Task");

  return {
    phases: phases.map((phase) => {
      const phaseJobs = jobs
        .filter((j) => j.parentId === phase.id)
        .map((job) => ({
          ...job,
          tasks: tasks
            .filter((t) => t.parentId === job.id)
            .sort((a, b) => (a.order || 0) - (b.order || 0)),
        }));
      return { ...phase, jobs: phaseJobs };
    }),
  };
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
 * If any child failed, the parent is failed; if any is inProgress, parent is inProgress; etc.
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
    (r) => r.recordType === "Job" && r.parentId === phaseId
  );
}

export function getTasksForJob(records, jobId) {
  return records.filter(
    (r) => r.recordType === "Task" && r.parentId === jobId
  );
}

export function findRecordById(records, id) {
  return records.find((r) => r.id === id) || null;
}
