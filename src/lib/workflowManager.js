/**
 * workflowManager.js
 *
 * Workflow template system. Templates are YAML definitions stored in
 * collections/workflow-templates.yaml in the config repo.
 *
 * Workflow state lives entirely in ADO work items:
 *   - Parent WI (PBI/Bug) = workflow instance
 *   - Child Tasks = step execution records
 *   - Tag "superui:wf:{templateId}" on parent = template reference
 *
 * Action executors handle: gather-pipeline-outputs, merge-vars, edit-file,
 * raise-pr, run-pipeline, request-approval, create-task.
 */

import yaml from "js-yaml";

const WORKFLOW_TEMPLATES_PATH = "collections/workflow-templates.yaml";

// ── Template Loading ──────────────────────────────────────────────────────────

/**
 * Load workflow templates from the config repo.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {{ project: string, repoId: string, branch?: string }} config
 * @returns {Promise<{ templates: Array, byId: Map, objectId: string|null }>}
 */
export async function loadWorkflowTemplates(client, config) {
  try {
    const file = await client.readGitFile(
      config.project,
      config.repoId,
      WORKFLOW_TEMPLATES_PATH,
      config.branch || "main"
    );
    if (!file?.content) return { templates: [], byId: new Map(), objectId: null };

    const parsed = yaml.load(file.content);
    if (!parsed || !Array.isArray(parsed.templates)) {
      return { templates: [], byId: new Map(), objectId: file.objectId };
    }

    const templates = parsed.templates.map(validateTemplate).filter(Boolean);
    const byId = new Map(templates.map(t => [t.id, t]));

    return { templates, byId, objectId: file.objectId };
  } catch {
    return { templates: [], byId: new Map(), objectId: null };
  }
}

function validateTemplate(raw) {
  if (!raw || typeof raw !== "object" || !raw.id) return null;
  return {
    id:          raw.id,
    name:        raw.name || raw.id,
    icon:        raw.icon || "⚡",
    color:       raw.color || "#6B7280",
    wiType:      raw.wiType || "User Story",
    description: raw.description || "",
    params:      Array.isArray(raw.params) ? raw.params.map(normaliseParam) : [],
    tracks:      Array.isArray(raw.tracks) ? raw.tracks.map(normaliseTrack) : [],
  };
}

function normaliseParam(raw) {
  return {
    key:         raw.key,
    label:       raw.label || raw.key,
    type:        raw.type || "string",
    required:    !!raw.required,
    default:     raw.default,
    description: raw.description || "",
    options:     Array.isArray(raw.options) ? raw.options : undefined,
    itemFields:  Array.isArray(raw.itemFields) ? raw.itemFields : undefined,
  };
}

function normaliseTrack(raw) {
  return {
    id:        raw.id,
    name:      raw.name || raw.id,
    color:     raw.color || "#6B7280",
    dependsOn: Array.isArray(raw.dependsOn) ? raw.dependsOn : [],
    steps:     Array.isArray(raw.steps) ? raw.steps.map(normaliseStep) : [],
  };
}

function normaliseStep(raw) {
  return {
    id:            raw.id,
    title:         raw.title || raw.id,
    description:   raw.description || "",
    dependsOn:     Array.isArray(raw.dependsOn) ? raw.dependsOn : [],
    action:        normaliseAction(raw.action),
    gates:         Array.isArray(raw.gates) ? raw.gates.map(normaliseGate) : [],
    repeatForEach: raw.repeatForEach,
    sequential:    raw.sequential !== false, // default true
  };
}

function normaliseGate(raw) {
  return {
    when:   raw.when || "true",
    action: normaliseAction(raw.action),
  };
}

function normaliseAction(raw) {
  if (!raw || typeof raw !== "object") return { type: "create-task" };
  return { ...raw, type: raw.type || "create-task" };
}

// ── Token Interpolation ───────────────────────────────────────────────────────

/**
 * Resolve a dotpath/bracket expression against an object.
 */
