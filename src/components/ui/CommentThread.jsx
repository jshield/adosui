import { useState, useRef } from "react";
import { T } from "../../lib/theme";

/**
 * CommentThread
 *
 * A collapsible inline comment thread with an add-comment input.
 * Renders below a resource card in CollectionResources and ResourceDetail.
 *
 * Props:
 *   comments    – array of { text, author, authorId, createdAt }
 *   onAdd       – (text) => void  (called when user submits a new comment)
 *   authorName  – string (current user's display name, pre-filled as author)
 *   disabled    – bool (disable posting, e.g. while saving)
 */
export function CommentThread({ comments = [], onAdd, authorName = "", disabled = false }) {
  const [open,     setOpen]     = useState(false);
  const [draft,    setDraft]    = useState("");
  const [posting,  setPosting]  = useState(false);
  const inputRef = useRef(null);

  const count = comments.length;

  const handleToggle = () => {
    setOpen(o => !o);
    if (!open) {
      // Focus input on open
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  const handlePost = async () => {
    const text = draft.trim();
    if (!text || posting || disabled) return;
    setPosting(true);
    try {
      await onAdd(text);
      setDraft("");
    } finally {
      setPosting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handlePost();
    if (e.key === "Escape") { setOpen(false); setDraft(""); }
  };

  const fmtDate = (iso) => {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }); }
    catch { return ""; }
  };

  return (
    <div style={{ marginTop: 6 }}>
      {/* Toggle button */}
      <button
        onClick={handleToggle}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "3px 0",
          fontSize: 11,
          fontFamily: "'JetBrains Mono'",
          color: count > 0 ? T.cyan : T.dim,
          display: "flex",
          alignItems: "center",
          gap: 5,
          opacity: 0.8,
        }}
        title={open ? "Collapse comments" : "Expand comments"}
      >
        <span style={{ fontSize: 12 }}>💬</span>
        <span>{count > 0 ? `${count} comment${count !== 1 ? "s" : ""}` : "Add comment"}</span>
        <span style={{ opacity: 0.5 }}>{open ? "▴" : "▾"}</span>
      </button>

      {/* Expanded thread */}
      {open && (
        <div style={{ marginTop: 6, borderLeft: `2px solid ${T.border}`, paddingLeft: 12 }}>
          {/* Existing comments */}
          {comments.map((c, i) => (
            <div key={i} style={{
              marginBottom: 8,
              background: "rgba(255,255,255,0.025)",
              border: `1px solid ${T.border}`,
              borderRadius: 5,
              padding: "8px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, fontFamily: "'Barlow Condensed'", letterSpacing: "0.04em" }}>
                  {c.author || "Unknown"}
                </span>
                <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>
                  {fmtDate(c.createdAt)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {c.text}
              </div>
            </div>
          ))}

          {/* Add comment input */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 4 }}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment… (Ctrl+Enter to post)"
              rows={2}
              disabled={posting || disabled}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${draft ? T.cyan + "44" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 5,
                outline: "none",
                color: T.text,
                padding: "7px 10px",
                fontSize: 12,
                fontFamily: "'Barlow'",
                resize: "none",
                lineHeight: 1.5,
                transition: "border-color 0.12s",
              }}
            />
            <button
              onClick={handlePost}
              disabled={!draft.trim() || posting || disabled}
              style={{
                background: draft.trim() ? `${T.cyan}18` : "rgba(255,255,255,0.04)",
                border: `1px solid ${draft.trim() ? T.cyan + "44" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 5,
                padding: "7px 14px",
                cursor: draft.trim() && !posting && !disabled ? "pointer" : "not-allowed",
                color: draft.trim() ? T.cyan : T.dim,
                fontSize: 12,
                fontFamily: "'Barlow'",
                fontWeight: 500,
                whiteSpace: "nowrap",
                opacity: posting ? 0.5 : 1,
                alignSelf: "stretch",
              }}
            >
              {posting ? "…" : "Post"}
            </button>
          </div>
          <div style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", marginTop: 4 }}>
            Posting as {authorName || "you"} · Ctrl+Enter
          </div>
        </div>
      )}
    </div>
  );
}
