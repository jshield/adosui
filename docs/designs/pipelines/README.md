# Pipeline Logs Tail Mode - Design Index

This document serves as an index to the complete design documentation for the Pipeline Logs Tail Mode system.

## Document List

| Document | Description |
|----------|-------------|
| [overview.md](overview.md) | System overview, architecture, and data flow |
| [rest-api.md](rest-api.md) | Azure DevOps REST API endpoints and SignalR details |
| [data-models.md](data-models.md) | TypeScript interfaces and data structures |
| [storage.md](storage.md) | Dexie.js IndexedDB schema and operations |
| [signalr.md](signalr.md) | Real-time log streaming via SignalR |
| [graph.md](graph.md) | React Flow pipeline visualization |
| [comments.md](comments.md) | Line-based commenting system |
| [components.md](components.md) | React component architecture |

## Quick Reference

### Data Sources

| Source | Endpoint | Purpose |
|--------|----------|---------|
| Timeline | `GET /builds/{id}/timeline` | Phase/Job/Task structure |
| Logs | `GET /builds/{id}/logs/{logId}` | Task log content |
| Run | `GET /pipelines/{id}/runs/{runId}` | Run details + resources |
| Artifacts | `GET /pipelines/{id}/runs/{runId}/artifacts` | Produced artifacts |
| SignalR | WebSocket | Live log streaming |

### Key Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| reactflow | ^11.10.0 | Graph visualization |
| dagre | ^0.8.5 | Graph layout |
| dexie | ^4.0.0 | Browser storage |
| @microsoft/signalr | ^8.0.0 | Real-time streaming |
| react-window | ^1.8.10 | Virtualized lists |
| react-virtualized-auto-sizer | ^1.0.24 | Auto-sizing |

### Graph Node Types

- `phase` - Pipeline phase container
- `job` - Executable job
- `repository` - Source repository
- `artifact` - Build artifact
- `environment` - Deployment environment
- `serviceConnection` - External service
- `variableGroup` - Variable group

### Edge Types

- `contains` - Phase contains Job
- `dependsOn` - Job dependency
- `produces` - Job produces Artifact
- `consumes` - Job consumes Artifact
- `uses` - Job uses Resource
- `deploysTo` - Job deploys to Environment

### Line ID Formats

```
SignalR: "signalr-{timelineRecordId}-{index}"
REST:    "rest-{logId}-{lineNumber}"
```

### Connection Flow

```
1. Negotiate → Get WebSocket URL + Token
2. Connect to SignalR Hub
3. Invoke "WatchBuild" with projectId + runId
4. Receive "logConsoleLines" messages
5. On build complete → Disconnect → Fetch REST
```

## Implementation Phases

### Phase 1: Storage Layer
- Set up Dexie.js database
- Implement timeline/log caching

### Phase 2: API Client
- Add timeline/log/artifact endpoints to ADOClient

### Phase 3: SignalR Integration
- Create usePipelineSignalR hook
- Handle connect/disconnect/reconnect

### Phase 4: Graph View
- Build graph from timeline
- Render with React Flow + Dagre layout

### Phase 5: Log Viewer
- Lazy load logs per task
- Virtualized rendering

### Phase 6: Comments
- Line selection UI
- Comment panel
- Collection persistence

## File Locations

```
src/
├── components/views/
│   ├── PipelineLogsViewer.jsx
│   ├── RunTabs.jsx
│   ├── TimelineSidebar.jsx
│   ├── LogViewer.jsx
│   ├── CommentPanel.jsx
│   └── graph/
│       ├── PipelineGraphViewer.jsx
│       └── ...
├── hooks/
│   ├── usePipelineSignalR.ts
│   ├── usePipelineGraph.ts
│   └── useLogLines.ts
└── lib/
    ├── pipelineLogsDB.ts
    ├── pipelineGraphBuilder.ts
    ├── timelineUtils.ts
    ├── commentUtils.ts
    ├── lineMatching.ts
    └── adoClient.ts (extended)

docs/designs/pipelines/
├── overview.md
├── rest-api.md
├── data-models.md
├── storage.md
├── signalr.md
├── graph.md
├── comments.md
└── components.md
```

## Open Questions (for implementation)

1. **Log retention period** - How long to keep cached data?
2. **Max runs in tabs** - How many historical run tabs?
3. **Graph performance** - How many jobs before virtualization needed?
4. **Comment sync** - Real-time sync or on-save only?
5. **Error boundaries** - How to handle API failures gracefully?
