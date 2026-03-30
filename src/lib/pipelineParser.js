/**
 * Pipeline Parser for Azure DevOps pipelines
 * Detects deployment targets from both YAML definitions and execution logs
 */
import yaml from "js-yaml";

// ── Target type labels & icons (used by UI) ─────────────────────────────────
export const TARGET_TYPE_META = {
  webapp:      { label: "Web App",             icon: "WEB" },
  functionapp: { label: "Function App",        icon: "FN"  },
  aci:         { label: "Container Instances",  icon: "ACI" },
  aks:         { label: "Kubernetes Service",   icon: "AKS" },
  arm:         { label: "ARM Deployment",       icon: "ARM" },
  sql:         { label: "SQL Database",         icon: "SQL" },
  vm:          { label: "Virtual Machine",      icon: "VM"  },
  appservice:  { label: "App Service Settings", icon: "APP" },
};

// Azure DevOps task type mappings
const TASK_TYPE_MAPPING = {
  AzureWebApp:                             "webapp",
  AzureFunctionApp:                        "functionapp",
  AzureContainerInstances:                 "aci",
  AzureKubernetesService:                  "aks",
  AzureResourceManagerTemplateDeployment:  "arm",
  AzureSqlDatabaseDeployment:              "sql",
  AzureVMDeployment:                       "vm",
  AzureAppServiceSettings:                 "appservice",
  AzureRMWebAppDeployment:                 "webapp",
  AzureRMFunctionAppDeployment:            "functionapp",
};

