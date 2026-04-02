/**
 * resourceApi.js
 *
 * Generic API execution layer for resource types. Handles:
 *   1. REST API calls driven by config (URL interpolation, response mapping)
 *   2. File-backed reads from Git repos (YAML/JSON)
 *   3. CRUD operations for file-backed types (branch + PR workflow)
 *   4. Search (filter-all, POST-based, preset)
 *   5. Background worker refresh
 *
 * The ADOClient instance is used for HTTP and Git operations.
 * All endpoint logic is driven by the resource type config.
 */

import yaml from "js-yaml";
import { cache } from ".";
import { resolveField } from "./resourceTypes";

const CACHE_TTL = 5 * 60 * 1000;

// ── URL interpolation ────────────────────────────────────────────────────────

/**
 * Interpolate a URL template with variables.
 * Replaces {baseUrl}, {org}, {project}, and arbitrary {param} placeholders.
 *
 * @param {string} template - URL template
 * @param {object} vars - { org, project, baseUrl, ...other }
 * @returns {string}
 */
export function resolveUrl(template, vars = {}) {
  if (!template) return "";
  const baseUrl = vars.baseUrl || (vars.org ? `https://dev.azure.com/${encodeURIComponent(vars.org)}` : "");
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (key === "baseUrl") return baseUrl;
    if (vars[key] != null) return encodeURIComponent(vars[key]);
    return match;
  });
}

/**
 * Extract a value from an object by dotpath.
 * "value" → obj.value, "data.items" → obj.data.items
 */
function resolvePath(obj, path) {
  if (!obj || !path) return obj;
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

// ── REST API: fetch for project ──────────────────────────────────────────────

/**
 * Fetch resources from a REST endpoint for a single project.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} rt - Resource type config
 * @param {string} projectName
 * @returns {Promise<Array>}
 */
export async function fetchForProject(client, rt, projectName) {
  const endpoint = rt.source?.api?.endpoints?.fetchProject;
  if (!endpoint) return [];

  const vars = { org: client.org, project: projectName, baseUrl: client.base };
  const url = resolveUrl(endpoint.url, vars);

  const method = endpoint.method || "GET";
  const opts = { method };
  if (endpoint.body) {
    opts.body = JSON.stringify(interpolateBody(endpoint.body, vars));
  }

  const r = await client._fetch(url, opts);
  const items = resolvePath(r, endpoint.responsePath) || [];

  // Tag items with _projectName
  items.forEach(item => { item._projectName = projectName; });

  return items;
}

function interpolateBody(body, vars) {
  if (typeof body === "string") {
    return resolveUrl(body, vars);
  }
  if (Array.isArray(body)) {
    return body.map(b => interpolateBody(b, vars));
  }
  if (body && typeof body === "object") {
    const result = {};
    for (const [k, v] of Object.entries(body)) {
      result[k] = interpolateBody(v, vars);
    }
    return result;
  }
  return body;
}

// ── REST API: fetch all ──────────────────────────────────────────────────────

/**
 * Collect items from a per-project fetcher across all (or scoped) projects.
 * Uses the same _collectFromProjects pattern as the old ADOClient methods.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} rt - Resource type config
 * @param {boolean} [forceRefresh=false]
 * @param {Function} [onProjectSearched]
 * @returns {Promise<Array>}
 */
export async function fetchAll(client, rt, forceRefresh = false, onProjectSearched) {
  if (!rt.source || rt.source.type !== "rest") return [];

  // Handle presets
  if (rt.source.api?.preset === "workItems") {
    return []; // work items don't have a list-all
  }

  const endpoint = rt.source.api?.endpoints?.fetchProject;
  if (!endpoint) return [];

  const cacheKey = rt.source.api?.cacheKeyPrefix;
  if (forceRefresh && cacheKey) cache.invalidate("project:");

  return _collectFromProjects(client, cacheKey,
    project => fetchForProject(client, rt, project),
    [], forceRefresh, onProjectSearched
  );
}

/**
 * Fetch for specific projects only.
 */
export async function fetchForProjects(client, rt, projectNames, onProjectSearched) {
  if (!rt.source || rt.source.type !== "rest") return [];

  const endpoint = rt.source.api?.endpoints?.fetchProject;
  if (!endpoint) return [];

  const cacheKey = rt.source.api?.cacheKeyPrefix;
  return _collectFromProjects(client, cacheKey,
    project => fetchForProject(client, rt, project),
    projectNames, false, onProjectSearched
  );
}

async function _collectFromProjects(client, cacheKey, fetcher, projectNames, forceRefresh, onProjectSearched) {
  if (forceRefresh && cacheKey) cache.invalidate("project:");
  if (!projectNames.length) {
    if (!client._projects.length) await client.getProjects();
    projectNames = client._projects.map(p => p.name);
  }
  const total = projectNames.length;
  let searched = 0;
  const all = [];
  for (const name of projectNames) {
    const items = await _getProjectCached(client, name, cacheKey, fetcher);
    all.push(...items);
    searched++;
    if (onProjectSearched) onProjectSearched(name, searched, total);
  }
  return all;
}

async function _getProjectCached(client, projectName, cacheKey, fetcher) {
  const key = `project:${projectName}:${cacheKey}`;
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const data = await fetcher(projectName);
    data.forEach(item => { item._projectName = projectName; });
    cache.set(key, data, CACHE_TTL);
    return data;
  } catch {
    return [];
  }
}

