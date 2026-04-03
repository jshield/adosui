# Workflow System — User Manual

> User-driven workflows backed by ADO work items, defined in YAML templates.

---

## Overview

The workflow system lets you define **repeatable multi-step processes** as YAML templates, then apply them to work items. Each step can automatically execute actions like updating files, creating PRs, running pipelines, or gating on approvals.

**State lives entirely in ADO work items** — no custom fields, no external storage:

- **Parent work item** (PBI, Bug, etc.) = the workflow instance
- **Child Tasks** = individual steps
- **Tag `superui:wf:{templateId}`** = template reference on the parent
- **Task states** (`New` → `Active` → `Closed`) = step progress

---

## Quick Start

### 1. Add a Workflow Template

Create or edit `collections/workflow-templates.yaml` in your config repo:

```yaml
templates:
  - id: my-workflow
    name: My First Workflow
    icon: "🚀"
    color: "#22D3EE"
    wiType: "User Story"
    description: "A simple workflow example"

    params:
      - key: environment
        label: "Target Environment"
        type: select
        options: ["dev", "staging", "prod"]
        required: true

    tracks:
      - id: main
        name: Main Track
        color: "#22D3EE"
        steps:
          - id: hello
            title: "Say Hello"
            action:
              type: create-task
              title: "Hello {params.environment}"
              description: "Greet the {params.environment} environment"
```

Save the file. The template loads automatically on next connection.

### 2. Apply a Workflow to a Work Item

1. Open a work item from your collection
2. Scroll below the comments section to the **Workflow** area
3. Click **Apply Workflow**
4. Select a template from the list
5. Fill in the parameters (if any)
6. Click **Create Workflow**

Child Tasks are created for each step. The parent WI is tagged with `superui:wf:{templateId}`.

### 3. Execute Steps

Each step card shows a button. Click it to run the action. The step status updates as tasks complete.

---

## Template Structure

### Top-Level Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique identifier for the template |
| `name` | string | yes | Display name shown in the template picker |
| `icon` | emoji | no | Icon shown in UI (default: `⚡`) |
| `color` | hex | no | Accent color (default: `#6B7280`) |
| `wiType` | string | no | ADO work item type to create (default: `User Story`) |
| `description` | string | no | Shown in template picker and step cards |
| `params` | array | no | Workflow-level parameters prompted at creation |
| `tracks` | array | yes | Groups of steps that can run in parallel |

### Parameters (`params`)

Parameters are prompted when creating a workflow instance. Their values are injected into step actions via `{params.key}` tokens.

```yaml
params:
  - key: releaseVersion
    label: "Release Version"
    type: string
    required: true
    description: "Semver string, e.g. 2.4.0"

  - key: environment
    label: "Environment"
    type: select
    options: ["dev", "staging", "prod"]
    required: true

  - key: sourcePipelines
    label: "Source Pipelines"
    type: array
    itemFields:
      - key: name
        label: "Display Name"
        type: string
        required: true
      - key: pipelineId
        label: "Pipeline ID"
        type: number
        required: true
      - key: tfvarKey
        label: "Tfvars Variable Name"
        type: string
        required: true
```

| Param Type | Description |
|---|---|
| `string` | Text input |
| `number` | Numeric input |
| `boolean` | Checkbox |
| `select` | Dropdown with `options` array |
| `textarea` | Multi-line text input |
| `tags` | Comma-separated tags |
| `array` | Dynamic list with `itemFields` schema |

### Tracks

Tracks group steps. Tracks with `dependsOn` wait for referenced tracks to complete before their steps become executable.

```yaml
tracks:
  - id: collect
    name: Collect Versions
    color: "#22D3EE"
    steps:
      - id: gather-builds
        title: "Gather Source Build Numbers"
        action:
          type: gather-pipeline-outputs
          pipelines: "{params.sourcePipelines}"

  - id: apply
    name: Plan & Apply
    color: "#4ADE80"
    dependsOn: ["collect"]     # waits for collect track to finish
    steps:
      - id: deploy
        title: "Deploy"
        action:
          type: run-pipeline
          pipeline: 42
```

