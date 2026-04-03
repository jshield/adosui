/**
 * yamlToolsManager.js
 *
 * Manages YAML tool definitions — loading from per-repo .superui/tools.yml
 * files and a central tools directory, resolving schemas (inline or external
 * JSON Schema references), reading/writing YAML array items, and performing
 * branch + commit operations.
 */

import yaml from "js-yaml";

const TOOLS_FILE_PATH = ".superui/tools.yml";

// ── Glob helpers ───────────────────────────────────────────────────────────────

/**
 * Check if a file path contains glob characters.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isGlobPattern(filePath) {
  return /[*?[]/.test(filePath);
}

/**
 * Convert a simple glob pattern to a RegExp.
 * Supports: * (match within segment), ** (match across segments).
 * @param {string} pattern - Glob pattern like "config/envs/*.yaml"
 * @returns {RegExp}
 */
export function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|\\]/g, "\\$&")   // escape regex specials (except * ? [)
    .replace(/\*\*/g, "<<GLOBSTAR>>")      // placeholder for **
    .replace(/\*/g, "[^/]*")               // * matches within a segment
    .replace(/<<GLOBSTAR>>/g, ".*");       // ** matches across segments
  return new RegExp(`^${escaped}$`);
}

/**
 * Match file paths against a glob pattern.
 * @param {string} pattern - Glob pattern
 * @param {string[]} candidates - File paths to test
 * @returns {string[]} Matching paths
 */
export function matchGlobPattern(pattern, candidates) {
  const regex = globToRegex(pattern);
  return candidates.filter(p => regex.test(p));
}

/**
 * Read multiple YAML files matching a glob pattern and extract arrays.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {string} project
 * @param {string} repoId
 * @param {string} globPattern - Glob pattern (e.g. "config/envs/*.yaml")
 * @param {string} arrayPath - Dot-notation path to the array in each file
 * @param {string} branch
 * @returns {Promise<{ files: Array<{ path, items, objectId, raw }>, totalItems: number }>}
 */
