import { useState, useCallback } from "react";
import { T } from "../../lib/theme";
import { Btn, Spinner, Pill } from "../ui";
import { interpolate } from "../../lib/workflowManager";

/**
 * StepActionDialog — Modal for previewing and confirming step action execution.
 * Renders action-specific content based on action type.
 */
export function StepActionDialog({
  step,
  action,
  loopContext,
  client,
  profile,
  project,
  parentWi,
  stepResults,
  onExecute,
  onClose,
}) {
  const [phase, setPhase] = useState("preview"); // preview | executing | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [userContent, setUserContent] = useState(""); // for user-input content mode

  const resolvedTitle = loopContext
    ? interpolate(step.title, {}, parentWi, stepResults, loopContext)
    : step.title;

  const handleExecute = useCallback(async () => {
    setPhase("executing");
    setError(null);
    try {
      // Inject user-provided content if applicable
      const execAction = { ...action };
      if (action.contentMode === "user-input" && userContent) {
        execAction.content = userContent;
      }

      const r = await onExecute(execAction);
      setResult(r);
      setPhase("done");
    } catch (e) {
      setError(e.message || "Action failed");
      setPhase("error");
    }
  }, [action, userContent, onExecute]);

  const renderActionPreview = () => {
    switch (action.type) {
      case "merge-vars":
        return <MergeVarsPreview action={action} loopContext={loopContext} stepResults={stepResults} />;
      case "edit-file":
        return <EditFilePreview action={action} loopContext={loopContext} stepResults={stepResults} userContent={userContent} setUserContent={setUserContent} />;
      case "raise-pr":
        return <RaisePRPreview action={action} loopContext={loopContext} stepResults={stepResults} />;
      case "run-pipeline":
        return <RunPipelinePreview action={action} loopContext={loopContext} stepResults={stepResults} />;
      case "request-approval":
        return <ApprovalPreview action={action} loopContext={loopContext} stepResults={stepResults} />;
      case "gather-pipeline-outputs":
        return <GatherPreview action={action} />;
      case "create-task":
        return <CreateTaskPreview action={action} loopContext={loopContext} />;
      default:
        return <div style={{ fontSize: 12, color: T.dim }}>Action type: {action.type}</div>;
    }
  };

  const renderResult = () => {
    if (!result) return null;
    return (
      <div style={{ marginTop: 16, padding: "12px", background: `${T.green}10`, borderRadius: 6, border: `1px solid ${T.green}33` }}>
        <div style={{ fontSize: 12, color: T.green, fontWeight: 600, marginBottom: 8 }}>Completed</div>
        {result.branch && <ResultRow label="Branch" value={result.branch} />}
        {result.filePath && <ResultRow label="File" value={result.filePath} />}
        {result.pullRequestId && <ResultRow label="PR" value={`#${result.pullRequestId}`} href={result.url} />}
        {result.runId && <ResultRow label="Run" value={`#${result.runId}`} href={result.runUrl} />}
        {result.taskId && <ResultRow label="Task" value={`#${result.taskId}`} />}
        {result.approvalId && <ResultRow label="Approval" value={result.status} />}
        {result.outputs && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 4 }}>OUTPUTS</div>
            {Object.entries(result.outputs).map(([k, v]) => (
              <ResultRow key={k} label={k} value={String(v)} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={phase === "executing" ? undefined : onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8,
          padding: 24, minWidth: 400, maxWidth: 560, maxHeight: "80vh", overflowY: "auto",
        }}
      >
        <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 18, color: T.heading, marginBottom: 4 }}>
          {resolvedTitle}
        </div>
        {step.description && (
          <div style={{ fontSize: 12, color: T.dim, marginBottom: 16 }}>{step.description}</div>
        )}

        <Pill label={actionLabel(action.type)} color={T.cyan} />

        {phase === "preview" && (
          <div style={{ marginTop: 16 }}>
            {renderActionPreview()}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Btn variant="primary" onClick={handleExecute}>Execute</Btn>
              <Btn onClick={onClose}>Cancel</Btn>
            </div>
          </div>
        )}

        {phase === "executing" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 20, justifyContent: "center", marginTop: 16 }}>
            <Spinner size={18} />
            <span style={{ fontSize: 13, color: T.muted }}>Executing…</span>
          </div>
        )}

        {phase === "done" && (
          <div>
            {renderResult()}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <Btn onClick={onClose}>Close</Btn>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div>
            <div style={{ marginTop: 16, padding: "12px", background: `${T.red}10`, borderRadius: 6, border: `1px solid ${T.red}33` }}>
              <div style={{ fontSize: 12, color: T.red, fontWeight: 600 }}>Failed</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{error}</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Btn onClick={handleExecute}>Retry</Btn>
              <Btn onClick={onClose}>Close</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Action-specific previews ──────────────────────────────────────────────────

function ResultRow({ label, value, href }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, padding: "3px 0" }}>
      <span style={{ color: T.dim, fontFamily: "'JetBrains Mono'", fontSize: 11, width: 80, flexShrink: 0 }}>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener" style={{ color: T.blue, textDecoration: "underline" }}>{value}</a>
      ) : (
        <span style={{ color: T.text, fontFamily: "'JetBrains Mono'" }}>{value}</span>
      )}
    </div>
  );
}

