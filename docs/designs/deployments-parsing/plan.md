# Deployment Targets Parsing Design

## Overview

Parse Azure DevOps pipeline metadata — both YAML definitions and execution
logs — to identify deployment targets (Azure Web Apps, Function Apps,
Container Instances, AKS, ARM deployments, SQL databases, VMs) and display
them in the Pipeline Detail view.

## Goals

- Detect which Azure resources a pipeline targets for deployment (planned **and** actual).
- Extract metadata: resource name, resource group, slot, namespace, subscription.
- Distinguish **planned** deployments (YAML) from **actual** deployments (logs).
- Display results inline in the PipelineDetail component.

## Architecture

```
┌──────────────────┐     ┌─────────────────────┐
│  ADO REST API    │     │  pipelineParser.js   │
│  ───────────     │     │  ─────────────────   │
│  getPipelineYaml │────▶│  parsePipeline()     │──┐
│  getFullBuildLog │────▶│  parsePipelineLogs() │  │
└──────────────────┘     └─────────────────────┘  │
                                                   ▼
                         ┌─────────────────────┐  merge
                         │  mergeTargets()      │◀─┘
                         └────────┬────────────┘
                                  ▼
                         ┌─────────────────────┐
                         │  DeploymentTargets   │
                         │  Section (React)     │
                         └─────────────────────┘
```

### Files

| File | Role |
|------|------|
| `src/lib/pipelineParser.js` | YAML parsing, log parsing, merge/dedup logic |
| `src/lib/adoClient.js` | `getPipelineYaml()`, `getFullBuildLog()` methods |
| `src/components/views/ResourceDetail.jsx` | `DeploymentTargetsSection` component |

## Parsing Utility (`src/lib/pipelineParser.js`)

### YAML Parsing — `parsePipeline(yamlText)`

1. Parse YAML via `js-yaml`.
2. Flatten the pipeline structure into a uniform list of steps, handling:
   - `stages > jobs > steps`
   - Deployment strategies (`runOnce`, `rolling`, `canary`) with phases (`preDeploy`, `deploy`, `routeTraffic`, `postRouteTraffic`)
   - Direct `jobs > steps` (older format)
   - Top-level `steps` (simple pipelines)
3. For each step, detect deployment targets via:
   - **Task detection** — match known task names (stripped of `@version`) against
     a mapping (`AzureWebApp` → `webapp`, `AzureFunctionApp` → `functionapp`, etc.).
     Extract properties from `inputs` (appName, resourceGroupName, slotName, etc.).
   - **Script detection** — for `script`, `bash`, `powershell`, `pwsh` fields, and
     for `AzureCLI`/`AzurePowerShell` task `inputs.script`, match CLI patterns
     (`az webapp`, `az functionapp`, `New-AzWebApp`, etc.) and extract `--name` /
     `--resource-group` arguments.

### Log Parsing — `parsePipelineLogs(logText)`

1. Split concatenated build log text into lines.
2. Match each line against the same CLI patterns used for script detection.
3. Extract resource name and resource group from command arguments.
4. Each match produces a target with `source: "log"`.

### Merge — `mergeTargets(yamlTargets, logTargets)`

- Key targets by `(type, name, resourceGroup)` (case-insensitive).
- When the same target appears in both YAML and logs, set `source: "both"` and
  prefer log-resolved values (which contain expanded variables).

### Output Format

```javascript
{
  type: "webapp" | "functionapp" | "aci" | "aks" | "arm" | "sql" | "vm",
  name: string,
  resourceGroup?: string,
  slot?: string,
  namespace?: string,
  subscription?: string,
  pipelineStep: string,
  source: "yaml" | "log" | "both",
}
```

### Task Type Mapping

| ADO Task | Target Type |
|----------|-------------|
| `AzureWebApp` | `webapp` |
| `AzureFunctionApp` | `functionapp` |
| `AzureContainerInstances` | `aci` |
| `AzureKubernetesService` | `aks` |
| `AzureResourceManagerTemplateDeployment` | `arm` |
| `AzureSqlDatabaseDeployment` | `sql` |
| `AzureVMDeployment` | `vm` |
| `AzureAppServiceSettings` | `appservice` |
| `AzureRMWebAppDeployment` | `webapp` |
| `AzureRMFunctionAppDeployment` | `functionapp` |

### CLI Patterns Detected

| Pattern | Target Type |
|---------|-------------|
| `az webapp ...` | `webapp` |
| `az functionapp ...` | `functionapp` |
| `az container ...` | `aci` |
| `az aks ...` | `aks` |
| `az deployment group create` | `arm` |
| `New-AzWebApp` / `Set-AzWebApp` | `webapp` |
| `New-AzFunctionApp` / `Set-AzFunctionApp` | `functionapp` |
| `New-AzContainerGroup` | `aci` |
| `New-AzAksCluster` / `Get-AzAksCredential` | `aks` |
| `New-AzResourceGroupDeployment` | `arm` |

## ADO Client Extension (`src/lib/adoClient.js`)

Two new methods:

- **`getPipelineYaml(project, pipelineId)`** — gets the latest completed run
  for the pipeline, then fetches the `$expand=finalYaml` endpoint. The response
  JSON is parsed to extract the `finalYaml` property (expanded YAML with
  template includes resolved).

- **`getFullBuildLog(project, buildId)`** — fetches the log index for a build,
  then fetches and concatenates all log segments into a single string.

Both methods are called on-demand when the user views a pipeline's detail pane.

## UI Integration (`DeploymentTargetsSection`)

A self-contained React component rendered inside the PipelineDetail view, between
the "Runs by Branch" section and the comment thread.

### States

| State | Rendering |
|-------|-----------|
| Loading | Spinner + "Analysing pipeline..." |
| Error | Red error text |
| Empty (no targets) | Section hidden entirely |
| Targets found | List of target cards |

### Target Cards

Each card shows:
- **Left border** colour-coded by source (cyan = YAML, green = log, amber = both)
- **Type badge** — short code (WEB, FN, ACI, AKS, ARM, SQL, VM)
- **Resource name** + type pill
- **Metadata row** — resource group, slot, namespace, subscription (when present)
- **Source label** — YAML / LOG / BOTH

### Trigger

The `useEffect` fires when `pipeline.id` or `runs.length` changes. It finds
the latest completed run, fetches YAML (for YAML-type pipelines) and logs in
parallel, parses both, merges, and sets state. A cleanup function cancels stale
updates if the user navigates away.

## Error Handling

- **YAML not available** — silently produces zero YAML targets; log targets
  still display. Classic (non-YAML) pipelines skip YAML fetch entirely.
- **Logs not available** — silently produces zero log targets; YAML targets
  still display.
- **Parse errors** — caught and logged to console; empty target list returned.
- **Network errors** — if both YAML and log fetches fail, an error message is
  shown in the UI.

## Testing

- Unit tests for `parsePipeline()` with multi-stage, deployment-strategy, and
  simple pipeline YAML.
- Unit tests for `parsePipelineLogs()` with Azure CLI and PowerShell log output.
- Unit tests for `mergeTargets()` covering dedup and source promotion.
- Manual testing with live ADO pipelines covering Web App, Function App, AKS,
  ARM, and script-based deployments.