### Steps

Each step has an **action** that executes when triggered.

```yaml
steps:
  - id: my-step
    title: "Step Title"
    description: "What this step does"
    dependsOn: ["previous-step"]   # step IDs within same track
    repeatForEach: "{params.environments}"  # optional: run per item
    sequential: true               # default: run iterations in order
    gates:                         # optional: pause before iterations
      - when: "{loop.env == 'prod'}"
        action:
          type: request-approval
          environment: "production"
    action:
      type: run-pipeline
      pipeline: 42
```

---

## Action Types

### `create-task`

Creates a child Task work item. The user completes it manually in ADO.

```yaml
action:
  type: create-task
  title: "Investigate the issue"
  description: "Reproduce and document the bug"
```

### `gather-pipeline-outputs`

Fetches the latest successful `buildNumber` from multiple pipelines.

```yaml
action:
  type: gather-pipeline-outputs
  pipelines:
    - name: "App Build"
      project: "MyApp"
      pipelineId: 100
      tfvarKey: "app_image_tag"
    - name: "DB Migration"
      project: "MyApp"
      pipelineId: 101
      tfvarKey: "db_migrator_tag"
```

**Result:** `{ outputs: { "app_image_tag": "20240402.5" }, runs: { ... } }`

### `merge-vars`

Reads a tfvars file, updates key-value pairs, and commits to a new branch. Parses both `key = "value"` and `key = value` formats.

```yaml
action:
  type: merge-vars
  repo: "terraform-config"
  filePath: "tfvars/{loop.env}.tfvars"
  vars: "{step.gather-builds.outputs}"
  branch: "tfvars/bulk-update"
  commitMessage: "tfvars: update versions for {loop.env}"
```

| Field | Description |
|---|---|
| `repo` | Repository name (resolved to ID) |
| `filePath` | Path to the tfvars file |
| `vars` | Object of key-value pairs to merge |
| `branch` | Branch name to commit to |
| `commitMessage` | Commit message |

### `edit-file`

Creates a branch and writes file content to a repository.

```yaml
action:
  type: edit-file
  repo: "my-app"
  filePath: "CHANGELOG.md"
  content: |
    ## 2.4.0
    - Release notes
  branch: "release/2.4.0"
  commitMessage: "changelog: add 2.4.0"
```

### `raise-pr`

Creates a pull request.

```yaml
action:
  type: raise-pr
  repo: "my-app"
  sourceBranch: "release/2.4.0"
  targetBranch: "main"
  titleTemplate: "Release 2.4.0"
  descriptionTemplate: "Automated release PR"
```

### `run-pipeline`

Triggers a pipeline run with optional parameters.

```yaml
action:
  type: run-pipeline
  pipeline: "deploy-prod"
  project: "MyApp"
  params:
    ENVIRONMENT: "production"
    TFVARS_FILE: "tfvars/prod.tfvars"
```

