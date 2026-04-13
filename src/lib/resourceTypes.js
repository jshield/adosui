/**
 * resourceTypes.js
 *
 * Central registry for resource types. Loads type definitions from
 * collections/resource-types.yaml in the config repo, merges with
 * built-in types, and provides generic helpers that replace all
 * the per-type if-else chains throughout the codebase.
 */

import yaml from "js-yaml";
import { T } from "./theme";
import { WI_TYPE_COLOR, stateColor, pipelineStatus, prStatus, branchName, getRunBranch, getLatestRun } from "./wiUtils";

const RESOURCE_TYPES_PATH = "collections/resource-types.yaml";

// ── Named function references for dynamic display ────────────────────────────

const DISPLAY_FNS = {
  wiTypeColor: (item) => WI_TYPE_COLOR[item?.fields?.["System.WorkItemType"]] || T.dim,
  pipelineStatus: (item) => {
    const s = pipelineStatus(item?.latestRun?.result || item?.latestRun?.state);
    return { label: s.label, color: s.color };
  },
  stateColor: (item, rt) => stateColor(item?.[rt?.display?.statusField]),
  prStatus: (item) => {
    const s = prStatus(item?.status);
    return { label: s.label, color: s.color };
  },
  flagStatus: (item) => item?.enabled
    ? { label: "on", color: T.green }
    : { label: "off", color: T.dim },
  pipelineBranch: (item) => {
    // Try cached runs first, then latestRun fallback
    const run = getLatestRun(item?.latestRun) || null;
    return getRunBranch(run) || branchName(item?.latestRun?.sourceBranch || item?.latestRun?.sourceRefName) || "";
  },
  prSubtitle: (item) => {
    const author = item?.createdBy?.displayName || "";
    const target = branchName(item?.targetRefName) || "";
    if (author && target) return `${author} → ${target}`;
    return author || target || "";
  },
};

const TRANSFORMS = {
  stripRefsHeads: (val) => (val || "").replace("refs/heads/", ""),
  truncate: (val, len = 40) => !val ? "" : val.length > len ? val.slice(0, len) + "…" : val,
};

// ── Built-in type definitions ────────────────────────────────────────────────

