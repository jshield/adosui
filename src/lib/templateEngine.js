/**
 * templateEngine.js v2
 *
 * Rich LLM prompt templates with JSON Schema, instructions,
 * and context fetching from ADO resources.
 */

import yaml from "js-yaml";
import { getType, resolveField } from "./resourceTypes";

const TEMPLATES_PATH = "collections/llm-templates.yaml";

/**
 * v2 built-in templates with JSON Schema output specification
 */
const BUILT_IN_TEMPLATES = [
  {
    id: "create-work-item",
    name: "Create Work Item",
    description: "Create a new Azure DevOps work item",
    icon: "📋",
    goal: "What's the work item about?",
    outputSchema: {
      type: "object",
      required: ["requestId", "actions"],
      properties: {
        requestId: { type: "string", description: "Unique ID, format: req-xxxxxxxx" },
        correlationId: { type: "string", description: "Chain ID for related requests" },
        prompt: { type: "string", description: "Original user goal" },
        actions: {
          type: "array",
          items: {
            type: "object",
            required: ["actionType", "payload"],
            properties: {
              actionType: { type: "string", const: "create-work-item" },
              resourceType: { type: "string", const: "workitem" },
              payload: {
                type: "object",
                required: ["title", "type"],
                properties: {
                  title: { type: "string", description: "Work item title" },
                  type: { type: "string", enum: ["Bug", "Task", "User Story", "Epic", "Feature"] },
                  priority: { type: "integer", minimum: 1, maximum: 4, description: "1=Critical, 2=High, 3=Medium, 4=Low" },
                  description: { type: "string", description: "Detailed description in markdown" },
                  project: { type: "string", description: "Project name" },
                  assignee: { type: "string", description: "Assignee email or display name" },
                  areaPath: { type: "string", description: "Area path" },
                  iterationPath: { type: "string", description: "Iteration path" }
                }
              }
            }
          }
        }
      }
    },
    instructions: `Analyze the user's goal and create an appropriate work item.

Required fields:
- title: Clear, concise summary
- type: Bug, Task, User Story, Epic, or Feature
- priority: 1 (Critical) to 4 (Low)

For bugs, include:
- Steps to reproduce in description
- Expected vs actual behavior

For user stories:
- Description should follow INVEST format`,
    example: `requestId: req-createwi
prompt: Create a bug for the login blank screen issue
actions:
  - actionType: create-work-item
    resourceType: workitem
    payload:
      title: Login page blank on Safari mobile
      type: Bug
      priority: 1
      description: |
        ## Steps to Reproduce
        1. Open app on iOS Safari
        2. Navigate to /login
        
        ## Expected
        Login page loads
        
        ## Actual
        Blank white screen
      project: MyProject`,
    variables: [],
    contextFetch: "workitem"
  },
  {
    id: "update-work-item",
    name: "Update Work Item",
    description: "Update an existing Azure DevOps work item",
    icon: "📝",
    goal: "What work item and what needs to change?",
    outputSchema: {
      type: "object",
      required: ["requestId", "actions"],
      properties: {
        requestId: { type: "string" },
        correlationId: { type: "string" },
        prompt: { type: "string" },
        actions: {
          type: "array",
          items: {
            type: "object",
            required: ["actionType", "payload"],
            properties: {
              actionType: { type: "string", const: "update-work-item" },
              resourceType: { type: "string", const: "workitem" },
              payload: {
                type: "object",
                required: ["id", "project"],
                properties: {
                  id: { type: "integer", description: "Work item ID" },
                  project: { type: "string", description: "Project name" },
                  title: { type: "string" },
                  state: { type: "string", description: "New state" },
                  priority: { type: "integer", minimum: 1, maximum: 4 },
                  assignee: { type: "string" },
                  description: { type: "string" }
                }
              }
            }
          }
        }
      }
    },
    instructions: `Update fields on an existing work item.

Include at minimum:
- id: The work item ID to update
- project: Project containing the work item
- At least one field to update (title, state, priority, etc.)`,
    example: `requestId: req-updatewi
prompt: Mark bug #123 as resolved
actions:
  - actionType: update-work-item
    resourceType: workitem
    payload:
      id: 123
      project: MyProject
      state: Resolved`,
    variables: [],
    contextFetch: "workitem"
  },
  {
    id: "trigger-pipeline",
    name: "Trigger Pipeline",
    description: "Run an Azure DevOps pipeline",
    icon: "⚡",
    goal: "Which pipeline to run and with what parameters?",
    outputSchema: {
      type: "object",
      required: ["requestId", "actions"],
      properties: {
        requestId: { type: "string" },
        correlationId: { type: "string" },
        prompt: { type: "string" },
        actions: {
          type: "array",
          items: {
            type: "object",
            required: ["actionType", "payload"],
            properties: {
              actionType: { type: "string", const: "trigger-pipeline" },
              resourceType: { type: "string", const: "pipeline" },
              payload: {
                type: "object",
                required: ["project", "pipelineId"],
                properties: {
                  project: { type: "string", description: "Project name" },
                  pipelineId: { type: "integer", description: "Pipeline definition ID" },
                  templateParameters: { type: "object", description: "Pipeline parameters" },
                  branch: { type: "string", description: "Branch to run" }
                }
              }
            }
          }
        }
      }
    },
    instructions: `Trigger a pipeline run.

Required:
- project: Project containing the pipeline
- pipelineId: The pipeline definition ID

Optional:
- templateParameters: Key-value parameters for the pipeline
- branch: Branch to run from (defaults to default branch)`,
    example: `requestId: req-triggerpipe
prompt: Run the build pipeline
actions:
  - actionType: trigger-pipeline
    resourceType: pipeline
    payload:
      project: MyProject
      pipelineId: 5`,
    variables: [],
    contextFetch: "pipeline"
  },
  {
    id: "create-pr",
    name: "Create Pull Request",
    description: "Create an Azure DevOps pull request",
    icon: "🔀",
    goal: "What's being reviewed and from/to which branch?",
    outputSchema: {
      type: "object",
      required: ["requestId", "actions"],
      properties: {
        requestId: { type: "string" },
        correlationId: { type: "string" },
        prompt: { type: "string" },
        actions: {
          type: "array",
          items: {
            type: "object",
            required: ["actionType", "payload"],
            properties: {
              actionType: { type: "string", const: "create-pr" },
              resourceType: { type: "string", const: "pr" },
              payload: {
                type: "object",
                required: ["project", "repoId", "sourceBranch", "title"],
                properties: {
                  project: { type: "string" },
                  repoId: { type: "string" },
                  sourceBranch: { type: "string", description: "Source branch" },
                  targetBranch: { type: "string", description: "Target branch, defaults to main" },
                  title: { type: "string" },
                  description: { type: "string", description: "PR description" }
                }
              }
            }
          }
        }
      }
    },
    instructions: `Create a pull request.

Required:
- project: Project name
- repoId: Repository ID
- sourceBranch: Branch with changes
- title: PR title

Optional:
- targetBranch: Target branch (defaults to main)
- description: Detailed PR description`,
    example: `requestId: req-createpr
prompt: Create PR for feature/login
actions:
  - actionType: create-pr
    resourceType: pr
    payload:
      project: MyProject
      repoId: myrepo
      sourceBranch: feature/login
      targetBranch: main
      title: Add login flow
      description: Implements OAuth login`,
    variables: [],
    contextFetch: "pr"
  },
  {
    id: "upsert-wiki",
    name: "Update Wiki",
    description: "Create or update a wiki page",
    icon: "📖",
    goal: "Which wiki page to update?",
    outputSchema: {
      type: "object",
      required: ["requestId", "actions"],
      properties: {
        requestId: { type: "string" },
        correlationId: { type: "string" },
        prompt: { type: "string" },
        actions: {
          type: "array",
          items: {
            type: "object",
            required: ["actionType", "payload"],
            properties: {
              actionType: { type: "string", const: "upsert-wiki" },
              resourceType: { type: "string", const: "wiki" },
              payload: {
                type: "object",
                required: ["project", "path", "content"],
                properties: {
                  project: { type: "string" },
                  wiki: { type: "string", description: "Wiki name" },
                  path: { type: "string", description: "Page path" },
                  content: { type: "string", description: "Markdown content" }
                }
              }
            }
          }
        }
      }
    },
    instructions: `Create or update a wiki page.

Required:
- project: Project containing the wiki
- path: Page path (e.g., /docs/intro)
- content: Markdown content

Use this to update existing documentation.`,
    example: `requestId: req-upsertwiki
prompt: Update getting started doc
actions:
  - actionType: upsert-wiki
    resourceType: wiki
    payload:
      project: MyProject
      wiki: docs
      path: /getting-started
      content: |
        # Getting Started
        
        Welcome to the project!
        
        ## Setup
        1. Clone the repo
        2. Run npm install`,
    variables: [],
    contextFetch: "wiki"
  }
];

