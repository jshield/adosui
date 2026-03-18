# Component Architecture

This document describes the React component architecture for the Pipeline Logs Tail Mode system.

## Component Hierarchy

```
App
└── MainView
    └── PipelinesView
        └── ResourceDetail
            └── PipelineDetail
                └── PipelineLogsViewer (NEW)
                    ├── RunTabs
                    ├── ViewToggle (Graph / List)
                    ├── PipelineGraphViewer
                    │   └── ReactFlow
                    │       ├── PhaseNode
                    │       ├── JobNode
                    │       ├── ArtifactNode
                    │       └── ResourceNode
                    ├── TimelineSidebar
                    │   └── TimelineItem
                    ├── LogViewer
                    │   └── LogLine (virtualized)
                    ├── LineSelector
                    └── CommentPanel
                        └── CommentItem
```

## Component Responsibilities

### PipelineLogsViewer

Main container component that manages the overall state and data fetching.

**Location**: `src/components/views/PipelineLogsViewer.jsx`

**Props**:
```typescript
interface PipelineLogsViewerProps {
  client: ADOClient;
  pipeline: Pipeline;
  runs: PipelineRun[];
  collection: Collection;
  profile: Profile;
  onSaveComments: (pipelineId: string, runId: number, comments: LogComment[]) => void;
}
```

**State**:
- `activeRunId` - Currently selected run
- `viewMode` - 'graph' | 'list'
- `selectedJobId` - Selected job for task view
- `selectedTaskId` - Selected task for log view
- `timeline` - Full timeline data
- `graphData` - Processed graph nodes/edges
- `logLines` - Current task's log lines
- `comments` - Comments for current run
- `selection` - Current line selection

### RunTabs

Tab bar for switching between pipeline runs.

**Location**: `src/components/views/RunTabs.jsx`

**Props**:
```typescript
interface RunTabsProps {
  runs: PipelineRun[];
  activeRunId: number | null;
  onSelect: (runId: number) => void;
}
```

### PipelineGraphViewer

React Flow-based graph visualization.

**Location**: `src/components/views/graph/PipelineGraphViewer.jsx`

**Props**:
```typescript
interface PipelineGraphViewerProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (nodeId: string) => void;
}
```

### TimelineSidebar

Hierarchical navigation for Phase → Job → Task.

**Location**: `src/components/views/TimelineSidebar.jsx`

**Props**:
```typescript
interface TimelineSidebarProps {
  timeline: Timeline | null;
  selectedJobId: string | null;
  selectedTaskId: string | null;
  onSelectJob: (jobId: string) => void;
  onSelectTask: (taskId: string) => void;
}
```

### LogViewer

Virtualized log display using react-window.

**Location**: `src/components/views/LogViewer.jsx`

**Props**:
```typescript
interface LogViewerProps {
  lines: LogLine[];
  loading: boolean;
  connectionStatus: ConnectionStatus;
  onLineSelect: (start: number, end: number) => void;
}
```

### CommentPanel

Side panel for viewing and adding comments.

**Location**: `src/components/views/CommentPanel.jsx`

**Props**:
```typescript
interface CommentPanelProps {
  comments: LogComment[];
  selectedRange: { start: number; end: number } | null;
  onAddComment: (text: string, lineRefs: LineRef[]) => void;
  onResolveComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void;
  onClose: () => void;
}
```

## Data Flow

### Loading a Run

```
1. User clicks run tab
   │
   ▼
2. PipelineLogsViewer.setActiveRunId(runId)
   │
   ▼
3. useEffect triggers:
   │  - Fetch timeline (REST)
   │  - Build graph data
   │  - Load comments from collection
   ▼
4. Render:
   │  - RunTabs (highlight active)
   │  - PipelineGraphViewer (if graph mode)
   │  - TimelineSidebar (expanded)
   ▼
5. User clicks job in graph or timeline
   │
   ▼
6. PipelineLogsViewer.setSelectedJobId(jobId)
   │
   ▼
7. Show task list for job
   │
   ▼
8. User clicks task
   │
   ▼
9. PipelineLogsViewer.setSelectedTaskId(taskId)
   │
   ▼
10. Fetch log file for task
    │
    ▼
11. Render in LogViewer (virtualized)
```

### Adding a Comment

```
1. User clicks + drags on LogViewer
   │
   ▼
2. LogViewer tracks selection
   │
   ▼
3. User clicks "Add Comment" in CommentPanel
   │
   ▼
4. User enters comment text
   │
   ▼
5. User clicks "Save"
   │
   ▼
6. PipelineLogsViewer.addComment(text, lineRefs)
   │
   ▼
7. Update local state
   │
   ▼
8. Call onSaveComments(pipelineId, runId, comments)
   │
   ▼
9. Parent updates collection
   │
   ▼
10. Collection syncs to git/wiki
```

