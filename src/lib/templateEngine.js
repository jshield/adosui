/**
 * templateEngine.js
 *
 * Handles LLM prompt templates: loading, variable substitution,
 * and context fetching from ADO resources.
 */

import yaml from "js-yaml";
import { getType, resolveField } from "./resourceTypes";

const TEMPLATES_PATH = "collections/llm-templates.yaml";

const BUILT_IN_TEMPLATES = [
  {
    id: "analyze-work-items",
    name: "Analyze Work Items",
    description: "Get analysis of selected work items",
    icon: "📋",
    variables: [
      {
        name: "focus",
        label: "Focus Area",
        type: "select",
        options: ["status", "blockers", "assignment", "trends", "overview"],
        default: "overview",
      },
      {
        name: "includeChildren",
        label: "Include Child Work Items",
        type: "boolean",
        default: false,
      },
    ],
    contextFetch: "workitem",
    promptTemplate: "## Context\n### Selected Work Items\n{{workItems}}\n\n### Analysis Focus\n{{focus}}\n\n## Request\n{{prompt}}",
  },
  {
    id: "pipeline-failure-analysis",
    name: "Pipeline Failure Analysis",
    description: "Analyze why a pipeline failed",
    icon: "⚡",
    variables: [
      {
        name: "includeLogs",
        label: "Include Recent Log Lines",
        type: "boolean",
        default: true,
      },
      {
        name: "logLines",
        label: "Number of Log Lines",
        type: "number",
        default: 50,
        showIf: "includeLogs",
      },
      {
        name: "includeTimeline",
        label: "Include Timeline/Graph",
        type: "boolean",
        default: true,
      },
    ],
    contextFetch: "pipeline",
    promptTemplate: "## Context\n### Pipeline\n{{pipeline}}\n\n{{includeLogs}}### Recent Logs (last {{logLines}} lines)\n```\n{{logs}}\n```\n\n{{includeTimeline}}### Timeline\n{{timeline}}\n\n## Request\n{{prompt}}",
  },
  {
    id: "code-review",
    name: "Code Review Context",
    description: "Get PR and build context for review",
    icon: "🔀",
    variables: [
      {
        name: "includeBuilds",
        label: "Include Build Status",
        type: "boolean",
        default: true,
      },
      {
        name: "includeTests",
        label: "Include Test Results",
        type: "boolean",
        default: true,
      },
      {
        name: "includeFiles",
        label: "Include Changed Files List",
        type: "boolean",
        default: true,
      },
    ],
    contextFetch: "pr",
    promptTemplate: "## Context\n### Pull Request\n{{pr}}\n\n{{includeBuilds}}### Build Status\n{{builds}}\n\n{{includeTests}}### Test Results\n{{tests}}\n\n{{includeFiles}}### Changed Files\n{{files}}\n\n## Request\n{{prompt}}",
  },
  {
    id: "repository-analysis",
    name: "Repository Analysis",
    description: "Analyze repository health and activity",
    icon: "📁",
    variables: [
      {
        name: "includeBranches",
        label: "Include Branch Info",
        type: "boolean",
        default: true,
      },
      {
        name: "includeRecentCommits",
        label: "Include Recent Commits",
        type: "boolean",
        default: true,
      },
      {
        name: "commitCount",
        label: "Number of Commits",
        type: "number",
        default: 10,
        showIf: "includeRecentCommits",
      },
    ],
    contextFetch: "repo",
    promptTemplate: "## Context\n### Repository\n{{repo}}\n\n{{includeBranches}}### Branches\n{{branches}}\n\n{{includeRecentCommits}}### Recent Commits (last {{commitCount}})\n{{commits}}\n\n## Request\n{{prompt}}",
  },
];

let _templates = null;
let _templatesById = null;

export async function loadTemplates(client, config) {
  const templates = [...BUILT_IN_TEMPLATES];

  try {
    const file = await client.readGitFile(
      config.project,
      config.repoId,
      TEMPLATES_PATH,
      config.branch || "main"
    );

    if (file?.content) {
      const parsed = yaml.load(file.content);
      if (parsed?.templates && Array.isArray(parsed.templates)) {
        const builtInIds = new Set(BUILT_IN_TEMPLATES.map((t) => t.id));
        for (const t of parsed.templates) {
          if (!builtInIds.has(t.id)) {
            templates.push(t);
          }
        }
      }
    }
  } catch (e) {
  }

  _templates = templates;
  _templatesById = new Map(templates.map((t) => [t.id, t]));

  return templates;
}

export function getTemplate(id) {
  if (!_templatesById) return null;
  return _templatesById.get(id) || null;
}

export function getAllTemplates() {
  return _templates || BUILT_IN_TEMPLATES;
}

export function substituteVariables(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return values[key] !== undefined ? values[key] : match;
  });
}