const BUILT_IN_TYPES = [
  {
    id: "workitem",
    name: "Work Items",
    icon: "📋",
    color: "#A78BFA",
    shortLabel: "WI",
    collectionField: "workItemIds",
    collectionShape: "flat",
    idField: "id",
    source: {
      type: "rest",
      api: { preset: "workItems" },
      search: { preset: "workItems" },
    },
    worker: { enabled: false },
    display: {
      titleField: "fields['System.Title']",
      statusField: "fields['System.State']",
      colorFn: "wiTypeColor",
      idField: "id",
      idPrefix: "#",
    },
    detail: "WorkItemDetail",
    urlTemplate: "{baseUrl}/_workitems/edit/{id}",
  },
  {
    id: "repo",
    name: "Repositories",
    icon: "📁",
    color: "#22D3EE",
    shortLabel: "REPO",
    collectionField: "repos",
    collectionShape: "object",
    idField: "id",
    defaultShape: { id: "", comments: [] },
    source: {
      type: "rest",
      api: {
        baseUrl: "{org}",
        endpoints: {
          fetchProject: {
            method: "GET",
            url: "{baseUrl}/{project}/_apis/git/repositories?api-version=7.1",
            responsePath: "value",
          },
        },
        cacheKeyPrefix: "repos",
      },
      search: { mode: "filter", filterField: "name" },
    },
    worker: { enabled: true, cacheKey: "repos" },
    display: {
      titleField: "name",
      subtitleField: "defaultBranch",
      subtitleTransform: "stripRefsHeads",
    },
    detail: "RepoDetail",
    urlTemplate: "{baseUrl}/{project}/_git/{name}",
  },
  {
    id: "pipeline",
    name: "Pipelines",
    icon: "⚡",
    color: "#F59E0B",
    shortLabel: "PIPE",
    collectionField: "pipelines",
    collectionShape: "object",
    idField: "id",
    defaultShape: { id: "", name: "", project: "", folder: "", configurationType: "", comments: [], runs: [] },
    source: {
      type: "rest",
      api: {
        baseUrl: "{org}",
        endpoints: {
          fetchProject: {
            method: "GET",
            url: "{baseUrl}/{project}/_apis/pipelines?api-version=7.1&$top=50",
            responsePath: "value",
          },
        },
        cacheKeyPrefix: "pipelines",
      },
      search: { mode: "filter", filterField: "name" },
    },
    worker: { enabled: true, cacheKey: "pipelines" },
    display: {
      titleField: "name",
      statusFn: "pipelineStatus",
      subtitleFn: "pipelineBranch",
    },
    detail: "PipelineDetail",
    urlTemplate: "{baseUrl}/{project}/_build?definitionId={id}",
  },
  {
    id: "pr",
    name: "Pull Requests",
    icon: "🔀",
    color: "#A78BFA",
    shortLabel: "PR",
    collectionField: "prIds",
    collectionShape: "flat",
    idField: "pullRequestId",
    source: {
      type: "rest",
      api: {
        baseUrl: "{org}",
        endpoints: {
          fetchProject: {
            method: "GET",
            url: "{baseUrl}/{project}/_apis/git/pullrequests?searchCriteria.status=active&$top=30&api-version=7.1",
            responsePath: "value",
          },
        },
        cacheKeyPrefix: "prs",
      },
      search: { mode: "filter", filterField: "title" },
    },
    worker: { enabled: true, cacheKey: "pullRequests" },
    display: {
      titleField: "title",
      idField: "pullRequestId",
      idPrefix: "#",
      statusField: "status",
      subtitleFn: "prSubtitle",
    },
    detail: "PRDetail",
    urlTemplate: "{baseUrl}/{project}/_git/pullrequests/{pullRequestId}",
  },
  {
    id: "serviceconnection",
    name: "Service Connections",
    icon: "🔌",
    color: "#22D3EE",
    shortLabel: "SVC",
    collectionField: "serviceConnections",
    collectionShape: "object",
    idField: "id",
    defaultShape: { id: "", project: "", type: "", comments: [] },
    source: {
      type: "rest",
      api: {
        baseUrl: "{org}",
        endpoints: {
          fetchProject: {
            method: "GET",
            url: "{baseUrl}/{project}/_apis/serviceendpoint/endpoints?api-version=7.1&$top=50",
            responsePath: "value",
          },
        },
        cacheKeyPrefix: "serviceConnections",
      },
      search: { mode: "filter", filterField: "name" },
    },
    worker: { enabled: true, cacheKey: "serviceConnections" },
    display: {
      titleField: "name",
      subtitleField: "type",
    },
    detail: "ServiceConnectionDetail",
    urlTemplate: "{baseUrl}/{project}/_settings/adminservices?resourceId={id}",
  },
  {
    id: "wiki",
    name: "Wiki Pages",
    icon: "📖",
    color: "#4ADE80",
    shortLabel: "WIKI",
    collectionField: "wikiPages",
    collectionShape: "object",
    idField: "id",
    defaultShape: { id: "", path: "", wikiId: "", wikiName: "", project: "", comments: [] },
    source: {
      type: "rest",
      api: {
        baseUrl: "{org}",
        endpoints: { fetchProject: null },
        cacheKeyPrefix: null,
      },
      search: {
        mode: "post",
        url: "https://almsearch.dev.azure.com/{org}/_apis/search/wikisearchresults?api-version=7.1",
        bodyTemplate: { searchText: "{searchTerm}", "$top": 20, filters: { Project: "{projects}" } },
        responsePath: "results",
        resultMapping: {
          id: "wiki.id + ':' + path",
          path: "path",
          wikiId: "wiki.id",
          wikiName: "wiki.name",
          project: "project.name",
        },
      },
    },
    worker: { enabled: false },
    display: {
      titleField: "path",
      subtitleField: "wikiName",
    },
    detail: "WikiPageDetail",
  },
  {
    id: "testrun",
    name: "Test Runs",
    icon: "🧪",
    color: "#4ADE80",
    shortLabel: "TEST",
    collectionField: null,
    source: {
      type: "rest",
      api: {
        baseUrl: "{org}",
        endpoints: {
          fetchProject: {
            method: "GET",
            url: "{baseUrl}/{project}/_apis/test/runs?api-version=7.1&$top=20&includeRunDetails=true",
            responsePath: "value",
          },
        },
        cacheKeyPrefix: "testRuns",
      },
      search: null,
    },
    worker: { enabled: true, cacheKey: "testRuns" },
    display: null,
    detail: null,
  },
  {
    id: "yamltool",
    name: "YAML Tools",
    icon: "🛠️",
    color: "#F59E0B",
    shortLabel: "TOOL",
    collectionField: "yamlTools",
    collectionShape: "object",
    idField: "id",
    defaultShape: { id: "", name: "", icon: "📄", comments: [] },
    source: null,
    crud: {
      enabled: true,
      target: { file: ".superui/tools.yml", arrayPath: "tools" },
      schema: { ref: "__tool_builder_schema__" },
      branch: { prefix: "yaml-tool/" },
      commitMessageTemplate: "Update {field:id}",
    },
    worker: { enabled: false },
    display: {
      titleField: "name",
      iconField: "icon",
    },
    detail: "YamlToolDetail",
  },
  {
    id: "link",
    name: "Links",
    icon: "🔗",
    color: "#6B7280",
    shortLabel: "LINK",
    collectionField: "links",
    collectionShape: "object",
    idField: "url",
    defaultShape: { url: "", label: "", comments: [], addedAt: "" },
    source: null,
    worker: { enabled: false },
    display: { titleField: "url" },
    detail: null,
  },
  {
    id: "llmrequest",
    name: "LLM Requests",
    icon: "🤝",
    color: "#EC4899",
    shortLabel: "LLM",
    collectionField: null,
    collectionShape: "object",
    idField: "requestId",
    defaultShape: {
      requestId: "",
      correlationId: "",
      parentRequestId: null,
      createdAt: "",
      llmSource: "",
      human: "",
      prompt: "",
      context: [],
      template: null,
      templateValues: {},
      actions: [],
      status: "pending",
      humanReview: null,
      result: null,
    },
    source: null,
    worker: { enabled: false },
    display: {
      titleField: "prompt",
      subtitleField: "status",
      subtitleTransform: "truncate",
      statusField: "status",
    },
    detail: null,
  },
];