export async function readYamlFilesByGlob(client, project, repoId, globPattern, arrayPath, branch = "main") {
  // Derive base directory from the pattern (everything up to the first glob char)
  const globIdx = globPattern.search(/[*?[]/);
  const baseDir = globIdx > 0 ? globPattern.slice(0, globIdx).replace(/\/+$/, "") : "/";
  const searchDir = baseDir || "/";

  // List all items recursively under the base directory
  const allItems = await client.listGitItemsRecursive(project, repoId, searchDir, branch);

  // Filter to files matching the glob
  const filePaths = allItems.filter(i => !i.isFolder && i.path).map(i => i.path);
  const matchedPaths = matchGlobPattern(globPattern, filePaths);

  // Read each matched file in parallel
  const results = await Promise.allSettled(
    matchedPaths.map(async (filePath) => {
      const { items, objectId, raw } = await readYamlArray(client, project, repoId, filePath, arrayPath, branch);
      return { path: filePath, items, objectId, raw };
    })
  );

  const files = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

  return {
    files,
    totalItems: files.reduce((sum, f) => sum + f.items.length, 0),
  };
}

// ── Field normalisation ───────────────────────────────────────────────────────

/**
 * Normalise an inline field definition into a standard shape.
 * Recursively handles `object` (with `fields` children) and `array` (with `itemFields`).
 * @param {object} f - Raw field definition
 * @returns {object} Normalised field definition
 */
function normaliseField(f) {
  const base = {
    key:         f.key,
    label:       f.label || f.key,
    type:        f.type || "string",
    required:    !!f.required,
    description: f.description || "",
    default:     f.default,
    options:     Array.isArray(f.options) ? f.options : undefined,
  };

  if (f.type === "object" && Array.isArray(f.fields)) {
    base.fields = f.fields.map(normaliseField);
  }

  if (f.type === "array" && Array.isArray(f.itemFields)) {
    base.itemFields = f.itemFields.map(normaliseField);
  }

  return base;
}

/**
 * Convert a JSON Schema property definition into our internal field format.
 * @param {string} key - Property name
 * @param {object} prop - JSON Schema property object
 * @param {string[]} requiredKeys - Array of required property names
 * @returns {object} Normalised field definition
 */
function jsonSchemaPropToField(key, prop, requiredKeys = []) {
  let type = "string";
  if (prop.type === "number" || prop.type === "integer") type = "number";
  else if (prop.type === "boolean") type = "boolean";
  else if (Array.isArray(prop.enum)) type = "select";
  else if (prop.type === "array" && prop.items?.type === "string") type = "tags";
  else if (prop.format === "textarea") type = "textarea";

  return {
    key,
    label:       prop.title || key,
    type,
    required:    requiredKeys.includes(key),
    description: prop.description || "",
    default:     prop.default,
    options:     Array.isArray(prop.enum) ? prop.enum : undefined,
  };
}

/**
 * Resolve a tool's schema definition into an array of normalised field
 * definitions. Handles both inline fields and external JSON Schema refs.
 *
 * @param {object} tool - Tool definition with schema config
 * @param {import('./adoClient').ADOClient} client - ADO client for fetching external schemas
 * @param {string} project - ADO project name
 * @param {string} repoId - Repository ID
 * @param {string} branch - Branch to read external schemas from
 * @returns {Promise<object[]>} Array of normalised field definitions
 */
export async function resolveSchema(tool, client, project, repoId, branch) {
  const schema = tool.schema;
  if (!schema) return [];

  // Inline fields
  if (Array.isArray(schema.fields)) {
    return schema.fields.map(normaliseField);
  }

  // External JSON Schema reference
  if (schema.ref) {
    const file = await client.readGitFile(project, repoId, schema.ref, branch);
    if (!file?.content) throw new Error(`Schema file not found: ${schema.ref}`);
    const jsonSchema = JSON.parse(file.content);
    const props = jsonSchema.properties || {};
    const requiredKeys = jsonSchema.required || [];
    return Object.entries(props).map(([key, prop]) =>
      jsonSchemaPropToField(key, prop, requiredKeys)
    );
  }

  return [];
}

// ── Tool loading ──────────────────────────────────────────────────────────────

/**
 * Validate a single tool definition from a .superui/tools.yml file.
 * Returns a normalised tool object or null if invalid.
 * @param {object} raw - Raw tool object from YAML
 * @returns {object|null} Validated tool definition
 */
function validateTool(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.id || typeof raw.id !== "string") return null;
  if (!raw.target || typeof raw.target.file !== "string") return null;

  return {
    id:          raw.id,
    name:        raw.name || raw.id,
    description: raw.description || "",
    icon:        raw.icon || "📄",
    target: {
      file:       raw.target.file,
      arrayPath:  raw.target.arrayPath || "",
    },
    schema:      raw.schema || {},
    branch: {
      prefix: raw.branch?.prefix || "yaml-tool/",
    },
    commitMessageTemplate: raw.commitMessageTemplate || "Add item to {tool:name}",
    _isMultiFile: isGlobPattern(raw.target.file),
  };
}

/**
 * Load tool definitions from a single repo's .superui/tools.yml.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {string} project
 * @param {string} repoId
 * @param {string} branch
 * @returns {Promise<object[]>} Array of validated tool definitions (may be empty)
 */
export async function loadToolsFromRepo(client, project, repoId, branch = "main") {
  try {
    const file = await client.readGitFile(project, repoId, TOOLS_FILE_PATH, branch);
    if (!file?.content) return [];
    const parsed = yaml.load(file.content);
    if (!parsed || !Array.isArray(parsed.tools)) return [];

    return parsed.tools
      .map(validateTool)
      .filter(Boolean)
      .map(t => ({ ...t, _sourceRepo: { project, repoId, branch } }));
  } catch {
    return [];
  }
}

/**
 * Load central tool definitions from the config repo's tools directory.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {{ project: string, repoId: string, branch?: string, toolsPath?: string }} config
 * @returns {Promise<object[]>} Array of validated tool definitions
 */
export async function loadCentralTools(client, config) {
  const toolsPath = config.toolsPath || "/config/tools";
  const branch = config.branch || "main";
  try {
    const items = await client.listGitItems(config.project, config.repoId, toolsPath, branch);
    const yamlFiles = items.filter(
      i => !i.isFolder && (i.path?.endsWith(".yaml") || i.path?.endsWith(".yml"))
    );
    const results = await Promise.allSettled(
      yamlFiles.map(async (item) => {
        const file = await client.readGitFile(config.project, config.repoId, item.path, branch);
        if (!file?.content) return [];
        const parsed = yaml.load(file.content);
        const tools = Array.isArray(parsed?.tools) ? parsed.tools : (parsed?.id ? [parsed] : []);
        return tools
          .map(validateTool)
          .filter(Boolean)
          .map(t => ({ ...t, _sourceRepo: { project: config.project, repoId: config.repoId, branch } }));
      })
    );
    return results.flatMap(r => (r.status === "fulfilled" ? r.value : []));
  } catch {
    return [];
  }
}

