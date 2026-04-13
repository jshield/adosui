/**
 * executor.js
 *
 * Executes approved LLM request actions against Azure DevOps.
 * Each action type has a dedicated handler function.
 */

import yaml from "js-yaml";

export class ExecutionError extends Error {
  constructor(message, action, originalError) {
    super(message);
    this.action = action;
    this.originalError = originalError;
  }
}

/**
 * Execute all actions in a request.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} request - The approved request object
 * @param {Function} onProgress - Callback for progress updates (actionIndex, action, result)
 * @returns {Promise<{ success: boolean, results: Array }>}
 */
export async function executeRequest(client, request, onProgress = () => {}) {
  const results = [];

  for (let i = 0; i < request.actions.length; i++) {
    const action = request.actions[i];

    onProgress(i, action, null);

    try {
      const result = await executeAction(client, action, request);
      results.push({ success: true, action, result });
      onProgress(i, action, result);
    } catch (error) {
      results.push({ success: false, action, error: error.message });
      onProgress(i, action, { error: error.message });

      // Stop execution on first failure (configurable behavior)
      return {
        success: false,
        results,
        failedAt: i,
        error: error.message,
      };
    }
  }

  return {
    success: true,
    results,
  };
}

/**
 * Execute a single action based on actionType.
 */
async function executeAction(client, action, request) {
  const { actionType, resourceType, payload, dryRun } = action;

  if (dryRun) {
    return { dryRun: true, preview: generatePreview(action) };
  }

  switch (actionType) {
    case "create-work-item":
      return await handleCreateWorkItem(client, resourceType, payload);
    case "update-work-item":
      return await handleUpdateWorkItem(client, resourceType, payload);
    case "trigger-pipeline":
      return await handleTriggerPipeline(client, resourceType, payload);
    case "create-pr":
      return await handleCreatePR(client, resourceType, payload);
    case "create-branch":
      return await handleCreateBranch(client, resourceType, payload);
    case "upsert-wiki":
      return await handleUpsertWiki(client, resourceType, payload);
    case "create-service-connection":
      return await handleCreateServiceConnection(client, resourceType, payload);
    case "add-comment":
      return await handleAddComment(client, resourceType, payload);
    default:
      throw new ExecutionError(`Unknown action type: ${actionType}`, action, null);
  }
}

// ── Action Handlers ───────────────────────────────────────────────────────────

async function handleCreateWorkItem(client, resourceType, payload) {
  const project = payload.project;
  const workItemType = payload.type || "Task";
  const fields = {
    "System.Title": payload.title,
    "System.Description": payload.description || "",
    "System.WorkItemType": workItemType,
  };

  if (payload.priority) {
    fields["Microsoft.VSTS.Common.Priority"] = payload.priority;
  }
  if (payload.assignee) {
    fields["System.AssignedTo"] = payload.assignee;
  }
  if (payload.areaPath) {
    fields["System.AreaPath"] = payload.areaPath;
  }
  if (payload.iterationPath) {
    fields["System.IterationPath"] = payload.iterationPath;
  }

  const result = await client.createWorkItem(project, workItemType, fields);
  return {
    workItemId: result.id,
    url: `https://dev.azure.com/${client.org}/${project}/_workitems/edit/${result.id}`,
  };
}

async function handleUpdateWorkItem(client, resourceType, payload) {
  const project = payload.project;
  const workItemId = payload.id;
  const fields = {};

  if (payload.title) fields["System.Title"] = payload.title;
  if (payload.description !== undefined) fields["System.Description"] = payload.description;
  if (payload.state) fields["System.State"] = payload.state;
  if (payload.priority !== undefined) fields["Microsoft.VSTS.Common.Priority"] = payload.priority;
  if (payload.assignee) fields["System.AssignedTo"] = payload.assignee;
  if (payload.areaPath) fields["System.AreaPath"] = payload.areaPath;
  if (payload.iterationPath) fields["System.IterationPath"] = payload.iterationPath;

  const result = await client.updateWorkItem(project, workItemId, fields);
  return {
    workItemId,
    url: `https://dev.azure.com/${client.org}/${project}/_workitems/edit/${workItemId}`,
  };
}

async function handleTriggerPipeline(client, resourceType, payload) {
  const project = payload.project;
  const pipelineId = payload.pipelineId;
  const templateParameters = payload.templateParameters || {};

  const result = await client.runPipeline(project, pipelineId, templateParameters);
  return {
    runId: result.id,
    url: `https://dev.azure.com/${client.org}/${project}/_build/results?buildId=${result.id}`,
  };
}

async function handleCreatePR(client, resourceType, payload) {
  const project = payload.project;
  const repoId = payload.repoId;
  const sourceBranch = payload.sourceBranch;
  const targetBranch = payload.targetBranch || "main";
  const title = payload.title;
  const description = payload.description || "";

  const result = await client.createPullRequest(
    project,
    repoId,
    title,
    description,
    sourceBranch,
    targetBranch
  );
  return {
    pullRequestId: result.pullRequestId,
    url: result.url,
  };
}

async function handleCreateBranch(client, resourceType, payload) {
  const project = payload.project;
  const repoId = payload.repoId;
  const newBranch = payload.branchName;
  const sourceBranch = payload.sourceBranch || "main";

  const result = await client.createBranch(project, repoId, newBranch, sourceBranch);
  return {
    branch: newBranch,
    url: `https://dev.azure.com/${client.org}/${project}/_git/${repoId}/?branch=${encodeURIComponent(newBranch)}`,
  };
}

