import { cache, CACHE_TTL } from "../lib";

export class ADOClient {
  constructor(org, pat) {
    this.org = org.trim().replace(/\/$/, "");
    this.pat = pat;
    this.base = `https://dev.azure.com/${encodeURIComponent(this.org)}`;
    this.feedsBase = `https://feeds.dev.azure.com/${encodeURIComponent(this.org)}`;
    this._auth = `Basic ${btoa(":" + pat)}`;
    this._projects = [];
  }

  updatePat(pat) {
    this.pat = pat;
    this._auth = `Basic ${btoa(":" + pat)}`;
    this.clearCache();
  }

  clearCache() {
    cache.clear();
    this._projects = [];
  }

  _getHeaders(opts = {}) {
    const headers = {
      "Authorization": this._auth,
      "Content-Type": "application/json",
      "Accept": "application/json",
    };
    return headers;
  }

  async _fetch(url, opts = {}) {
    const fetchOpts = {
      method: opts.method || "GET",
      headers: this._getHeaders(opts),
      body: opts.body || undefined,
    };

    const res = await fetch(url, fetchOpts);
    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch {}
      throw new Error(`${res.status}: ${msg}`);
    }
    return res.json();
  }

  async testConnection() {
    return this._fetch(`${this.base}/_apis/projects?api-version=7.1&$top=1`);
  }

  _cachedFetch(key, fetcher, ttl = CACHE_TTL) {
    const cached = cache.get(key);
    if (cached) return Promise.resolve(cached);
    return fetcher().then(data => {
      cache.set(key, data, ttl);
      return data;
    });
  }

  async getProjects(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("projects");
    const r = await this._cachedFetch("projects", () => 
      this._fetch(`${this.base}/_apis/projects?api-version=7.1&$top=200`)
    );
    this._projects = r.value || [];
    return this._projects;
  }

  async searchWorkItems(searchTerm = "", filters = {}) {
    let wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] IN ('Epic','Feature','User Story','Bug','Task') AND [System.State] NOT IN ('Closed','Removed')`;
    
    if (filters.types?.length) {
      const types = filters.types.map(t => `'${t}'`).join(",");
      wiql = wiql.replace(`IN ('Epic','Feature','User Story','Bug','Task')`, `IN (${types})`);
    }
    
    if (filters.states?.length) {
      const states = filters.states.map(s => `'${s}'`).join(",");
      wiql += ` AND [System.State] IN (${states})`;
    }
    
    if (filters.assignee) {
      const a = filters.assignee.replace(/'/g, "''");
      wiql += ` AND [System.AssignedTo] CONTAINS '${a}'`;
    }
    
    if (filters.areaPath) {
      const a = filters.areaPath.replace(/'/g, "''");
      wiql += ` AND [System.AreaPath] UNDER '${a}'`;
    }
    
    if (searchTerm.trim()) {
      const term = searchTerm.replace(/'/g, "''");
      wiql += ` AND ([System.Title] CONTAINS '${term}' OR [System.Description] CONTAINS '${term}')`;
    }
    
    wiql += " ORDER BY [System.ChangedDate] DESC";
    
    const r = await this._fetch(
      `${this.base}/_apis/wit/wiql?api-version=7.1&$top=200`,
      { method: "POST", body: JSON.stringify({ query: wiql }) }
    );
    if (!r.workItems?.length) return [];
    const ids = r.workItems.slice(0, 50).map(w => w.id).join(",");
    const fields = [
      "System.Id","System.Title","System.WorkItemType","System.State",
      "Microsoft.VSTS.Common.Priority","System.Parent","System.AssignedTo",
      "System.ChangedDate","System.AreaPath",
    ].join(",");
    const detail = await this._fetch(
      `${this.base}/_apis/wit/workitems?ids=${ids}&fields=${fields}&api-version=7.1`
    );
    return detail.value || [];
  }

  async getWorkItemsByIds(ids) {
    if (!ids?.length) return [];
    const fields = [
      "System.Id","System.Title","System.WorkItemType","System.State",
      "Microsoft.VSTS.Common.Priority","System.Parent","System.AssignedTo",
      "System.ChangedDate","System.AreaPath","System.TeamProject",
    ].join(",");
    const detail = await this._fetch(
      `${this.base}/_apis/wit/workitems?ids=${ids.join(",")}&fields=${fields}&api-version=7.1`
    );
    return detail.value || [];
  }

  async getWorkItemComments(workItemId, project) {
    if (!project) return [];
    try {
      const r = await this._fetch(
        `${this.base}/${encodeURIComponent(project)}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview.4`
      );
      return r.comments || [];
    } catch { return []; }
  }

  async addWorkItemComment(workItemId, text, project) {
    if (!project) return;
    const r = await this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/wit/workItems/${workItemId}/comments?api-version=7.1-preview.4`,
      { method: "POST", body: JSON.stringify({ text }) }
    );
    return r;
  }

  async getAllRepos(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("repos-");
    return this._cachedFetch("repos-all", async () => {
      if (!this._projects.length) await this.getProjects();
      const all = [];
      for (const p of this._projects.slice(0, 10)) {
        try { 
          const repos = await this.getRepos(p.name);
          repos.forEach(repo => { repo._projectName = p.name; });
          all.push(...repos); 
        } catch {}
      }
      return all;
    });
  }

  async getAllPipelines(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("pipelines-");
    return this._cachedFetch("pipelines-all", async () => {
      if (!this._projects.length) await this.getProjects();
      const all = [];
      for (const p of this._projects.slice(0, 10)) {
        try { 
          const pipelines = await this.getPipelines(p.name);
          pipelines.forEach(pl => { pl._projectName = p.name; });
          all.push(...pipelines); 
        } catch {}
      }
      return all;
    });
  }

  async getAllPullRequests(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("prs-");
    return this._cachedFetch("prs-all", async () => {
      if (!this._projects.length) await this.getProjects();
      const all = [];
      for (const p of this._projects.slice(0, 10)) {
        try { 
          const prs = await this.getPullRequests(p.name);
          prs.forEach(pr => { pr._projectName = p.name; });
          all.push(...prs); 
        } catch {}
      }
      return all;
    });
  }

  async getAllTestRuns(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("tests-");
    return this._cachedFetch("tests-all", async () => {
      if (!this._projects.length) await this.getProjects();
      const all = [];
      for (const p of this._projects.slice(0, 10)) {
        try { all.push(...await this.getTestRuns(p.name)); } catch {}
      }
      return all;
    });
  }

  async getAllServiceConnections(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("serviceconnections-");
    return this._cachedFetch("serviceconnections-all", async () => {
      if (!this._projects.length) await this.getProjects();
      const all = [];
      for (const p of this._projects.slice(0, 10)) {
        try {
          const scs = await this.getServiceConnections(p.name);
          scs.forEach(sc => { sc._projectName = p.name; });
          all.push(...scs);
        } catch {}
      }
      return all;
    });
  }

  async getRepos(project) {
    const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`);
    return r.value || [];
  }

  async getPipelines(project) {
    const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/pipelines?api-version=7.1&$top=50`);
    return r.value || [];
  }

  async getPipelineRuns(project, pipelineId) {
    const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/pipelines/${encodeURIComponent(pipelineId)}/runs?api-version=7.1&$top=5`);
    return r.value || [];
  }

  async getBuildRuns(project, definitionId) {
    const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/build/builds?definitions=${definitionId}&$top=5&api-version=7.1`);
    return r.value || [];
  }

  /**
   * Fetch builds for multiple definition IDs in one request and return a
   * mapping of definitionId -> latest build (or null).
   * We request a larger $top so the response includes several recent builds
   * across the given definitions, then pick the most recent per definition.
   */
  async getBuildRunsForDefinitions(project, definitionIds = [], perDefinition = 5) {
    if (!definitionIds || !definitionIds.length) return {};
    const defs = definitionIds.map(String).join(",");
    const top = Math.max(5, definitionIds.length * perDefinition);
    try {
      const r = await this._fetch(
        `${this.base}/${encodeURIComponent(project)}/_apis/build/builds?definitions=${encodeURIComponent(defs)}&$top=${top}&api-version=7.1`
      );
      const builds = r.value || [];
      // Group by definition id and pick the latest by queueTime/startTime
      const byDef = {};
      for (const b of builds) {
        const defId = b.definition?.id || (b.definition && b.definition.id) || null;
        if (!defId) continue;
        const key = String(defId);
        if (!byDef[key]) byDef[key] = [];
        byDef[key].push(b);
      }
      const result = {};
      for (const id of definitionIds) {
        const key = String(id);
        const arr = byDef[key] || [];
        // Sort by startTime/queueTime desc
        arr.sort((a, b) => {
          const ta = new Date(a.startTime || a.queueTime || 0).getTime();
          const tb = new Date(b.startTime || b.queueTime || 0).getTime();
          return tb - ta;
        });
        // Return array of recent builds (newest first) — may be empty
        result[key] = arr;
      }
      return result;
    } catch (e) {
      return definitionIds.reduce((acc, id) => (acc[String(id)] = [], acc), {});
    }
  }

  async getPullRequests(project) {
    const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/git/pullrequests?searchCriteria.status=active&$top=30&api-version=7.1`);
    return r.value || [];
  }

  async getTestRuns(project) {
    try {
      const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/test/runs?api-version=7.1&$top=20&includeRunDetails=true`);
      return r.value || [];
    } catch { return []; }
  }

  async getServiceConnections(project) {
    try {
      const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/serviceendpoint/endpoints?api-version=7.1&$top=50`);
      return r.value || [];
    } catch { return []; }
  }

  async getProfile() {
    return this._cachedFetch("profile", async () => {
      const r = await this._fetch(`${this.base}/_apis/connectionData?api-version=7.1-preview`);
      const u = r.authenticatedUser;
      if (!u) throw new Error("connectionData returned no authenticatedUser");
      // Normalise to the shape the rest of the app expects
      return {
        id:           u.id,
        displayName:  u.providerDisplayName || u.id,
        emailAddress: u.properties?.Account?.$value || u.descriptor?.split("\\")[1] || "",
      };
    });
  }

  // ── Git repository API ────────────────────────────────────────────────────

  /**
   * List all repositories in a project.
   * Returns the full ADO repository objects (id, name, remoteUrl, …).
   */
  async listReposInProject(project) {
    const r = await this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`
    );
    return r.value || [];
  }

  /**
   * Resolve or verify a repository by name within a project.
   * Returns the repo object if found, or null.
   */
  async getRepoByName(project, repoName) {
    const repos = await this.listReposInProject(project);
    return repos.find(r => r.name.toLowerCase() === repoName.toLowerCase()) || null;
  }

  /**
   * Create a new Git repository in the specified project.
   * Returns the created repository object.
   */
  async createRepo(project, repoName) {
    const projectsResp = await this._fetch(`${this.base}/_apis/projects/${encodeURIComponent(project)}?api-version=7.1`);
    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`,
      {
        method: "POST",
        body: JSON.stringify({ name: repoName, project: { id: projectsResp.id } }),
      }
    );
  }

  /**
   * List items (files/directories) at a given path in a Git repo.
   * Returns an array of item objects with path, objectId, isFolder, etc.
   */
  async listGitItems(project, repoId, path = "/") {
    try {
      const r = await this._fetch(
        `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/items` +
        `?scopePath=${encodeURIComponent(path)}&recursionLevel=OneLevel&api-version=7.1`
      );
      return r.value || [];
    } catch {
      return [];
    }
  }

  /**
   * Read the content of a single file from a Git repo.
   * Returns { content: string, objectId: string } or null if not found.
   */
  async readGitFile(project, repoId, filePath) {
    try {
      const r = await this._fetch(
        `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/items` +
        `?path=${encodeURIComponent(filePath)}&includeContent=true&api-version=7.1`
      );
      // The items API returns the file content in r.content when includeContent=true
      return { content: r.content || "", objectId: r.objectId || null };
    } catch {
      return null;
    }
  }

  /**
   * Push a single file change (create, update, or delete) to a Git repo.
   *
   * @param {string} project       ADO project name
   * @param {string} repoId        Repository ID (GUID)
   * @param {string} filePath      Path in the repo, e.g. "/collections/shared/team.yaml"
   * @param {string|null} content  File content (null to delete)
   * @param {string|null} oldObjectId  Previous objectId for updates (null for new files)
   * @param {string} commitMessage
   * @param {string} authorName
   * @param {string} authorEmail
   * @returns {Promise<object>} The push response from ADO
   */
  async pushGitFile(project, repoId, filePath, content, oldObjectId, commitMessage, authorName, authorEmail) {
    // Determine the branch's latest commit so we can push on top of it
    const refsResp = await this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}` +
      `/refs?filter=heads/main&api-version=7.1`
    );
    const refs = refsResp.value || [];
    const mainRef = refs.find(r => r.name === "refs/heads/main") || refs[0];

    // For brand-new repos the branch may not exist yet — use the null OID
    const oldRefObjectId = mainRef ? mainRef.objectId : "0000000000000000000000000000000000000000";

    // When no oldObjectId is supplied (new collection created in the browser),
    // probe whether the file already exists so we use "edit" rather than "add"
    // if a previous session already wrote it.
    let resolvedOldObjectId = oldObjectId;
    if (content !== null && !resolvedOldObjectId) {
      const existing = await this.readGitFile(project, repoId, filePath);
      if (existing?.objectId) resolvedOldObjectId = existing.objectId;
    }

    const changeType = content === null ? "delete" : (resolvedOldObjectId ? "edit" : "add");
    const change = {
      changeType,
      item: { path: filePath },
      ...(changeType !== "delete" ? { newContent: { content, contentType: "rawtext" } } : {}),
    };

    const now = new Date().toISOString();
    const pushPayload = {
      refUpdates: [{ name: "refs/heads/main", oldObjectId: oldRefObjectId }],
      commits: [{
        comment: commitMessage,
        author: { name: authorName, email: authorEmail, date: now },
        changes: [change],
      }],
    };

    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pushes?api-version=7.1`,
      { method: "POST", body: JSON.stringify(pushPayload) }
    );
  }

  // ── Wiki API ──────────────────────────────────────────────────────────────

  /**
   * List all wikis in the organisation (optionally filtered to a project).
   * Returns an array of wiki objects.
   */
  async listWikis(project) {
    const url = project
      ? `${this.base}/${encodeURIComponent(project)}/_apis/wiki/wikis?api-version=7.1`
      : `${this.base}/_apis/wiki/wikis?api-version=7.1`;
    try {
      const r = await this._fetch(url);
      return r.value || [];
    } catch {
      return [];
    }
  }

  /**
   * Upsert (create or update) a wiki page.
   * ADO Wiki PUT creates parent pages automatically.
   *
   * @param {string} project   ADO project name
   * @param {string} wikiId    Wiki ID or name
   * @param {string} pagePath  Page path, e.g. "ADO-SuperUI/Collections/Team Backend"
   * @param {string} content   Markdown content
   * @returns {Promise<object>} The wiki page response
   */
  async upsertWikiPage(project, wikiId, pagePath, content) {
    const encodedPath = encodeURIComponent(pagePath);
    const url = `${this.base}/${encodeURIComponent(project)}/_apis/wiki/wikis/${wikiId}/pages?path=${encodedPath}&api-version=7.1`;

    // First try to get the current ETag (version) so we can update rather than conflict
    let eTag = null;
    try {
      const getResp = await fetch(url, { method: "GET", headers: this._getHeaders() });
      if (getResp.ok) {
        eTag = getResp.headers.get("ETag");
      }
    } catch { /* page doesn't exist yet — that's fine */ }

    const headers = { ...this._getHeaders(), "Content-Type": "application/json" };
    if (eTag) headers["If-Match"] = eTag;

    const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ content }) });

    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch {}
      throw new Error(`Wiki upsert failed ${res.status}: ${msg}`);
    }
    return res.json();
  }

  // Helper to recursively flatten wiki pages hierarchy
  flattenWikiPages(page, wikiId, wikiName, projectName) {
    // Use composite ID (wikiId:path) for collection membership
    // Store original API page ID for content fetching
    const compositeId = `${wikiId}:${page.path}`;
    const apiPageId = page.id;  // Original numeric ID from API
    const result = [{
      ...page,
      id: compositeId,
      _pageId: apiPageId,
      _wikiId: wikiId,
      _wikiName: wikiName,
      _projectName: projectName,
    }];
    if (page.subPages && page.subPages.length > 0) {
      page.subPages.forEach(sub => {
        result.push(...this.flattenWikiPages(sub, wikiId, wikiName, projectName));
      });
    }
    return result;
  }

  async getWikiPagesForProject(project) {
    try {
      const wikis = await this.listWikis(project);
      const allPages = [];
      for (const wiki of wikis) {
        try {
          const url = `${this.base}/${encodeURIComponent(project)}/_apis/wiki/wikis/${wiki.id}/pages?api-version=7.1&recursionLevel=1`;
          const r = await this._fetch(url);
          if (r && r.path) {
            const pages = this.flattenWikiPages(r, wiki.id, wiki.name, project);
            allPages.push(...pages);
          }
        } catch { /* skip wikis we can't access */ }
      }
      return allPages;
    } catch {
      return [];
    }
  }

  async getAllWikiPages(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("wiki-pages-");
    return this._cachedFetch("wiki-pages-all", async () => {
      const allPages = [];
      let wikis = [];
      try {
        wikis = await this.listWikis();
      } catch { /* org-level wikis may not exist */ }
      for (const wiki of wikis) {
        try {
          const url = `${this.base}/_apis/wiki/wikis/${wiki.id}/pages?api-version=7.1&recursionLevel=1`;
          const r = await this._fetch(url);
          if (r && r.path) {
            const pages = this.flattenWikiPages(r, wiki.id, wiki.name, "");
            allPages.push(...pages);
          }
        } catch { /* skip wikis we can't access */ }
      }
      if (!this._projects.length) await this.getProjects();
      for (const p of this._projects.slice(0, 20)) {
        try {
          const projPages = await this.getWikiPagesForProject(p.name);
          allPages.push(...projPages);
        } catch { /* skip projects we can't access */ }
      }
      return allPages;
    });
  }

  async getWikiPageComments(wikiId, pageId) {
    try {
      const url = `${this.base}/_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages/${encodeURIComponent(pageId)}/comments?$top=50&excludeDeleted=true&$expand=9&api-version=7.1`;
      const r = await this._fetch(url);
      return r.value || [];
    } catch {
      return [];
    }
  }

  async getWikiPageContent(wikiId, pagePath, projectName, apiPageId) {
    try {
      const projectPart = projectName ? `${encodeURIComponent(projectName)}/` : "";
      let url;
      if (apiPageId) {
        // Use page ID endpoint: /pages/{pageId}
        url = `${this.base}/${projectPart}_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages/${encodeURIComponent(apiPageId)}?includeContent=true&api-version=7.1`;
      } else {
        // Use path endpoint: /pages?path={path}
        url = `${this.base}/${projectPart}_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages?path=${encodeURIComponent(pagePath)}&includeContent=true&api-version=7.1`;
      }
      const r = await this._fetch(url);
      let content = r.content;
      // Handle case where content might be an object
      if (content && typeof content !== "string") {
        // Try to stringify if it's an object, or convert to string
        content = typeof content === "object" ? JSON.stringify(content) : String(content);
      }
      return content || "";
    } catch {
      return "";
    }
  }

  // ── Pipeline Timeline & Logs API ─────────────────────────────────────────

  async _fetchText(url, opts = {}) {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers: { ...this._getHeaders(opts), Accept: "text/plain" },
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); msg = j.message || j.error || msg; } catch {}
      throw new Error(`${res.status}: ${msg}`);
    }
    return res.text();
  }

  async getBuildTimeline(project, buildId) {
    const r = await this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/build/builds/${encodeURIComponent(buildId)}/timeline?api-version=7.1`
    );
    return r;
  }

  async getBuildLogs(project, buildId) {
    const r = await this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/build/builds/${encodeURIComponent(buildId)}/logs?api-version=7.1`
    );
    return r.value || [];
  }

  async getBuildLog(project, buildId, logId) {
    return this._fetchText(
      `${this.base}/${encodeURIComponent(project)}/_apis/build/builds/${encodeURIComponent(buildId)}/logs/${encodeURIComponent(logId)}?api-version=7.1`
    );
  }

  async getBuildLogRange(project, buildId, logId, startLine, endLine) {
    return this._fetchText(
      `${this.base}/${encodeURIComponent(project)}/_apis/build/builds/${encodeURIComponent(buildId)}/logs/${encodeURIComponent(logId)}?startLine=${startLine}&endLine=${endLine}&api-version=7.1`
    );
  }

  async getPipelineRun(project, pipelineId, runId) {
    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/pipelines/${encodeURIComponent(pipelineId)}/runs/${encodeURIComponent(runId)}?api-version=7.1`
    );
  }

  async getPipelineRunArtifacts(project, pipelineId, runId) {
    try {
      const r = await this._fetch(
        `${this.base}/${encodeURIComponent(project)}/_apis/pipelines/${encodeURIComponent(pipelineId)}/runs/${encodeURIComponent(runId)}/artifacts?api-version=7.1`
      );
      return r.value || [];
    } catch { return []; }
  }

  async getEnvironment(project, envId) {
    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/distributedtask/environments/${encodeURIComponent(envId)}?api-version=7.1`
    );
  }

  async getVariableGroup(project, groupId) {
    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/distributedtask/variablegroups/${encodeURIComponent(groupId)}?api-version=7.1`
    );
  }

  async getServiceEndpoint(project, endpointId) {
    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/serviceendpoint/endpoints/${encodeURIComponent(endpointId)}?api-version=7.1`
    );
  }

  /**
   * Get the Azure DevOps organization instance ID (for SignalR contextToken).
   * Cached since it never changes for a given org.
   */
  async getOrganizationId() {
    return this._cachedFetch("org-instance-id", async () => {
      const r = await this._fetch(`${this.base}/_apis/connectionData?api-version=7.1-preview`);
      return r.instanceId;
    });
  }

  /**
   * Get the project GUID from a project name.
   */
  async getProjectId(projectName) {
    if (!this._projects.length) await this.getProjects();
    const p = this._projects.find(
      (proj) => proj.name.toLowerCase() === projectName.toLowerCase()
    );
    return p?.id || null;
  }

  async addWikiPageComment(wikiId, pageId, text) {
    const url = `${this.base}/_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages/${encodeURIComponent(pageId)}/comments?api-version=7.1`;
    const r = await this._fetch(url, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    return r;
  }
}
