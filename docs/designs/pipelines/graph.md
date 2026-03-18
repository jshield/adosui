# Graph Visualization

This document describes the pipeline graph visualization using React Flow, showing phases, jobs, and resource connections.

## Overview

The graph provides a visual representation of the pipeline topology:
- **Phases** as containers
- **Jobs** as nodes within phases
- **Resources** (repos, artifacts, environments, etc.) connected to jobs
- **Dependencies** shown as edges between jobs

## Visual Design

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        PHASE: Build                                       │
│                                                                           │
│   ┌───────────┐     ┌───────────┐     ┌───────────┐                    │
│   │  Job A    │────▶│  Job B    │────▶│  Job C    │                    │
│   │  (build)  │     │  (test)   │     │  (pack)   │                    │
│   │    ✓      │     │    ✓      │     │    ✓      │                    │
│   └─────┬─────┘     └─────┬─────┘     └─────┬─────┘                    │
│         │                  │                  │                          │
│    ┌────┴────┐       ┌────┴────┐            │                          │
│    │  Repo   │       │Artifact │            │                          │
│    │ (main)  │       │  (app)  │            │                          │
│    └─────────┘       └────┬────┘            │                          │
│                            │                  │                          │
└────────────────────────────┼──────────────────┼──────────────────────────┘
                             │                  │
                             ▼                  ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      PHASE: Deploy                                        │
│                                                                           │
│   ┌───────────┐     ┌───────────┐                                        │
│   │  Job D    │────▶│  Job E    │                                        │
│   │ (staging) │     │  (prod)   │                                        │
│   │    ●      │     │    ○      │                                        │
│   └─────┬─────┘     └─────┬─────┘                                        │
│         │                  │                                              │
│    ┌────┴────┐       ┌────┴────┐                                        │
│    │  Env    │       │   Svc   │                                        │
│    │(staging)│       │  Conn   │                                        │
│    └─────────┘       └─────────┘                                        │
│         │                  │                                              │
│    ┌────┴────┐            │                                              │
│    │Artifact │◀───────────┘                                              │
│    │ (app)  │   (consumed)                                              │
│    └─────────┘                                                          │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

Legend:  ✓ succeeded   ● inProgress   ✗ failed   ○ pending
```

## Node Types

### Phase Node

```typescript
interface PhaseNodeData {
  type: 'phase';
  name: string;
  status?: string;
}
```

Visual: Rounded rectangle container, holds job nodes

### Job Node

```typescript
interface JobNodeData {
  type: 'job';
  name: string;
  status: NodeStatus;
  startTime?: string;
  finishTime?: string;
  agentPool?: string;
}
```

Visual: Rectangle with status border and indicator

### Resource Nodes

```typescript
interface ResourceNodeData {
  type: ResourceType;
  name: string;
  resourceType?: string;
  metadata?: Record<string, unknown>;
}

type ResourceType = 'repository' | 'artifact' | 'environment' | 'variableGroup' | 'serviceConnection';
```

Visual: Colored nodes based on resource type

## Edge Types

| Edge Type | Style | Description |
|-----------|-------|-------------|
| `contains` | Solid, no arrow | Phase contains Job |
| `dependsOn` | Solid, arrow | Job dependency |
| `produces` | Dashed, arrow | Job produces Artifact |
| `consumes` | Dotted, arrow | Job consumes Artifact |
| `uses` | Dotted, no arrow | Job uses Resource |
| `deploysTo` | Solid, arrow | Job deploys to Environment |

## Color Scheme

| Node Type | Background | Border |
|-----------|------------|--------|
| Phase | #2d2d2d | #4a4a4a |
| Job (succeeded) | #1e3a2e | #22c55e |
| Job (failed) | #3a1e1e | #ef4444 |
| Job (inProgress) | #3a3a1e | #eab308 |
| Job (pending) | #2d2d2d | #6b7280 |
| Repository | #1e2d3a | #3b82f6 |
| Artifact | #3a2e1e | #f97316 |
| Environment | #1e3a2e | #22c55e |
| Service Connection | #2d1e3a | #a855f7 |
| Variable Group | #3a3a1e | #eab308 |

## Component Implementation

### JobNode.jsx

```jsx
function JobNode({ data }) {
  const statusColors = {
    succeeded: '#22c55e',
    failed: '#ef4444',
    inProgress: '#eab308',
    pending: '#6b7280',
    skipped: '#9ca3af',
    cancelled: '#6b7280',
    succeededWithIssues: '#f97316'
  };

  const borderColor = statusColors[data.status] || '#6b7280';

  return (
    <div style={{
      padding: '12px 16px',
      border: `2px solid ${borderColor}`,
      borderRadius: 8,
      background: '#1e1e1e',
      minWidth: 150,
      position: 'relative'
    }}>
      {/* Status indicator */}
      <div style={{
        position: 'absolute',
        top: -6,
        right: -6,
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: borderColor
      }} />
      
      <div style={{ fontWeight: 600, fontSize: 12 }}>{data.name}</div>
      <div style={{ fontSize: 10, color: borderColor, marginTop: 4 }}>
        {data.status}
      </div>
      
      {data.agentPool && (
        <div style={{ fontSize: 9, color: '#6b7280', marginTop: 4 }}>
          {data.agentPool}
        </div>
      )}
    </div>
  );
}
```

### ResourceNode.jsx

```jsx
function ResourceNode({ data }) {
  const typeColors = {
    repository: '#3b82f6',
    artifact: '#f97316',
    environment: '#22c55e',
    serviceConnection: '#a855f7',
    variableGroup: '#eab308'
  };

  const icons = {
    repository: '📦',
    artifact: '📦',
    environment: '🌍',
    serviceConnection: '🔗',
    variableGroup: '🔑'
  };

  const color = typeColors[data.type] || '#6b7280';

  return (
    <div style={{
      padding: '8px 12px',
      border: `1px solid ${color}`,
      borderRadius: 6,
      background: '#1a1a1a',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11
    }}>
      <span>{icons[data.type]}</span>
      <span style={{ color, fontWeight: 500 }}>{data.name}</span>
    </div>
  );
}
```

## Layout Algorithm

Using Dagre for automatic left-to-right layout:

```javascript
import dagre from 'dagre';

