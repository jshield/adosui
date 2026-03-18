import React, { useState } from "react";
import { T } from "../../lib/theme";
import { buildTimelineTree, getRecordStatus } from "../../lib/timelineUtils";

const STATUS_COLORS = {
  succeeded: T.green,
  failed: T.red,
  inProgress: T.amber,
  pending: T.muted,
  skipped: T.dim,
  cancelled: T.muted,
  succeededWithIssues: T.amber,
};

const STATUS_ICONS = {
  succeeded: "\u2713",
  failed: "\u2717",
  inProgress: "\u25CF",
  pending: "\u25CB",
  skipped: "\u2014",
  cancelled: "\u2014",
  succeededWithIssues: "!",
};

function TaskItem({ task, isSelected, onSelect }) {
  const status = getRecordStatus(task);
  const color = STATUS_COLORS[status] || T.muted;

  return (
    <div
      onClick={() => onSelect(task.id, task.logId)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 8px 3px 40px",
        cursor: task.logId ? "pointer" : "default",
        background: isSelected ? "rgba(245,158,11,0.08)" : "transparent",
        borderLeft: isSelected ? `2px solid ${T.amber}` : "2px solid transparent",
        opacity: task.logId ? 1 : 0.5,
      }}
    >
      <span style={{ fontSize: 10, color, width: 12, textAlign: "center", flexShrink: 0 }}>
        {STATUS_ICONS[status] || "\u25CB"}
      </span>
      <span
        style={{
          fontSize: 10,
          color: isSelected ? T.heading : T.text,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flex: 1,
        }}
      >
        {task.name}
      </span>
      {(task.errorCount > 0 || task.warningCount > 0) && (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {task.errorCount > 0 && (
            <span style={{ fontSize: 8, color: T.red, fontWeight: 600 }}>
              {task.errorCount}
            </span>
          )}
          {task.warningCount > 0 && (
            <span style={{ fontSize: 8, color: T.amber, fontWeight: 600 }}>
              {task.warningCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function JobItem({ job, isSelected, selectedTaskId, onSelectJob, onSelectTask }) {
  const [expanded, setExpanded] = useState(isSelected);
  const status = getRecordStatus(job);
  const color = STATUS_COLORS[status] || T.muted;

  // Auto-expand when selected
  if (isSelected && !expanded) setExpanded(true);

  return (
    <div>
      <div
        onClick={() => {
          setExpanded(!expanded);
          onSelectJob(job.id);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px 4px 24px",
          cursor: "pointer",
          background: isSelected && !selectedTaskId ? "rgba(245,158,11,0.05)" : "transparent",
        }}
      >
        <span style={{ fontSize: 8, color: T.muted, width: 10, flexShrink: 0 }}>
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span style={{ fontSize: 10, color, width: 12, textAlign: "center", flexShrink: 0 }}>
          {STATUS_ICONS[status] || "\u25CB"}
        </span>
        <span
          style={{
            fontSize: 11,
            color: isSelected ? T.heading : T.text,
            fontWeight: isSelected ? 600 : 400,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
          }}
        >
          {job.name}
        </span>
      </div>
      {expanded && job.tasks?.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          isSelected={task.id === selectedTaskId}
          onSelect={onSelectTask}
        />
      ))}
    </div>
  );
}

export function TimelineSidebar({
  timeline,
  selectedJobId,
  selectedTaskId,
  onSelectJob,
  onSelectTask,
}) {
  if (!timeline?.records?.length) {
    return (
      <div style={{ padding: 12, color: T.muted, fontSize: 11 }}>
        No timeline data.
      </div>
    );
  }

  const tree = buildTimelineTree(timeline.records);

  return (
    <div
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: `1px solid ${T.border}`,
        overflowY: "auto",
        background: T.panel,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: `1px solid ${T.border}`,
          fontWeight: 600,
          fontSize: 10,
          color: T.muted,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Timeline
      </div>

      {tree.phases.map((phase) => {
        const status = getRecordStatus(phase);
        const color = STATUS_COLORS[status] || T.muted;

        return (
          <div key={phase.id} style={{ marginBottom: 2 }}>
            {/* Phase header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                background: "rgba(255,255,255,0.02)",
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: T.heading,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {phase.name}
              </span>
            </div>

            {/* Jobs */}
            {phase.jobs?.map((job) => (
              <JobItem
                key={job.id}
                job={job}
                isSelected={job.id === selectedJobId}
                selectedTaskId={selectedTaskId}
                onSelectJob={onSelectJob}
                onSelectTask={onSelectTask}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
