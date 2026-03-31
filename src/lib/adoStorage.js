/**
 * adoStorage.js
 *
 * ADO Git-backed storage for collections.
 *
 * Repository layout:
 *   collections/
 *     shared/
 *       {id}.yaml          ← team-wide collections
 *     users/
 *       {profileId}/
 *         {id}.yaml        ← personal collections (incl. pinned-pipelines)
 *
 * Each collection is one YAML file. js-yaml handles parse/stringify.
 *
 * Shape migration: the old format stored flat string arrays for repoIds,
 * pipelineIds, etc. This module transparently upgrades those to structured
 * objects with a comments array on first read.
 */

import yaml from "js-yaml";

// ── PINNED PIPELINES reserved ID ──────────────────────────────────────────────
export const PINNED_PIPELINES_ID = "pinned-pipelines";

// ── Path helpers ──────────────────────────────────────────────────────────────

function sharedPath(collectionId) {
  return `/collections/shared/${collectionId}.yaml`;
}

function personalPath(profileId, collectionId) {
  return `/collections/users/${profileId}/${collectionId}.yaml`;
}

function collectionPath(collection, profileId) {
  if (collection.scope === "personal") {
    if (!profileId) throw new Error("Cannot determine path for personal collection: profile ID is missing.");
    return personalPath(profileId, collection.id);
  }
  return sharedPath(collection.id);
}

// ── Shape migration ───────────────────────────────────────────────────────────

/**
 * Normalise a collection object from any historical shape to the current one.
 *
 * Old shape:  { repoIds: ["guid", …], pipelineIds: ["42", …], … }
 * New shape:  { repos: [{ id, comments:[] }], pipelines: [{ id, name, project, …, comments:[] }], … }
 *
 * Old repoIds / pipelineIds fields are kept for backwards compat reading but
 * the canonical write path always uses the new shape.
 */
export function migrateCollection(raw) {
  const col = { ...raw };

  // Ensure top-level comments array
  if (!Array.isArray(col.comments)) col.comments = [];

  // Migrate repoIds → repos
  if (!Array.isArray(col.repos)) {
    const ids = Array.isArray(col.repoIds) ? col.repoIds : [];
    col.repos = ids.map(id => ({ id: String(id), comments: [] }));
  } else {
    col.repos = col.repos.map(r =>
      typeof r === "string"
        ? { id: r, comments: [] }
        : { comments: [], ...r }
    );
  }

  // Migrate pipelineIds → pipelines
  if (!Array.isArray(col.pipelines)) {
    const ids = Array.isArray(col.pipelineIds) ? col.pipelineIds : [];
    col.pipelines = ids.map(id => ({ id: String(id), comments: [], runs: [] }));
  } else {
    col.pipelines = col.pipelines.map(p =>
      typeof p === "string"
        ? { id: p, comments: [], runs: [] }
        : { comments: [], runs: [], ...p }
    );
  }

  // Ensure workItemIds is an array of strings
  if (!Array.isArray(col.workItemIds)) col.workItemIds = [];
  col.workItemIds = col.workItemIds.map(String);

  // prIds stays as a flat array (no comments on PRs per plan)
  if (!Array.isArray(col.prIds)) col.prIds = [];
  col.prIds = col.prIds.map(String);

  // Migrate serviceConnections
  if (!Array.isArray(col.serviceConnections)) {
    col.serviceConnections = [];
  } else {
    col.serviceConnections = col.serviceConnections.map(sc =>
      typeof sc === "string"
        ? { id: sc, comments: [] }
        : { comments: [], ...sc }
    );
  }

  // Migrate wikiPages
  if (!Array.isArray(col.wikiPages)) {
    col.wikiPages = [];
  } else {
    col.wikiPages = col.wikiPages.map(wp =>
      typeof wp === "string"
        ? { id: wp, path: "", wikiId: "", wikiName: "", project: "", comments: [] }
        : { comments: [], ...wp }
    );
  }

  // Remove legacy flat arrays to keep the YAML clean
  delete col.repoIds;
  delete col.pipelineIds;

  // Ensure filters exists
  if (!col.filters) col.filters = { types: [], states: [], assignee: "", areaPath: "" };

  // Ensure projects exists (optional project scope for search optimization)
  if (!Array.isArray(col.projects)) col.projects = [];

  return col;
}

/**
 * Return a plain serialisable form of a collection for YAML output.
 */
function serialise(collection) {
  return {
    id:       collection.id,
    name:     collection.name,
    icon:     collection.icon || "📁",
    color:    collection.color || "#6B7280",
    scope:    collection.scope || "shared",
    owner:    collection.owner || null,
    filters:  collection.filters || { types: [], states: [], assignee: "", areaPath: "" },
    projects: (collection.projects || []).map(String),
    comments: collection.comments || [],
    workItemIds: (collection.workItemIds || []).map(String),
    repos:    (collection.repos || []).map(r => ({
      id:       String(r.id),
      comments: r.comments || [],
    })),
    pipelines: (collection.pipelines || []).map(p => ({
      id:                String(p.id),
      name:              p.name || "",
      project:           p.project || "",
      folder:            p.folder || "",
      configurationType: p.configurationType || "",
      comments:          p.comments || [],
      runs:              (p.runs || []).slice(0, 5).map(r => ({
        id:          r.id,
        buildNumber: r.buildNumber || "",
        branch:      r.branch || "",
        startTime:   r.startTime || "",
        comments:    (r.comments || []).map(c => ({
          id:        c.id || "",
          lineRefs:  c.lineRefs || [],
          author:    c.author || "",
          authorId:  c.authorId || "",
          text:      c.text || "",
          resolved:  !!c.resolved,
          createdAt: c.createdAt || "",
        })),
      })),
    })),
    prIds: (collection.prIds || []).map(String),
    serviceConnections: (collection.serviceConnections || []).map(sc => ({
      id:          String(sc.id),
      project:     sc.project || "",
      type:        sc.type || "",
      comments:    sc.comments || [],
    })),
    wikiPages: (collection.wikiPages || []).map(wp => ({
      id:         String(wp.id),
      path:       wp.path || "",
      wikiId:     wp.wikiId || "",
      wikiName:   wp.wikiName || "",
      project:    wp.project || "",
      comments:   wp.comments || [],
    })),
  };
}