function getLayoutedElements(nodes, edges) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: 'LR',
    ranksep: 100,
    nodesep: 50,
    marginx: 20,
    marginy: 20
  });

  nodes.forEach(node => {
    const isPhase = node.type === 'phase';
    dagreGraph.setNode(node.id, {
      width: isPhase ? 400 : 150,
      height: isPhase ? 200 : 70
    });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWithPosition.width / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2
      }
    };
  });
}
```

## Graph Builder

```typescript
// src/lib/pipelineGraphBuilder.ts

export async function buildPipelineGraph(
  client: ADOClient,
  projectId: string,
  pipelineId: number,
  runId: number
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  // 1. Fetch all data
  const [run, timeline, artifacts] = await Promise.all([
    client.getPipelineRun(projectId, pipelineId, runId),
    client.getBuildTimeline(projectId, runId),
    client.getPipelineRunArtifacts(projectId, pipelineId, runId)
  ]);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 2. Build artifact map
  const artifactByJob = buildArtifactMap(artifacts);

  // 3. Process timeline
  const phases = timeline.records.filter(r => r.recordType === 'Phase');
  const jobs = timeline.records.filter(r => r.recordType === 'Job');

  // 4. Add phase nodes
  for (const phase of phases) {
    nodes.push(createPhaseNode(phase));

    const phaseJobs = jobs.filter(j => j.parentId === phase.id);
    
    for (const job of phaseJobs) {
      nodes.push(createJobNode(job));
      edges.push({ source: phase.id, target: job.id, type: 'contains' });

      // Job dependencies
      if (job.dependencies) {
        for (const dep of job.dependencies) {
          edges.push({
            source: dep.recordId,
            target: job.id,
            type: 'dependsOn'
          });
        }
      }

      // Produced artifacts
      const produced = artifactByJob[job.name] || [];
      for (const artifact of produced) {
        nodes.push(createArtifactNode(artifact));
        edges.push({
          source: job.id,
          target: artifact.id,
          type: 'produces'
        });
      }
    }
  }

  // 5. Add resource connections
  await addResourceConnections(client, projectId, run, nodes, edges);

  // 6. Apply layout
  return getLayoutedElements(nodes, edges);
}
```

## React Flow Integration

```jsx
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState
} from 'reactflow';

function PipelineGraph({ nodes, edges, onNodeClick }) {
  const [flowNodes, setNodes, onNodesChange] = useNodesState(nodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(edges);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      fitView
      minZoom={0.1}
    >
      <Background color="#333" gap={20} />
      <Controls />
      <MiniMap 
        nodeColor={node => getNodeColor(node)}
        maskColor="rgba(0,0,0,0.8)"
      />
    </ReactFlow>
  );
}
```

## Interaction

| Action | Result |
|--------|--------|
| Click Job Node | Open task sidebar, show tasks for that job |
| Click Resource Node | Highlight all connected jobs |
| Hover Edge | Show edge label (e.g., "produces", "dependsOn") |
| Drag Node | Reposition (layout resets on data refresh) |
| Zoom/Pan | Navigate large graphs |

## File Locations

```
src/lib/pipelineGraphBuilder.ts    # Graph data builder
src/components/views/graph/
├── PipelineGraph.jsx       # Main graph component
├── JobNode.jsx            # Custom job node
├── PhaseNode.jsx          # Custom phase node
├── ArtifactNode.jsx       # Custom artifact node
├── ResourceNode.jsx       # Custom resource node
└── index.js               # Exports
```

## Dependencies

```json
{
  "reactflow": "^11.10.0",
  "dagre": "^0.8.5",
  "@types/dagre": "^0.7.52"
}
```
