# SignalR Integration

This document describes the SignalR integration for real-time log streaming of running pipeline builds.

## Overview

SignalR provides live log streaming for pipeline runs that are currently in progress. Once a run completes, the system switches to REST API for fetching final log data.

## SignalR Hub Details

### Hub URL

```
wss://dev.azure.com/_signalr/{projectId}/signalr
```

For your organization:
- **Organization**: jshield
- **Project ID**: 216a8129-e82c-4424-8b40-bbd33b1490ab
- **Hub URL**: `wss://dev.azure.com/_signalr/216a8129-e82c-4424-8b40-bbd33b1490ab/signalr`

### Negotiation

Before connecting, negotiate to get the WebSocket URL and access token:

```
POST https://dev.azure.com/{org}/_apis/{projectId}/signalr/negotiate
```

Query parameters:
- `transport=webSockets`
- `contextToken={organizationId}` (your org ID)

Headers:
- `Authorization: Basic base64(":PAT")`

### Organization ID

Your Azure DevOps organization ID (for contextToken):
- **Organization ID**: `dbdef725-0847-46e6-8768-d431e433b9f4`

## Connection Flow

```typescript
class PipelineSignalR {
  private connection: signalR.HubConnection | null = null;
  private readonly HUB_URL = 'https://dev.azure.com/_signalr/216a8129-e82c-4424-8b40-bbd33b1490ab/signalr';
  private readonly ORG_ID = 'dbdef725-0847-46e6-8768-d431e433b9f4';

  async connect(client: ADOClient, projectId: string, runId: number): Promise<void> {
    // 1. Negotiate
    const negotiateUrl = `${client.base}/_apis/216a8129-e82c-4424-8b40-bbd33b1490ab/signalr/negotiate?transport=webSockets&contextToken=${this.ORG_ID}`;
    
    const response = await fetch(negotiateUrl, {
      headers: client._getHeaders()
    });
    
    const { url, accessToken } = await response.json();

    // 2. Build connection
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(url, {
        accessTokenFactory: () => accessToken
      })
      .withAutomaticReconnect([0, 1000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // 3. Register handlers
    this.connection.on('logConsoleLines', this.handleLogLines.bind(this));
    this.connection.on('buildUpdated', this.handleBuildUpdated.bind(this));
    this.connection.on('timelineRecordsUpdated', this.handleTimelineUpdated.bind(this));
    
    this.connection.onclose(this.handleClose.bind(this));
    this.connection.onreconnecting(this.handleReconnecting.bind(this));
    this.connection.onreconnected(this.handleReconnected.bind(this));

    // 4. Start connection
    await this.connection.start();

    // 5. Subscribe to build
    await this.connection.invoke('WatchBuild', projectId, runId);
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.invoke('StopWatchingBuild', projectId, runId);
        await this.connection.stop();
      } catch (e) {
        // Ignore errors on disconnect
      }
      this.connection = null;
    }
  }
}
```

## Message Handlers

### logConsoleLines

Received when new log lines are available:

```typescript
interface LogConsoleLinesMessage {
  lines: string[];
  timelineId: string;
  timelineRecordId: string;
  stepRecordId: string;
  buildId: number;
}

handleLogLines(messages: LogConsoleLinesMessage[]): void {
  messages.forEach(msg => {
    if (msg.lines && Array.isArray(msg.lines)) {
      const newLines = msg.lines.map((content, idx) => ({
        id: `${msg.buildId}-${msg.timelineRecordId}-${idx}`,
        content,
        timelineRecordId: msg.timelineRecordId,
        stepRecordId: msg.stepRecordId,
        buildId: msg.buildId,
        receivedAt: Date.now()
      }));
      
      // Append to log buffer
      this.onLogLines(newLines);
    }
  });
}
```

### buildUpdated

Received when build state changes:

```typescript
handleBuildUpdated(data: { build: PipelineBuild; buildId: number }): void {
  // Update build state in UI
  this.onBuildUpdate(data.build);
  
  // If completed, trigger REST fetch for final logs
  if (data.build.state === 'completed') {
    this.onBuildCompleted(data.build);
  }
}
```

### timelineRecordsUpdated

Received when timeline records change (job started, task completed, etc.):

```typescript
handleTimelineUpdated(data: [buildId, timelineId, recordId, changeType]): void {
  // Could trigger timeline refetch
}
```

## Reconnection Strategy

The SignalR client is configured with exponential backoff:

```typescript
.withAutomaticReconnect([0, 1000, 5000, 10000, 30000])
//  - Immediate retry
//  - 1 second
//  - 5 seconds
//  - 10 seconds
//  - 30 seconds
```

## States

```typescript
type ConnectionStatus = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';
```

## React Hook

```typescript
// src/hooks/usePipelineSignalR.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';

export function usePipelineSignalR(
  client: ADOClient | null,
  projectId: string | null,
  runId: number | null
) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  const connect = useCallback(async () => {
    if (!client || !projectId || !runId) return;

    try {
      setConnectionStatus('connecting');
      
      // ... connection logic ...
      
      await connection.start();
      setConnectionStatus('connected');
      
      await connection.invoke('WatchBuild', projectId, runId);
      connectionRef.current = connection;
      
    } catch (error) {
      console.error('SignalR connection failed:', error);
      setConnectionStatus('error');
    }
  }, [client, projectId, runId]);

  const disconnect = useCallback(async () => {
    // ... disconnect logic ...
  }, []);

  useEffect(() => {
    if (runId && projectId && client) {
      connect();
    }
    return () => disconnect();
  }, [runId, projectId]);

  return {
    connectionStatus,
    logLines,
    clearLines: () => setLogLines([])
  };
}
```

## Integration with REST

When a build completes via SignalR:

1. Receive `buildUpdated` with state === 'completed'
2. Disconnect SignalR connection
3. Fetch final timeline via REST
4. Fetch final logs via REST for each job/task
5. Match SignalR lines to REST lines (for comment continuity)

## File Location

```
src/hooks/usePipelineSignalR.ts
```

## Dependencies

```json
{
  "@microsoft/signalr": "^8.0.0"
}
```

## Error Handling

| Error | Handling |
|-------|----------|
| Auth failure | Show error, prompt for re-auth |
| Connection timeout | Auto-retry with backoff |
| Build cancelled | Update UI, don't reconnect |
| Network loss | Auto-reconnect |

## Notes

- Only connects for runs with `state === 'inProgress'`
- Automatically disconnects when run completes
- Line IDs use SignalR format until REST sync
- Comments created during live streaming use SignalR line IDs