// ── Registry state ───────────────────────────────────────────────────────────

let _registry = null; // { types: [...], byId: Map }

/**
 * Build the registry from built-in types.
 * Call loadResourceTypes() to merge with config-defined types.
 */
function buildBuiltinRegistry() {
  const types = BUILT_IN_TYPES.map(t => ({ ...t }));
  const byId = new Map(types.map(t => [t.id, t]));
  return { types, byId };
}

/**
 * Serialize built-in types to a clean YAML string.
 * Strips any internal code properties and produces a user-editable config.
 */
function serializeBuiltinTypes() {
  const clean = BUILT_IN_TYPES.map(rt => {
    const entry = {
      id: rt.id,
      name: rt.name,
      icon: rt.icon,
      color: rt.color,
      shortLabel: rt.shortLabel,
    };
    if (rt.collectionField)  entry.collectionField  = rt.collectionField;
    if (rt.collectionShape)  entry.collectionShape  = rt.collectionShape;
    if (rt.idField)          entry.idField          = rt.idField;
    if (rt.defaultShape && Object.keys(rt.defaultShape).length) entry.defaultShape = rt.defaultShape;
    if (rt.source)           entry.source           = rt.source;
    if (rt.crud)             entry.crud             = rt.crud;
    if (rt.worker)           entry.worker           = rt.worker;
    if (rt.display)          entry.display          = rt.display;
    if (rt.detail)           entry.detail           = rt.detail;
    if (rt.urlTemplate)      entry.urlTemplate      = rt.urlTemplate;
    return entry;
  });

  return yaml.dump(
    { resourceTypes: clean },
    { lineWidth: 120, quotingType: '"', noRefs: true }
  );
}

