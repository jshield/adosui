import React from "react";
import { T } from "../../../lib/theme";

const TYPE_COLORS = {
  repository: T.blue,
  artifact: T.amber,
  environment: T.green,
  serviceConnection: T.purple,
  variableGroup: T.amber,
};

const TYPE_LABELS = {
  repository: "Repo",
  artifact: "Artifact",
  environment: "Env",
  serviceConnection: "Svc",
  variableGroup: "Vars",
};

export function ResourceNode({ node }) {
  const color = TYPE_COLORS[node.type] || T.muted;
  const label = TYPE_LABELS[node.type] || node.type;

  return (
    <div
      style={{
        width: node.width,
        height: node.height,
        padding: "6px 10px",
        border: `1px solid ${color}`,
        borderRadius: 6,
        background: T.panel,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 6,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          fontSize: 8,
          color: T.bg,
          background: color,
          padding: "1px 4px",
          borderRadius: 3,
          fontWeight: 600,
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 10,
          color,
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {node.name}
      </span>
    </div>
  );
}
