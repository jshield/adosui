# YAML Tools — Structured Editing of YAML Files in Azure DevOps

## Overview

YAML Tools provides a configurable, schema-driven system for adding structured objects
to YAML files stored in Azure DevOps Git repositories. Each "tool" presents a form
generated from a schema definition, allows users to add new items to a YAML array,
and commits changes via a branch + optional pull request workflow.

Tools are defined in `.superui/tools.yml` files (per-repo) or a central tools directory
in the config repository, making the system fully data-driven and extensible without
code changes.

## Configuration

### Per-repo tool definitions

Each repository can contain a `.superui/tools.yml` file at its root:

```yaml
# .superui/tools.yml
tools:
  - id: deploy-targets
    name: Deploy Targets
    description: Manage deployment target configurations
    icon: "\U0001F680"
    target:
      file: config/deploy-targets.yaml
      arrayPath: targets
    schema:
      fields:
        - key: name
          label: Target Name
          type: string
          required: true
        - key: environment
          label: Environment
          type: select
          options: [dev, staging, prod]
          required: true
        - key: url
          label: Endpoint URL
          type: string
          description: The base URL for this target
        - key: replicas
          label: Replicas
          type: number
          default: 1
        - key: enabled
          label: Enabled
          type: boolean
          default: true
        - key: tags
          label: Tags
          type: tags
    branch:
      prefix: yaml-tool/
    commitMessageTemplate: "Add {field:name} to {tool:name}"
```

### External JSON Schema reference

Instead of inline fields, a tool can reference a JSON Schema file in the same repo:

```yaml
  - id: feature-flags
    name: Feature Flags
    icon: "\U0001F3AF"
    target:
      file: config/feature-flags.yaml
      arrayPath: flags
    schema:
      ref: schemas/feature-flags.json
    branch:
      prefix: yaml-tool/
```

The referenced JSON Schema file uses standard JSON Schema with `properties`,
`required`, and `type` fields. Fields are converted to the internal normalized
format by mapping JSON Schema types to field types:

| JSON Schema type | Field type |
|---|---|
| `string` | `string` (or `textarea` if `format: textarea`) |
| `number`, `integer` | `number` |
| `boolean` | `boolean` |
| `string` + `enum` | `select` |
| `array` (items: string) | `tags` |

### Central tools directory

The config repository can contain a directory of tool definitions (default path
configured in repo config). All `.yaml`/`.yml` files in this directory are loaded
and merged with per-repo tools.

### Discovery

Tools are discovered by:
1. Scanning repos that appear in the user's collections for `.superui/tools.yml`
2. Loading any central tools from the config repo
3. Merging both sets — per-repo tools override central tools with the same ID

## Architecture

### Data flow

```
.tools.yml (per-repo or central)
       |
       v
  yamlToolsManager.loadToolsFromRepo()
       |
       v
  Normalized tool definitions (in memory)
       |
       v
  YamlToolsView renders tool list
       |
       v
  User selects tool -> readYamlArray() reads target YAML file
       |
       v
  SchemaForm renders form from field definitions
       |
       v
  User submits form -> writeYamlArrayItem() pushes to feature branch
       |
       v
  BranchCommitDialog offers optional PR creation
```

### Components

| Component | File | Responsibility |
|---|---|---|
| `ADOClient` | `src/lib/adoClient.js` | `createBranch()`, `createPullRequest()` |
| `YamlToolsManager` | `src/lib/yamlToolsManager.js` | Tool loading, schema resolution, YAML operations |
| `SchemaForm` | `src/components/ui/SchemaForm.jsx` | Form renderer from field definitions |
| `YamlToolsView` | `src/components/views/YamlToolsView.jsx` | Main tools container view |
| `BranchCommitDialog` | `src/components/views/BranchCommitDialog.jsx` | Branch/commit/PR workflow UI |

### Git workflow

1. User fills form and clicks "Create Branch & Commit"
2. A branch is created from the configured base branch (default: `main`)
   via `POST .../refs` API
3. The YAML file is read from the new branch to get its current `objectId`
4. The new item is inserted into the array at `arrayPath`
5. The modified YAML is pushed to the new branch via `pushGitFile()`
6. User can optionally create a PR via `createPullRequest()`

### Branch naming

Branch names follow the pattern: `{prefix}{toolId}-{shortHash}`
where `shortHash` is a 6-char hex derived from a timestamp to avoid collisions.

Example: `yaml-tool/deploy-targets-a3f291`

## Schema Form Fields

| Field type | UI element | Data stored |
|---|---|---|
| `string` | Text input | `string` |
| `number` | Number input | `number` |
| `boolean` | Toggle/checkbox | `boolean` |
| `select` | Dropdown | `string` (from options list) |
| `textarea` | Multi-line text area | `string` |
| `tags` | Comma-separated input | `string[]` |
| `object` | Nested group of sub-fields | `object` |
| `array` | Dynamic list with add/remove, each item rendered via `itemFields` template | `object[]` |

The `object` and `array` types enable recursive schema definitions, which is used
by the built-in Tool Builder to self-describe its own form structure.

### Field definition

