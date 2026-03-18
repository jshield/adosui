import React, { useRef, useEffect, useCallback, useState } from "react";
import { List } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer";
import { T } from "../../lib/theme";

const LINE_HEIGHT = 20;

function LogLineRow({ index, style, lines, selectionStart, selectionEnd, isSelecting, commentedLines, onMouseDown, onMouseEnter }) {
  const line = lines[index];
  if (!line) return null;

  const selStart = Math.min(selectionStart ?? -1, selectionEnd ?? -1);
  const selEnd = Math.max(selectionStart ?? -1, selectionEnd ?? -1);
  const isSelected =
    selStart >= 0 && selEnd >= 0 && index >= selStart && index <= selEnd;
  const hasComment = commentedLines?.has(index);

  return (
    <div
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        background: isSelected ? "rgba(245,158,11,0.12)" : "transparent",
        userSelect: isSelecting ? "none" : "auto",
      }}
      onMouseDown={(e) => onMouseDown(index, e)}
      onMouseEnter={() => onMouseEnter(index)}
    >
      {/* Comment indicator */}
      <div
        style={{
          width: 8,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {hasComment && (
          <div
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: T.amber,
            }}
          />
        )}
      </div>

      {/* Line number */}
      <span
        style={{
          width: 48,
          flexShrink: 0,
          textAlign: "right",
          paddingRight: 10,
          fontSize: 10,
          fontFamily: "JetBrains Mono, monospace",
          color: T.dim,
          userSelect: "none",
        }}
      >
        {line.lineNumber}
      </span>

      {/* Content */}
      <span
        style={{
          flex: 1,
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
          color: T.text,
          whiteSpace: "pre",
          overflow: "hidden",
        }}
      >
        {line.content}
      </span>
    </div>
  );
}

export function LogViewer({
  lines,
  loading,
  connectionStatus,
  selectedRange,
  commentedLines,
  onLineSelect,
  noLogMessage,
}) {
  const listRef = useRef(null);
  const prevLenRef = useRef(0);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);

  // Auto-scroll to bottom in tail mode (connected + new lines)
  useEffect(() => {
    if (
      connectionStatus === "connected" &&
      lines.length > prevLenRef.current &&
      listRef.current
    ) {
      listRef.current.scrollToRow({ index: lines.length - 1, align: "end" });
    }
    prevLenRef.current = lines.length;
  }, [lines.length, connectionStatus]);

  const handleMouseDown = useCallback((index, e) => {
    if (e.button !== 0) return; // left click only
    setSelectionStart(index);
    setSelectionEnd(index);
    setIsSelecting(true);
  }, []);

  const handleMouseEnter = useCallback(
    (index) => {
      if (isSelecting) {
        setSelectionEnd(index);
      }
    },
    [isSelecting]
  );

  const handleMouseUp = useCallback(() => {
    if (isSelecting && selectionStart !== null && selectionEnd !== null) {
      const start = Math.min(selectionStart, selectionEnd);
      const end = Math.max(selectionStart, selectionEnd);
      onLineSelect?.({ start, end });
    }
    setIsSelecting(false);
  }, [isSelecting, selectionStart, selectionEnd, onLineSelect]);

  // Use selected range from parent if provided (e.g., when clicking a comment)
  const effectiveStart = selectedRange ? selectedRange.start : selectionStart;
  const effectiveEnd = selectedRange ? selectedRange.end : selectionEnd;

  if (!lines?.length && !loading) {
    return (
      <div style={{ padding: 16, color: T.muted, fontSize: 12 }}>
        {noLogMessage || "No log output for this task."}
      </div>
    );
  }

  return (
    <div
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        flex: 1,
        minHeight: 200,
        background: T.bg,
        borderRadius: 4,
        border: `1px solid ${T.border}`,
        position: "relative",
      }}
    >
      {/* Status bar */}
      {(loading || connectionStatus === "connected" || connectionStatus === "connecting") && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: connectionStatus === "connected" ? T.green : T.amber,
            opacity: 0.6,
            zIndex: 1,
          }}
        />
      )}

      {/* Connection indicator */}
      {connectionStatus && connectionStatus !== "disconnected" && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 8,
            fontSize: 9,
            color:
              connectionStatus === "connected"
                ? T.green
                : connectionStatus === "error"
                ? T.red
                : T.amber,
            background: "rgba(0,0,0,0.6)",
            padding: "2px 6px",
            borderRadius: 3,
            zIndex: 2,
          }}
        >
          {connectionStatus}
        </div>
      )}

      <AutoSizer>
        {({ height, width }) => (
          <List
            listRef={listRef}
            style={{ height, width }}
            rowCount={lines.length}
            rowHeight={LINE_HEIGHT}
            rowProps={{
              lines,
              selectionStart: effectiveStart,
              selectionEnd: effectiveEnd,
              isSelecting,
              commentedLines,
              onMouseDown: handleMouseDown,
              onMouseEnter: handleMouseEnter,
            }}
            rowComponent={LogLineRow}
          />
        )}
      </AutoSizer>
    </div>
  );
}
