import React, { useRef, useState, useCallback } from "react";
import { T } from "../../../lib/theme";
import { JobNode } from "./JobNode";
import { PhaseNode } from "./PhaseNode";
import { ResourceNode } from "./ResourceNode";

const EDGE_STYLES = {
  contains:  { stroke: T.dim,   dash: "4,4", arrow: false },
  dependsOn: { stroke: T.muted, dash: null,   arrow: true },
  produces:  { stroke: T.amber, dash: "6,3",  arrow: true },
  consumes:  { stroke: T.blue,  dash: "4,2",  arrow: true },
  uses:      { stroke: T.muted, dash: "2,2",  arrow: false },
  deploysTo: { stroke: T.green, dash: null,    arrow: true },
};

function buildPathD(points) {
  if (!points?.length) return "";
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  if (rest.length === 0) return d;
  if (rest.length === 1) {
    d += ` L ${rest[0].x} ${rest[0].y}`;
    return d;
  }
  // Use smooth curves through control points
  for (let i = 0; i < rest.length; i++) {
    const p = rest[i];
    if (i === 0) {
      const prev = first;
      const cpx = (prev.x + p.x) / 2;
      d += ` C ${cpx} ${prev.y}, ${cpx} ${p.y}, ${p.x} ${p.y}`;
    } else {
      const prev = rest[i - 1];
      const cpx = (prev.x + p.x) / 2;
      d += ` C ${cpx} ${prev.y}, ${cpx} ${p.y}, ${p.x} ${p.y}`;
    }
  }
  return d;
}

export function PipelineGraph({
  graphData,
  selectedJobId,
  onNodeClick,
}) {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);

  const { nodes, edges, width, height } = graphData || {
    nodes: [],
    edges: [],
    width: 600,
    height: 400,
  };

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.2, Math.min(3, z - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e) => {
    // Only pan on background click (not on nodes)
    if (e.target === e.currentTarget || e.target.tagName === "svg" || e.target.tagName === "rect") {
      setDragging(true);
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !dragStart.current) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
    dragStart.current = null;
  }, []);

  if (!nodes.length) {
    return (
      <div style={{ padding: 24, color: T.muted, fontSize: 12 }}>
        No graph data available for this run.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        width: "100%",
        height: 280,
        overflow: "hidden",
        position: "relative",
        background: T.bg,
        borderRadius: 6,
        border: `1px solid ${T.border}`,
        cursor: dragging ? "grabbing" : "grab",
      }}
    >
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {/* SVG layer for edges */}
        <svg
          width={width}
          height={height}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={T.muted} />
            </marker>
            <marker
              id="arrowhead-amber"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={T.amber} />
            </marker>
            <marker
              id="arrowhead-blue"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={T.blue} />
            </marker>
            <marker
              id="arrowhead-green"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={T.green} />
            </marker>
          </defs>
          {edges.map((edge, i) => {
            const style = EDGE_STYLES[edge.type] || EDGE_STYLES.uses;
            const d = buildPathD(edge.points);
            if (!d) return null;

            let markerEnd = "";
            if (style.arrow) {
              if (edge.type === "produces") markerEnd = "url(#arrowhead-amber)";
              else if (edge.type === "consumes") markerEnd = "url(#arrowhead-blue)";
              else if (edge.type === "deploysTo") markerEnd = "url(#arrowhead-green)";
              else markerEnd = "url(#arrowhead)";
            }

            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={style.stroke}
                strokeWidth={1.5}
                strokeDasharray={style.dash || "none"}
                markerEnd={markerEnd}
                opacity={0.6}
              />
            );
          })}
        </svg>

        {/* HTML layer for nodes via absolute positioning */}
        {nodes.map((node) => (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y,
            }}
          >
            {node.type === "job" ? (
              <JobNode
                node={node}
                isSelected={node.id === selectedJobId}
                onClick={onNodeClick}
              />
            ) : node.type === "phase" ? (
              <PhaseNode node={node} />
            ) : (
              <ResourceNode node={node} />
            )}
          </div>
        ))}
      </div>

      {/* Zoom indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 6,
          right: 8,
          fontSize: 9,
          color: T.muted,
          background: "rgba(0,0,0,0.5)",
          padding: "2px 6px",
          borderRadius: 3,
          pointerEvents: "none",
        }}
      >
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
