# REST API Surface

This document details the Azure DevOps REST API endpoints used by the Pipeline Logs Tail Mode system.

## Base URLs

- **Pipelines API**: `https://dev.azure.com/{organization}/{project}/_apis/pipelines`
- **Build API**: `https://dev.azure.com/{organization}/{project}/_apis/build`
- **Distributed Task API**: `https://dev.azure.com/{organization}/{project}/_apis/distributedtask`
- **Service Endpoint API**: `https://dev.azure.com/{organization}/{project}/_apis/serviceendpoint`
- **Git API**: `https://dev.azure.com/{organization}/{project}/_apis/git`

## Timeline & Logs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{project}/_apis/build/builds/{buildId}/timeline` | GET | Get build timeline (phases, jobs, tasks) |
| `/{project}/_apis/build/builds/{buildId}/logs` | GET | Get list of log files |
| `/{project}/_apis/build/builds/{buildId}/logs/{logId}` | GET | Get specific log content |
| `/{project}/_apis/build/builds/{buildId}/logs/{logId}?startLine=X&endLine=Y` | GET | Get log line range |

### Timeline Response Structure

```typescript
interface Timeline {
  records: TimelineRecord[];
}

interface TimelineRecord {
  id: string;
  recordType: "Phase" | "Job" | "Task";
  name: string;
  result?: "succeeded" | "failed" | "skipped" | "succeededWithIssues";
  state?: "completed" | "inProgress" | "pending";
  parentId?: string;
  startTime?: string;
  finishTime?: string;
  logId?: number;
  lineOffset?: number;
  jobName?: string;
  taskId?: string;
  dependencies?: Dependency[];
}

interface Dependency {
  jobId: string;
  recordId: string;
  dependencyType: "ordered" | "exclusive";
}
```

## Pipeline Runs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{project}/_apis/pipelines/{pipelineId}/runs` | GET | List pipeline runs |
| `/{project}/_apis/pipelines/{pipelineId}/runs/{runId}` | GET | Get run details with resources |
| `/{project}/_apis/pipelines/{pipelineId}/runs/{runId}/artifacts` | GET | List artifacts produced by run |

### Run Response Resources

The `/runs/{runId}` endpoint returns resource information in the response:

```typescript
interface PipelineRun {
  id: number;
  name: string;
  state: "completed" | "inProgress" | "cancelling" | "pending";
  result?: "succeeded" | "failed" | "succeededWithIssues" | "cancelled";
  resources: {
    repositories: RepositoryResource[];
    pipelines: PipelineResource[];
    containers: ContainerResource[];
    packages: PackageResource[];
  };
}

interface RepositoryResource {
  alias: string;
  id: string;
  name: string;
  type: "git" | "github" | "bitbucket";
  ref: string;
  version: string;
}

interface PipelineResource {
  alias: string;
  id: number;
  name: string;
  sourceBranch: string;
  sourceVersion: string;
}

interface ContainerResource {
  alias: string;
  name: string;
  tag: string;
}
```

## Artifacts

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{project}/_apis/pipelines/{pipelineId}/runs/{runId}/artifacts` | GET | List artifacts |
| `/{project}/_apis/pipelines/{pipelineId}/runs/{runId}/artifacts/{artifactName}` | GET | Get specific artifact |
| `/{project}/_apis/pipelines/{pipelineId}/runs/{runId}/artifacts?$expand=signedContent` | GET | Get with signed content |

### Artifact Response

```typescript
interface Artifact {
  id: number;
  name: string;
  type: "PipelineArtifact" | "Build";
  resource: {
    type: string;
    url: string;
    data: string;
    version: string;
  };
  createdBy: {
    displayName: string;
    id: string;
  };
}
```

## Environments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{project}/_apis/distributedtask/environments` | GET | List environments |
| `/{project}/_apis/pipelines/environments/{environmentId}` | GET | Get environment details |

```typescript
interface Environment {
  id: number;
  name: string;
  description: string;
  createdBy: {
    displayName: string;
    id: string;
  };
  createdOn: string;
  modifiedBy: {
    displayName: string;
    id: string;
  };
  modifiedOn: string;
  resourceReference: {
    id: string;
    type: string;
  };
}
```

## Variable Groups

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{project}/_apis/distributedtask/variablegroups` | GET | List variable groups |
| `/{project}/_apis/distributedtask/variablegroups/{groupId}` | GET | Get variable group |

```typescript
interface VariableGroup {
  id: number;
  name: string;
  description: string;
  variables: Record<string, {
    value: string;
    isSecret: boolean;
  }>;
  createdBy: string;
  createdOn: string;
  modifiedBy: string;
  modifiedOn: string;
}
```

## Service Connections (Endpoints)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{project}/_apis/serviceendpoint/endpoints` | GET | List service connections |
| `/{project}/_apis/serviceendpoint/endpoints/{endpointId}` | GET | Get service connection |
| `/_apis/serviceendpoint/types` | GET | List service connection types |

```typescript
interface ServiceEndpoint {
  id: string;
  name: string;
  type: string;
  url: string;
  authorization: {
    scheme: "UsernamePassword" | "Token" | "Certificate" | "OAuth";
  };
  createdBy: {
    displayName: string;
    id: string;
  };
}
```

## Repositories

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/{project}/_apis/git/repositories` | GET | List repositories |
| `/{project}/_apis/git/repositories/{repoId}` | GET | Get repository |

## Agent Pools

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/_apis/distributedtask/pools` | GET | List agent pools |
| `/_apis/distributedtask/pools/{poolId}` | GET | Get pool details |
| `/_apis/distributedtask/pools/{poolId}/agents` | GET | List agents in pool |

## SignalR Hub

### Negotiation

```
POST https://dev.azure.com/{org}/_apis/{projectId}/signalr/negotiate?transport=webSockets&contextToken={organizationId}
```

Headers:
- `Authorization`: Basic base64(":PAT")

Response:
```typescript
interface NegotiationResponse {
  url: string;
  accessToken: string;
  connectionId: string;
}
```

### Hub URL

```
wss://dev.azure.com/_signalr/{projectId}/signalr
```

### SignalR Messages

#### logConsoleLines
```json
{
  "H": "BuildDetailHub",
  "M": "logConsoleLines",
  "A": [{
    "lines": ["line 1", "line 2"],
    "timelineId": "guid",
    "timelineRecordId": "guid",
    "stepRecordId": "guid",
    "buildId": 660
  }]
}
```

#### buildUpdated
```json
{
  "H": "BuildDetailHub",
  "M": "buildUpdated",
  "A": [{
    "build": { ... },
    "buildId": 660
  }]
}
```

#### timelineRecordsUpdated
```json
{
  "H": "BuildDetailHub",
  "M": "timelineRecordsUpdated",
  "A": [660, "timelineId", "timelineId", 8]
}
```

### SignalR Invocations

#### WatchBuild
```
{
  "H": "builddetailhub",
  "M": "WatchBuild",
  "A": ["{projectId}", {runId}],
  "I": 2
}
```

#### StopWatchingBuild
```
{
  "H": "builddetailhub",
  "M": "StopWatchingBuild",
  "A": ["{projectId}", {runId}],
  "I": 1
}
```

## API Version

All endpoints use `api-version=7.1` unless otherwise specified.