/**
 * Load resource types from config repo, merging with built-ins.
 * If the config file doesn't exist, auto-creates it from built-in types.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {{ project: string, repoId: string, branch?: string }} config
 * @returns {Promise<{ types: Array, byId: Map }>}
 */
export async function loadResourceTypes(client, config) {
  // Start with built-in types
  const { types, byId } = buildBuiltinRegistry();

  let file = null;
  try {
    file = await client.readGitFile(
      config.project, config.repoId,
      RESOURCE_TYPES_PATH,
      config.branch || "main"
    );
  } catch {
    // readGitFile swallows errors and returns null, but just in case
  }

  if (file?.content) {
    // File exists — parse and merge config overrides
    try {
      const parsed = yaml.load(file.content);
      if (parsed && Array.isArray(parsed.resourceTypes)) {
        for (const rt of parsed.resourceTypes) {
          if (!rt.id) continue;
          const validated = validateType(rt);
          if (!validated) continue;

          // Merge with existing (config overrides built-in)
          if (byId.has(rt.id)) {
            const idx = types.findIndex(t => t.id === rt.id);
            types[idx] = validated;
          } else {
            types.push(validated);
          }
          byId.set(rt.id, validated);
        }
      }
    } catch (e) {
      console.warn("[resourceTypes] Failed to parse config file:", e.message);
    }
  } else {
    // File doesn't exist — auto-create from built-in types
    try {
      const content = serializeBuiltinTypes();
      await client.pushGitFile(
        config.project, config.repoId,
        RESOURCE_TYPES_PATH, content,
        null, // null oldObjectId = add new file
        "superui: initialize resource types config",
        "SuperUI", "superui@dev.azure",
        config.branch || "main"
      );
    } catch (pushErr) {
      console.warn("[resourceTypes] Failed to auto-create config file:", pushErr.message);
    }
  }

  _registry = { types, byId };
  return _registry;
}

/**
 * Get the current registry (must call loadResourceTypes first, or returns built-ins).
 */
export function getRegistry() {
  if (!_registry) _registry = buildBuiltinRegistry();
  return _registry;
}

/**
 * Get a single resource type by ID.
 */
export function getType(id) {
  return getRegistry().byId.get(id) || null;
}

/**
 * Get all resource types.
 */
export function getAllTypes() {
  return getRegistry().types;
}

/**
 * Get types that support search.
 */
export function getSearchableTypes() {
  return getRegistry().types.filter(t => t.source?.search || t.source?.search?.preset);
}

/**
 * Get types that use the background worker.
 */
export function getWorkerTypes() {
  return getRegistry().types.filter(t => t.worker?.enabled);
}

/**
 * Get types that are stored in collections.
 */