## Custom Hooks

### usePipelineSignalR

Manages SignalR connection for live logs.

**Location**: `src/hooks/usePipelineSignalR.ts`

```typescript
function usePipelineSignalR(
  client: ADOClient | null,
  projectId: string | null,
  runId: number | null
): {
  connectionStatus: ConnectionStatus;
  logLines: LogLine[];
  clearLines: () => void;
}
```

### usePipelineGraph

Fetches and builds graph data.

**Location**: `src/hooks/usePipelineGraph.ts`

```typescript
function usePipelineGraph(
  client: ADOClient | null,
  projectId: string | null,
  pipelineId: number | null,
  runId: number | null
): {
  graphData: { nodes: GraphNode[]; edges: GraphEdge[] } | null;
  loading: boolean;
  error: Error | null;
}
```

### useLogLines

Fetches log lines (REST or cached).

**Location**: `src/hooks/useLogLines.ts`

```typescript
function useLogLines(
  runId: number | null,
  recordId: string | null
): {
  lines: LogLine[];
  loading: boolean;
  error: Error | null;
}
```

## Utility Libraries

### pipelineLogsDB

Dexie.js database operations.

**Location**: `src/lib/pipelineLogsDB.ts`

### pipelineGraphBuilder

Builds graph data from API responses.

**Location**: `src/lib/pipelineGraphBuilder.ts`

### timelineUtils

Parses timeline and builds tree structure.

**Location**: `src/lib/timelineUtils.ts`

### commentUtils

Comment management helpers.

**Location**: `src/lib/commentUtils.ts`

### lineMatching

Normalizes line IDs between SignalR and REST.

**Location**: `src/lib/lineMatching.ts`

## ADOClient Extensions

New methods added to existing client:

**Location**: `src/lib/adoClient.ts`

```typescript
// Timeline & Logs
getBuildTimeline(project: string, buildId: number): Promise<Timeline>;
getBuildLogs(project: string, buildId: number): Promise<BuildLog[]>;
getBuildLog(project: string, buildId: number, logId: number): Promise<string>;

// Pipeline Runs
getPipelineRun(project: string, pipelineId: number, runId: number): Promise<PipelineRun>;
getPipelineRunArtifacts(project: string, pipelineId: number, runId: number): Promise<Artifact[]>;

// Resources
getEnvironment(project: string, environmentId: number): Promise<Environment>;
getVariableGroup(project: string, groupId: number): Promise<VariableGroup>;
getServiceConnection(project: string, connectionId: string): Promise<ServiceEndpoint>;
```

## File Structure

```
src/
├── components/
│   └── views/
│       ├── PipelineLogsViewer.jsx      # Main container
│       ├── RunTabs.jsx                 # Run tab bar
│       ├── TimelineSidebar.jsx         # Phase/Job/Task nav
│       ├── LogViewer.jsx               # Virtualized logs
│       ├── CommentPanel.jsx            # Comments side panel
│       └── graph/
│           ├── PipelineGraphViewer.jsx
│           ├── JobNode.jsx
│           ├── PhaseNode.jsx
│           ├── ArtifactNode.jsx
│           ├── ResourceNode.jsx
│           └── index.js
├── hooks/
│   ├── usePipelineSignalR.ts
│   ├── usePipelineGraph.ts
│   └── useLogLines.ts
├── lib/
│   ├── pipelineLogsDB.ts               # Dexie operations
│   ├── pipelineGraphBuilder.ts         # Graph building
│   ├── timelineUtils.ts                # Timeline parsing
│   ├── commentUtils.ts                # Comment helpers
│   ├── lineMatching.ts                # Line ID normalization
│   └── adoClient.ts                   # Extended with new methods
└── types/
    └── pipeline.ts                    # TypeScript interfaces
```

## Integration with Existing Code

### PipelineDetail Changes

The existing `PipelineDetail` component in `ResourceDetail.jsx` is extended:

```jsx
function PipelineDetail({ client, pipeline, org, collection, profile, ... }) {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div>
      {/* Existing header */}
      <div>...pipeline info...</div>
      
      {/* Logs toggle */}
      <button onClick={() => setShowLogs(!showLogs)}>
        {showLogs ? '📜 View Details' : '📜 View Logs'}
      </button>
      
      {/* Conditional content */}
      {showLogs ? (
        <PipelineLogsViewer
          client={client}
          pipeline={pipeline}
          runs={runs}
          collection={collection}
          profile={profile}
          onSaveComments={handleSaveComments}
        />
      ) : (
        /* Existing runs by branch view */
        <RunsByBranchList runs={runs} ... />
      )}
    </div>
  );
}
```