/**
 * Discover tools from all repos referenced in collections, plus central tools.
 * Deduplicates by tool ID (per-repo overrides central).
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {{ project: string, repoId: string, branch?: string, toolsPath?: string }} config - Config repo config
 * @param {Array} collections - User's loaded collections
 * @returns {Promise<object[]>} Merged, deduplicated tool definitions
 */
export async function discoverTools(client, config, collections) {
  // Collect unique repos from collections
  const repoSet = new Map();
  for (const col of collections) {
    for (const repo of (col.repos || [])) {
      const project = repo.project || col.projects?.[0];
      if (project && repo.id && !repoSet.has(repo.id)) {
        repoSet.set(repo.id, { project, repoId: repo.id });
      }
    }
  }

  // Load tools from each repo in parallel
  const perRepoResults = await Promise.allSettled(
    Array.from(repoSet.values()).map(({ project, repoId }) =>
      loadToolsFromRepo(client, project, repoId)
    )
  );
  const perRepoTools = perRepoResults.flatMap(r =>
    r.status === "fulfilled" ? r.value : []
  );

  // Load central tools
  const centralTools = await loadCentralTools(client, config);

  // Merge: per-repo tools override central tools with the same ID
  const merged = new Map();
  for (const t of centralTools) {
    merged.set(t.id, t);
  }
  for (const t of perRepoTools) {
    merged.set(t.id, t);
  }

  return Array.from(merged.values());
}

// ── YAML array operations ─────────────────────────────────────────────────────

/**
 * Read a YAML file and extract the array at a given path.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {string} project
 * @param {string} repoId
 * @param {string} filePath - Path to the YAML file in the repo
 * @param {string} arrayPath - Dot-notation path to the array (empty = root is array)
 * @param {string} branch
 * @returns {Promise<{ items: any[], objectId: string|null, raw: any }>}
 */
export async function readYamlArray(client, project, repoId, filePath, arrayPath, branch = "main") {
  const file = await client.readGitFile(project, repoId, filePath, branch);
  if (!file?.content) {
    return { items: [], objectId: null, raw: {} };
  }

  const parsed = yaml.load(file.content);
  if (!parsed) {
    return { items: [], objectId: file.objectId, raw: {} };
  }

  // Root is the array itself
  if (!arrayPath) {
    const items = Array.isArray(parsed) ? parsed : [];
    return { items, objectId: file.objectId, raw: parsed };
  }

  // Navigate dot-notation path
  let current = parsed;
  const parts = arrayPath.split(".");
  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return { items: [], objectId: file.objectId, raw: parsed };
    }
    current = current[part];
  }

  return {
    items:  Array.isArray(current) ? current : [],
    objectId: file.objectId,
    raw:    parsed,
  };
}

/**
 * Add an item to a YAML array and push the change to a branch.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {string} project
 * @param {string} repoId
 * @param {string} filePath - Path to the YAML file
 * @param {string} arrayPath - Dot-notation path to the array
 * @param {object} item - The item to add
 * @param {string|null} objectId - Current file objectId for optimistic locking
 * @param {string} branch - Branch to push to
 * @param {string} commitMessage - Commit message
 * @param {{ displayName: string, emailAddress: string }} author - Commit author
 * @returns {Promise<string|null>} Fresh objectId or null
 */
export async function writeYamlArrayItem(client, project, repoId, filePath, arrayPath, item, objectId, branch, commitMessage, author) {
  // Read current file to get latest content
  const { items, raw } = await readYamlArray(client, project, repoId, filePath, arrayPath, branch);

  // Add the new item
  items.push(item);

  // Reconstruct the file
  let newContent;
  if (!arrayPath) {
    // Root is the array
    newContent = yaml.dump(items, { lineWidth: 120, quotingType: '"' });
  } else {
    // Set the array back into the raw structure
    const result = { ...raw };
    let target = result;
    const parts = arrayPath.split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] == null || typeof target[parts[i]] !== "object") {
        target[parts[i]] = {};
      }
      target[parts[i]] = { ...target[parts[i]] };
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = items;
    newContent = yaml.dump(result, { lineWidth: 120, quotingType: '"' });
  }

  await client.pushGitFile(
    project,
    repoId,
    filePath,
    newContent,
    objectId,
    commitMessage,
    author?.displayName,
    author?.emailAddress,
    branch
  );

  // Re-read to get fresh objectId
  try {
    const refreshed = await client.readGitFile(project, repoId, filePath, branch);
    return refreshed?.objectId || null;
  } catch {
    return null;
  }
}