// CLI command patterns for detecting deployment targets in scripts/logs
const CLI_PATTERNS = [
  { regex: /az\s+webapp\s+/i,                    type: "webapp"      },
  { regex: /az\s+functionapp\s+/i,                type: "functionapp" },
  { regex: /az\s+container\s+/i,                  type: "aci"         },
  { regex: /az\s+aks\s+/i,                        type: "aks"         },
  { regex: /az\s+deployment\s+group\s+create/i,   type: "arm"         },
  { regex: /New-AzWebApp|Set-AzWebApp/i,          type: "webapp"      },
  { regex: /New-AzFunctionApp|Set-AzFunctionApp/i,type: "functionapp" },
  { regex: /New-AzContainerGroup/i,               type: "aci"         },
  { regex: /New-AzAksCluster|Get-AzAksCredential/i, type: "aks"      },
  { regex: /New-AzResourceGroupDeployment/i,      type: "arm"         },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Try to pull a resource name out of a CLI / script string */
function extractName(text) {
  const patterns = [
    /--name\s+(\S+)/i,
    /-n\s+(\S+)/i,
    /appName\s*[:=]\s*['"]?(\S+)/i,
    /functionAppName\s*[:=]\s*['"]?(\S+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return undefined;
}

/** Try to pull a resource-group out of a CLI / script string */
function extractResourceGroup(text) {
  const patterns = [
    /--resource-group\s+(\S+)/i,
    /-g\s+(\S+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return undefined;
}

// ── YAML parsing ─────────────────────────────────────────────────────────────

/**
 * Flatten pipeline structure to get all steps/tasks.
 * Handles stages > jobs > steps, deployment strategies, and direct-jobs formats.
 */
function flattenSteps(data) {
  const steps = [];
  if (!data || typeof data !== "object") return steps;

  const pushSteps = (arr, ctx) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(s => steps.push({ ...s, _ctx: ctx }));
  };

  const walkJobs = (jobs, stageName) => {
    if (!Array.isArray(jobs)) return;
    jobs.forEach(job => {
      const ctx = { stage: stageName, job: job.job || job.deployment };
      // deployment job with strategy
      const strategy = job.strategy;
      if (strategy) {
        for (const kind of ["runOnce", "rolling", "canary"]) {
          const phases = strategy[kind];
          if (!phases) continue;
          for (const phase of ["preDeploy", "deploy", "routeTraffic", "postRouteTraffic"]) {
            pushSteps(phases[phase]?.steps, ctx);
          }
        }
      }
      pushSteps(job.steps, ctx);
    });
  };

  // stages > jobs
  if (Array.isArray(data.stages)) {
    data.stages.forEach(stage => walkJobs(stage.jobs, stage.stage));
  }
  // top-level jobs
  walkJobs(data.jobs, undefined);
  // top-level steps (simple pipeline)
  pushSteps(data.steps, {});

  return steps;
}

/** Detect a deployment target from a known ADO task */
function detectTargetFromTask(step) {
  if (!step.task || typeof step.task !== "string") return null;
  const taskName = step.task.split("@")[0];
  const type = TASK_TYPE_MAPPING[taskName];
  if (!type) return null;

  const inp = step.inputs || {};
  const target = {
    type,
    pipelineStep: step.displayName || step.name || step.task,
    source: "yaml",
  };

  switch (type) {
    case "webapp":
    case "functionapp":
      target.name          = inp.appName || inp.WebAppName || inp.FunctionAppName;
      target.resourceGroup = inp.resourceGroupName || inp.ResourceGroupName;
      target.slot          = inp.slotName || inp.SlotName;
      break;
    case "aci":
      target.name          = inp.name || inp.ContainerGroupName;
      target.resourceGroup = inp.resourceGroupName || inp.ResourceGroupName;
      break;
    case "aks":
      target.name      = inp.connectedServiceName || inp.KubernetesServiceConnection;
      target.namespace = inp.namespace || inp.Namespace;
      break;
    case "arm":
      target.name          = inp.deploymentName || inp.DeploymentName;
      target.resourceGroup = inp.resourceGroupName || inp.ResourceGroupName;
      break;
    case "sql":
      target.name          = inp.DatabaseName || inp.databaseName;
      target.resourceGroup = inp.resourceGroupName || inp.ResourceGroupName;
      target.serverName    = inp.ServerName || inp.serverName;
      break;
    default:
      target.name          = inp.appName || inp.name || inp.Name;
      target.resourceGroup = inp.resourceGroupName || inp.ResourceGroupName;
      break;
  }

  target.subscription = inp.connectedServiceName || inp.azureSubscription || inp.AzureSubscription;
  return target;
}

/** Detect a deployment target from inline script text */
function detectTargetFromScript(script, scriptType) {
  if (!script || typeof script !== "string") return null;
  for (const { regex, type } of CLI_PATTERNS) {
    if (regex.test(script)) {
      return {
        type,
        name:          extractName(script),
        resourceGroup: extractResourceGroup(script),
        pipelineStep:  `${scriptType} script`,
        source:        "yaml",
      };
    }
  }
  return null;
}

/**
 * Parse pipeline YAML content and extract deployment targets.
 * @param {string} yamlContent  Raw YAML text
 * @returns {Array} deployment targets
 */
export function parsePipeline(yamlContent) {
  if (!yamlContent || typeof yamlContent !== "string") return [];
  try {
    const data = yaml.load(yamlContent);
    if (!data) return [];

    const steps   = flattenSteps(data);
    const targets = [];

    for (const step of steps) {
      // Task-based detection
      if (step.task) {
        const t = detectTargetFromTask(step);
        if (t) targets.push(t);

        // AzureCLI / AzurePowerShell tasks carry scripts inside inputs
        if (step.task.includes("AzureCLI") || step.task.includes("AzurePowerShell")) {
          const s = step.inputs?.script || step.inputs?.azurePowerShellScript || "";
          if (s) { const t2 = detectTargetFromScript(s, step.task); if (t2) targets.push(t2); }
        }
      }

      // Inline script detection
      for (const field of ["script", "bash", "powershell", "pwsh"]) {
        if (step[field]) {
          const t = detectTargetFromScript(step[field], field);
          if (t) targets.push(t);
        }
      }
    }
    return targets;
  } catch (err) {
    console.warn("[pipelineParser] YAML parse error:", err);
    return [];
  }
}

// ── Log parsing ──────────────────────────────────────────────────────────────

/**
 * Parse pipeline execution log text and extract deployment targets.
 * @param {string} logContent  Concatenated log text
 * @returns {Array} deployment targets
 */
export function parsePipelineLogs(logContent) {
  if (!logContent || typeof logContent !== "string") return [];

  const targets = [];
  for (const line of logContent.split("\n")) {
    for (const { regex, type } of CLI_PATTERNS) {
      if (regex.test(line)) {
        targets.push({
          type,
          name:          extractName(line),
          resourceGroup: extractResourceGroup(line),
          pipelineStep:  "execution log",
          source:        "log",
        });
        break; // one match per line is enough
      }
    }
  }
  return targets;
}

// ── Merge & deduplicate ──────────────────────────────────────────────────────

/**
 * Merge targets from YAML and log sources, deduplicating by (type, name, rg).
 * When both sources report the same target, source becomes "both" and log-side
 * values (which contain resolved variables) are preferred.
 */
export function mergeTargets(yamlTargets, logTargets) {
  const map = new Map(); // key -> target

  const keyOf = (t) =>
    `${t.type}|${(t.name || "").toLowerCase()}|${(t.resourceGroup || "").toLowerCase()}`;

  for (const t of yamlTargets) {
    map.set(keyOf(t), { ...t });
  }

  for (const t of logTargets) {
    const k = keyOf(t);
    const existing = map.get(k);
    if (existing) {
      // Merge: prefer log-resolved values, mark source as "both"
      map.set(k, {
        ...existing,
        name:          t.name || existing.name,
        resourceGroup: t.resourceGroup || existing.resourceGroup,
        source:        "both",
        status:        t.status || existing.status,
      });
    } else {
      map.set(k, { ...t });
    }
  }

  return [...map.values()];
}