async function handleUpsertWiki(client, resourceType, payload) {
  const project = payload.project;
  const wikiName = payload.wikiName || payload.wiki;
  const pagePath = payload.path;
  const content = payload.content;
  const version = payload.version;

  const result = await client.upsertWikiPage(project, wikiName, pagePath, content, version);
  return {
    path: pagePath,
    wiki: wikiName,
  };
}

async function handleCreateServiceConnection(client, resourceType, payload) {
  // Service connections require project-scoped calls
  const project = payload.project;
  const name = payload.name;
  const type = payload.type; // azure-rm, github, docker-registry, etc.
  const configuration = payload.configuration || {};

  // This is a simplified implementation; full implementation would need
  // the specific API format for each service connection type
  throw new Error("Service connection creation requires manual configuration in ADO");
}

async function handleAddComment(client, resourceType, payload) {
  const project = payload.project;
  const workItemId = payload.workItemId;
  const comment = payload.comment;

  const result = await client.createWorkItemComment(project, workItemId, comment);
  return {
    workItemId,
    commentId: result.id,
  };
}

// ── Preview Generation ────────────────────────────────────────────────────────

function generatePreview(action) {
  const { actionType, resourceType, payload } = action;

  switch (actionType) {
    case "create-work-item":
      return {
        summary: `Create ${payload.type || "Task"} work item: "${payload.title}"`,
        changes: [
          { field: "Title", value: payload.title },
          { field: "Type", value: payload.type || "Task" },
          { field: "Project", value: payload.project },
          ...(payload.priority ? [{ field: "Priority", value: payload.priority }] : []),
        ],
      };

    case "update-work-item":
      return {
        summary: `Update work item #${payload.id}`,
        changes: Object.entries(payload).filter(
          ([k]) => !["project", "id"].includes(k)
        ).map(([field, value]) => ({ field, value })),
      };

    case "trigger-pipeline":
      return {
        summary: `Trigger pipeline #${payload.pipelineId} in ${payload.project}`,
        changes: [
          { field: "Pipeline ID", value: payload.pipelineId },
          { field: "Project", value: payload.project },
          { field: "Parameters", value: JSON.stringify(payload.templateParameters || {}) },
        ],
      };

    case "create-pr":
      return {
        summary: `Create PR: ${payload.title}`,
        changes: [
          { field: "Title", value: payload.title },
          { field: "Source", value: payload.sourceBranch },
          { field: "Target", value: payload.targetBranch || "main" },
          { field: "Repo", value: payload.repoId },
        ],
      };

    case "create-branch":
      return {
        summary: `Create branch: ${payload.branchName}`,
        changes: [
          { field: "Branch", value: payload.branchName },
          { field: "From", value: payload.sourceBranch || "main" },
          { field: "Repo", value: payload.repoId },
        ],
      };

    case "upsert-wiki":
      return {
        summary: `Upsert wiki page: ${payload.path}`,
        changes: [
          { field: "Wiki", value: payload.wikiName || payload.wiki },
          { field: "Path", value: payload.path },
          { field: "Content length", value: payload.content?.length || 0 },
        ],
      };

    case "add-comment":
      return {
        summary: `Add comment to work item #${payload.workItemId}`,
        changes: [{ field: "Comment", value: payload.comment.substring(0, 100) + "..." }],
      };

    default:
      return { summary: `Action: ${actionType}`, changes: [] };
  }
}

/**
 * Generate a diff-style preview of all actions in a request.
 */
export function generateActionPreview(actions) {
  return actions.map((action) => ({
    actionType: action.actionType,
    resourceType: action.resourceType,
    preview: generatePreview(action),
  }));
}

/**
 * Validate action payload for a given action type.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateActionPayload(actionType, payload) {
  const errors = [];

  switch (actionType) {
    case "create-work-item":
      if (!payload.project) errors.push("project is required");
      if (!payload.title) errors.push("title is required");
      break;

    case "update-work-item":
      if (!payload.project) errors.push("project is required");
      if (!payload.id) errors.push("id (work item ID) is required");
      break;

    case "trigger-pipeline":
      if (!payload.project) errors.push("project is required");
      if (!payload.pipelineId) errors.push("pipelineId is required");
      break;

    case "create-pr":
      if (!payload.project) errors.push("project is required");
      if (!payload.repoId) errors.push("repoId is required");
      if (!payload.sourceBranch) errors.push("sourceBranch is required");
      if (!payload.title) errors.push("title is required");
      break;

    case "create-branch":
      if (!payload.project) errors.push("project is required");
      if (!payload.repoId) errors.push("repoId is required");
      if (!payload.branchName) errors.push("branchName is required");
      break;

    case "upsert-wiki":
      if (!payload.project) errors.push("project is required");
      if (!payload.wikiName && !payload.wiki) errors.push("wiki name is required");
      if (!payload.path) errors.push("path is required");
      if (!payload.content) errors.push("content is required");
      break;

    case "add-comment":
      if (!payload.project) errors.push("project is required");
      if (!payload.workItemId) errors.push("workItemId is required");
      if (!payload.comment) errors.push("comment is required");
      break;
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate all actions in a request.
 */
export function validateRequestActions(request) {
  const errors = [];

  for (let i = 0; i < request.actions.length; i++) {
    const action = request.actions[i];
    const validation = validateActionPayload(action.actionType, action.payload);
    if (!validation.valid) {
      errors.push({
        actionIndex: i,
        actionType: action.actionType,
        errors: validation.errors,
      });
    }
  }

  return { valid: errors.length === 0, errors };
}