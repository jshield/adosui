# Data Models

This document defines the TypeScript interfaces and data structures used throughout the Pipeline Logs Tail Mode system.

## Core Types

### Pipeline Run

```typescript
interface PipelineRun {
  id: number;
  buildNumber: string;
  state: RunState;
  result?: RunResult;
  sourceBranch: string;
  queueTime?: string;
  startTime?: string;
  finishTime?: string;
  _projectName: string;
  pipelineId: number;
}

type RunState = "completed" | "inProgress" | "cancelling" | "pending";
type RunResult = "succeeded" | "failed" | "succeededWithIssues" | "cancelled" | "skipped";
```

### Timeline

```typescript
interface Timeline {
  lastChangedBy: string;
  lastChangedOn: string;
  changeId: number;
  records: TimelineRecord[];
}

interface TimelineRecord {
  id: string;
  recordType: "Phase" | "Job" | "Task";
  name: string;
  path?: string;
  startTime?: string;
  finishTime?: string;
  result?: string;
  state: "completed" | "inProgress" | "pending";
  parentId?: string;
  previousAttempts?: TimelineRecordAttempt[];
  workerName?: string;
  logId?: number;
  lineOffset?: number;
  taskId?: string;
  jobName?: string;
  expand?: string[];
  dependencies?: TimelineDependency[];
  errorCount?: number;
  warningCount?: number;
}

interface TimelineRecordAttempt {
  attemptId: number;
  recordId: string;
}

interface TimelineDependency {
  jobId: string;
  recordId: string;
  dependencyType: "ordered" | "exclusive";
  alias?: string;
}
```

### Log Line

```typescript
interface LogLine {
  id: string;
  runId: number;
  recordId?: string;
  lineNumber: number;
  content: string;
  receivedAt?: number;
  createdAt: number;
}
```

## Graph Types

### Graph Node

```typescript
type GraphNodeType = 
  | "phase" 
  | "job" 
  | "task"
  | "repository" 
  | "artifact" 
  | "environment" 
  | "variableGroup" 
  | "serviceConnection"
  | "agentPool";

interface GraphNode {
  id: string;
  type: GraphNodeType;
  name: string;
  status?: NodeStatus;
  position?: { x: number; y: number };
  data: GraphNodeData;
}

type NodeStatus = "succeeded" | "failed" | "inProgress" | "pending" | "skipped" | "cancelled" | "succeededWithIssues";

interface GraphNodeData {
  // Common
  metadata?: Record<string, unknown>;
  
  // Job specific
  startTime?: string;
  finishTime?: string;
  agentPool?: string;
  
  // Resource specific
  resourceType?: string;
  fullName?: string;
  version?: string;
  sourcePipeline?: number;
  sourceRun?: number;
}
```

### Graph Edge

```typescript
type EdgeType = 
  | "contains" 
  | "dependsOn" 
  | "produces" 
  | "consumes" 
  | "uses" 
  | "deploysTo";

interface GraphEdge {
  id?: string;
  source: string;
  target: string;
  type: EdgeType;
  label?: string;
  animated?: boolean;
  style?: Record<string, unknown>;
}
```

## Comment Types

### Log Comment

```typescript
interface LogComment {
  id: string;
  runId: number;
  pipelineId: number;
  lineRefs: LineRef[];
  author: string;
  text: string;
  resolved: boolean;
  createdAt: number;
}

interface LineRef {
  source: "signalr" | "rest";
  id: string;
}
```

### Line Reference Formats

```
SignalR format: "signalr-{timelineRecordId}-{index}"
REST format:     "rest-{logId}-{lineNumber}"
```

## Collection Schema

### Pipeline in Collection

```typescript
interface CollectionPipeline {
  id: string;
  name: string;
  project: string;
  folder?: string;
  configurationType?: string;
  runs: CollectionPipelineRun[];
  comments: LogComment[];
}

interface CollectionPipelineRun {
  id: number;
  buildNumber?: string;
  branch?: string;
  startTime?: string;
  comments: LogComment[];
  // Optionally store log lines for offline viewing
  logLines?: SerializedLogLine[];
}

interface SerializedLogLine {
  id: string;
  content: string;
  lineNumber: number;
}
```

## API Response Types

### Build Log Response

```typescript
// GET /builds/{buildId}/logs - response
interface BuildLogsResponse {
  count: number;
  value: BuildLog[];
}

interface BuildLog {
  id: number;
  type: string;
  url: string;
  name: string;
  lineCount?: number;
}
```

### Pipeline Run Response

```typescript
// GET /pipelines/{pipelineId}/runs/{runId} - response
interface PipelineRunResponse {
  _links: {
    self: { href: string };
    web: { href: string };
    pipeline: { href: string };
  };
  pipeline: {
    id: number;
    name: string;
    folder: string;
  };
  state: RunState;
  result?: RunResult;
  createdDate: string;
  startedDate?: string;
  finishedDate?: string;
  resources?: {
    repositories?: RepositoryResource[];
    pipelines?: PipelineResource[];
    containers?: ContainerResource[];
    packages?: PackageResource[];
  };
}

interface RepositoryResource {
  alias: string;
  id: string;
  name: string;
  type: string;
  ref: string;
  version: string;
}
```

## Storage Types (Dexie)

### Timeline Cache

```typescript
interface CachedTimeline {
  runId: number;
  projectId: string;
  data: Timeline;
  fetchedAt: number;
}
```

### Log Lines Cache

```typescript
interface CachedLogLine {
  id?: number;
  runId: number;
  recordId: string;
  lineNumber: number;
  content: string;
  createdAt: number;
}
```

## SignalR Message Types

### Log Console Lines Message

```typescript
interface LogConsoleLinesMessage {
  lines: string[];
  timelineId: string;
  timelineRecordId: string;
  stepRecordId: string;
  buildId: number;
}
```

### Build Updated Message

```typescript
interface BuildUpdatedMessage {
  build: PipelineBuild;
  buildId: number;
}

interface PipelineBuild {
  id: number;
  buildNumber: string;
  status: string;
  result?: string;
  startTime?: string;
  finishTime?: string;
  definition: {
    id: number;
    name: string;
  };
  // ... other build properties
}
```
