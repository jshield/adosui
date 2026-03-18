# Pipeline Logs Tail Mode - Design Overview

## System Overview

The Pipeline Logs Tail Mode provides real-time log streaming and historical log viewing for Azure DevOps pipeline runs, with integrated commenting capabilities. The system uses a hybrid approach: SignalR for live streaming of running builds, and REST API for fetching completed run data.

## Key Features

1. **Real-time Log Streaming** - Live logs via SignalR WebSocket connection
2. **Historical Log Viewing** - REST API for completed runs with lazy loading
3. **Interactive Graph View** - Visual pipeline topology with phases, jobs, and resources
4. **Timeline Navigation** - Phase → Job → Task hierarchy for log organization
5. **Line-based Commenting** - Add comments to specific log lines or ranges
6. **Collection Integration** - Persist comments to linked Azure DevOps collections
7. **Resource Visualization** - Show repositories, artifacts, environments, service connections

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PipelineLogsViewer                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────────────────────────────────┐  ┌────────────┐  │
│   │                  RunTabs                         │  │ CommentPan │  │
│   │  [660 ●] [659] [658] [657] [+older]           │  │    el     │  │
│   └─────────────────────────────────────────────────┘  └────────────┘  │
│   ┌─────────────────────────────────────────────────┐                   │
│   │              PipelineGraphViewer                  │                   │
│   │  (React Flow - Phases → Jobs → Resources)      │                   │
│   └─────────────────────────────────────────────────┘                   │
│   ┌─────────────────────────────────────────────────┐                   │
│   │              TimelineSidebar                      │                   │
│   │  Phase: Build > Job: Build > Task: npm         │                   │
│   └─────────────────────────────────────────────────┘                   │
│   ┌─────────────────────────────────────────────────┐                   │
│   │              LogViewer (Virtualized)             │                   │
│   │  (react-window - lazy loaded per task)         │                   │
│   └─────────────────────────────────────────────────┘                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
User selects pipeline
        │
        ▼
Load runs list (from existing API)
        │
        ▼
User selects a run tab
        │
        ▼
Build Pipeline Graph (REST)
        │
        ├── Fetch timeline (phases/jobs/tasks)
        ├── Fetch run resources (repos, envs, etc)
        └── Fetch artifacts
        │
        ▼
Render graph with React Flow
        │
        ▼
User clicks a job/node
        │
        ▼
Show task list for that job
        │
        ▼
User clicks a task
        │
        ▼
Fetch log file for that task (REST)
        │
        ▼
Render in virtualized list
        │
        ▼
If run is RUNNING:
  - Connect SignalR
  - Stream live logs
  - Match to existing lines
```

## Integration Points

### Existing Components
- **PipelinesView** - Entry point for pipeline selection
- **PipelineDetail** - Container for pipeline details, extended with logs
- **ADOClient** - Extended with new API methods
- **Collection System** - Comments persisted to collection YAML

### Storage
- **Dexie.js** - Browser IndexedDB for log caching
- **Collection YAML** - Comment persistence

## User Interactions

1. **Select Pipeline** → View pipeline runs
2. **Select Run Tab** → Load timeline and graph
3. **Click Graph Node** → Navigate to job/tasks
4. **Select Task** → Load and display logs
5. **Click+Drag on Logs** → Select line range
6. **Add Comment** → Save to collection

## Document Structure

This design documentation is organized into:

1. **[Overview](overview.md)** - This document
2. **[REST API Surface](rest-api.md)** - Azure DevOps API endpoints
3. **[Data Models](data-models.md)** - TypeScript interfaces
4. **[Storage Layer](storage.md)** - Dexie.js schema
5. **[SignalR Integration](signalr.md)** - Real-time streaming
6. **[Graph Visualization](graph.md)** - React Flow implementation
7. **[Comment System](comments.md)** - Line-based commenting
8. **[Component Architecture](components.md)** - React components

## Dependencies

```json
{
  "@microsoft/signalr": "^8.0.0",
  "dexie": "^4.0.0",
  "react-window": "^1.8.10",
  "react-virtualized-auto-sizer": "^1.0.24",
  "reactflow": "^11.10.0",
  "dagre": "^0.8.5"
}
```