/**
 * Update an existing item in a YAML array file.
 *
 * @param {object} client
 * @param {string} project
 * @param {string} repoId
 * @param {string} filePath
 * @param {string} arrayPath - Dot-notation path to the array within the file (e.g. "rules" or "data.items")
 * @param {object} updatedItem - The updated item data
 * @param {string|number} matchKey - Item id or array index to match
 * @param {string|null} objectId - Current file objectId (for concurrency)
 * @param {string} branch - Target branch
 * @param {string} commitMessage
 * @param {object} author - { displayName, emailAddress }
 * @returns {Promise<string|null>} New objectId
 */
export async function writeYamlArrayUpdate(client, project, repoId, filePath, arrayPath, updatedItem, matchKey, objectId, branch, commitMessage, author) {
  const { items, raw } = await readYamlArray(client, project, repoId, filePath, arrayPath, branch);

  let newItems;
  if (typeof matchKey === "number") {
    if (matchKey >= 0 && matchKey < items.length) {
      newItems = [...items];
      newItems[matchKey] = updatedItem;
    } else {
      throw new Error(`Index ${matchKey} out of bounds for array of ${items.length} items`);
    }
  } else {
    const idx = items.findIndex(i => i && (i.id === matchKey || i.name === matchKey));
    if (idx === -1) throw new Error(`Item with id "${matchKey}" not found`);
    newItems = [...items];
    newItems[idx] = updatedItem;
  }

  let newContent;
  if (!arrayPath) {
    newContent = yaml.dump(newItems, { lineWidth: 120, quotingType: '"' });
  } else {
    const result = JSON.parse(JSON.stringify(raw));
    let target = result;
    const parts = arrayPath.split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] == null || typeof target[parts[i]] !== "object") {
        target[parts[i]] = {};
      }
      target[parts[i]] = { ...target[parts[i]] };
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = newItems;
    newContent = yaml.dump(result, { lineWidth: 120, quotingType: '"' });
  }

  await client.pushGitFile(project, repoId, filePath, newContent, objectId, commitMessage, author?.displayName, author?.emailAddress, branch);

  try {
    const refreshed = await client.readGitFile(project, repoId, filePath, branch);
    return refreshed?.objectId || null;
  } catch {
    return null;
  }
}

/**
 * Delete an item from a YAML array file.
 *
 * @param {object} client
 * @param {string} project
 * @param {string} repoId
 * @param {string} filePath
 * @param {string} arrayPath - Dot-notation path to the array
 * @param {string|number} matchKey - Item id or array index to match
 * @param {string|null} objectId - Current file objectId
 * @param {string} branch - Target branch
 * @param {string} commitMessage
 * @param {object} author - { displayName, emailAddress }
 * @returns {Promise<string|null>} New objectId
 */
export async function writeYamlArrayDelete(client, project, repoId, filePath, arrayPath, matchKey, objectId, branch, commitMessage, author) {
  const { items, raw } = await readYamlArray(client, project, repoId, filePath, arrayPath, branch);

  let newItems;
  if (typeof matchKey === "number") {
    if (matchKey >= 0 && matchKey < items.length) {
      newItems = items.filter((_, i) => i !== matchKey);
    } else {
      throw new Error(`Index ${matchKey} out of bounds for array of ${items.length} items`);
    }
  } else {
    const before = items.length;
    newItems = items.filter(i => !(i && (i.id === matchKey || i.name === matchKey)));
    if (newItems.length === before) throw new Error(`Item with id "${matchKey}" not found`);
  }

  let newContent;
  if (!arrayPath) {
    newContent = yaml.dump(newItems, { lineWidth: 120, quotingType: '"' });
  } else {
    const result = JSON.parse(JSON.stringify(raw));
    let target = result;
    const parts = arrayPath.split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] == null || typeof target[parts[i]] !== "object") {
        target[parts[i]] = {};
      }
      target[parts[i]] = { ...target[parts[i]] };
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = newItems;
    newContent = yaml.dump(result, { lineWidth: 120, quotingType: '"' });
  }

  await client.pushGitFile(project, repoId, filePath, newContent, objectId, commitMessage, author?.displayName, author?.emailAddress, branch);

  try {
    const refreshed = await client.readGitFile(project, repoId, filePath, branch);
    return refreshed?.objectId || null;
  } catch {
    return null;
  }
}

