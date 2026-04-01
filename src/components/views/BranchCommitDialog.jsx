import { useState, useCallback } from "react";
import { T } from "../../lib/theme";
import { Btn, Input, Spinner, formLabelStyle } from "../ui";

/**
 * BranchCommitDialog — Shows branch name, commit message, and handles the
 * create-branch → commit → optional-PR workflow.
 *
 * States:
 *   "config"    → user edits branch name + commit message, clicks commit
 *   "committing" → branch + push in progress
 *   "committed"  → success, shows option to create PR
 *   "creating-pr" → PR creation in progress
 *   "pr-created"  → PR done, shows link
 *
 * @param {object} props
 * @param {string} props.branchName - Initial branch name (editable)
 * @param {string} props.commitMessage - Initial commit message (editable)
 * @param {string} props.targetBranch - Base branch (for display)
 * @param {(branchName: string, commitMessage: string) => Promise<void>} props.onCommit - Creates branch + pushes file
 * @param {() => void} props.onCancel
 * @param {(prBranch: string) => Promise<{ url: string, pullRequestId: number }>} props.onCreatePR
 */
export function BranchCommitDialog({ branchName: initialBranch, commitMessage: initialMsg, targetBranch, onCommit, onCancel, onCreatePR }) {
  const [branchName, setBranchName] = useState(initialBranch);
  const [commitMessage, setCommitMessage] = useState(initialMsg);
  const [phase, setPhase] = useState("config"); // config | committing | committed | creating-pr | pr-created
  const [error, setError] = useState(null);
  const [prUrl, setPrUrl] = useState(null);

  const handleCommit = useCallback(async () => {
    if (!branchName.trim() || !commitMessage.trim()) return;
    setPhase("committing");
    setError(null);
    try {
      await onCommit(branchName.trim(), commitMessage.trim());
      setPhase("committed");
    } catch (e) {
      setError(e.message || "Failed to commit");
      setPhase("config");
    }
  }, [branchName, commitMessage, onCommit]);

  const handleCreatePR = useCallback(async () => {
    setPhase("creating-pr");
    setError(null);
    try {
      const pr = await onCreatePR(branchName.trim());
      setPrUrl(pr.url);
      setPhase("pr-created");
    } catch (e) {
      setError(e.message || "Failed to create PR");
      setPhase("committed");
    }
  }, [branchName, onCreatePR]);

  const handleDone = useCallback(() => {
    onCancel(); // parent resets to tool selection
  }, [onCancel]);

  if (phase === "committing") {
    return (
      <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <Spinner size={18} />
        <span style={{ fontSize: 13, color: T.muted }}>Creating branch and committing…</span>
      </div>
    );
  }

  if (phase === "creating-pr") {
    return (
      <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <Spinner size={18} />
        <span style={{ fontSize: 13, color: T.muted }}>Creating pull request…</span>
      </div>
    );
  }

  if (phase === "pr-created") {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 13, color: T.green, fontWeight: 500, marginBottom: 12 }}>
          Pull request created
        </div>
        {prUrl && (
          <a href={prUrl} target="_blank" rel="noreferrer"
            style={{ color: T.amber, fontSize: 12, fontFamily: "'JetBrains Mono'", textDecoration: "none", display: "block", marginBottom: 16, wordBreak: "break-all" }}
          >
            {prUrl} ↗
          </a>
        )}
        <Btn variant="primary" onClick={handleDone}>Done</Btn>
      </div>
    );
  }

  if (phase === "committed") {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 13, color: T.green, fontWeight: 500, marginBottom: 6 }}>
          Committed to <code style={{ color: T.amber, background: `${T.amber}12`, padding: "1px 6px", borderRadius: 3 }}>{branchName}</code>
        </div>
        <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 16 }}>
          Pushed to {targetBranch || "main"} ← {branchName}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="primary" onClick={handleCreatePR}>Create Pull Request</Btn>
          <Btn onClick={handleDone}>Done</Btn>
        </div>
        {error && (
          <div style={{ fontSize: 11, color: T.red, fontFamily: "'JetBrains Mono'", marginTop: 10 }}>{error}</div>
        )}
      </div>
    );
  }

  // Config phase
  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <label style={formLabelStyle}>Branch Name</label>
        <Input value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="yaml-tool/my-change" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={formLabelStyle}>Commit Message</label>
        <textarea
          value={commitMessage}
          onChange={e => setCommitMessage(e.target.value)}
          rows={3}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${error ? T.red + "55" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 5, outline: "none", color: T.text,
            fontFamily: "'JetBrains Mono'", padding: "8px 12px", fontSize: 12,
            width: "100%", boxSizing: "border-box", resize: "vertical",
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", marginBottom: 14 }}>
        Base branch: {targetBranch || "main"}
      </div>
      {error && (
        <div style={{ fontSize: 11, color: T.red, fontFamily: "'JetBrains Mono'", marginBottom: 10 }}>{error}</div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Btn variant="primary" onClick={handleCommit} disabled={!branchName.trim() || !commitMessage.trim()}>
          Create Branch & Commit
        </Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}