function resolvePath(obj, expr) {
  if (!obj || !expr) return undefined;

  // Handle array index: "environments[0]"
  const arrMatch = expr.match(/^(\w+)\[(\d+)\](.*)$/);
  if (arrMatch) {
    const [, key, idx, rest] = arrMatch;
    const val = obj[key]?.[parseInt(idx)];
    return rest ? resolvePath(val, rest.replace(/^\./, "")) : val;
  }

  const parts = [];
  let remaining = expr;
  while (remaining) {
    const dotIdx = remaining.indexOf(".");
    const bracketIdx = remaining.indexOf("[");
    if (bracketIdx >= 0 && (dotIdx < 0 || bracketIdx < dotIdx)) {
      const prefix = remaining.slice(0, bracketIdx);
      if (prefix) parts.push(prefix);
      const closeIdx = remaining.indexOf("]", bracketIdx);
      const inner = remaining.slice(bracketIdx + 1, closeIdx);
      parts.push(inner.replace(/^['"]|['"]$/g, ""));
      remaining = remaining.slice(closeIdx + 1);
      if (remaining.startsWith(".")) remaining = remaining.slice(1);
    } else if (dotIdx >= 0) {
      parts.push(remaining.slice(0, dotIdx));
      remaining = remaining.slice(dotIdx + 1);
    } else {
      parts.push(remaining);
      remaining = "";
    }
  }

  let val = obj;
  for (const part of parts) {
    if (val == null) return undefined;
    val = val[part];
  }
  return val;
}

/**
 * Interpolate {params.x}, {parent.field}, {step.x.y}, {loop.x} tokens in a string.
 */
export function interpolate(template, params, parentWi, stepResults, loopContext) {
  if (typeof template !== "string") return template;
  return template.replace(/\{([^}]+)\}/g, (match, expr) => {
    // Ternary: {loop.env == 'dev' ? 'true' : 'false'}
    const ternaryMatch = expr.match(/^(.+?)\s*\?\s*'([^']*)'\s*:\s*'([^']*)'$/);
    if (ternaryMatch) {
      const [, condExpr, trueVal, falseVal] = ternaryMatch;
      const parts = condExpr.trim().split(/\s*(==|!=)\s*/);
      if (parts.length === 3) {
        const left = interpolate(`{${parts[0]}}`, params, parentWi, stepResults, loopContext);
        const op = parts[1];
        const right = parts[2].replace(/^['"]|['"]$/g, "");
        const result = op === "==" ? left === right : left !== right;
        return result ? trueVal : falseVal;
      }
    }

    const [source, ...path] = expr.trim().split(".");
    const pathStr = path.join(".");

    if (source === "params")  return resolvePath(params, pathStr) ?? match;
    if (source === "parent")  return resolvePath(parentWi?.fields || parentWi, pathStr) ?? match;
    if (source === "loop")    return resolvePath(loopContext, pathStr) ?? match;
    if (source === "env")     return loopContext?.env ?? match;
    if (source === "step") {
      const [stepId, ...rest] = path;
      return resolvePath(stepResults, stepId + (rest.length ? "." + rest.join(".") : "")) ?? match;
    }

    // Direct param shorthand: {sourcePipelines}
    if (params && params[source] !== undefined && !path.length) {
      return typeof params[source] === "object" ? JSON.stringify(params[source]) : String(params[source]);
    }

    return match;
  });
}

/**
 * Deep-interpolate all string values in an object/array.
 */
export function resolveAction(action, params, parentWi, stepResults, loopContext) {
  if (action == null) return action;
  if (typeof action === "string") return interpolate(action, params, parentWi, stepResults, loopContext);
  if (typeof action !== "object") return action;
  if (Array.isArray(action)) {
    return action.map(item => resolveAction(item, params, parentWi, stepResults, loopContext));
  }
  const result = {};
  for (const [key, val] of Object.entries(action)) {
    result[key] = resolveAction(val, params, parentWi, stepResults, loopContext);
  }
  return result;
}

// ── Action Executors ──────────────────────────────────────────────────────────

/**
 * Execute a single action and return its result.
 */
export async function executeAction(client, profile, project, action, parentWi, stepResults) {
  const executors = {
    "gather-pipeline-outputs": executeGatherOutputs,
    "merge-vars":              executeMergeVars,
    "edit-file":               executeEditFile,
    "raise-pr":                executeRaisePR,
    "run-pipeline":            executeRunPipeline,
    "request-approval":        executeRequestApproval,
    "create-task":             executeCreateTask,
  };

  const executor = executors[action.type];
  if (!executor) throw new Error(`Unknown action type: ${action.type}`);

  return executor(client, profile, project, action, parentWi, stepResults);
}

async function executeGatherOutputs(client, _profile, _project, action, _parentWi, _stepResults) {
  const pipelines = action.pipelines;
  if (!Array.isArray(pipelines)) throw new Error("gather-pipeline-outputs requires a 'pipelines' array");

  const outputs = {};
  const runs = {};

  await Promise.all(pipelines.map(async (p) => {
    try {
      const recentRuns = await client.getPipelineRuns(p.project, p.pipelineId);
      const latest = recentRuns.find(r => r.result === "succeeded") || recentRuns[0];
      if (latest) {
        outputs[p.tfvarKey] = latest.buildNumber;
        runs[p.tfvarKey] = { runId: latest.id, buildNumber: latest.buildNumber, project: p.project };
      }
    } catch (e) {
      console.warn(`[workflow] Failed to gather outputs for pipeline ${p.pipelineId}:`, e.message);
    }
  }));

  return { outputs, runs };
}

async function executeMergeVars(client, profile, project, action, _parentWi, _stepResults) {
  const { repo, filePath, vars, branch, commitMessage } = action;
  if (!repo || !filePath || !vars || !branch) {
    throw new Error("merge-vars requires repo, filePath, vars, and branch");
  }

  const repoInfo = await resolveRepo(client, project, repo);
  const baseBranch = "main";

  // Read existing file
  const file = await client.readGitFile(repoInfo.project || project, repoInfo.id, filePath, baseBranch);
  let content = file?.content || "";

  // Parse and merge tfvars: key = "value"
  for (const [key, value] of Object.entries(vars)) {
    const escapedKey = escapeRegex(key);
    const quoted = new RegExp("^(" + escapedKey + ")\\s*=\\s*\"[^\"]*\"", "m");
    const unquoted = new RegExp("^(" + escapedKey + ")\\s*=\\s*[^\\s]+", "m");
    const replacement = key + " = \"" + value + "\"";

    if (quoted.test(content)) {
      content = content.replace(quoted, replacement);
    } else if (unquoted.test(content)) {
      content = content.replace(unquoted, replacement);
    } else {
      content += (content.endsWith("\n") ? "" : "\n") + replacement + "\n";
    }
  }

  // Create branch and commit
  const targetProject = repoInfo.project || project;
  await client.createBranch(targetProject, repoInfo.id, branch, baseBranch).catch(() => {});
  await client.pushGitFile(
    targetProject, repoInfo.id, filePath, content,
    file?.objectId || null,
    commitMessage || `update ${filePath}`,
    profile?.displayName || "Workflow", profile?.emailAddress || "",
    branch
  );

  return { filePath, branch, vars, repo: repoInfo.name };
}

async function executeEditFile(client, profile, project, action, _parentWi, _stepResults) {
  const { repo, filePath, content, branch, commitMessage } = action;
  if (!repo || !filePath || !branch) {
    throw new Error("edit-file requires repo, filePath, and branch");
  }

  const repoInfo = await resolveRepo(client, project, repo);
  const targetProject = repoInfo.project || project;
  const fileContent = content || "";
  const baseBranch = "main";

  // Read existing to get objectId
  const existing = await client.readGitFile(targetProject, repoInfo.id, filePath, baseBranch);

  await client.createBranch(targetProject, repoInfo.id, branch, baseBranch).catch(() => {});
  await client.pushGitFile(
    targetProject, repoInfo.id, filePath, fileContent,
    existing?.objectId || null,
    commitMessage || `update ${filePath}`,
    profile?.displayName || "Workflow", profile?.emailAddress || "",
    branch
  );

  return { filePath, branch, repo: repoInfo.name };
}

async function executeRaisePR(client, _profile, project, action, _parentWi, _stepResults) {
  const { repo, sourceBranch, targetBranch, titleTemplate, descriptionTemplate } = action;
  if (!repo || !sourceBranch) throw new Error("raise-pr requires repo and sourceBranch");

  const repoInfo = await resolveRepo(client, project, repo);
  const targetProject = repoInfo.project || project;

  const pr = await client.createPullRequest(
    targetProject, repoInfo.id,
    titleTemplate || `Workflow: ${sourceBranch}`,
    descriptionTemplate || "",
    sourceBranch,
    targetBranch || "main"
  );

  return { pullRequestId: pr.pullRequestId, url: pr.url, repo: repoInfo.name };
}

async function executeRunPipeline(client, _profile, project, action, _parentWi, _stepResults) {
  const { pipeline, project: pipeProject, params: pipeParams } = action;
  if (!pipeline) throw new Error("run-pipeline requires 'pipeline'");

  const targetProject = pipeProject || project;
  const pipelineId = await resolvePipelineId(client, targetProject, pipeline);

  const run = await client.runPipeline(targetProject, pipelineId, pipeParams || {});

  return { runId: run.id, runUrl: run.url, project: targetProject, pipelineId };
}

async function executeRequestApproval(client, _profile, project, action, _parentWi, stepResults) {
  const { environment, pipelineRunRef, description } = action;

  // Find the pipeline run to check approvals for
  let runId = null;
  let targetProject = project;
  if (pipelineRunRef?.step) {
    const refKey = pipelineRunRef.loopItem
      ? `${pipelineRunRef.step}:${pipelineRunRef.loopItem}`
      : pipelineRunRef.step;
    const refResult = stepResults[refKey] || stepResults[pipelineRunRef.step];
    if (refResult) {
      runId = refResult.runId;
      targetProject = refResult.project || project;
    }
  }

  // Fetch pending approvals
  const approvals = await client.getPendingApprovals(targetProject);
  const envApproval = approvals.find(a => {
    if (environment && a.stageName?.toLowerCase() === environment.toLowerCase()) return true;
    if (runId && a.pipelineRun?.id === runId) return true;
    return approvals.length > 0 ? a : false;
  }) || approvals[0] || null;

  return {
    approvalId: envApproval?.id || null,
    status: envApproval ? "pending" : "not-found",
    environment,
    description,
    assignedTo: envApproval?.steps?.flatMap(s => s.approvers?.map(a => a.displayName) || []) || [],
    runId,
  };
}

async function executeCreateTask(client, _profile, project, action, parentWi, _stepResults) {
  const { title, description, fields } = action;
  const wi = await client.createChildWorkItem(
    project, parentWi.id, "Task",
    title || "Workflow Task",
    description || "",
    fields || {}
  );
  return { taskId: wi.id, taskUrl: wi.url };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveRepo(client, project, repoNameOrId) {
  // If it looks like a GUID, use directly
  if (/^[0-9a-f]{8}-/.test(repoNameOrId)) {
    return { id: repoNameOrId, name: repoNameOrId, project };
  }
  // Resolve by name
  const repos = await client.getRepos(project);
  const found = repos.find(r => r.name.toLowerCase() === repoNameOrId.toLowerCase());
  if (!found) throw new Error(`Repository "${repoNameOrId}" not found in project "${project}"`);
  return { id: found.id, name: found.name, project };
}

async function resolvePipelineId(client, project, pipelineNameOrId) {
  if (typeof pipelineNameOrId === "number") return pipelineNameOrId;
  if (/^\d+$/.test(String(pipelineNameOrId))) return parseInt(pipelineNameOrId);
  const pipelines = await client.getPipelines(project);
  const found = pipelines.find(p => p.name.toLowerCase() === String(pipelineNameOrId).toLowerCase());
  if (!found) throw new Error(`Pipeline "${pipelineNameOrId}" not found in project "${project}"`);
  return found.id;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Workflow State Reading ────────────────────────────────────────────────────

const WORKFLOW_TAG_PREFIX = "superui:wf:";

/**
 * Check if a work item has a workflow tag and extract the template ID.
 */
export function getWorkflowTemplateId(workItem) {
  const tags = workItem.fields?.["System.Tags"] || "";
  const match = tags.split(";").map(t => t.trim()).find(t => t.startsWith(WORKFLOW_TAG_PREFIX));
  return match ? match.slice(WORKFLOW_TAG_PREFIX.length) : null;
}

/**
 * Read the live workflow state from ADO child work items.
 *
 * @returns {{ tracks: object, stepResults: object }}
 */
export async function readWorkflowState(client, project, parentWiId, template) {
  const children = await client.getChildWorkItems(project, parentWiId);

  // Build a map of child tasks by title (normalized)
  const taskByTitle = new Map();
  for (const child of children) {
    const title = child.fields?.["System.Title"] || "";
    taskByTitle.set(title, child);
  }

  const tracks = {};
  const stepResults = {};

  for (const track of template.tracks) {
    const trackState = { steps: {} };

    for (const step of track.steps) {
      const stepState = { task: null, state: "pending", loopItems: {} };

      if (step.repeatForEach) {
        // Match tasks by title prefix (e.g., "Plan & Apply: dev")
        for (const [title, task] of taskByTitle) {
          if (title.startsWith(step.title.replace(/\{[^}]+\}/g, "").trim().replace(/:\s*$/, ""))) {
            const loopEnv = title.split(":").pop()?.trim();
            if (loopEnv) {
              stepState.loopItems[loopEnv] = {
                task,
                state: mapTaskState(task.fields?.["System.State"]),
              };
            }
          }
        }
      } else {
        // Match by exact title
        const task = taskByTitle.get(step.title);
        if (task) {
          stepState.task = task;
          stepState.state = mapTaskState(task.fields?.["System.State"]);
        }
      }

      trackState.steps[step.id] = stepState;
    }

    tracks[track.id] = trackState;
  }

  return { tracks, stepResults };
}

function mapTaskState(adoState) {
  const s = (adoState || "").toLowerCase();
  if (s === "removed" || s === "cut") return "skipped";
  if (s === "closed" || s === "done" || s === "resolved") return "completed";
  if (s === "active" || s === "in progress" || s === "committed") return "active";
  return "pending";
}

// ── Progress Computation ──────────────────────────────────────────────────────

/**
 * Compute progress from live workflow state.
 */
export function computeProgress(template, state) {
  let totalSteps = 0;
  let completedSteps = 0;
  let activeSteps = 0;
  const trackProgress = {};

  for (const track of template.tracks) {
    let trackTotal = 0;
    let trackCompleted = 0;
    let trackActive = 0;
    let trackBlocked = false;

    // Check track-level dependsOn
    for (const depId of track.dependsOn) {
      const depTrack = template.tracks.find(t => t.id === depId);
      if (depTrack) {
        const depState = state.tracks?.[depId];
        if (!isTrackComplete(depTrack, depState)) {
          trackBlocked = true;
        }
      }
    }

    for (const step of track.steps) {
      const stepState = state.tracks?.[track.id]?.steps?.[step.id];
      if (step.repeatForEach && stepState?.loopItems) {
        const loops = Object.values(stepState.loopItems);
        trackTotal += loops.length || 1;
        trackCompleted += loops.filter(l => l.state === "completed").length;
        trackActive += loops.filter(l => l.state === "active").length;
      } else {
        trackTotal += 1;
        if (stepState?.state === "completed") trackCompleted += 1;
        if (stepState?.state === "active") trackActive += 1;
      }
    }

    totalSteps += trackTotal;
    completedSteps += trackCompleted;
    activeSteps += trackActive;

    trackProgress[track.id] = {
      total: trackTotal,
      completed: trackCompleted,
      active: trackActive,
      blocked: trackBlocked,
      percent: trackTotal > 0 ? Math.round((trackCompleted / trackTotal) * 100) : 0,
    };
  }

  return {
    overall: {
      total: totalSteps,
      completed: completedSteps,
      active: activeSteps,
      percent: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0,
    },
    tracks: trackProgress,
  };
}

function isTrackComplete(track, state) {
  if (!state) return false;
  for (const step of track.steps) {
    const stepState = state.steps?.[step.id];
    if (step.repeatForEach && stepState?.loopItems) {
      if (!Object.values(stepState.loopItems).every(l => l.state === "completed")) return false;
    } else {
      if (stepState?.state !== "completed") return false;
    }
  }
  return true;
}

// ── Template Tag Management ───────────────────────────────────────────────────

/**
 * Add workflow template tag to a work item.
 */
export async function tagWorkItemWithTemplate(client, project, wiId, templateId) {
  await client.addWorkItemTag(project, wiId, `${WORKFLOW_TAG_PREFIX}${templateId}`);
}

// ── Instance Creation ─────────────────────────────────────────────────────────

/**
 * Create a workflow instance: create all child tasks for each step,
 * tag the parent WI, and return the task map.
 */
export async function createWorkflowInstance(client, template, params, project, parentWi) {
  const taskMap = {};

  for (const track of template.tracks) {
    for (const step of track.steps) {
      const resolvedAction = resolveAction(step.action, params, parentWi, {}, null);

      if (step.repeatForEach) {
        const loopItems = resolveAction(step.repeatForEach, params, parentWi, {}, null);
        if (!Array.isArray(loopItems)) continue;

        for (const loopItem of loopItems) {
          const loopContext = typeof loopItem === "string"
            ? { env: loopItem, item: loopItem }
            : loopItem;

          const title = interpolate(step.title, params, parentWi, {}, loopContext);
          const desc = interpolate(step.description, params, parentWi, {}, loopContext);

          const task = await client.createChildWorkItem(project, parentWi.id, "Task", title, desc);
          const resultKey = `${step.id}:${loopContext.env || loopContext.item}`;
          taskMap[resultKey] = task.id;
        }
      } else {
        const title = interpolate(step.title, params, parentWi, {}, null);
        const desc = interpolate(step.description, params, parentWi, {}, null);

        const task = await client.createChildWorkItem(project, parentWi.id, "Task", title, desc);
        taskMap[step.id] = task.id;
      }
    }
  }

  // Tag parent with template reference
  await tagWorkItemWithTemplate(client, project, parentWi.id, template.id);

  return taskMap;
}

// ── Save Workflow Templates ─────────────────────────────────────────────────────

/**
 * Save workflow templates to the config repo.
 * Merges the provided templates with any existing ones (by ID).
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {{ project: string, repoId: string, branch?: string }} config
 * @param {Array} templates - Array of template objects to save
 * @param {string|null} objectId - Current file objectId for optimistic locking
 * @param {{ displayName: string, emailAddress: string }} [author]
 * @returns {Promise<string|null>} Fresh objectId
 */
export async function saveWorkflowTemplates(client, config, templates, objectId, author) {
  const content = yaml.dump(
    { templates: templates.map(sanitiseTemplateForSave) },
    { lineWidth: 120, quotingType: '"' }
  );

  await client.pushGitFile(
    config.project,
    config.repoId,
    WORKFLOW_TEMPLATES_PATH,
    content,
    objectId || null,
    "superui: update workflow templates",
    author?.displayName,
    author?.emailAddress,
    config.branch || "main"
  );

  try {
    const refreshed = await client.readGitFile(
      config.project, config.repoId, WORKFLOW_TEMPLATES_PATH, config.branch || "main"
    );
    return refreshed?.objectId || null;
  } catch {
    return null;
  }
}

function sanitiseTemplateForSave(t) {
  return {
    id:          t.id,
    name:        t.name,
    icon:        t.icon || "⚡",
    color:       t.color || "#6B7280",
    wiType:      t.wiType || "User Story",
    description: t.description || "",
    params:      (t.params || []).map(sanitiseParamForSave),
    tracks:      (t.tracks || []).map(sanitiseTrackForSave),
  };
}

function sanitiseParamForSave(p) {
  const out = { key: p.key, label: p.label || p.key, type: p.type || "string" };
  if (p.required) out.required = true;
  if (p.default !== undefined) out.default = p.default;
  if (p.description) out.description = p.description;
  if (p.options) out.options = p.options;
  if (p.itemFields) out.itemFields = p.itemFields.map(sanitiseParamForSave);
  return out;
}

function sanitiseTrackForSave(tr) {
  const out = {
    id:    tr.id,
    name:  tr.name || tr.id,
    color: tr.color || "#6B7280",
  };
  if (tr.dependsOn?.length) out.dependsOn = tr.dependsOn;
  out.steps = (tr.steps || []).map(sanitiseStepForSave);
  return out;
}

function sanitiseStepForSave(s) {
  const out = {
    id:          s.id,
    title:       s.title || s.id,
    description: s.description || "",
  };
  if (s.dependsOn?.length) out.dependsOn = s.dependsOn;
  if (s.repeatForEach) out.repeatForEach = s.repeatForEach;
  if (s.sequential !== undefined) out.sequential = s.sequential;
  if (s.gates?.length) out.gates = s.gates.map(sanitiseGateForSave);
  if (s.action) out.action = s.action;
  return out;
}

function sanitiseGateForSave(g) {
  return {
    when:   g.when,
    action: g.action,
  };
}
