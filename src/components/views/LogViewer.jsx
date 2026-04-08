import React, { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { FixedSizeList } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { T } from "../../lib/theme";

const LINE_HEIGHT = 20;

function LogLine({ style, line, index, isSelected, hasComment, isSelecting, onMouseDown, onMouseEnter }) {
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

const Row = React.memo(({ index, style, data }) => {
  const { lines, selStart, selEnd, commentedLines, isSelecting, handleMouseDown, handleMouseEnter } = data;
  const line = lines[index];
  const isSelected = selStart >= 0 && selEnd >= 0 && index >= selStart && index <= selEnd;
  return (
    <LogLine
      style={style}
      line={line}
      index={index}
      isSelected={isSelected}
      hasComment={commentedLines?.has(index) || false}
      isSelecting={isSelecting}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
    />
  );
});

export function LogViewer({
  lines,
  loading,
  connectionStatus,
  selectedRange,
  commentedLines,
  onLineSelect,
  noLogMessage,
  scrollToLine,
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
      listRef.current.scrollToItem(lines.length - 1, "end");
    }
    prevLenRef.current = lines.length;
  }, [lines.length, connectionStatus]);

  // Scroll to a specific line when requested (e.g. clicking a comment)
  useEffect(() => {
    if (scrollToLine != null && listRef.current) {
      // Offset by 3 lines so there's context above the target
      listRef.current.scrollToItem(Math.max(0, scrollToLine - 3), "start");
    }
  }, [scrollToLine]);

  const handleMouseDown = useCallback((index, e) => {
    if (e.button !== 0) return;
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

  const effectiveStart = selectedRange ? selectedRange.start : selectionStart;
  const effectiveEnd = selectedRange ? selectedRange.end : selectionEnd;
  const selStart = Math.min(effectiveStart ?? -1, effectiveEnd ?? -1);
  const selEnd = Math.max(effectiveStart ?? -1, effectiveEnd ?? -1);

  // Memoize itemData to avoid re-rendering all rows when unrelated state changes
  const itemData = useMemo(
    () => ({ lines, selStart, selEnd, commentedLines, isSelecting, handleMouseDown, handleMouseEnter }),
    [lines, selStart, selEnd, commentedLines, isSelecting, handleMouseDown, handleMouseEnter]
  );

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
        minHeight: 0,
        background: T.bg,
        borderRadius: 4,
        border: `1px solid ${T.border}`,
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Progress bar (loading / live connected) */}
      {(loading || connectionStatus === "connected" || connectionStatus === "connecting") && (
        <div
          style={{
            height: 2,
            flexShrink: 0,
            background: connectionStatus === "connected" ? T.green : T.amber,
            opacity: 0.6,
          }}
        />
      )}

      {/* Connection status badge */}
      {connectionStatus && connectionStatus !== "disconnected" && (
        <div
          style={{
            position: "absolute",
            top: 4,
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

      {/* Virtualized log lines */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <AutoSizer>
          {({ width, height }) => (
            <FixedSizeList
              ref={listRef}
              width={width}
              height={height}
              itemCount={lines.length}
              itemSize={LINE_HEIGHT}
              itemData={itemData}
              overscanCount={10}
            >
              {Row}
            </FixedSizeList>
          )}
        </AutoSizer>
      </div>
    </div>
  );
}
