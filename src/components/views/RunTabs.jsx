import React from "react";
import { T } from "../../lib/theme";

const STATUS_COLORS = {
  succeeded: T.green,
  failed: T.red,
  inProgress: T.amber,
  pending: T.muted,
  cancelling: T.muted,
  cancelled: T.muted,
};

function getRunStatus(run) {
  if (run.result) return run.result;
  if (run.status === "inProgress" || run.state === "inProgress") return "inProgress";
  return run.state || run.status || "pending";
}

export function RunTabs({ runs, activeRunId, onSelect }) {
  if (!runs?.length) return null;

  // Show up to 5 most recent runs
  const visible = runs.slice(0, 5);

  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: "0 4px",
        borderBottom: `1px solid ${T.border}`,
        overflowX: "auto",
      }}
    >
      {visible.map((run) => {
        const runId = run.id;
        const isActive = runId === activeRunId;
        const status = getRunStatus(run);
        const color = STATUS_COLORS[status] || T.muted;
        const label = run.buildNumber || run.name || `#${runId}`;

        return (
          <button
            key={runId}
            onClick={() => onSelect(runId)}
            style={{
              background: "none",
              border: "none",
              borderBottom: isActive ? `2px solid ${T.amber}` : "2px solid transparent",
              padding: "7px 12px 5px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
              transition: "border-color 0.15s",
            }}
          >
            {/* Status dot */}
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: color,
                animation: status === "inProgress" ? "pulse 1.5s infinite" : "none",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? T.heading : T.muted,
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          </button>
        );
      })}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
