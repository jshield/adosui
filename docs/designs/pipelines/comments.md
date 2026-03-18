# Comment System

This document describes the line-based commenting system for pipeline logs.

## Overview

Users can select a range of log lines and add comments. Comments are persisted to the linked Azure DevOps collection and synced via git.

## Features

1. **Line Selection** - Click and drag to select log line ranges
2. **Side Panel** - Dedicated panel for viewing/managing comments
3. **Line References** - Comments reference specific lines (SignalR or REST format)
4. **Collection Sync** - Comments persist to collection YAML

## Line Selection

### Click + Drag Implementation

```typescript
function useLineSelection(onSelectionChange: (range: LineRange | null) => void) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  const handleMouseDown = (lineIndex: number, e: React.MouseEvent) => {
    if (e.button === 0) { // Left click
      setSelectionStart(lineIndex);
      setSelectionEnd(lineIndex);
      setIsSelecting(true);
    }
  };

  const handleMouseEnter = (lineIndex: number) => {
    if (isSelecting) {
      setSelectionEnd(lineIndex);
    }
  };

  const handleMouseUp = () => {
    if (isSelecting && selectionStart !== null && selectionEnd !== null) {
      const range = {
        start: Math.min(selectionStart, selectionEnd),
        end: Math.max(selectionStart, selectionEnd)
      };
      onSelectionChange(range);
    }
    setIsSelecting(false);
  };

  return {
    isSelecting,
    selectionStart,
    selectionEnd,
    handleMouseDown,
    handleMouseEnter,
    handleMouseUp
  };
}
```

### Selection Highlight

```jsx
function LogLine({ line, index, isSelected, isInSelection }) {
  const background = isInSelection ? 'rgba(245, 158, 11, 0.15)' : 'transparent';
  
  return (
    <div
      onMouseDown={(e) => handleMouseDown(index, e)}
      onMouseEnter={() => handleMouseEnter(index)}
      onMouseUp={handleMouseUp}
      style={{
        display: 'flex',
        background,
        cursor: 'pointer'
      }}
    >
      <span style={{ width: 40, textAlign: 'right', color: 'dim' }}>
        {line.lineNumber}
      </span>
      <span>{line.content}</span>
    </div>
  );
}
```

## Data Structures