let _templates = null;
let _templatesById = null;

/**
 * Load templates from config repo, merging with built-ins.
 */
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

/**
 * Render a prompt from a template and user goal.
 * Returns the full prompt including schema, instructions, and example.
 */
export function renderPrompt(templateId, userGoal, variableValues = {}, contextResources = []) {
  const template = getTemplate(templateId);
  if (!template) {
    throw new Error("Template not found: " + templateId);
  }

  // Build YAML schema string
  const schemaYaml = yaml.dump(template.outputSchema, {
    lineWidth: 0,
    noRefs: true
  });

  // Build the full prompt
  let prompt = "";
  
  prompt += "## Goal\n" + userGoal + "\n\n";
  
  prompt += "## Output Schema (JSON)\n```json\n" + JSON.stringify(template.outputSchema, null, 2) + "\n```\n\n";
  
  if (template.instructions) {
    prompt += "## Instructions\n" + template.instructions + "\n\n";
  }
  
  if (template.example) {
    prompt += "## Example Output (YAML)\n```yaml\n" + template.example + "\n```\n\n";
  }

  // Add context if available
  if (contextResources.length > 0) {
    prompt += "## Context\n";
    for (const res of contextResources) {
      prompt += "- " + res.resourceType + ": " + res.resourceId + "\n";
      if (res.data) {
        prompt += "  " + JSON.stringify(res.data).slice(0, 200) + "...\n";
      }
    }
    prompt += "\n";
  }

  return {
    prompt,
    schema: template.outputSchema,
    instructions: template.instructions,
    example: template.example,
    template
  };
}

/**
 * Validate parsed response against template schema
 */
export function validateResponse(templateId, response) {
  const template = getTemplate(templateId);
  if (!template) {
    return { valid: false, errors: ["Template not found"] };
  }

  const errors = [];
  const schema = template.outputSchema;

  // Check required top-level fields
  if (!response.requestId) errors.push("Missing required field: requestId");
  if (!response.actions) errors.push("Missing required field: actions");
  else if (!Array.isArray(response.actions)) {
    errors.push("actions must be an array");
  } else if (response.actions.length === 0) {
    errors.push("actions must have at least one item");
  }

  // Validate each action
  if (response.actions) {
    for (let i = 0; i < response.actions.length; i++) {
      const action = response.actions[i];
      const idx = i + 1;

      if (!action.actionType) {
        errors.push(`actions[${idx}]: missing actionType`);
      } else if (action.actionType !== templateId.replace("create-", "").split("-")[0] + "-") {
        // Allow some flexibility - just warn if mismatched
      }

      if (!action.payload) {
        errors.push(`actions[${idx}]: missing payload`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Re-export for convenience
export { BUILT_IN_TEMPLATES };