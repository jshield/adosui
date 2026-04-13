/**
 * PlanModeView.jsx
 *
 * Human-in-the-loop LLM integration UI.
 * Allows humans to build prompts with context, paste LLM output,
 * and approve/reject requests before execution.
 */

import { useState, useEffect, useCallback } from "react";
import yaml from "js-yaml";
import { T } from "../../lib/theme";
import {
  Btn, Spinner, Card, SectionLabel, SelectableRow, Dot, Input, Textarea, Modal,
  EmptyState, Pill
} from "../ui";
import { T as Theme } from "../../lib/theme";
import {
  parseRequest, serializeRequest, loadPendingRequestsGrouped,
  saveRequest, approveRequest, rejectRequest, markExecuting, markCompleted,
  getStatusLabel, getActionLabel
} from "../../lib/llmRequestManager";
import {
  loadTemplates, getAllTemplates, renderTemplate, fetchAdditionalContext
} from "../../lib/templateEngine";
import { executeRequest, generateActionPreview, validateRequestActions } from "../../lib/executor";
import backgroundWorker from "../../lib/backgroundWorker";

export function PlanModeView({
  client,
  repoConfig,
  profile,
  collections,
  showToast,
}) {
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState(null);

  // Prompt builder state
  const [promptText, setPromptText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateVariables, setTemplateVariables] = useState({});
  const [selectedResources, setSelectedResources] = useState([]); // { type, id, data }

  // Input parser state
  const [inputText, setInputText] = useState("");
  const [parseError, setParseError] = useState(null);
  const [parsedRequest, setParsedRequest] = useState(null);

  // Pending requests
  const [pendingGroups, setPendingGroups] = useState(new Map());
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [expandedCorrelations, setExpandedCorrelations] = useState(new Set());

  // Execution
  const [executing, setExecuting] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(null);

  // Templates
  const [templates, setTemplates] = useState([]);

  // Initialize
  useEffect(() => {
    if (!client || !repoConfig) return;

    async function init() {
      try {
        const [reqs, temps] = await Promise.all([
          loadPendingRequestsGrouped(client, repoConfig),
          loadTemplates(client, repoConfig),
        ]);
        setPendingGroups(reqs);
        setTemplates(temps);
        setPhase("main");
      } catch (e) {
        setError(e.message);
        setPhase("error");
      }
    }

    init();
  }, [client, repoConfig]);

  // ── Prompt Builder ───────────────────────────────────────────────────────────

  const handleSelectTemplate = (templateId) => {
    const t = templates.find((t) => t.id === templateId);
    setSelectedTemplate(t);
    const defaults = {};
    for (const v of t?.variables || []) {
      if (v.default !== undefined) defaults[v.name] = v.default;
    }
    setTemplateVariables(defaults);
  };

  const handleVariableChange = (varName, value) => {
    setTemplateVariables((prev) => ({ ...prev, [varName]: value }));
  };

  const handleAddResource = (type, id) => {
    // Fetch resource data from background worker or cache
    const data = fetchResourceData(type, id);
    setSelectedResources((prev) => [...prev, { resourceType: type, resourceId: id, data }]);
  };

  const handleRemoveResource = (index) => {
    setSelectedResources((prev) => prev.filter((_, i) => i !== index));
  };

  async function buildFullPrompt() {
    if (!selectedTemplate || selectedResources.length === 0) {
      return promptText;
    }

    const rendered = await renderTemplate(
      selectedTemplate.id,
      templateVariables,
      selectedResources,
      promptText
    );

    const additional = await fetchAdditionalContext(
      client,
      selectedTemplate,
      templateVariables,
      selectedResources
    );

    return rendered.prompt + "\n\n## Additional Context\n" + JSON.stringify(additional, null, 2);
  }

  function fetchResourceData(type, id) {
    // Simple placeholder - in real implementation, fetch from worker cache
    return { id, type, _fetchedAt: new Date().toISOString() };
  }

  // ── Input Parser ─────────────────────────────────────────────────────────────

  const handleParseInput = () => {
    setParseError(null);
    setParsedRequest(null);

    const { request, error } = parseRequest(inputText);

    if (error) {
      setParseError(error);
      return;
    }

    // Set human from profile
    request.human = profile?.id || "unknown";

    // Validate actions
    const validation = validateRequestActions(request);
    if (!validation.valid) {
      setParseError(`Action validation failed: ${JSON.stringify(validation.errors)}`);
      return;
    }

    setParsedRequest(request);
  };

  const handleSaveAsPending = async () => {
    if (!parsedRequest) return;

    try {
      await saveRequest(client, repoConfig, parsedRequest);
      showToast("Request saved as pending", T.green);

      // Refresh pending
      const reqs = await loadPendingRequestsGrouped(client, repoConfig);
      setPendingGroups(reqs);

      setInputText("");
      setParsedRequest(null);
      setParseError(null);
    } catch (e) {
      showToast(`Failed to save: ${e.message}`, T.red);
    }
  };

  // ── Request Review ──────────────────────────────────────────────────────────

  const handleApprove = async (request) => {
    try {
      await approveRequest(client, repoConfig, request, profile?.id, "");
      showToast("Request approved, executing...", T.green);

      // Execute
      setExecuting(true);
      setSelectedRequest(request);

      const result = await executeRequest(client, request, (idx, action, res) => {
        setExecutionProgress({ current: idx + 1, total: request.actions.length, action, result: res });
      });

      // Mark complete
      await markCompleted(client, repoConfig, request, result.success, result);

      showToast(result.success ? "All actions executed successfully" : `Execution failed: ${result.error}`, result.success ? T.green : T.red);

      // Refresh
      const reqs = await loadPendingRequestsGrouped(client, repoConfig);
      setPendingGroups(reqs);
    } catch (e) {
      showToast(`Error: ${e.message}`, T.red);
    } finally {
      setExecuting(false);
      setExecutionProgress(null);
      setSelectedRequest(null);
    }
  };

  const handleReject = async (request, comment = "") => {
    try {
      await rejectRequest(client, repoConfig, request, profile?.id, comment);
      showToast("Request rejected", T.dim);

      const reqs = await loadPendingRequestsGrouped(client, repoConfig);
      setPendingGroups(reqs);
    } catch (e) {
      showToast(`Error: ${e.message}`, T.red);
    }
  };

  const toggleCorrelationExpand = (corrId) => {
    setExpandedCorrelations((prev) => {
      const next = new Set(prev);
      if (next.has(corrId)) {
        next.delete(corrId);
      } else {
        next.add(corrId);
      }
      return next;
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (phase === "loading") {
    return <div style={{ padding: 40, textAlign: "center" }}><Spinner /> Loading...</div>;
  }

  if (phase === "error") {
    return <div style={{ padding: 40, color: T.red }}>Error: {error}</div>;
  }

  return (
    <div style={{ display: "flex", height: "100%", gap: 16 }}>
      {/* Left Panel: Prompt Builder + Input */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
        <Card>
          <SectionLabel>Build Prompt</SectionLabel>

          {/* Template Selector */}
          <div style={{ marginBottom: 12 }}>
            <select
              value={selectedTemplate?.id || ""}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              style={{ width: "100%", padding: 8, background: T.bg, color: T.fg, border: `1px solid ${T.border}` }}
            >
              <option value="">No template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
              ))}
            </select>
          </div>

          {/* Template Variables */}
          {selectedTemplate?.variables?.length > 0 && (
            <div style={{ marginBottom: 12, padding: 8, background: T.bg2, borderRadius: 4 }}>
              {selectedTemplate.variables.map((v) => (
                <div key={v.name} style={{ marginBottom: 8 }}>
                  <label style={{ display: "block", fontSize: 12, color: T.dim, marginBottom: 4 }}>
                    {v.label}
                  </label>
                  {v.type === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={templateVariables[v.name] || false}
                      onChange={(e) => handleVariableChange(v.name, e.target.checked)}
                    />
                  ) : v.type === "select" ? (
                    <select
                      value={templateVariables[v.name] || v.default || ""}
                      onChange={(e) => handleVariableChange(v.name, e.target.value)}
                      style={{ width: "100%", padding: 4, background: T.bg, color: T.fg }}
                    >
                      {v.options.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : v.type === "number" ? (
                    <input
                      type="number"
                      value={templateVariables[v.name] || v.default || 0}
                      onChange={(e) => handleVariableChange(v.name, parseInt(e.target.value))}
                      style={{ width: "100%", padding: 4, background: T.bg, color: T.fg }}
                    />
                  ) : (
                    <input
                      type="text"
                      value={templateVariables[v.name] || ""}
                      onChange={(e) => handleVariableChange(v.name, e.target.value)}
                      style={{ width: "100%", padding: 4, background: T.bg, color: T.fg }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Context Resources */}
          {selectedResources.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <SectionLabel style={{ fontSize: 12 }}>Selected Resources</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {selectedResources.map((r, i) => (
                  <Pill key={i} onRemove={() => handleRemoveResource(i)}>
                    {r.resourceType}: {r.resourceId}
                  </Pill>
                ))}
              </div>
            </div>
          )}

          {/* Prompt Text */}
          <Textarea
            placeholder="Enter your prompt for the LLM..."
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            style={{ minHeight: 100 }}
          />

          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <Btn onClick={() => buildFullPrompt().then(p => navigator.clipboard.writeText(p))}>
              Copy Full Prompt
            </Btn>
          </div>
        </Card>

        {/* LLM Input Parser */}
        <Card>
          <SectionLabel>Paste LLM Output</SectionLabel>
          <p style={{ fontSize: 12, color: T.dim, marginBottom: 8 }}>
            Paste YAML or JSON from the LLM to create a request
          </p>

          <Textarea
            placeholder="Paste LLM output here..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{ minHeight: 150 }}
          />

          {parseError && (
            <div style={{ color: T.red, fontSize: 12, margin: "8px 0" }}>{parseError}</div>
          )}

          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <Btn onClick={handleParseInput}>Parse Input</Btn>
            {parsedRequest && (
              <Btn onClick={handleSaveAsPending} variant="primary">
                Save as Pending
              </Btn>
            )}
          </div>

          {/* Parsed Preview */}
          {parsedRequest && (
            <div style={{ marginTop: 16, padding: 12, background: T.bg2, borderRadius: 4 }}>
              <SectionLabel style={{ fontSize: 12 }}>Parsed Request</SectionLabel>
              <div style={{ fontSize: 12 }}>
                <div><strong>ID:</strong> {parsedRequest.requestId}</div>
                <div><strong>Correlation:</strong> {parsedRequest.correlationId}</div>
                <div><strong>Prompt:</strong> {parsedRequest.prompt?.substring(0, 100)}...</div>
                <div><strong>Actions:</strong> {parsedRequest.actions.length}</div>
                {parsedRequest.actions.map((a, i) => (
                  <div key={i} style={{ marginLeft: 16, color: T.dim }}>
                    {i + 1}. {getActionLabel(a.actionType)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Right Panel: Pending Requests */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Card style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <SectionLabel>Pending Requests</SectionLabel>

          {pendingGroups.size === 0 ? (
            <EmptyState>No pending requests</EmptyState>
          ) : (
            <div style={{ overflow: "auto", flex: 1 }}>
              {Array.from(pendingGroups.entries()).map(([corrId, requests]) => (
                <div key={corrId} style={{ marginBottom: 16 }}>
                  <div
                    onClick={() => toggleCorrelationExpand(corrId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      padding: "8px 0",
                      borderBottom: `1px solid ${T.border}`,
                    }}
                  >
                    <span>{expandedCorrelations.has(corrId) ? "▼" : "▶"}</span>
                    <span style={{ fontFamily: Theme.monospace, fontSize: 12 }}>
                      {corrId}
                    </span>
                    <span style={{ color: T.dim, fontSize: 12 }}>
                      ({requests.length} request{requests.length > 1 ? "s" : ""})
                    </span>
                  </div>

                  {expandedCorrelations.has(corrId) && (
                    <div style={{ marginLeft: 16 }}>
                      {requests.map((req) => (
                        <RequestCard
                          key={req.requestId}
                          request={req}
                          onSelect={() => setSelectedRequest(req)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Request Detail Modal */}
      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          executing={executing}
          progress={executionProgress}
          onClose={() => setSelectedRequest(null)}
          onApprove={() => handleApprove(selectedRequest)}
          onReject={(comment) => handleReject(selectedRequest, comment)}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RequestCard({ request, onSelect }) {
  const statusColors = {
    pending: T.yellow,
    approved: T.green,
    rejected: T.red,
    executing: T.blue,
    success: T.green,
    failed: T.red,
  };

  return (
    <div
      onClick={onSelect}
      style={{
        padding: 8,
        margin: "4px 0",
        background: T.bg2,
        borderRadius: 4,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Dot color={statusColors[request.status] || T.dim} />
        <span style={{ fontWeight: 500 }}>{request.requestId}</span>
        <span style={{ color: T.dim, fontSize: 12 }}>
          {request.prompt?.substring(0, 50)}...
        </span>
      </div>
      <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>
        {request.actions.length} action{request.actions.length !== 1 ? "s" : ""}
        {request.parentRequestId && ` • parent: ${request.parentRequestId}`}
      </div>
    </div>
  );
}

function RequestDetailModal({ request, executing, progress, onClose, onApprove, onReject }) {
  const [rejectComment, setRejectComment] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const preview = generateActionPreview(request.actions);

  return (
    <Modal onClose={onClose} title={`Request: ${request.requestId}`} width={600}>
      {/* Request Info */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <strong>Status:</strong> {getStatusLabel(request.status)}
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Correlation ID:</strong> <span style={{ fontFamily: Theme.monospace }}>{request.correlationId}</span>
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Created:</strong> {new Date(request.createdAt).toLocaleString()}
        </div>
        {request.human && (
          <div style={{ marginBottom: 8 }}>
            <strong>Human:</strong> {request.human}
          </div>
        )}
      </div>

      {/* Prompt */}
      {request.prompt && (
        <div style={{ marginBottom: 16 }}>
          <SectionLabel style={{ fontSize: 12 }}>Prompt</SectionLabel>
          <div style={{ padding: 8, background: T.bg2, borderRadius: 4, fontSize: 13, whiteSpace: "pre-wrap" }}>
            {request.prompt}
          </div>
        </div>
      )}

      {/* Actions Preview */}
      <div style={{ marginBottom: 16 }}>
        <SectionLabel style={{ fontSize: 12 }}>Actions ({request.actions.length})</SectionLabel>
        {preview.map((p, i) => (
          <div key={i} style={{ padding: 8, margin: "4px 0", background: T.bg2, borderRadius: 4 }}>
            <div style={{ fontWeight: 500 }}>{i + 1}. {getActionLabel(p.actionType)}</div>
            {p.preview?.summary && (
              <div style={{ fontSize: 12, color: T.dim, marginTop: 4 }}>{p.preview.summary}</div>
            )}
            {p.preview?.changes?.length > 0 && (
              <div style={{ fontSize: 11, color: T.dim, marginTop: 4 }}>
                {p.preview.changes.map((c, j) => (
                  <div key={j}>• {c.field}: {JSON.stringify(c.value)}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Execution Progress */}
      {executing && progress && (
        <div style={{ marginBottom: 16, padding: 12, background: T.blue + "20", borderRadius: 4 }}>
          <div>Executing action {progress.current} of {progress.total}</div>
          <div style={{ fontSize: 12, color: T.dim }}>
            {progress.action?.actionType}: {progress.result?.error || "..."}
          </div>
        </div>
      )}

      {/* Result */}
      {request.result && (
        <div style={{ marginBottom: 16, padding: 8, background: T.bg2, borderRadius: 4 }}>
          <SectionLabel style={{ fontSize: 12 }}>Result</SectionLabel>
          <pre style={{ fontSize: 11, overflow: "auto" }}>
            {JSON.stringify(request.result, null, 2)}
          </pre>
        </div>
      )}

      {/* Actions */}
      {request.status === "pending" && !executing && (
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Btn variant="primary" onClick={onApprove}>
            Approve & Execute
          </Btn>
          {showRejectInput ? (
            <>
              <Input
                placeholder="Rejection reason..."
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                style={{ flex: 1 }}
              />
              <Btn onClick={() => { onReject(rejectComment); onClose(); }}>
                Confirm Reject
              </Btn>
            </>
          ) : (
            <Btn onClick={() => setShowRejectInput(true)}>Reject</Btn>
          )}
        </div>
      )}

      {request.status !== "pending" && (
        <div style={{ marginTop: 16 }}>
          <Btn onClick={onClose}>Close</Btn>
        </div>
      )}
    </Modal>
  );
}