export async function renderTemplate(templateId, variableValues, contextResources, userPrompt) {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error("Template not found: " + templateId);
  }

  const context = [];
  let promptContent = template.promptTemplate || "";

  if (template.contextFetch && contextResources.length > 0) {
    const fetchType = template.contextFetch;

    for (const res of contextResources) {
      if (res.resourceType !== fetchType && fetchType !== "all") continue;

      const contextData = await transformResourceForContext(res, template, variableValues);
      context.push({
        resourceType: res.resourceType,
        resourceId: res.resourceId,
        data: contextData,
        templateVariables: extractTemplateVariables(template, variableValues),
      });
    }
  }

  const contextBlocks = context.map((c) => formatContextBlock(c)).join("\n\n");

  promptContent = substituteVariables(promptContent, {
    ...variableValues,
    workItems: formatWorkItems(context),
    pipeline: formatPipeline(context),
    pr: formatPR(context),
    repo: formatRepo(context),
    logs: "",
    timeline: "",
    builds: "",
    tests: "",
    files: "",
    branches: "",
    commits: "",
    prompt: userPrompt,
  });

  return {
    prompt: promptContent,
    context,
    template: templateId,
    templateValues: variableValues,
  };
}

async function transformResourceForContext(res, template, variableValues) {
  const rt = getType(res.resourceType);
  if (!rt) return res.data;

  if (res.resourceType === "workitem") {
    const titleField = "fields['System.Title']";
    const typeField = "fields['System.WorkItemType']";
    const stateField = "fields['System.State']";
    const assigneeField = "fields['System.AssignedTo.displayName']";
    const descField = "fields['System.Description']";
    return {
      id: res.data.id,
      title: resolveField(res.data, titleField),
      type: resolveField(res.data, typeField),
      state: resolveField(res.data, stateField),
      assignee: resolveField(res.data, assigneeField),
      description: resolveField(res.data, descField),
    };
  }

  if (res.resourceType === "pipeline") {
    const run = res.data.latestRun || {};
    return {
      id: res.data.id,
      name: res.data.name,
      project: res.data.project,
      latestRun: {
        id: run.id,
        state: run.state,
        result: run.result,
        sourceBranch: run.sourceBranch,
        finishTime: run.finishTime,
      },
    };
  }

  if (res.resourceType === "pr") {
    return {
      id: res.data.pullRequestId,
      title: res.data.title,
      sourceBranch: res.data.sourceBranch,
      targetBranch: res.data.targetRefName,
      author: res.data.createdBy?.displayName,
      reviewers: res.data.reviewers?.map((r) => r.displayName).join(", "),
      status: res.data.status,
    };
  }

  if (res.resourceType === "repo") {
    return {
      id: res.data.id,
      name: res.data.name,
      project: res.data.project,
      defaultBranch: res.data.defaultBranch,
      remoteUrl: res.data.remoteUrl,
    };
  }

  return res.data;
}

function extractTemplateVariables(template, values) {
  const vars = {};
  for (const v of template.variables || []) {
    if (values[v.name] !== undefined) {
      vars[v.name] = values[v.name];
    }
  }
  return vars;
}

function formatContextBlock(context) {
  const lines = ["### " + context.resourceType + ": " + context.resourceId];
  const data = context.data;
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined && val !== null) {
      lines.push("- " + key + ": " + val);
    }
  }
  return lines.join("\n");
}

function formatWorkItems(context) {
  const items = context.filter((c) => c.resourceType === "workitem");
  return items
    .map(
      (c) =>
        "- #" + c.data.id + " [" + c.data.type + "] " + c.data.title + " (" + c.data.state + ")"
    )
    .join("\n");
}

function formatPipeline(context) {
  const p = context.find((c) => c.resourceType === "pipeline");
  if (!p) return "No pipeline selected";
  const run = p.data.latestRun || {};
  return p.data.name + " (" + p.data.project + ") - " + run.state + (run.result ? " / " + run.result : "");
}

function formatPR(context) {
  const pr = context.find((c) => c.resourceType === "pr");
  if (!pr) return "No PR selected";
  return "#" + pr.data.id + " " + pr.data.title + " (" + pr.data.sourceBranch + " -> " + pr.data.targetBranch + ")";
}

function formatRepo(context) {
  const r = context.find((c) => c.resourceType === "repo");
  if (!r) return "No repository selected";
  return r.data.name + " (" + r.data.project + ") - " + r.data.defaultBranch;
}

export async function fetchAdditionalContext(client, template, variableValues, contextResources) {
  const additional = {};

  if (template.contextFetch === "pipeline" && variableValues.includeLogs) {
    const pipelineRes = contextResources.find((r) => r.resourceType === "pipeline");
    if (pipelineRes?.data?.latestRun?.id) {
      try {
        const logText = await client.getBuildLog(
          pipelineRes.data.project,
          pipelineRes.data.id,
          pipelineRes.data.latestRun.id
        );
        const lines = variableValues.logLines || 50;
        const logLinesArr = logText.split("\n").slice(-lines);
        additional.logs = logLinesArr.join("\n");
      } catch (e) {
        additional.logs = "(Failed to fetch logs)";
      }
    }
  }

  return additional;
}

export { BUILT_IN_TEMPLATES };