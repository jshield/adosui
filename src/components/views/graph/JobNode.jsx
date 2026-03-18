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

export function JobNode({ node, isSelected, onClick }) {
  const color = STATUS_COLORS[node.status] || T.muted;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(node.id);
      }}
      style={{
        width: node.width,
        height: node.height,
        padding: "8px 12px",
        border: `2px solid ${isSelected ? T.amber : color}`,
        borderRadius: 8,
        background: isSelected ? "rgba(245,158,11,0.08)" : T.panel,
        cursor: "pointer",
        position: "relative",
        boxSizing: "border-box",
        overflow: "hidden",
        transition: "border-color 0.15s",
      }}
    >
      {/* Status dot */}
      <div
        style={{
          position: "absolute",
          top: -4,
          right: -4,
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          border: `2px solid ${T.panel}`,
        }}
      />

      <div
        style={{
          fontWeight: 600,
          fontSize: 11,
          color: T.heading,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {node.name}
      </div>

      <div style={{ fontSize: 9, color, marginTop: 3 }}>{node.status}</div>

      {(node.data.errorCount > 0 || node.data.warningCount > 0) && (
        <div style={{ fontSize: 9, marginTop: 2, display: "flex", gap: 6 }}>
          {node.data.errorCount > 0 && (
            <span style={{ color: T.red }}>
              {node.data.errorCount} err
            </span>
          )}
          {node.data.warningCount > 0 && (
            <span style={{ color: T.amber }}>
              {node.data.warningCount} warn
            </span>
          )}
        </div>
      )}
    </div>
  );
}