export function getCollectionTypes() {
  return getRegistry().types.filter(t => t.collectionField);
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateType(raw) {
  if (!raw || typeof raw !== "object" || !raw.id) return null;
  return {
    id:                raw.id,
    name:              raw.name || raw.id,
    icon:              raw.icon || "📄",
    color:             raw.color || T.dim,
    shortLabel:        raw.shortLabel || raw.id.slice(0, 4).toUpperCase(),
    collectionField:   raw.collectionField || null,
    collectionShape:   raw.collectionShape || "object",
    idField:           raw.idField || "id",
    defaultShape:      raw.defaultShape || {},
    source:            raw.source || null,
    crud:              raw.crud || null,
    worker:            raw.worker || { enabled: false },
    display:           raw.display || null,
    detail:            raw.detail || null,
    urlTemplate:       raw.urlTemplate || null,
  };
}

// ── Generic helpers ──────────────────────────────────────────────────────────

/**
 * Extract the ID value from an item using the type's idField config.
 */
export function getId(typeId, item) {
  const rt = getType(typeId);
  if (!rt) return item?.id;
  return resolveField(item, rt.idField);
}

/**
 * Get the collection field name for a type.
 */
export function getCollectionField(typeId) {
  const rt = getType(typeId);
  return rt?.collectionField || null;
}

/**
 * Get a default shape for a new item of this type.
 */
export function getItemDefault(typeId, overrides = {}) {
  const rt = getType(typeId);
  if (!rt) return { ...overrides };
  return {
    ...rt.defaultShape,
    ...overrides,
    comments: overrides.comments || [],
  };
}

/**
 * Check if an item is in a collection, using the type's config.
 */
export function isInCollection(typeId, collection, itemId) {
  const rt = getType(typeId);
  if (!rt || !rt.collectionField) return false;

  const items = collection[rt.collectionField];
  if (!Array.isArray(items)) return false;

  const sid = String(itemId);

  if (rt.collectionShape === "flat") {
    return items.some(i => String(i) === sid);
  }

  // object shape: compare by idField
  return items.some(i => String(resolveField(i, rt.idField)) === sid);
}

/**
 * Add or remove an item from a collection, using type config.
 * Returns the updated collection.
 */
export function toggleInCollection(typeId, collection, itemId, wikiItem) {
  const rt = getType(typeId);
  if (!rt || !rt.collectionField) return collection;

  const field = rt.collectionField;
  const items = collection[field] || [];
  const sid = String(itemId);

  if (rt.collectionShape === "flat") {
    const exists = items.some(i => String(i) === sid);
    return { ...collection, [field]: exists ? items.filter(i => String(i) !== sid) : [...items, sid] };
  }

  // object shape
  const exists = items.some(i => String(resolveField(i, rt.idField)) === sid);
  if (exists) {
    return { ...collection, [field]: items.filter(i => String(resolveField(i, rt.idField)) !== sid) };
  }

  const defaultItem = getItemDefault(typeId);
  const newItem = { ...defaultItem, ...wikiItem };
  // Ensure the ID field is set
  if (rt.idField.includes(".")) {
    // nested — just set the whole item
  } else {
    newItem[rt.idField] = sid;
  }
  return { ...collection, [field]: [...items, newItem] };
}

/**
 * Add a comment to an item in a collection.
 * Returns the updated collection.
 */
export function addCommentToCollection(typeId, collection, resourceId, comment) {
  const rt = getType(typeId);
  if (!rt || !rt.collectionField) return collection;

  const field = rt.collectionField;
  const items = collection[field];
  if (!Array.isArray(items)) return collection;

  if (rt.collectionShape === "flat") return collection; // flat arrays don't have comments

  const sid = String(resourceId);
  return {
    ...collection,
    [field]: items.map(item => {
      if (String(resolveField(item, rt.idField)) !== sid) return item;
      return { ...item, comments: [...(item.comments || []), comment] };
    }),
  };
}

/**
 * Get the default object for adding to a collection (for handleResourceToggle).
 * Maps wikiItem fields to the default shape.
 */
export function mapItemToCollection(typeId, item) {
  const rt = getType(typeId);
  if (!rt) return item;

  const result = { ...rt.defaultShape, comments: [] };

  if (!item) return result;

  // Copy fields from item that exist in defaultShape
  for (const key of Object.keys(result)) {
    if (item[key] !== undefined) {
      result[key] = item[key];
    }
  }

  // Ensure the ID field is set
  const idVal = resolveField(item, rt.idField);
  if (rt.idField.includes(".")) {
    // nested ID field — handled by the caller
  } else {
    result[rt.idField] = idVal;
  }

  return result;
}

// ── Expression evaluation ────────────────────────────────────────────────────

/**
 * Resolve a dotpath/bracket expression against an object.
 *
 * Supports:
 *   "name"                          → obj.name
 *   "fields['System.Title']"        → obj.fields["System.Title"]
 *   "latestRun.result"              → obj.latestRun?.result
 *   "wiki.id + ':' + path"          → (for wiki result mapping)
 *
 * @param {object} obj
 * @param {string} expr
 * @returns {*}
 */
export function resolveField(obj, expr) {
  if (!obj || !expr) return undefined;

  // Handle concatenation expressions (used in wiki resultMapping)
  if (expr.includes("+")) {
    return resolveConcatExpr(obj, expr);
  }

  // Parse dotpath with bracket notation: "fields['System.Title']" → ["fields", "System.Title"]
  const parts = [];
  let remaining = expr;
  while (remaining) {
    const dotIdx = remaining.indexOf(".");
    const bracketIdx = remaining.indexOf("[");
    if (bracketIdx >= 0 && (dotIdx < 0 || bracketIdx < dotIdx)) {
      // Bracket notation: fields['System.Title']
      const prefix = remaining.slice(0, bracketIdx);
      if (prefix) parts.push(prefix);
      const closeIdx = remaining.indexOf("]", bracketIdx);
      const inner = remaining.slice(bracketIdx + 1, closeIdx);
      // Strip quotes
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

function resolveConcatExpr(obj, expr) {
  // Simple concatenation: "wiki.id + ':' + path"
  const segments = expr.split("+").map(s => s.trim());
  return segments.map(seg => {
    if ((seg.startsWith("'") && seg.endsWith("'")) || (seg.startsWith('"') && seg.endsWith('"'))) {
      return seg.slice(1, -1);
    }
    return resolveField(obj, seg) ?? "";
  }).join("");
}

/**
 * Build a URL from a template using an item's values.
 */
export function buildUrl(rt, item, org) {
  if (!rt?.urlTemplate) return null;
  const baseUrl = `https://dev.azure.com/${encodeURIComponent(org)}`;
  return rt.urlTemplate.replace(/\{(\w+)\}/g, (match, key) => {
    if (key === "baseUrl") return baseUrl;
    if (key === "org") return org;
    return resolveField(item, key) ?? match;
  });
}

/**
 * Get display properties for an item based on type config.
 */
export function getDisplayProps(typeId, item) {
  const rt = getType(typeId);
  if (!rt || !rt.display || !item) return null;

  const d = rt.display;
  const props = {
    icon: d.iconField ? resolveField(item, d.iconField) : rt.icon,
    color: rt.color,
    shortLabel: rt.shortLabel,
    title: resolveField(item, d.titleField) || "",
    subtitle: null,
    status: null,
    idText: null,
  };

  // Subtitle
  if (d.subtitleFn && DISPLAY_FNS[d.subtitleFn]) {
    props.subtitle = DISPLAY_FNS[d.subtitleFn](item) || null;
  } else if (d.subtitleField) {
    let sub = resolveField(item, d.subtitleField);
    if (d.subtitleTransform && TRANSFORMS[d.subtitleTransform]) {
      sub = TRANSFORMS[d.subtitleTransform](sub);
    }
    props.subtitle = sub || null;
  }

  // Status
  if (d.statusFn && DISPLAY_FNS[d.statusFn]) {
    props.status = DISPLAY_FNS[d.statusFn](item);
  } else if (d.statusField) {
    const val = resolveField(item, d.statusField);
    if (val) {
      // Try color functions
      if (d.colorFn && DISPLAY_FNS[d.colorFn]) {
        props.color = DISPLAY_FNS[d.colorFn](item);
      } else {
        props.status = { label: val, color: stateColor(val) };
      }
    }
  }

  // Dynamic color
  if (d.colorFn && DISPLAY_FNS[d.colorFn]) {
    props.color = DISPLAY_FNS[d.colorFn](item);
  }

  // ID text
  if (d.idField) {
    const idVal = resolveField(item, d.idField);
    if (idVal != null) {
      props.idText = (d.idPrefix || "") + String(idVal);
    }
  }

  return props;
}

export { DISPLAY_FNS, TRANSFORMS };