// ── Branch helpers ────────────────────────────────────────────────────────────

/**
 * Generate a branch name from a tool definition and a short hash.
 * @param {{ branch?: { prefix?: string }, id: string }} tool
 * @returns {string} Branch name like "yaml-tool/deploy-targets-a3f291"
 */
export function generateBranchName(tool) {
  const prefix = tool.branch?.prefix || "yaml-tool/";
  const hash = Date.now().toString(36).slice(-6);
  return `${prefix}${tool.id}-${hash}`;
}

/**
 * Interpolate a commit message template with tool and field values.
 * Supports: {tool:name}, {tool:id}, {field:key}
 *
 * @param {string} template - Message template
 * @param {{ name: string, id: string }} tool
 * @param {object} values - Form values object (keyed by field key)
 * @returns {string} Interpolated message
 */
export function interpolateCommitMessage(template, tool, values) {
  return template
    .replace(/\{tool:name\}/g, tool.name || tool.id)
    .replace(/\{tool:id\}/g, tool.id)
    .replace(/\{field:(\w+)\}/g, (_, key) => values[key] ?? "");
}

// ── Available repos helper ────────────────────────────────────────────────────

/**
 * Load all available repos from the ADO client (cache-first via getAllRepos)
 * and return a simplified list for use in tool builder dropdowns.
 *
 * @param {import('./adoClient').ADOClient} client
 * @returns {Promise<Array<{ project: string, repoId: string, repoName: string }>>}
 */
export async function loadAvailableRepos(client) {
  const allRepos = await client.getAllRepos();
  return allRepos
    .map(r => ({
      project:        r._projectName || r.project?.name || "",
      repoId:         r.id,
      repoName:       r.name,
      defaultBranch:  (r.defaultBranch || "").replace("refs/heads/", "") || "main",
    }))
    .filter(r => r.project && r.repoId && r.repoName);
}

// ── Built-in tool: Tool Builder ───────────────────────────────────────────────

/**
 * Self-describing built-in tool for creating and editing YAML tool definitions.
 * Always available — injected into the tool list by YamlToolsView.
 *
 * The form it renders is generated from its own schema, which describes the
 * structure of a tool definition. This is the "eating its own dogfood" tool.
 */
export const BUILT_IN_TOOL_BUILDER = {
  id:   "__tool-builder__",
  name: "Tool Builder",
  description: "Create and edit YAML tool definitions",
  icon: "📐",
  target: {
    file:      TOOLS_FILE_PATH,
    arrayPath: "tools",
  },
  schema: {
    fields: [
      {
        key: "id", label: "Tool ID", type: "string", required: true,
        description: "Unique identifier (e.g. deploy-targets)",
      },
      {
        key: "name", label: "Display Name", type: "string", required: true,
      },
      {
        key: "description", label: "Description", type: "string",
      },
      {
        key: "icon", label: "Icon (emoji)", type: "string", default: "📄",
      },
      {
        key: "targetProject", label: "Target Project", type: "select", required: true,
        description: "The ADO project to store this tool definition in",
        optionsSource: (values, ctx) => {
          const repos = ctx.availableRepos || [];
          return [...new Set(repos.map(r => r.project))].filter(Boolean).sort();
        },
      },
      {
        key: "targetRepo", label: "Target Repository", type: "select", required: true,
        description: "The repo to store this tool definition in (.superui/tools.yml)",
        optionsSource: (values, ctx) => {
          const repos = ctx.availableRepos || [];
          return repos
            .filter(r => r.project === values.targetProject)
            .map(r => r.repoName)
            .filter(Boolean)
            .sort();
        },
      },
      {
        key: "target", label: "Target", type: "object", required: true,
        fields: [
          {
            key: "file", label: "YAML File Path", type: "string", required: true,
            description: "Path to YAML file or glob pattern (e.g. config/envs/*.yaml)",
          },
          {
            key: "arrayPath", label: "Array Path", type: "string",
            description: "Dot-notation path to the array (empty = root is array)",
          },
        ],
      },
      {
        key: "schemaMode", label: "Schema Source", type: "select", required: true,
        options: ["inline", "ref"],
        description: "Define fields inline or reference an external JSON Schema file",
        default: "inline",
      },
      {
        key: "schemaFields", label: "Schema Fields", type: "array",
        description: "Define the fields that appear in the form",
        visibleWhen: (v) => v.schemaMode !== "ref",
        itemFields: [
          { key: "key", label: "Key", type: "string", required: true, description: "YAML key name" },
          { key: "label", label: "Label", type: "string" },
          {
            key: "type", label: "Type", type: "select", required: true, default: "string",
            options: ["string", "number", "boolean", "select", "textarea", "tags"],
          },
          { key: "required", label: "Required", type: "boolean" },
          { key: "description", label: "Help Text", type: "string" },
          { key: "options", label: "Options", type: "tags", description: "Comma-separated options (for select type)" },
          { key: "default", label: "Default Value", type: "string" },
        ],
      },
      {
        key: "schemaRef", label: "Schema File Path", type: "string",
        description: "Path to JSON Schema file in the same repo (e.g. schemas/targets.json)",
        visibleWhen: (v) => v.schemaMode === "ref",
      },
      {
        key: "branch", label: "Branch Config", type: "object",
        fields: [
          { key: "prefix", label: "Branch Prefix", type: "string", default: "yaml-tool/" },
        ],
      },
      {
        key: "commitMessageTemplate", label: "Commit Message Template", type: "string",
        default: "Add {field:name} to {tool:name}",
        description: "Supports {tool:name}, {tool:id}, {field:key}",
      },
    ],
  },
  branch: { prefix: "yaml-tool/" },
  commitMessageTemplate: "Add {field:id} to Tool Builder",
  _isBuiltIn: true,
};

