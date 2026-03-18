import React, { useState } from "react";
import { T } from "../../lib/theme";
import { getCommentLineRange } from "../../lib/commentUtils";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function CommentItem({ comment, onResolve, onDelete }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        marginBottom: 6,
        background: comment.resolved ? "rgba(255,255,255,0.01)" : "rgba(245,158,11,0.04)",
        border: `1px solid ${comment.resolved ? T.border : "rgba(245,158,11,0.15)"}`,
        borderRadius: 6,
        opacity: comment.resolved ? 0.5 : 1,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 10, color: T.amber, fontWeight: 600 }}>
          {getCommentLineRange(comment)}
        </span>
        <span style={{ fontSize: 9, color: T.muted }}>
          {timeAgo(comment.createdAt)}
        </span>
      </div>

      {/* Author */}
      <div style={{ fontSize: 9, color: T.muted, marginBottom: 4 }}>
        {comment.author}
      </div>

      {/* Text */}
      <div
        style={{
          fontSize: 11,
          color: T.text,
          lineHeight: 1.4,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {comment.text}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {!comment.resolved && (
          <button
            onClick={() => onResolve(comment.id)}
            style={{
              background: "none",
              border: `1px solid ${T.dim}`,
              color: T.muted,
              fontSize: 9,
              padding: "2px 8px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Resolve
          </button>
        )}
        <button
          onClick={() => onDelete(comment.id)}
          style={{
            background: "none",
            border: `1px solid ${T.dim}`,
            color: T.muted,
            fontSize: 9,
            padding: "2px 8px",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function CommentPanel({
  comments,
  selectedRange,
  onAddComment,
  onResolveComment,
  onDeleteComment,
  onClose,
  authorName,
  disabled,
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState("");

  const handleAdd = () => {
    if (!newText.trim()) return;
    onAddComment(newText.trim());
    setNewText("");
    setIsAdding(false);
  };

  const showForm = selectedRange || isAdding;

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        borderLeft: `1px solid ${T.border}`,
        display: "flex",
        flexDirection: "column",
        background: T.panel,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontWeight: 600,
              fontSize: 11,
              color: T.heading,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Comments
          </span>
          <span
            style={{
              fontSize: 9,
              color: T.muted,
              background: T.dimmer,
              padding: "1px 5px",
              borderRadius: 8,
            }}
          >
            {comments?.length || 0}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: T.muted,
            fontSize: 14,
            cursor: "pointer",
            padding: 0,
            lineHeight: 1,
          }}
        >
          x
        </button>
      </div>

      {/* Comment list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {comments?.length ? (
          comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              onResolve={onResolveComment}
              onDelete={onDeleteComment}
            />
          ))
        ) : (
          <div style={{ padding: 12, color: T.muted, fontSize: 11, textAlign: "center" }}>
            No comments yet. Select lines in the log to add one.
          </div>
        )}
      </div>

      {/* Add comment form */}
      {showForm ? (
        <div style={{ padding: 8, borderTop: `1px solid ${T.border}` }}>
          {selectedRange && (
            <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>
              Commenting on lines {selectedRange.start + 1}-{selectedRange.end + 1}
            </div>
          )}
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Enter your comment..."
            style={{
              width: "100%",
              height: 60,
              background: T.bg,
              border: `1px solid ${T.dim}`,
              borderRadius: 4,
              color: T.text,
              padding: 8,
              fontSize: 11,
              fontFamily: "Barlow, sans-serif",
              resize: "none",
              boxSizing: "border-box",
              outline: "none",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 6,
              marginTop: 6,
            }}
          >
            <button
              onClick={() => {
                setIsAdding(false);
                setNewText("");
              }}
              style={{
                background: "none",
                border: `1px solid ${T.dim}`,
                color: T.muted,
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!newText.trim() || disabled}
              style={{
                background: T.amber,
                border: "none",
                color: T.bg,
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 4,
                cursor: newText.trim() && !disabled ? "pointer" : "default",
                opacity: newText.trim() && !disabled ? 1 : 0.4,
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: 8, borderTop: `1px solid ${T.border}` }}>
          <button
            onClick={() => setIsAdding(true)}
            style={{
              width: "100%",
              background: "none",
              border: `1px solid ${T.dim}`,
              color: T.muted,
              fontSize: 10,
              padding: "5px 0",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            + Add Comment
          </button>
        </div>
      )}
    </div>
  );
}
