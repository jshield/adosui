import { useState, useEffect, useCallback } from "react";
import { T } from "../../lib/theme";
import { Pill, Dot, Spinner, Btn } from "../ui";
import {
  readWorkflowState,
  computeProgress,
  executeAction,
  resolveAction,
  getWorkflowTemplateId,
  interpolate,
} from "../../lib/workflowManager";
import { StepActionDialog } from "./StepActionDialog";

/**
 * WorkflowSection — Inline workflow state + controls rendered within
 * WorkItemDetail when a work item has a workflow tag.
 *
 * Renders: header with progress, collapsible track groups, step cards
 * with action buttons, approval controls.
 */
export function WorkflowSection({
  client,
  workItem,
  profile,
  org,
  workflowTemplates,
  showToast,
}) {
  const templateId = getWorkflowTemplateId(workItem);
  const template = workflowTemplates?.byId?.get(templateId);

  const [state, setState] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(null); // stepId currently executing
  const [dialogAction, setDialogAction] = useState(null); // { stepId, action, loopContext }
  const [expandedTracks, setExpandedTracks] = useState({});

  const project = workItem.fields?.["System.TeamProject"]
    || workItem.fields?.["System.AreaPath"]?.split("\\")[0]
    || "";

  // Load workflow state
  const loadState = useCallback(async () => {
    if (!template || !client || !project) { setLoading(false); return; }
    setLoading(true);
    try {
      const s = await readWorkflowState(client, project, workItem.id, template);
      setState(s);
      setProgress(computeProgress(template, s));
    } catch (e) {
      console.warn("[WorkflowSection] Failed to load state:", e.message);
    } finally {
      setLoading(false);
    }
  }, [template, client, project, workItem.id]);

  useEffect(() => { loadState(); }, [loadState]);

  // Toggle track expansion
  const toggleTrack = useCallback((trackId) => {
    setExpandedTracks(prev => ({ ...prev, [trackId]: !prev[trackId] }));
  }, []);

  // Execute a step action
  const handleExecute = useCallback(async (step, loopContext) => {
    if (!template || !client) return;
    const stepId = loopContext ? `${step.id}:${loopContext.env || loopContext.item}` : step.id;
    setExecuting(stepId);

    try {
      const resolvedAction = resolveAction(step.action, {}, workItem, state?.stepResults || {}, loopContext);
      const result = await executeAction(
        client, profile, project, resolvedAction, workItem, state?.stepResults || {}
      );
      showToast(`Step "${step.title}" completed`, T.green);
      await loadState();
    } catch (e) {
      showToast(`Step failed: ${e.message}`, T.red);
    } finally {
      setExecuting(null);
    }
  }, [template, client, profile, project, workItem, state, showToast, loadState]);

  // Handle gate action (approval)
  const handleGateAction = useCallback(async (step, gate, loopContext) => {
    if (!template || !client) return;
    const stepId = loopContext ? `${step.id}:${loopContext.env || loopContext.item}` : step.id;
    setExecuting(stepId);

    try {
      const resolvedAction = gate.action;
      if (resolvedAction.type === "request-approval") {
        // Show approval dialog inline
        setDialogAction({
          stepId: step.id,
          action: resolvedAction,
          loopContext,
          type: "approval",
        });
      } else {
        const result = await executeAction(
          client, profile, project, resolvedAction, workItem, state?.stepResults || {}, loopContext
        );
        showToast("Gate action completed", T.green);
        await loadState();
      }
    } catch (e) {
      showToast(`Gate failed: ${e.message}`, T.red);
    } finally {
      setExecuting(null);
    }
  }, [template, client, profile, project, workItem, state, showToast, loadState]);

  // Approve/Reject handler
  const handleApproval = useCallback(async (approvalId, status) => {
    if (!client || !project) return;
    try {
      await client.respondToApproval(project, approvalId, status, `${status} via SuperUI`);
      showToast(`Approval ${status}`, status === "approved" ? T.green : T.red);
      setDialogAction(null);
      await loadState();
    } catch (e) {
      showToast(`Approval failed: ${e.message}`, T.red);
    }
  }, [client, project, showToast, loadState]);

  if (!template) return null;
  if (loading) {
    return (
      <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 10, color: T.dim }}>
        <Spinner size={14} /> Loading workflow…
      </div>
    );
  }

  const p = progress?.overall || { total: 0, completed: 0, percent: 0 };

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 16 }}>{template.icon}</span>
        <span style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 16, color: T.heading }}>
          {template.name}
        </span>
        <span style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
          {p.completed}/{p.total} {p.percent}%
        </span>
        <div style={{ flex: 1 }} />
        <ProgressBar percent={p.percent} color={template.color} width={120} />
      </div>

      {/* Tracks */}
      {template.tracks.map(track => {
        const tp = progress?.tracks?.[track.id] || { total: 0, completed: 0, active: 0, blocked: false, percent: 0 };
        const isExpanded = expandedTracks[track.id] !== false; // default expanded
        const trackState = state?.tracks?.[track.id];

        return (
          <div key={track.id} style={{ marginBottom: 8 }}>
            {/* Track header */}
            <div
              onClick={() => toggleTrack(track.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                background: "rgba(255,255,255,0.02)", borderRadius: 6, cursor: "pointer",
                borderLeft: `3px solid ${track.color}`,
              }}
            >
              <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", width: 12 }}>
                {isExpanded ? "▾" : "▸"}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.heading, flex: 1 }}>{track.name}</span>
              {tp.blocked && <Pill label="blocked" color={T.dim} />}
              <ProgressBar percent={tp.percent} color={track.color} width={80} />
              <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                {tp.completed}/{tp.total}
              </span>
            </div>

            {/* Steps */}
            {isExpanded && (
              <div style={{ marginLeft: 20, marginTop: 4 }}>
                {track.steps.map(step => {
                  const stepState = trackState?.steps?.[step.id];

                  if (step.repeatForEach && stepState?.loopItems) {
                    return Object.entries(stepState.loopItems).map(([env, loopState]) => (
                      <StepCard
                        key={`${step.id}:${env}`}
                        step={step}
                        stepState={loopState}
                        loopContext={{ env, item: env }}
                        trackBlocked={tp.blocked}
                        executing={executing === `${step.id}:${env}`}
                        onExecute={() => handleExecute(step, { env, item: env })}
                        onGateAction={(gate) => handleGateAction(step, gate, { env, item: env })}
                      />
                    ));
                  }

                  return (
                    <StepCard
                      key={step.id}
                      step={step}
                      stepState={stepState}
                      loopContext={null}
                      trackBlocked={tp.blocked}
                      executing={executing === step.id}
                      onExecute={() => handleExecute(step, null)}
                      onGateAction={(gate) => handleGateAction(step, gate, null)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Approval Dialog */}
      {dialogAction && (
        <ApprovalDialog
          action={dialogAction.action}
          loopContext={dialogAction.loopContext}
          client={client}
          project={project}
          onApprove={(id) => handleApproval(id, "approved")}
          onReject={(id) => handleApproval(id, "rejected")}
          onClose={() => setDialogAction(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ percent, color, width = 100 }) {
  return (
    <div style={{ width, height: 4, background: T.dimmer, borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
      <div style={{
        width: `${Math.min(100, percent)}%`, height: "100%",
        background: color || T.cyan, borderRadius: 2,
        transition: "width 0.3s ease",
      }} />
    </div>
  );
}

const STEP_STATUS_META = {
  pending:   { icon: "·", color: T.dim,   label: "pending" },
  active:    { icon: "▶", color: T.cyan,  label: "active" },
  completed: { icon: "✓", color: T.green, label: "done" },
  skipped:   { icon: "—", color: T.dim,   label: "skipped" },
};

function StepCard({ step, stepState, loopContext, trackBlocked, executing, onExecute, onGateAction }) {
  const status = stepState?.state || "pending";
  const meta = STEP_STATUS_META[status] || STEP_STATUS_META.pending;
  const task = stepState?.task;
  const hasGate = step.gates?.length > 0;
  const gateActive = hasGate && loopContext && step.gates.some(g => {
    // Simple check: if loopContext matches the gate condition
    return g.when?.includes(loopContext.env);
  });

  const title = loopContext
    ? interpolate(step.title, {}, {}, {}, loopContext)
    : step.title;

  const canExecute = status === "pending" && !trackBlocked && !executing;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
      borderBottom: `1px solid ${T.border}`, fontSize: 12,
      opacity: trackBlocked && status === "pending" ? 0.4 : 1,
    }}>
      <Dot color={meta.color} pulse={status === "active"} />
      <span style={{ color: meta.color, fontFamily: "'JetBrains Mono'", fontSize: 10, width: 14 }}>
        {meta.icon}
      </span>
      <span style={{ flex: 1, color: status === "completed" ? T.muted : T.text }}>
        {title}
      </span>

      {/* Action button */}
      {status === "pending" && !trackBlocked && (
        gateActive ? (
          <Btn variant="primary" onClick={() => onGateAction(step.gates[0])} disabled={executing}>
            {executing ? <Spinner size={12} /> : "Approve"}
          </Btn>
        ) : step.action?.type !== "create-task" ? (
          <Btn variant="ghost" onClick={onExecute} disabled={executing}>
            {executing ? <Spinner size={12} /> : actionLabel(step.action?.type)}
          </Btn>
        ) : null
      )}

      {/* Task link */}
      {task && (
        <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
          #{task.id}
        </span>
      )}
    </div>
  );
}

function actionLabel(type) {
  const labels = {
    "gather-pipeline-outputs": "Gather",
    "merge-vars": "Update",
    "edit-file": "Edit",
    "raise-pr": "Create PR",
    "run-pipeline": "Run",
    "request-approval": "Approve",
    "create-task": "Create",
  };
  return labels[type] || "Execute";
}

function ApprovalDialog({ action, loopContext, client, project, onApprove, onReject, onClose }) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await client.getPendingApprovals(project);
        if (!cancelled) setApprovals(a);
      } catch {
        if (!cancelled) setApprovals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [client, project]);

  const desc = loopContext
    ? interpolate(action.description || "", {}, {}, {}, loopContext)
    : action.description || "";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8,
          padding: 24, minWidth: 360, maxWidth: 480,
        }}
      >
        <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 18, color: T.heading, marginBottom: 12 }}>
          Pipeline Approval
        </div>
        {desc && <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>{desc}</div>}

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.dim, fontSize: 12 }}>
            <Spinner size={14} /> Checking approvals…
          </div>
        ) : approvals.length === 0 ? (
          <div style={{ fontSize: 12, color: T.dim }}>No pending approvals found.</div>
        ) : (
          <div>
            {approvals.map(a => (
              <div key={a.id} style={{
                padding: "10px 12px", background: "rgba(255,255,255,0.02)",
                borderRadius: 6, marginBottom: 8, border: `1px solid ${T.border}`,
              }}>
                <div style={{ fontSize: 12, color: T.text, marginBottom: 4 }}>
                  {a.pipeline?.name || a.stageName || "Pipeline Approval"}
                </div>
                <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                  Status: {a.status || "pending"}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <Btn variant="primary" onClick={() => onApprove(a.id)}>Approve</Btn>
                  <Btn onClick={() => onReject(a.id)}>Reject</Btn>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <Btn onClick={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  );
}