// ── Built-in tool: Link Rules ─────────────────────────────────────────────────

/**
 * Built-in tool for managing link classification rules.
 * Stores rules in collections/link-rules.yaml in the config repo.
 * Rules define URL regex patterns that classify bookmarked links,
 * extract named parameters, and generate deep links to external systems.
 */
export const BUILT_IN_LINK_RULES = {
  id:   "__link-rules__",
  name: "Link Rules",
  description: "Define URL patterns to classify and enrich bookmarked links",
  icon: "🔗",
  target: {
    file:      "collections/link-rules.yaml",
    arrayPath: "rules",
  },
  schema: {
    fields: [
      {
        key: "id", label: "Rule ID", type: "string", required: true,
        description: "Unique identifier (e.g. servicenow-change)",
      },
      {
        key: "name", label: "Display Name", type: "string", required: true,
      },
      {
        key: "icon", label: "Icon (emoji)", type: "string", default: "🔗",
      },
      {
        key: "color", label: "Accent Color (hex)", type: "string", default: "#F59E0B",
      },
      {
        key: "match", label: "URL Regex Pattern", type: "string", required: true,
        description: "Regular expression to match URLs. Use capture groups for parameter extraction.",
      },
      {
        key: "params", label: "Extracted Parameters", type: "array",
        description: "Named capture groups to extract from the URL",
        itemFields: [
          { key: "name",  label: "Param Name",     type: "string", required: true },
          { key: "group", label: "Capture Group #", type: "number", required: true, description: "1-based capture group index" },
        ],
      },
      {
        key: "displayTemplate", label: "Display Label Template", type: "string",
        description: "Label shown on link cards. Use {paramName} placeholders. E.g. SN Change {instance}/{sysId}",
      },
      {
        key: "linkTemplate", label: "Primary Link Template", type: "string",
        description: "URL template for the primary action button. Use {paramName} placeholders. E.g. https://{instance}.service-now.com/nav_to.do?uri=change_request.do?sys_id={sysId}",
      },
      {
        key: "links", label: "Additional Link Buttons", type: "array",
        description: "Extra action buttons shown on link cards",
        itemFields: [
          { key: "label",    label: "Button Label", type: "string", required: true },
          { key: "template", label: "URL Template",  type: "string", required: true },
        ],
      },
    ],
  },
  branch: { prefix: "link-rules/" },
  commitMessageTemplate: "Update link rule {field:id}",
  _isBuiltIn: true,
};

// ── Built-in tool: Workflow Builder ──────────────────────────────────────────────

/**
 * Built-in tool for managing workflow templates.
 * Stores templates in collections/workflow-templates.yaml in the config repo.
 */
export const BUILT_IN_WORKFLOW_BUILDER = {
  id:   "__workflow-builder__",
  name: "Workflow Builder",
  description: "Create and edit workflow templates with tracks, steps, and actions",
  icon: "⚡",
  target: {
    file:      "collections/workflow-templates.yaml",
    arrayPath: "templates",
  },
  schema: { fields: [] },
  branch: { prefix: "workflow-builder/" },
  commitMessageTemplate: "Update workflow templates",
  _isBuiltIn: true,
  _isWorkflowBuilder: true,
};
