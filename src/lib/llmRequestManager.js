/**
 * llmRequestManager.js
 *
 * Manages LLM requests: parsing, storage, correlation chains,
 * and status transitions for the human-in-the-loop workflow.
 */

import yaml from "js-yaml";
import { getType } from "./resourceTypes";

const REQUESTS_DIR = "collections/llm-requests";

export const REQUEST_STATUSES = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXECUTING: "executing",
  SUCCESS: "success",
  FAILED: "failed",
};

/**
 * Generate a UUID for request IDs.
 */
function generateId() {
  return "req-" + crypto.randomUUID().slice(0, 8);
}

/**
 * Generate a correlation ID for grouping related requests.
 */
function generateCorrelationId() {
  return "corr-" + crypto.randomUUID().slice(0, 8);
}

/**
 * Parse YAML or JSON input into a request object.
 * Validates required fields and enriches with defaults.
 *
 * @param {string} input - YAML or JSON string
 * @returns {{ request: object|null, error: string|null }}
 */
export function parseRequest(input) {
  if (!input || typeof input !== "string") {
    return { request: null, error: "Input is empty or not a string" };
  }

  let parsed;
  try {
    parsed = yaml.load(input);
  } catch (yamlErr) {
    try {
      parsed = JSON.parse(input);
    } catch (jsonErr) {
      return { request: null, error: `Invalid YAML/JSON: ${yamlErr.message}` };
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return { request: null, error: "Parsed content is not a valid object" };
  }

  // Validate required fields
  if (!parsed.prompt && !parsed.actions) {
    return { request: null, error: "Request must have at least 'prompt' or 'actions' field" };
  }

  // Enrich with defaults
  const now = new Date().toISOString();
  const request = {
    requestId: parsed.requestId || generateId(),
    correlationId: parsed.correlationId || generateCorrelationId(),
    parentRequestId: parsed.parentRequestId || null,
    createdAt: parsed.createdAt || now,
    llmSource: parsed.llmSource || "manual",
    human: parsed.human || "",
    prompt: parsed.prompt || "",
    context: Array.isArray(parsed.context) ? parsed.context : [],
    template: parsed.template || null,
    templateValues: parsed.templateValues || {},
    actions: normalizeActions(parsed.actions),
    status: normalizeStatus(parsed.status) || REQUEST_STATUSES.PENDING,
    humanReview: parsed.humanReview || null,
    result: parsed.result || null,
  };

  // Validate actions
  for (const action of request.actions) {
    if (!action.actionType) {
      return { request: null, error: "Each action must have 'actionType' field" };
    }
  }

  return { request, error: null };
}

/**
 * Normalize actions array to consistent structure.
 */
function normalizeActions(actions) {
  if (!actions) return [];
  if (!Array.isArray(actions)) actions = [actions];
  return actions.map((a) => ({
    actionType: a.actionType || null,
    resourceType: a.resourceType || null,
    payload: a.payload || {},
    dryRun: a.dryRun === true,
  }));
}

/**
 * Normalize status to valid value.
 */
function normalizeStatus(status) {
  if (!status) return null;
  const s = String(status).toLowerCase();
  if (Object.values(REQUEST_STATUSES).includes(s)) {
    return s;
  }
  return null;
}

/**
 * Serialize a request to YAML string.
 */
export function serializeRequest(request) {
  return yaml.dump(request, {
    lineWidth: 120,
    quotingType: '"',
    noRefs: true,
    sortKeys: false,
  });
}

/**
 * Determine which directory to store the request in based on status.
 */
function getStatusDir(status) {
  switch (status) {
    case REQUEST_STATUSES.PENDING:
      return "pending";
    case REQUEST_STATUSES.APPROVED:
      return "approved";
    case REQUEST_STATUSES.REJECTED:
      return "rejected";
    case REQUEST_STATUSES.EXECUTING:
    case REQUEST_STATUSES.SUCCESS:
    case REQUEST_STATUSES.FAILED:
      return "history";
    default:
      return "pending";
  }
}

/**
 * Get the file path for a request.
 */
function getRequestPath(request, status) {
  const dir = getStatusDir(status);
  const correlationDir = request.correlationId;
  return `${REQUESTS_DIR}/${dir}/${correlationDir}/${request.requestId}.yaml`;
}

/**
 * Load all requests from the config repo for a given status.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} config - { project, repoId, branch }
 * @param {string} status - Status to filter by
 * @returns {Promise<Array>}
 */
export async function loadRequestsByStatus(client, config, status) {
  const dir = `${REQUESTS_DIR}/${status}`;
  const requests = [];

  try {
    const items = await client.listGitItems(config.project, config.repoId, dir, config.branch || "main");
    if (!items?.children) return [];

    for (const item of items.children) {
      if (!item.isFolder && item.path?.endsWith(".yaml")) {
        try {
          const file = await client.readGitFile(config.project, config.repoId, item.path, config.branch || "main");
          if (file?.content) {
            const parsed = yaml.load(file.content);
            if (parsed) requests.push(parsed);
          }
        } catch (e) {
          console.warn(`[llmRequestManager] Failed to load ${item.path}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.warn(`[llmRequestManager] Failed to load requests for status ${status}:`, e.message);
  }

  return requests;
}

/**
 * Load all pending requests grouped by correlationId.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} config - { project, repoId, branch }
 * @returns {Promise<Map<string, Array>>}
 */
export async function loadPendingRequestsGrouped(client, config) {
  const pending = await loadRequestsByStatus(client, config, "pending");
  const grouped = new Map();

  for (const req of pending) {
    const corrId = req.correlationId || "unknown";
    if (!grouped.has(corrId)) {
      grouped.set(corrId, []);
    }
    grouped.get(corrId).push(req);
  }

  // Sort each group by createdAt
  for (const [corrId, requests] of grouped) {
    requests.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    grouped.set(corrId, requests);
  }

  return grouped;
}

/**
 * Load a single request by ID.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} config - { project, repoId, branch }
 * @param {string} requestId
 * @returns {Promise<object|null>}
 */
export async function loadRequest(client, config, requestId) {
  // Search in all status directories
  const statuses = ["pending", "approved", "rejected", "history"];

  for (const status of statuses) {
    const dir = `${REQUESTS_DIR}/${status}`;
    try {
      const items = await client.listGitItems(config.project, config.repoId, dir, config.branch || "main");
      if (!items?.children) continue;

      for (const item of items.children) {
        if (item.isFolder) continue;
        if (item.path?.includes(requestId)) {
          const file = await client.readGitFile(config.project, config.repoId, item.path, config.branch || "main");
          if (file?.content) {
            const parsed = yaml.load(file.content);
            if (parsed?.requestId === requestId) {
              return parsed;
            }
          }
        }
      }
    } catch (e) {
      continue;
    }
  }

  return null;
}

/**
 * Save a request to the config repo.
 * Moves the file if status changed.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} config - { project, repoId, branch }
 * @param {object} request - The request object
 * @param {string} oldStatus - Current status (for moving file)
 * @returns {Promise<boolean>}
 */
export async function saveRequest(client, config, request, oldStatus = null) {
  const newStatus = request.status;
  const newPath = getRequestPath(request, newStatus);

  const content = serializeRequest(request);

  try {
    // If status changed, need to delete old file and create new
    if (oldStatus && oldStatus !== newStatus) {
      const oldPath = getRequestPath(request, oldStatus);
      try {
        await client.deleteGitFile(config.project, config.repoId, oldPath, null, `Move request to ${newStatus}`, "SuperUI", "superui@dev.azure", config.branch || "main");
      } catch (e) {
        // Old file might not exist, continue
      }
    }

    await client.pushGitFile(
      config.project,
      config.repoId,
      newPath,
      content,
      null, // new file
      request.status === REQUEST_STATUSES.PENDING
        ? `Create LLM request ${request.requestId}`
        : `Update LLM request ${request.requestId} to ${request.status}`,
      "SuperUI",
      "superui@dev.azure",
      config.branch || "main"
    );

    return true;
  } catch (e) {
    console.error("[llmRequestManager] Failed to save request:", e.message);
    return false;
  }
}

/**
 * Approve a pending request.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} config - { project, repoId, branch }
 * @param {object} request - The request to approve
 * @param {string} reviewer - Profile ID of reviewer
 * @param {string} comment - Optional review comment
 * @returns {Promise<boolean>}
 */
export async function approveRequest(client, config, request, reviewer, comment = "") {
  request.status = REQUEST_STATUSES.APPROVED;
  request.humanReview = {
    reviewedAt: new Date().toISOString(),
    reviewer,
    decision: "approved",
    comment,
  };

  return saveRequest(client, config, request, REQUEST_STATUSES.PENDING);
}

/**
 * Reject a pending request.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} config - { project, repoId, branch }
 * @param {object} request - The request to reject
 * @param {string} reviewer - Profile ID of reviewer
 * @param {string} comment - Optional review comment
 * @returns {Promise<boolean>}
 */
export async function rejectRequest(client, config, request, reviewer, comment = "") {
  request.status = REQUEST_STATUSES.REJECTED;
  request.humanReview = {
    reviewedAt: new Date().toISOString(),
    reviewer,
    decision: "rejected",
    comment,
  };

  return saveRequest(client, config, request, REQUEST_STATUSES.PENDING);
}

/**
 * Mark request as executing.
 */
export async function markExecuting(client, config, request) {
  const oldStatus = request.status;
  request.status = REQUEST_STATUSES.EXECUTING;
  return saveRequest(client, config, request, oldStatus);
}

/**
 * Mark request as completed (success or failed).
 */
export async function markCompleted(client, config, request, success, result = {}) {
  const oldStatus = request.status;
  request.status = success ? REQUEST_STATUSES.SUCCESS : REQUEST_STATUSES.FAILED;
  request.result = result;
  return saveRequest(client, config, request, oldStatus);
}

/**
 * Get the chain of related requests (parent → children).
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} config - { project, repoId, branch }
 * @param {string} requestId - Starting request ID
 * @returns {Promise<Array>} - Ordered from root to leaf
 */
export async function getRequestChain(client, config, requestId) {
  const chain = [];
  let currentId = requestId;

  while (currentId) {
    const req = await loadRequest(client, config, currentId);
    if (!req) break;
    chain.push(req);
    currentId = req.parentRequestId || null;
  }

  // Now get all children of each request in the chain
  const allRelated = [...chain];
  for (const req of chain) {
    const children = await loadRequestsByStatus(client, config, "pending");
    for (const child of children) {
      if (child.parentRequestId === req.requestId) {
        allRelated.push(child);
      }
    }
  }

  // Sort by createdAt
  allRelated.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return allRelated;
}

/**
 * Validate an action type is supported.
 */
export function isValidActionType(actionType) {
  const validActions = [
    "create-work-item",
    "update-work-item",
    "trigger-pipeline",
    "create-pr",
    "create-branch",
    "upsert-wiki",
    "create-service-connection",
    "add-comment",
  ];
  return validActions.includes(actionType);
}

/**
 * Get human-readable label for action type.
 */
export function getActionLabel(actionType) {
  const labels = {
    "create-work-item": "Create Work Item",
    "update-work-item": "Update Work Item",
    "trigger-pipeline": "Trigger Pipeline",
    "create-pr": "Create Pull Request",
    "create-branch": "Create Branch",
    "upsert-wiki": "Upsert Wiki Page",
    "create-service-connection": "Create Service Connection",
    "add-comment": "Add Comment",
  };
  return labels[actionType] || actionType;
}

/**
 * Get human-readable label for status.
 */
export function getStatusLabel(status) {
  const labels = {
    pending: "Pending Review",
    approved: "Approved",
    rejected: "Rejected",
    executing: "Executing...",
    success: "Completed",
    failed: "Failed",
  };
  return labels[status] || status;
}