function GatherPreview({ action }) {
  const pipelines = action.pipelines || [];
  return (
    <div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>
        Will fetch latest successful build numbers from {pipelines.length} pipeline(s):
      </div>
      {pipelines.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 12 }}>
          <span style={{ color: T.text }}>{p.name || `Pipeline ${p.pipelineId}`}</span>
          <span style={{ color: T.dim }}>→</span>
          <span style={{ color: T.cyan, fontFamily: "'JetBrains Mono'" }}>{p.tfvarKey}</span>
        </div>
      ))}
    </div>
  );
}

function MergeVarsPreview({ action, loopContext, stepResults }) {
  const vars = action.vars || {};
  const filePath = loopContext
    ? interpolate(action.filePath || "", {}, {}, stepResults, loopContext)
    : action.filePath || "";

  return (
    <div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>
        Update <span style={{ color: T.cyan, fontFamily: "'JetBrains Mono'" }}>{filePath}</span>:
      </div>
      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: 12, fontFamily: "'JetBrains Mono'", fontSize: 11 }}>
        {Object.entries(vars).map(([k, v]) => (
          <div key={k} style={{ padding: "2px 0" }}>
            <span style={{ color: T.amber }}>{k}</span>
            <span style={{ color: T.dim }}> = </span>
            <span style={{ color: T.green }}>"{String(v)}"</span>
          </div>
        ))}
      </div>
      <ResultRow label="Branch" value={action.branch || "(auto)"} />
    </div>
  );
}

function EditFilePreview({ action, loopContext, stepResults, userContent, setUserContent }) {
  const filePath = loopContext
    ? interpolate(action.filePath || "", {}, {}, stepResults, loopContext)
    : action.filePath || "";

  return (
    <div>
      <ResultRow label="Repo" value={action.repo || "?"} />
      <ResultRow label="Path" value={filePath} />
      <ResultRow label="Branch" value={action.branch || "(auto)"} />
      <ResultRow label="Commit" value={action.commitMessage || "(default)"} />
      {action.contentMode === "user-input" && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", display: "block", marginBottom: 4 }}>
            FILE CONTENT
          </label>
          <textarea
            value={userContent}
            onChange={e => setUserContent(e.target.value)}
            placeholder="Enter file content…"
            style={{
              width: "100%", minHeight: 120, background: "rgba(255,255,255,0.04)",
              border: `1px solid ${T.border}`, borderRadius: 5, color: T.text,
              fontFamily: "'JetBrains Mono'", fontSize: 11, padding: 10, resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}
      {action.content && action.contentMode !== "user-input" && (
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", display: "block", marginBottom: 4 }}>
            CONTENT
          </label>
          <pre style={{
            background: "rgba(255,255,255,0.02)", borderRadius: 6, padding: 12,
            fontFamily: "'JetBrains Mono'", fontSize: 11, color: T.text,
            whiteSpace: "pre-wrap", maxHeight: 160, overflowY: "auto",
          }}>
            {action.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function RaisePRPreview({ action, loopContext, stepResults }) {
  const title = loopContext
    ? interpolate(action.titleTemplate || "", {}, {}, stepResults, loopContext)
    : action.titleTemplate || "";
  const desc = loopContext
    ? interpolate(action.descriptionTemplate || "", {}, {}, stepResults, loopContext)
    : action.descriptionTemplate || "";

  return (
    <div>
      <ResultRow label="Repo" value={action.repo || "?"} />
      <ResultRow label="Source" value={action.sourceBranch || "?"} />
      <ResultRow label="Target" value={action.targetBranch || "main"} />
      {title && <ResultRow label="Title" value={title} />}
      {desc && (
        <div style={{ marginTop: 8, fontSize: 12, color: T.muted, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
          {desc}
        </div>
      )}
    </div>
  );
}

function RunPipelinePreview({ action, loopContext, stepResults }) {
  const params = action.params || {};
  return (
    <div>
      <ResultRow label="Pipeline" value={String(action.pipeline || "?")} />
      <ResultRow label="Project" value={action.project || "?"} />
      {Object.keys(params).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", marginBottom: 4 }}>PARAMETERS</div>
          {Object.entries(params).map(([k, v]) => (
            <div key={k} style={{ display: "flex", gap: 8, fontSize: 12, padding: "2px 0" }}>
              <span style={{ color: T.amber, fontFamily: "'JetBrains Mono'", width: 100 }}>{k}</span>
              <span style={{ color: T.text }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalPreview({ action }) {
  return (
    <div>
      <ResultRow label="Environment" value={action.environment || "?"} />
      {action.description && (
        <div style={{ marginTop: 8, fontSize: 12, color: T.muted, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
          {action.description}
        </div>
      )}
    </div>
  );
}

function CreateTaskPreview({ action, loopContext }) {
  return (
    <div>
      <ResultRow label="Title" value={action.title || "Workflow Task"} />
      {action.description && (
        <div style={{ marginTop: 8, fontSize: 12, color: T.muted, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
          {action.description}
        </div>
      )}
    </div>
  );
}

function actionLabel(type) {
  const labels = {
    "gather-pipeline-outputs": "Gather Outputs",
    "merge-vars": "Merge Variables",
    "edit-file": "Edit File",
    "raise-pr": "Create Pull Request",
    "run-pipeline": "Run Pipeline",
    "request-approval": "Request Approval",
    "create-task": "Create Task",
  };
  return labels[type] || type;
}