// ── ADOStorage ────────────────────────────────────────────────────────────────

export class ADOStorage {
  /**
   * @param {import('./adoClient').ADOClient} client
   * @param {{ project: string, repoId: string, repoName: string, wikiId?: string }} config
   * @param {{ id: string, displayName: string, emailAddress: string }} profile
   */
  constructor(client, config, profile) {
    this.client  = client;
    this.config  = config;
    this.profile = profile;
  }

  get _project()  { return this.config.project; }
  get _repoId()   { return this.config.repoId; }


  // ── Read ────────────────────────────────────────────────────────────────────

  /**
   * Load all collections (shared + personal for this user).
   * @returns {Promise<Array>} migrated collection objects
   */
  async loadAll() {
    const profileId = this.profile?.id;

    const tasks = [this._loadFromFolder(`/collections/shared`)];
    if (profileId) {
      tasks.push(this._loadFromFolder(`/collections/users/${profileId}`));
    }

    const results = await Promise.allSettled(tasks);
    return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
  }

  async _loadFromFolder(folderPath) {
    const items = await this.client.listGitItems(this._project, this._repoId, folderPath);
    const yamlFiles = items.filter(i => !i.isFolder && i.path?.endsWith(".yaml"));

    const results = await Promise.allSettled(
      yamlFiles.map(item => this._readFile(item.path))
    );

    return results
      .filter(r => r.status === "fulfilled" && r.value)
      .map(r => r.value);
  }

  async _readFile(filePath) {
    const file = await this.client.readGitFile(this._project, this._repoId, filePath);
    if (!file) return null;
    try {
      const raw = yaml.load(file.content);
      if (!raw || typeof raw !== "object") return null;
      const col = migrateCollection(raw);
      col._objectId = file.objectId; // stash for optimistic locking
      return col;
    } catch (e) {
      console.warn(`[adoStorage] Failed to parse ${filePath}:`, e.message);
      return null;
    }
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  /**
   * Save a collection and return the fresh objectId so the caller can stamp it
   * on the in-memory object, avoiding a redundant probe on the next save.
   * Throws ConflictError if another user has pushed since we last read.
   * @returns {Promise<string|null>} fresh objectId, or null if unresolvable
   */
  async save(collection) {
    const data    = serialise(collection);
    const content = yaml.dump(data, { lineWidth: 120, quotingType: '"' });
    const path    = collectionPath(collection, this.profile?.id);
    const msg     = `superui: update collection "${collection.name}"`;

    // Skip push if content hasn't changed
    try {
      const existing = await this.client.readGitFile(this._project, this._repoId, path);
      if (existing?.content === content) {
        console.debug(`[adoStorage] No changes to "${collection.name}", skipping push`);
        return existing.objectId || null;
      }
    } catch (e) {
      console.warn(`[adoStorage] Failed to check existing content for "${collection.name}", proceeding with push:`, e.message);
    }

    try {
      await this.client.pushGitFile(
        this._project,
        this._repoId,
        path,
        content,
        collection._objectId || null,
        msg
      );
    } catch (e) {
      if (e.message?.includes("non-fast-forward") || e.message?.includes("409")) {
        throw new ConflictError(`Collection "${collection.name}" was modified by another user — please refresh.`);
      }
      throw e;
    }

    // Re-read the file to get the fresh objectId for optimistic locking on the
    // next save, so we don't need to probe again.
    try {
      const refreshed = await this.client.readGitFile(this._project, this._repoId, path);
      return refreshed?.objectId || null;
    } catch {
      return null;
    }
  }

  /**
   * Delete a collection from the repo.
   */
  async delete(collection) {
    const path = collectionPath(collection, this.profile.id);
    const msg  = `superui: delete collection "${collection.name}"`;
    await this.client.pushGitFile(
      this._project,
      this._repoId,
      path,
      null,          // null content = delete
      collection._objectId || null,
      msg
    );
  }

  // ── Pinned pipelines personal collection ────────────────────────────────────

  /**
   * Return the pinned-pipelines personal collection, creating a blank one if
   * it doesn't exist in the loaded collections array.
   */
  static getPinnedCollection(collections, profile) {
    const existing = collections.find(
      c => c.id === PINNED_PIPELINES_ID && c.scope === "personal"
    );
    if (existing) return existing;
    return {
      id:       PINNED_PIPELINES_ID,
      name:     "Pinned Pipelines",
      icon:     "📌",
      color:    "#F59E0B",
      scope:    "personal",
      owner:    profile?.id || null,
      filters:  { types: [], states: [], assignee: "", areaPath: "" },
      projects: [],
      comments: [],
      workItemIds: [],
      repos:    [],
      pipelines: [],
      prIds:    [],
      serviceConnections: [],
      wikiPages: [],
    };
  }
}

// ── ConflictError ─────────────────────────────────────────────────────────────

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConflictError";
  }
}
