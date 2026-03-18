import React from "react";
import { T } from "../../../lib/theme";

const STATUS_COLORS = {
  succeeded: T.green,
  failed: T.red,
  inProgress: T.amber,
  pending: T.muted,
  skipped: T.dim,
  cancelled: T.muted,
  succeededWithIssues: T.amber,
};

export function PhaseNode({ node, isStage }) {
  const color = STATUS_COLORS[node.status] || T.muted;

  // Stages use a solid border and slightly different styling
  const borderStyle = isStage ? `2px solid ${color}` : `1px dashed ${color}`;
  const bg = isStage ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.02)";

  const countLabel = isStage
    ? node.data.phaseCount > 0
      ? `${node.data.phaseCount} phase${node.data.phaseCount !== 1 ? "s" : ""}`
      : null
    : node.data.jobCount > 0
    ? `${node.data.jobCount} job${node.data.jobCount !== 1 ? "s" : ""}`
    : null;

  return (
    <div
      style={{
        width: node.width,
        height: node.height,
        padding: "6px 12px",
        border: borderStyle,
        borderRadius: isStage ? 12 : 10,
        background: bg,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          width: isStage ? 10 : 8,
          height: isStage ? 10 : 8,
          borderRadius: isStage ? 3 : "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontWeight: isStage ? 700 : 600,
          fontSize: isStage ? 12 : 11,
          color: isStage ? T.heading : T.text,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          textTransform: isStage ? "uppercase" : "none",
          letterSpacing: isStage ? "0.03em" : "normal",
        }}
      >
        {node.name}
      </div>
      {countLabel && (
        <div style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>
          {countLabel}
        </div>
      )}
    </div>
  );
}