```typescript
interface FieldDef {
  key: string;          // YAML key in the array item
  label: string;        // Display label
  type: "string" | "number" | "boolean" | "select" | "textarea" | "tags";
  required?: boolean;
  description?: string; // Help text
  default?: any;        // Default value
  options?: string[];   // For select type
}
```

### Validation

- Required fields must have a non-empty value before submit
- Number fields are parsed and stored as numeric types
- Select fields must match one of the defined options
- Tags are split on comma and trimmed

## File targets

### `arrayPath`

The `arrayPath` in the tool target config specifies where in the YAML structure
the array of items lives. It uses dot-notation for nested paths:

- `targets` — root-level `targets` key
- `config.targets` — nested under `config`
- (empty/absent) — the root object is itself an array

If the array doesn't exist yet, it is created.

## Dogfooding: Built-in Tool Builder

The YAML Tools system eats its own dogfood via a built-in **Tool Builder** tool
that is always available at the top of the tools list. It uses the same SchemaForm
renderer with `object` and `array` field types to present a form that describes
the structure of a `.superui/tools.yml` entry.

### How it works

1. The Tool Builder has an inline schema with `object` fields (`target`, `branch`)
   and an `array` field (`schemaFields`) containing `itemFields` for each schema
   field property (key, label, type, required, options, etc.)

2. The form is generated from the Tool Builder's own schema — the same mechanism
   used by all other tools. It's a self-describing form.

3. When submitting, the form values are transformed by `transformToolBuilderValues()`
   into a proper tool definition matching the `.superui/tools.yml` format.

### Location selection

The Tool Builder form includes a **Location** select field with two options:

| Location | Target | File path |
|---|---|---|
| `repo` | The config repo | `.superui/tools.yml` (appends to `tools` array) |
| `central` | The config repo's tools directory | `/config/tools/{tool-id}.yml` (creates new file) |

This determines where the new tool definition is written during the commit phase.

### Schema source selection

The Tool Builder includes a **Schema Source** field with two modes:

| Mode | Emitted as | Description |
|---|---|---|
| `inline` | `schema.fields` | Define fields directly in the tool config via the `schemaFields` array |
| `ref` | `schema.ref` | Reference an external `.json` JSON Schema file in the same repo |

When `inline` is selected, the `schemaFields` array is shown and required.
When `ref` is selected, a `schemaRef` path input is shown instead.
This uses SchemaForm's `visibleWhen` callback for conditional field visibility.

## Multi-File Glob Targeting

A tool can target multiple YAML files under a directory by using a glob pattern
in the `target.file` field.

```yaml
target:
  file: config/environments/*.yaml    # glob pattern
  arrayPath: targets                  # same arrayPath applied to all matched files
```

Detection is automatic: if `target.file` contains `*`, `?`, or `[`, the tool
is flagged as `_isMultiFile` and treated as a glob.

### How it works

1. The base directory is extracted from the pattern (everything before the first
   glob character).
2. `listGitItemsRecursive` fetches all files under that directory.
3. The glob pattern is converted to a regex and matched against file paths.
4. Each matched file is read via `readYamlArray` and collected into a
   `{ files: [{ path, items, objectId, raw }] }` result.

### UI

When a multi-file tool is selected, items are **grouped by file**:

```
+----------------------------------------------------+
| config/environments/*.yaml        [2 files]        |
+----------------------------------------------------+
├─ config/environments/dev.yaml ─────────────────────┤
│ api-gateway        ✓                        [+ Add]│
│ auth-service       ✓                               │
├─ config/environments/staging.yaml ─────────────────┤
│ api-gateway        ✓                        [+ Add]│
├─ config/environments/prod.yaml ────────────────────┤
│ (empty)                                      [+ Add]│
└────────────────────────────────────────────────────┘
```

Each file group has its own `+ Add` button. When adding, the selected file path
is stored in `selectedFilePath` and used as the commit target.

## UI Integration

### Navigation

A "YAML Tools" entry is added to the Rail (left sidebar), below the "Sync Status"
entry and above the collections list. It uses the `view: "yamlTools"` state.

### View layout

The YAML Tools view occupies the full content area (similar to Pipelines view):

```
+----------------------------------------------------+
| YAML Tools                             [repo: ▼]   |
+----------------------------------------------------+
| [🚀 Deploy Targets]  [🔧 Feature Flags]            |
+----------------------------------------------------+
| Existing items in config/deploy-targets.yaml        |
|                                                     |
| ┌─────────────────────────────────────────────┐    |
│ │ api-gateway        prod     ✓               │    │
│ │ auth-service       staging  ✓               │    │
│ └─────────────────────────────────────────────┘    |
|                                        [+ Add New] |
+----------------------------------------------------+
| (form appears here when adding)                     |
+----------------------------------------------------+
```

### State management

New state variables in `ui.jsx`:

| Variable | Type | Purpose |
|---|---|---|
| `yamlTools` | `ToolDef[]` | Loaded tool definitions |
| `activeYamlTool` | `string | null` | Selected tool ID |
| `yamlToolItems` | `any[]` | Items from target YAML file |
| `yamlToolObjectId` | `string | null` | Current file objectId for locking |
| `yamlToolLoading` | `boolean` | Loading state |
| `yamlToolError` | `string | null` | Error message |