// ── REST API: search ─────────────────────────────────────────────────────────

/**
 * Search resources using the type's search config.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} rt - Resource type config
 * @param {string} searchTerm
 * @param {object} filters
 * @param {string[]} projectNames
 * @param {Function} [onProjectSearched]
 * @returns {Promise<Array>}
 */
export async function search(client, rt, searchTerm, filters, projectNames, onProjectSearched) {
  const searchConf = rt.source?.search;
  if (!searchConf) return [];

  // Preset search (work items)
  if (searchConf.preset === "workItems") {
    return client.searchWorkItems(searchTerm, filters, projectNames);
  }

  // POST-based search (wiki)
  if (searchConf.mode === "post") {
    return _postSearch(client, rt, searchTerm, projectNames);
  }

  // Filter-all search: fetch all, then filter client-side
  if (searchConf.mode === "filter") {
    const all = await fetchAll(client, rt, false, onProjectSearched);
    const filterField = searchConf.filterField;
    if (!filterField || !searchTerm) return all;

    const lower = searchTerm.toLowerCase();
    return all.filter(item => {
      const val = resolveField(item, filterField);
      return val && String(val).toLowerCase().includes(lower);
    });
  }

  return [];
}

async function _postSearch(client, rt, searchTerm, projectNames) {
  const searchConf = rt.source.search;
  const body = interpolateSearchBody(searchConf.bodyTemplate, searchTerm, projectNames);

  const url = resolveUrl(searchConf.url, { org: client.org, baseUrl: client.base });
  const r = await client._fetch(url, {
    method: "POST",
    body: JSON.stringify(body),
  });

  const rawItems = resolvePath(r, searchConf.responsePath) || [];

  // Apply result mapping if defined
  if (searchConf.resultMapping) {
    return rawItems.map(raw => mapSearchResult(raw, searchConf.resultMapping));
  }

  return rawItems;
}

function interpolateSearchBody(template, searchTerm, projectNames) {
  if (!template) return {};
  const body = JSON.parse(JSON.stringify(template));
  return _replaceTemplateVars(body, searchTerm, projectNames);
}

function _replaceTemplateVars(obj, searchTerm, projectNames) {
  if (typeof obj === "string") {
    return obj
      .replace("{searchTerm}", searchTerm)
      .replace("{projects}", projectNames?.length ? projectNames : undefined);
  }
  if (Array.isArray(obj)) {
    return obj.map(v => _replaceTemplateVars(v, searchTerm, projectNames));
  }
  if (obj && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = _replaceTemplateVars(v, searchTerm, projectNames);
    }
    return result;
  }
  return obj;
}

function mapSearchResult(raw, mapping) {
  const mapped = {};
  for (const [targetKey, sourceExpr] of Object.entries(mapping)) {
    mapped[targetKey] = resolveField(raw, sourceExpr);
  }
  return mapped;
}

// ── File-backed: read from Git repos ─────────────────────────────────────────

/**
 * Read resource items from YAML/JSON files in Git repos.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} rt - Resource type config
 * @param {object[]} collections - All collections (for finding repos to scan for globs)
 * @param {object} repoConfig - Config repo pointer
 * @returns {Promise<Array>}
 */
export async function fetchFromFiles(client, rt, collections = [], repoConfig = {}) {
  if (!rt.source || rt.source.type !== "file") return [];
  const repos = rt.source.repos || [];
  const all = [];

  for (const source of repos) {
    try {
      if (source.mode === "specific") {
        const items = await _readFileItems(client, source, rt, repoConfig);
        all.push(...items);
      } else if (source.mode === "glob") {
        const items = await _readGlobItems(client, source, rt, collections);
        all.push(...items);
      }
    } catch (e) {
      console.warn(`[resourceApi] Failed to read file source for ${rt.id}:`, e.message);
    }
  }

  return all;
}

async function _readFileItems(client, source, rt, repoConfig) {
  const project = source.project || repoConfig.project;
  const repoId = source.repoId || repoConfig.repoId;
  const branch = source.branch || repoConfig.branch || "main";

  const file = await client.readGitFile(project, repoId, source.filePath, branch);
  if (!file?.content) return [];

  const parsed = _parseFileContent(file.content, source.filePath);
  if (!parsed) return [];

  const items = resolvePath(parsed, source.arrayPath) || [];
  return items.map(item => ({
    ...item,
    _sourceRoot: `${project}/${repoId}`,
    _filePath: source.filePath,
    _branch: branch,
  }));
}