| Field | Description |
|---|---|
| `pipeline` | Pipeline name or ID |
| `project` | ADO project (defaults to parent WI's project) |
| `params` | Template parameters passed to the pipeline |

### `request-approval`

Surfaces a pending ADO pipeline approval gate for inline approve/reject.

```yaml
action:
  type: request-approval
  environment: "production"
  pipelineRunRef:
    step: "apply-staging"
    loopItem: "staging"
  description: "Approve terraform apply for production"
```

| Field | Description |
|---|---|
| `environment` | ADO environment name |
| `pipelineRunRef.step` | Step ID whose run to check approvals for |
| `pipelineRunRef.loopItem` | Loop item key (for `repeatForEach` steps) |
| `description` | Shown in the approval dialog |

---

## Token Interpolation

All string values in actions support these tokens:

| Token | Source | Example |
|---|---|---|
| `{params.key}` | Workflow params | `{params.releaseVersion}` → `"2.4.0"` |
| `{parent.field}` | Parent WI fields | `{parent.title}` → `"Deploy auth service"` |
| `{parent.project}` | Parent WI project | `{parent.project}` → `"MyApp"` |
| `{step.stepId.output}` | Prior step result | `{step.gather-builds.outputs}` → `{...}` |
| `{loop.env}` | Current loop item | `{loop.env}` → `"staging"` |
| `{env}` | Shorthand for `{loop.env}` | `{env}` → `"staging"` |
| `{params.array[0]}` | Array index | `{params.environments[0]}` → `"dev"` |

### Ternary Expressions

```yaml
AUTO_APPLY: "{loop.env == 'dev' ? 'true' : 'false'}"
```

---

## `repeatForEach` — Per-Item Step Execution

When a step has `repeatForEach`, it runs once per item in the array:

```yaml
- id: apply-envs
  title: "Plan & Apply: {loop.env}"
  repeatForEach: "{params.environments}"   # ["dev", "staging", "prod"]
  sequential: true                         # dev → staging → prod
  gates:
    - when: "{loop.env != 'dev'}"
      action:
        type: request-approval
        environment: "{loop.env}"
        description: "Approve deploy to {loop.env}"
  action:
    type: run-pipeline
    pipeline: 42
    params:
      ENVIRONMENT: "{loop.env}"
```

- **`sequential: true`** (default) — iterations run in order
- **`sequential: false`** — iterations run in parallel
- **`gates[].when`** — condition evaluated before each iteration; if true, the gate action executes first

---

## Complete Example: Tfvars Update Pipeline

```yaml
templates:
  - id: tfvars-update
    name: Tfvars Update Pipeline
    icon: "🏗️"
    color: "#7C3AED"
    wiType: "User Story"

    params:
      - key: sourcePipelines
        label: "Source Pipelines"
        type: array
        itemFields:
          - key: name,       label: "Name",             type: string, required: true
          - key: project,    label: "Project",          type: string, required: true
          - key: pipelineId, label: "Pipeline ID",      type: number, required: true
          - key: tfvarKey,   label: "Tfvars Variable",  type: string, required: true
      - key: environments
        label: "Environments"
        type: tags
        default: ["dev", "staging", "prod"]
      - key: tfvarsRepo
        label: "Terraform Repo"
        type: string, required: true
      - key: terraformPipelineId
        label: "Terraform Pipeline ID"
        type: number, required: true
      - key: terraformPipelineProject
        label: "Terraform Pipeline Project"
        type: string, required: true

    tracks:
      - id: collect
        name: Collect Versions
        color: "#22D3EE"
        steps:
          - id: gather-builds
            title: "Gather Source Build Numbers"
            action:
              type: gather-pipeline-outputs
              pipelines: "{params.sourcePipelines}"

      - id: update
        name: Update Tfvars
        color: "#F59E0B"
        dependsOn: ["collect"]
        steps:
          - id: edit-tfvars
            title: "Update {loop.env} tfvars"
            repeatForEach: "{params.environments}"
            action:
              type: merge-vars
              repo: "{params.tfvarsRepo}"
              filePath: "tfvars/{loop.env}.tfvars"
              vars: "{step.gather-builds.outputs}"
              branch: "tfvars/bulk-update"
              commitMessage: "tfvars: update versions for {loop.env}"

          - id: raise-tfvars-pr
            title: "Create PR for tfvars changes"
            dependsOn: ["edit-tfvars"]
            action:
              type: raise-pr
              repo: "{params.tfvarsRepo}"
              sourceBranch: "tfvars/bulk-update"
              targetBranch: "main"
              titleTemplate: "Update tfvars: new versions"

      - id: apply
        name: Plan & Apply
        color: "#4ADE80"
        dependsOn: ["update"]
        steps:
          - id: apply-envs
            title: "Plan & Apply: {loop.env}"
            repeatForEach: "{params.environments}"
            sequential: true
            gates:
              - when: "{loop.env != 'dev'}"
                action:
                  type: request-approval
                  environment: "{loop.env}"
                  description: "Approve terraform apply for {loop.env}"
            action:
              type: run-pipeline
              pipeline: "{params.terraformPipelineId}"
              project: "{params.terraformPipelineProject}"
              params:
                ENVIRONMENT: "{loop.env}"
                TFVARS_FILE: "tfvars/{loop.env}.tfvars"
                AUTO_APPLY: "{loop.env == 'dev' ? 'true' : 'false'}"
```

---

## UI Guide

### Work Item Detail — Workflow Section

When a work item has a workflow tag, a workflow section appears below the comments:

```
┌─ 🏗️ Tfvars Update Pipeline ───────────────────────────── 3/8 37% ──┐
│                                                                      │
│ Collect Versions  ██████████████████████████████████  1/1 ✓          │
│   ✓ Gather Source Build Numbers                                     │
│     app_image_tag: 20240402.5 · db_migrator_tag: 20240402.3        │
│                                                                      │
│ Update Tfvars     ██████████████████████████████████  2/2 ✓          │
│   ✓ Update dev tfvars                                                │
│   ✓ Update staging tfvars                                            │
│   ✓ Update prod tfvars                                               │
│   ✓ Create PR for tfvars changes  → PR #847                          │
│                                                                      │
│ Plan & Apply      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  1/4 ▶           │
│   ✓ Plan & Apply: dev  → Run #456 ✓                                 │
│   ▶ Plan & Apply: staging  → Run #457 (in progress)                │
│   🔒 Approve Production Deploy  (waiting on: staging)               │
│   ⏳ Plan & Apply: prod  (blocked)                                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Step Status Indicators

| Icon | Color | Meaning |
|---|---|---|
| `·` | grey | Pending — not yet started |
| `▶` | cyan | Active — currently running |
| `✓` | green | Completed — successfully finished |
| `—` | grey | Skipped |

### Step Buttons

- **Execute** — runs the step action
- **Approve** — opens the approval dialog for gate actions
- **Gather / Update / Run / Create PR** — action-specific labels

### Collection View — Workflow Progress Card

Work items with workflows show a compact progress indicator on their card:

```
┌────────────────────────────┐
│ 🏗️ Tfvars Update Pipeline  │
│ ████████████░░░░░░░  37%   │
└────────────────────────────┘
```

---

## File Locations

| File | Purpose |
|---|---|
| `collections/workflow-templates.yaml` | Template definitions (edit this) |
| `src/lib/workflowManager.js` | Core engine |
| `src/lib/adoClient.js` | ADO API methods |
| `src/components/views/WorkflowSection.jsx` | Inline workflow UI |
| `src/components/views/WorkflowTemplateSelector.jsx` | Template picker |
| `src/components/views/StepActionDialog.jsx` | Action execution dialogs |
| `src/components/views/WorkflowProgress.jsx` | Progress cards |

---

## Troubleshooting

### Template not showing in picker

- Verify `collections/workflow-templates.yaml` exists in your config repo
- Check the YAML is valid (no syntax errors)
- Each template must have `id`, `name`, and `tracks` fields
- Refresh the page to reload templates

### Step action fails

- Check that referenced repos/pipelines exist and are accessible
- For `merge-vars` and `edit-file`, verify the repo name resolves correctly
- For `run-pipeline`, ensure the pipeline ID is valid
- For `request-approval`, ensure the pipeline run has a pending approval gate

### Track shows as "blocked"

- A track with `dependsOn` waits for all referenced tracks to complete
- Complete the dependent track's steps first

### Workflow not updating after step execution

- The UI refreshes automatically after step execution
- If child tasks were completed manually in ADO, refresh the work item detail tab
