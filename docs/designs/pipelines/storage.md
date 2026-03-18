# Storage Layer

This document describes the storage architecture using Dexie.js (IndexedDB) for caching pipeline data in the browser.

## Overview

The storage layer serves two purposes:
1. **Caching** - Reduce API calls by caching timeline and log data
2. **Session State** - Store log lines for the current session

Data is **not** persisted across browser sessions - it's refetched on each visit.

## Database Schema

```typescript
// Database: PipelineLogsDB
// Version: 1

import Dexie from 'dexie';

class PipelineLogsDB extends Dexie {
  timelines: Dexie.Table<CachedTimeline, number>;
  logLines: Dexie.Table<CachedLogLine, number>;

  constructor() {
    super('PipelineLogsDB');

    this.version(1).stores({
      timelines: 'runId, projectId, fetchedAt',
      logLines: '[runId+recordId], runId, recordId, lineNumber, createdAt'
    });
  }
}
```

## Table Definitions

### timelines

Caches the full timeline response (phases, jobs, tasks) for a run.

| Field | Type | Index | Description |
|-------|------|-------|-------------|
| runId | number | Yes | Build/run ID |
| projectId | string | Yes | Project name |
| data | Timeline | No | Full timeline response |
| fetchedAt | number | Yes | Unix timestamp |

### logLines

Caches log lines per job/task.

| Field | Type | Index | Description |
|-------|------|-------|-------------|
| id | number | Auto | Auto-increment key |
| runId | number | Yes | Build/run ID |
| recordId | string | Composite | Job/task ID |
| lineNumber | number | Yes | Line number in log |
| content | string | No | Log line text |
| createdAt | number | Yes | Unix timestamp |

## Composite Index

The `[runId+recordId]` index enables efficient queries:
```javascript
db.logLines
  .where('[runId+recordId]')
  .equals([runId, recordId])
  .sortBy('lineNumber');
```

## Operations

### Timeline Operations

```typescript
// Save timeline
async function saveTimeline(runId: number, projectId: string, timeline: Timeline): Promise<void> {
  await pipelineLogsDB.timelines.put({
    runId,
    projectId,
    data: timeline,
    fetchedAt: Date.now()
  });
}

// Get timeline
async function getTimeline(runId: number): Promise<Timeline | undefined> {
  const cached = await pipelineLogsDB.timelines.get(runId);
  return cached?.data;
}

// Check if timeline is fresh (within 5 minutes)
async function isTimelineFresh(runId: number, maxAgeMs: number = 300000): Promise<boolean> {
  const cached = await pipelineLogsDB.timelines.get(runId);
  if (!cached) return false;
  return Date.now() - cached.fetchedAt < maxAgeMs;
}
```

### Log Line Operations

```typescript
// Save log lines
async function saveLogLines(
  runId: number, 
  recordId: string, 
  lines: string[]
): Promise<void> {
  const timestamp = Date.now();
  await pipelineLogsDB.logLines.bulkAdd(
    lines.map((content, idx) => ({
      runId,
      recordId,
      lineNumber: idx + 1,
      content,
      createdAt: timestamp
    }))
  );
}

// Get log lines for a job/task
async function getLogLines(
  runId: number, 
  recordId: string
): Promise<LogLine[]> {
  return pipelineLogsDB.logLines
    .where('[runId+recordId]')
    .equals([runId, recordId])
    .sortBy('lineNumber');
}

// Get all log line count for a run
async function getLogLineCount(runId: number): Promise<number> {
  return pipelineLogsDB.logLines.where('runId').equals(runId).count();
}
```

### Cache Management

```typescript
// Clear all data for a specific run
async function clearRunData(runId: number): Promise<void> {
  await pipelineLogsDB.transaction('rw', 
    pipelineLogsDB.timelines, 
    pipelineLogsDB.logLines,
    async () => {
      await pipelineLogsDB.timelines.where('runId').equals(runId).delete();
      await pipelineLogsDB.logLines.where('runId').equals(runId).delete();
    }
  );
}

// Clear all cached data
async function clearAllData(): Promise<void> {
  await pipelineLogsDB.timelines.clear();
  await pipelineLogsDB.logLines.clear();
}

// Get storage usage estimate
async function getStorageUsage(): Promise<{ timelines: number; logLines: number }> {
  const [timelineCount, logLineCount] = await Promise.all([
    pipelineLogsDB.timelines.count(),
    pipelineLogsDB.logLines.count()
  ]);
  
  return {
    timelines: timelineCount,
    logLines: logLineCount
  };
}

// Auto-cleanup old data on startup
async function cleanupOldData(maxAgeMs: number = 3600000): Promise<void> {
  const cutoff = Date.now() - maxAgeMs;
  
  await pipelineLogsDB.transaction('rw',
    pipelineLogsDB.timelines,
    pipelineLogsDB.logLines,
    async () => {
      // Delete old timelines
      const oldTimelines = await pipelineLogsDB.timelines
        .where('fetchedAt')
        .below(cutoff)
        .primaryKeys();
      await pipelineLogsDB.timelines.bulkDelete(oldTimelines);
      
      // Delete old log lines
      const oldLogLines = await pipelineLogsDB.logLines
        .where('createdAt')
        .below(cutoff)
        .primaryKeys();
      await pipelineLogsDB.logLines.bulkDelete(oldLogLines);
    }
  );
}
```

## Usage in Components

### React Integration

```typescript
import { useLiveQuery } from 'dexie-react-hooks';

// Custom hook for log lines
function useLogLines(runId: number | null, recordId: string | null) {
  return useLiveQuery(async () => {
    if (!runId || !recordId) return [];
    return getLogLines(runId, recordId);
  }, [runId, recordId]);
}

// Custom hook for timeline
function useTimeline(runId: number | null) {
  return useLiveQuery(async () => {
    if (!runId) return null;
    return getTimeline(runId);
  }, [runId]);
}
```

## File Location

```
src/lib/pipelineLogsDB.js
```

## Dependencies

```json
{
  "dexie": "^4.0.0",
  "dexie-react-hooks": "^1.1.7"
}
```

## Notes

- All data is session-based and cleared on browser close
- Timeline data is refetched on each run tab selection (for completed runs)
- Log lines are lazy-loaded per task/job
- No offline support - requires active connection for fresh data