async function _readGlobItems(client, source, rt, collections) {
  // Find all repos in collections
  const repoIds = new Set();
  for (const col of collections) {
    for (const repo of (col.repos || [])) {
      if (repo.id) repoIds.add(repo.id);
    }
  }

  if (!repoIds.size) return [];

  // Get projects from collections
  const projectNames = new Set();
  for (const col of collections) {
    for (const p of (col.projects || [])) {
      projectNames.add(p);
    }
  }

  // For each project, list repos and match file paths
  const all = [];
  const projects = projectNames.size ? [...projectNames] : (await client.getProjects()).map(p => p.name);

  for (const project of projects) {
    try {
      const repos = await client.getRepos(project);
      for (const repo of repos) {
        if (!repoIds.has(repo.id)) continue;
        try {
          const matched = await client.listGitItems(project, repo.id, "/", source.branch || "main");
          const files = matchGlobFiles(matched, source.filePathPattern || source.arrayPath);
          for (const filePath of files) {
            try {
              const items = await _readFileItems(client, { ...source, project, repoId: repo.id, filePath }, rt, {});
              all.push(...items);
            } catch {}
          }
        } catch {}
      }
    } catch {}
  }

  return all;
}

/**
 * Match files against a glob pattern from a list of git items.
 * Supports simple patterns like globstar and wildcards.
 */
function matchGlobFiles(items, pattern) {
  if (!pattern) return items.filter(i => !i.isFolder).map(i => i.path);
  const regex = globToRegex(pattern);
  return items
    .filter(i => !i.isFolder && regex.test(i.path))
    .map(i => i.path);
}

function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "(.*/)?")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp("^" + escaped + "$");
}

function _parseFileContent(content, filePath) {
  if (filePath.endsWith(".json")) {
    return JSON.parse(content);
  }
  // Default: YAML
  return yaml.load(content);
}

// ── CRUD for file-backed types ───────────────────────────────────────────────

/**
 * Read items from a CRUD target file.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} rt - Resource type config (must have crud.target)
 * @param {string} project
 * @param {string} repoId
 * @param {string} branch
 * @returns {Promise<{ items: Array, objectId: string|null, raw: object|null }>}
 */
export async function readCrudItems(client, rt, project, repoId, branch) {
  const target = rt.crud?.target;
  if (!target) return { items: [], objectId: null, raw: null };

  try {
    const file = await client.readGitFile(project, repoId, target.file, branch);
    if (!file?.content) return { items: [], objectId: file?.objectId || null, raw: null };

    const parsed = _parseFileContent(file.content, target.file);
    if (!parsed) return { items: [], objectId: file?.objectId || null, raw: null };

    const items = resolvePath(parsed, target.arrayPath) || [];
    return { items, objectId: file?.objectId || null, raw: parsed };
  } catch {
    return { items: [], objectId: null, raw: null };
  }
}

/**
 * Write (add/update) an item in a CRUD target file.
 * Creates a branch + commit (same pattern as YAML Tools).
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {object} rt - Resource type config
 * @param {string} project
 * @param {string} repoId
 * @param {string} branch
 * @param {object} item - Item to add/update
 * @param {string|null} objectId - Current file objectId
 * @param {{ displayName: string, emailAddress: string }} [author]
 * @returns {Promise<string|null>} Fresh objectId
 */
export async function writeCrudItem(client, rt, project, repoId, branch, item, objectId, author) {
  const target = rt.crud?.target;
  if (!target) return null;

  const { items, raw, objectId: currentObjectId } = await readCrudItems(client, rt, project, repoId, branch);
  const existingId = currentObjectId || objectId;

  // Add or update
  const idField = rt.idField || "id";
  const idVal = resolveField(item, idField);
  let newItems;
  if (idVal != null && items.some(i => resolveField(i, idField) === idVal)) {
    newItems = items.map(i => resolveField(i, idField) === idVal ? { ...i, ...item } : i);
  } else {
    newItems = [...items, item];
  }

  // Write back
  const content = _buildFileContent(raw, target.arrayPath, newItems, target.file);
  const commitMsg = rt.crud.commitMessageTemplate
    ? rt.crud.commitMessageTemplate.replace(/\{field:(\w+)\}/g, (_, key) => item[key] || "")
    : `Update ${rt.name}`;

  await client.pushGitFile(
    project, repoId, target.file, content,
    existingId, commitMsg,
    author?.displayName, author?.emailAddress,
    branch
  );

  // Re-read for fresh objectId
  try {
    const refreshed = await client.readGitFile(project, repoId, target.file, branch);
    return refreshed?.objectId || null;
  } catch {
    return null;
  }
}

function _buildFileContent(raw, arrayPath, newItems, filePath) {
  if (filePath.endsWith(".json")) {
    const obj = raw || {};
    _setPath(obj, arrayPath, newItems);
    return JSON.stringify(obj, null, 2);
  }

  // YAML
  const obj = raw ? { ...raw } : {};
  _setPath(obj, arrayPath, newItems);
  return yaml.dump(obj, { lineWidth: 120, quotingType: '"' });
}

function _setPath(obj, path, value) {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}
