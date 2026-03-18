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

export function PhaseNode({ node }) {
  const color = STATUS_COLORS[node.status] || T.muted;

  return (
    <div
      style={{
        width: node.width,
        height: node.height,
        padding: "6px 12px",
        border: `1px dashed ${color}`,
        borderRadius: 10,
        background: "rgba(255,255,255,0.02)",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontWeight: 600,
          fontSize: 11,
          color: T.text,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {node.name}
      </div>
      {node.data.jobCount > 0 && (
        <div style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>
          {node.data.jobCount} job{node.data.jobCount !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