### Comment Interface

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
  source: 'signalr' | 'rest';
  id: string;
}
```

### Line ID Formats

```
SignalR format: "signalr-{timelineRecordId}-{index}"
REST format:     "rest-{logId}-{lineNumber}"
```

Example:
- SignalR: `signalr-12f1170f-54f2-53f3-20dd-22fc7dff55f9-5`
- REST: `rest-1-42`

## Comment Panel

### Layout

```
┌────────────────────────────┐
│ COMMENTS              [x]  │
├────────────────────────────┤
│ ┌────────────────────────┐ │
│ │ 💬 Lines 5-10         │ │
│ │ by John · 2 minutes   │ │
│ │                        │ │
│ │ This command failed    │ │
│ │ because of missing     │ │
│ │ dependencies.          │ │
│ │                        │ │
│ │ [Resolve] [Delete]     │ │
│ └────────────────────────┘ │
│                            │
│ ┌────────────────────────┐ │
│ │ 💬 Line 42            │ │
│ │ by Jane · 5 minutes  │ │
│ │                        │ │
│ │ Timeout issue -        │ │
│ │ increasing limit.      │ │
│ │                        │ │
│ │ [Resolve] [Delete]     │ │
│ └────────────────────────┘ │
├────────────────────────────┤
│ [+ Add Comment]           │
└────────────────────────────┘
```

### Component

```jsx
function CommentPanel({ 
  comments, 
  selectedRange,
  onAddComment, 
  onResolveComment, 
  onDeleteComment 
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');

  const handleAdd = () => {
    if (!newCommentText.trim()) return;
    
    onAddComment({
      text: newCommentText.trim(),
      lineRefs: selectedRange 
        ? buildLineRefs(selectedRange)
        : []
    });
    
    setNewCommentText('');
    setIsAdding(false);
  };

  return (
    <div style={{
      width: 280,
      borderLeft: '1px solid #333',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{ padding: 12, borderBottom: '1px solid #333' }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>COMMENTS</span>
        <span style={{ fontSize: 10, color: '#666', marginLeft: 8 }}>
          {comments.length}
        </span>
      </div>

      {/* Comment List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {comments.map(comment => (
          <CommentItem 
            key={comment.id} 
            comment={comment}
            onResolve={() => onResolveComment(comment.id)}
            onDelete={() => onDeleteComment(comment.id)}
          />
        ))}
      </div>

      {/* Add Comment Form */}
      {selectedRange || isAdding ? (
        <div style={{ padding: 8, borderTop: '1px solid #333' }}>
          {selectedRange && (
            <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>
              Commenting on lines {selectedRange.start + 1}-{selectedRange.end + 1}
            </div>
          )}
          <textarea
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder="Enter your comment..."
            style={{
              width: '100%',
              height: 60,
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#fff',
              padding: 8,
              fontSize: 12,
              resize: 'none'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button onClick={() => setIsAdding(false)}>Cancel</button>
            <button 
              onClick={handleAdd}
              disabled={!newCommentText.trim()}
              style={{ background: '#f59e0b', color: '#000' }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <button 
          onClick={() => setIsAdding(true)}
          style={{ margin: 8 }}
        >
          + Add Comment
        </button>
      )}
    </div>
  );
}
```

## Collection Persistence

### Schema Extension

```typescript
// In collection.yaml
pipelines:
  - id: "23"
    name: "My Pipeline"
    runs:
      - id: 660
        buildNumber: "20260318.1"
        branch: "refs/heads/master"
        startTime: "2026-03-18T07:29:54Z"
        comments:
          - id: "comment-123"
            lineRefs:
              - source: "rest"
                id: "rest-1-5"
              - source: "rest"  
                id: "rest-1-6"
            author: "John Doe"
            text: "This command failed because..."
            resolved: false
            createdAt: 1777777777777
```

### Save Function

```typescript
function saveCommentsToCollection(
  collection: Collection,
  pipelineId: string,
  runId: number,
  comments: LogComment[]
): Collection {
  const updated = { ...collection };
  
  const pipelineIdx = updated.pipelines.findIndex(
    p => String(p.id) === String(pipelineId)
  );
  
  if (pipelineIdx < 0) return collection;
  
  if (!updated.pipelines[pipelineIdx].runs) {
    updated.pipelines[pipelineIdx].runs = [];
  }
  
  const runIdx = updated.pipelines[pipelineIdx].runs.findIndex(
    r => r.id === runId
  );
  
  if (runIdx < 0) {
    updated.pipelines[pipelineIdx].runs.push({
      id: runId,
      comments
    });
  } else {
    updated.pipelines[pipelineIdx].runs[runIdx].comments = comments;
  }
  
  return updated;
}
```

## Line Matching

When switching between SignalR (live) and REST (completed), comments need to be matched to line IDs:

```typescript
function normalizeLineRefs(
  signalrLines: LogLine[],
  restLines: LogLine[]
): LineRef[] {
  const matched = [];
  
  // Index rest lines by content
  const restByContent = {};
  restLines.forEach(line => {
    if (!restByContent[line.content]) {
      restByContent[line.content] = [];
    }
    restByContent[line.content].push(line);
  });
  
  signalrLines.forEach(signalrLine => {
    const candidates = restByContent[signalrLine.content];
    
    if (candidates?.length === 1) {
      matched.push({
        source: 'rest' as const,
        id: `rest-${candidates[0].logId}-${candidates[0].lineNumber}`
      });
    } else if (candidates?.length > 1) {
      // Find closest by timestamp
      const closest = candidates.reduce((best, curr) => 
        Math.abs(curr.receivedAt - signalrLine.receivedAt) <
        Math.abs(best.receivedAt - signalrLine.receivedAt)
          ? curr : best
      );
      matched.push({
        source: 'rest' as const,
        id: `rest-${closest.logId}-${closest.lineNumber}`
      });
    } else {
      // No match - keep original SignalR reference
      matched.push({
        source: 'signalr' as const,
        id: signalrLine.id
      });
    }
  });
  
  return matched;
}
```

## File Locations

```
src/components/views/
├── CommentPanel.jsx      # Side panel component
├── LogViewer.jsx         # Updated with selection
└── PipelineLogsViewer.jsx

src/lib/
├── commentUtils.ts       # Comment helpers
└── lineMatching.ts      # Line ID normalization
```

## Dependencies

No additional dependencies required - uses existing React state management.

## Notes

- Comments are tied to specific run IDs
- Line IDs are normalized when build completes (SignalR → REST)
- Collection sync uses existing git-based persistence
- Comments visible to all collection members (shared scope)
