import React, { useState, useCallback, useMemo, useEffect } from "react";
import { T } from "../../lib/theme";
import { usePipelineGraph } from "../../hooks/usePipelineGraph";
import { usePipelineSignalR } from "../../hooks/usePipelineSignalR";
import { useLogLines } from "../../hooks/useLogLines";
import { getRecordStatus, findRecordById } from "../../lib/timelineUtils";
import {
  createLogComment,
  getCommentedLineIndices,
  getRunComments,
} from "../../lib/commentUtils";
import { PipelineGraph } from "./graph";
import { LogViewer } from "./LogViewer";
import { CommentPanel } from "./CommentPanel";
import { TimelineSidebar } from "./TimelineSidebar";
import { RunTabs } from "./RunTabs";
import { ErrorBoundary } from "./ErrorBoundary";

export function PipelineLogsViewer({
  client,
  pipeline,
  runs,
  collection,
  profile,
  onSaveComments,
  syncStatus,
}) {
  const projectName = pipeline?._projectName || pipeline?.project || "";
  const pipelineId = pipeline?.id;

  // ── State ──────────────────────────────────────────────────────────────
  const [activeRunId, setActiveRunId] = useState(null);
  const [viewMode, setViewMode] = useState("graph"); // "graph" | "list"
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedTaskLogId, setSelectedTaskLogId] = useState(null);
  const [lineSelection, setLineSelection] = useState(null);
  const [scrollToLine, setScrollToLine] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [localComments, setLocalComments] = useState([]);

  // Default to first run
  useEffect(() => {
    if (runs?.length && !activeRunId) {
      setActiveRunId(runs[0].id);
    }
  }, [runs, activeRunId]);

  // Load comments from collection when run changes
  useEffect(() => {
    if (collection && pipelineId && activeRunId) {
      const comments = getRunComments(collection, pipelineId, activeRunId);
      setLocalComments(comments);
    } else {
      setLocalComments([]);
    }
  }, [collection, pipelineId, activeRunId]);

  // Determine if the active run is still running
  const activeRun = useMemo(
    () => runs?.find((r) => r.id === activeRunId),
    [runs, activeRunId]
  );
  const isRunning =
    activeRun?.status === "inProgress" || activeRun?.state === "inProgress";

  // ── Hooks ──────────────────────────────────────────────────────────────

  const { graphData, timeline, loading: graphLoading, error: graphError } =
    usePipelineGraph(client, projectName, pipelineId, activeRunId);

  const { connectionStatus } = usePipelineSignalR(
    client,
    projectName,
    activeRunId,
    isRunning
  );

  // Find the selected task record for log fetching
  const selectedRecord = useMemo(() => {
    if (!timeline?.records || !selectedTaskId) return null;
    return findRecordById(timeline.records, selectedTaskId);
  }, [timeline, selectedTaskId]);

  const isTaskCompleted =
    selectedRecord?.state === "completed" ||
    getRecordStatus(selectedRecord) !== "inProgress";

  const { lines, loading: logLoading, error: logError } = useLogLines(
    client,
    projectName,
    activeRunId,
    selectedTaskId,
    selectedTaskLogId,
    isTaskCompleted
  );

  // Commented line indices for the log viewer gutter
  const commentedLines = useMemo(
    () => getCommentedLineIndices(localComments, selectedTaskId, lines),
    [localComments, selectedTaskId, lines]
  );

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSelectRun = useCallback((runId) => {
    setActiveRunId(runId);
    setSelectedJobId(null);
    setSelectedTaskId(null);
    setSelectedTaskLogId(null);
    setLineSelection(null);
  }, []);

  const handleNodeClick = useCallback(
    (nodeId) => {
      // Only job nodes are clickable
      const record = timeline?.records?.find(
        (r) => r.id === nodeId && r.type === "Job"
      );
      if (record) {
        setSelectedJobId(nodeId);
        setSelectedTaskId(null);
        setSelectedTaskLogId(null);
        setLineSelection(null);
      }
    },
    [timeline]
  );

  const handleSelectJob = useCallback((jobId) => {
    setSelectedJobId(jobId);
    setSelectedTaskId(null);
    setSelectedTaskLogId(null);
    setLineSelection(null);
  }, []);

  const handleSelectTask = useCallback((taskId, logId) => {
    setSelectedTaskId(taskId);
    setSelectedTaskLogId(logId || null);
    setLineSelection(null);
  }, []);

  const handleLineSelect = useCallback((range) => {
    setLineSelection(range);
    setScrollToLine(null); // clear any previous scroll target
    setShowComments(true);
  }, []);

  const handleCommentClick = useCallback(
    (comment) => {
      const refs = comment.lineRefs || [];
      if (!refs.length || !lines?.length) return;

      // Parse first and last lineRef to get line numbers
      const parseLine = (ref) => {
        const lastDash = ref.lastIndexOf("-");
        return lastDash >= 0 ? parseInt(ref.substring(lastDash + 1), 10) : NaN;
      };

      const firstNum = parseLine(refs[0]);
      const lastNum = parseLine(refs[refs.length - 1]);
      if (isNaN(firstNum)) return;

      // Find 0-based indices in the lines array
      const startIdx = lines.findIndex((l) => l.lineNumber === firstNum);
      const endIdx = !isNaN(lastNum)
        ? lines.findIndex((l) => l.lineNumber === lastNum)
        : startIdx;

      if (startIdx >= 0) {
        setLineSelection({ start: startIdx, end: endIdx >= 0 ? endIdx : startIdx });
        setScrollToLine(startIdx);
      }
    },
    [lines]
  );

  const handleAddComment = useCallback(
    (text) => {
      if (!profile || !selectedTaskId || !lineSelection) return;

      const startLineNum =
        lines[lineSelection.start]?.lineNumber || lineSelection.start + 1;
      const endLineNum =
        lines[lineSelection.end]?.lineNumber || lineSelection.end + 1;

      const comment = createLogComment({
        runId: activeRunId,
        pipelineId,
        recordId: selectedTaskId,
        startLine: startLineNum,
        endLine: endLineNum,
        author: profile.displayName || "",
        authorId: profile.id || "",
        text,
      });

      const updated = [...localComments, comment];
      setLocalComments(updated);
      setLineSelection(null);

      // Persist to collection
      if (onSaveComments) {
        onSaveComments(collection?.id, pipelineId, activeRunId, updated);
      }
    },
    [
      profile,
      selectedTaskId,
      lineSelection,
      lines,
      activeRunId,
      pipelineId,
      localComments,
      onSaveComments,
      collection,
    ]
  );

  const handleResolveComment = useCallback(
    (commentId) => {
      const updated = localComments.map((c) =>
        c.id === commentId ? { ...c, resolved: true } : c
      );
      setLocalComments(updated);
      if (onSaveComments) {
        onSaveComments(collection?.id, pipelineId, activeRunId, updated);
      }
    },
    [localComments, onSaveComments, collection, pipelineId, activeRunId]
  );

  const handleDeleteComment = useCallback(
    (commentId) => {
      const updated = localComments.filter((c) => c.id !== commentId);
      setLocalComments(updated);
      if (onSaveComments) {
        onSaveComments(collection?.id, pipelineId, activeRunId, updated);
      }
    },
    [localComments, onSaveComments, collection, pipelineId, activeRunId]
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden",
        background: T.bg,
      }}
    >
      {/* Top bar: Run tabs + view mode toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <RunTabs
          runs={runs}
          activeRunId={activeRunId}
          onSelect={handleSelectRun}
        />
        <div style={{ display: "flex", gap: 4, padding: "0 8px", flexShrink: 0 }}>
          {/* View mode toggle */}
          {["graph", "list"].map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                background: viewMode === mode ? T.dimmer : "none",
                border: `1px solid ${viewMode === mode ? T.dim : "transparent"}`,
                color: viewMode === mode ? T.heading : T.muted,
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 4,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {mode}
            </button>
          ))}
          {/* Comments toggle */}
          <button
            onClick={() => setShowComments(!showComments)}
            style={{
              background: showComments ? "rgba(245,158,11,0.1)" : "none",
              border: `1px solid ${showComments ? "rgba(245,158,11,0.3)" : "transparent"}`,
              color: showComments ? T.amber : T.muted,
              fontSize: 10,
              padding: "3px 10px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Comments{localComments.length ? ` (${localComments.length})` : ""}
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Timeline sidebar (list mode) */}
        {viewMode === "list" && (
          <TimelineSidebar
            timeline={timeline}
            selectedJobId={selectedJobId}
            selectedTaskId={selectedTaskId}
            onSelectJob={handleSelectJob}
            onSelectTask={handleSelectTask}
          />
        )}

        {/* Center: graph + logs */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Graph view */}
          {viewMode === "graph" && (
            <ErrorBoundary label="Graph">
              <div style={{ padding: 8, flexShrink: 0 }}>
                {graphLoading ? (
                  <div style={{ padding: 16, color: T.muted, fontSize: 11 }}>
                    Loading pipeline graph...
                  </div>
                ) : graphError ? (
                  <div style={{ padding: 16, color: T.red, fontSize: 11 }}>
                    Graph error: {graphError.message}
                  </div>
                ) : graphData ? (
                  <PipelineGraph
                    graphData={graphData}
                    selectedJobId={selectedJobId}
                    onNodeClick={handleNodeClick}
                  />
                ) : (
                  <div style={{ padding: 16, color: T.muted, fontSize: 11 }}>
                    Select a run to view its pipeline graph.
                  </div>
                )}
              </div>
            </ErrorBoundary>
          )}

          {/* Task list for selected job (graph mode) */}
          {viewMode === "graph" && selectedJobId && timeline?.records && (
            <div
              style={{
                padding: "4px 8px",
                borderTop: `1px solid ${T.border}`,
                borderBottom: `1px solid ${T.border}`,
                display: "flex",
                gap: 2,
                overflowX: "auto",
                flexShrink: 0,
              }}
            >
              {timeline.records
                .filter(
                  (r) =>
                    r.type === "Task" && r.parentId === selectedJobId
                )
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map((task) => {
                  const status = getRecordStatus(task);
                  const color =
                    {
                      succeeded: T.green,
                      failed: T.red,
                      inProgress: T.amber,
                    }[status] || T.muted;
                  const isActive = task.id === selectedTaskId;
                  const taskLogId = task.log?.id;

                  return (
                    <button
                      key={task.id}
                      onClick={() =>
                        handleSelectTask(task.id, taskLogId)
                      }
                      style={{
                        background: isActive ? "rgba(245,158,11,0.08)" : "none",
                        border: `1px solid ${isActive ? T.amber : T.border}`,
                        color: isActive ? T.heading : T.text,
                        fontSize: 10,
                        padding: "3px 8px",
                        borderRadius: 4,
                        cursor: taskLogId ? "pointer" : "default",
                        opacity: taskLogId ? 1 : 0.4,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <div
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: color,
                        }}
                      />
                      {task.name}
                    </button>
                  );
                })}
            </div>
          )}

          {/* Log viewer */}
          <ErrorBoundary label="Log Viewer">
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 8, overflow: "hidden", minHeight: 0 }}>
              {selectedTaskId ? (
                <LogViewer
                  lines={lines || []}
                  loading={logLoading}
                  connectionStatus={isRunning ? connectionStatus : null}
                  selectedRange={lineSelection}
                  commentedLines={commentedLines}
                  onLineSelect={handleLineSelect}
                  scrollToLine={scrollToLine}
                  noLogMessage={
                    selectedTaskLogId
                      ? undefined
                      : "This task has no log output."
                  }
                />
              ) : selectedJobId ? (
                <div style={{ padding: 16, color: T.muted, fontSize: 11 }}>
                  Select a task above to view its log output.
                </div>
              ) : (
                <div style={{ padding: 16, color: T.muted, fontSize: 11 }}>
                  {viewMode === "graph"
                    ? "Click a job node in the graph to view its tasks."
                    : "Select a task from the timeline to view its logs."}
                </div>
              )}

              {logError && (
                <div style={{ padding: 8, color: T.red, fontSize: 10 }}>
                  Log error: {logError.message}
                </div>
              )}
            </div>
          </ErrorBoundary>
        </div>

        {/* Comment panel */}
        {showComments && (
          <CommentPanel
            comments={localComments}
            selectedRange={lineSelection}
            onAddComment={handleAddComment}
            onResolveComment={handleResolveComment}
            onDeleteComment={handleDeleteComment}
            onCommentClick={handleCommentClick}
            onClose={() => setShowComments(false)}
            authorName={profile?.displayName || ""}
            disabled={syncStatus === "saving"}
          />
        )}
      </div>
    </div>
  );
}
