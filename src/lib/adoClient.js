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
      "Content-Type": opts.contentType || "application/json",
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

  async searchWorkItems(searchTerm = "", filters = {}, projectNames = []) {
    let wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] IN ('Epic','Feature','User Story','Bug','Task') AND [System.State] NOT IN ('Closed','Removed')`;

    if (filters.types?.length) {
      const types = filters.types.map(t => `'${t}'`).join(",");
      wiql = wiql.replace(`IN ('Epic','Feature','User Story','Bug','Task')`, `IN (${types})`);
    }

    if (projectNames.length) {
      const projects = projectNames.map(p => `'${p.replace(/'/g, "''")}'`).join(",");
      wiql += ` AND [System.TeamProject] IN (${projects})`;
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

  /**
   * Read per-project cache populated by the background worker.
   * For cache misses, fetch live and write to the per-project cache.
   */
  async _getProjectCached(projectName, cacheKey, fetcher) {
    const key = `project:${projectName}:${cacheKey}`;
    const cached = cache.get(key);
    if (cached) return cached;
    try {
      const data = await fetcher(projectName);
      data.forEach(item => { item._projectName = projectName; });
      cache.set(key, data, 5 * 60 * 1000);
      return data;
    } catch {
      return [];
    }
  }

  async _collectFromProjects(cacheKey, fetcher, projectNames, forceRefresh, onProjectSearched) {
    if (!projectNames.length) {
      if (!this._projects.length) await this.getProjects();
      projectNames = this._projects.map(p => p.name);
    }
    // Invalidate only the specific type's cache entries, not all project-scoped data
    if (forceRefresh) {
      for (const name of projectNames) {
        cache.invalidate(`project:${name}:${cacheKey}`);
      }
    }
    const total = projectNames.length;
    let completed = 0;
    const results = await Promise.all(
      projectNames.map(async (name) => {
        const items = await this._getProjectCached(name, cacheKey, fetcher);
        completed++;
        if (onProjectSearched) onProjectSearched(name, completed, total);
        return items;
      })
    );
    return results.flat();
  }

  async getAllRepos(forceRefresh = false, onProjectSearched) {
    return this._collectFromProjects("repos", n => this.getRepos(n), [], forceRefresh, onProjectSearched);
  }

  async getAllPipelines(forceRefresh = false, onProjectSearched) {
    return this._collectFromProjects("pipelines", n => this.getPipelines(n), [], forceRefresh, onProjectSearched);
  }

  async getAllPullRequests(forceRefresh = false, onProjectSearched) {
    return this._collectFromProjects("prs", n => this.getPullRequests(n), [], forceRefresh, onProjectSearched);
  }

  async getAllTestRuns(forceRefresh = false, onProjectSearched) {
    return this._collectFromProjects("testRuns", n => this.getTestRuns(n), [], forceRefresh, onProjectSearched);
  }

  async getAllServiceConnections(forceRefresh = false, onProjectSearched) {
    return this._collectFromProjects("serviceConnections", n => this.getServiceConnections(n), [], forceRefresh, onProjectSearched);
  }

  // ── Project-scoped variants ───────────────────────────────────────────────

  async getReposForProjects(projectNames, onProjectSearched) {
    return this._collectFromProjects("repos", n => this.getRepos(n), projectNames, false, onProjectSearched);
  }

  async getPipelinesForProjects(projectNames, onProjectSearched) {
    return this._collectFromProjects("pipelines", n => this.getPipelines(n), projectNames, false, onProjectSearched);
  }

  async getPullRequestsForProjects(projectNames, onProjectSearched) {
    return this._collectFromProjects("prs", n => this.getPullRequests(n), projectNames, false, onProjectSearched);
  }

  async getServiceConnectionsForProjects(projectNames, onProjectSearched) {
    return this._collectFromProjects("serviceConnections", n => this.getServiceConnections(n), projectNames, false, onProjectSearched);
  }

  async getRepos(project) {
    const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`);
    return r.value || [];
  }

  async getPipelines(project) {
    const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/pipelines?api-version=7.1&$top=500`);
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
    const r = await this._fetch(`${this.base}/${encodeURIComponent(project)}/_apis/git/pullrequests?searchCriteria.status=active&$top=200&api-version=7.1`);
    return r.value || [];
  }

  /**
   * Create a pull request in a Git repo.
   * @param {string} project
   * @param {string} repoId
   * @param {string} title  PR title
   * @param {string} description  PR description
   * @param {string} sourceBranch  Source branch name (without refs/heads/)
   * @param {string} [targetBranch="main"]  Target branch name
   * @returns {Promise<object>} The created PR object (includes url, pullRequestId)
   */
  async createPullRequest(project, repoId, title, description, sourceBranch, targetBranch = "main") {
    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/pullrequests?api-version=7.1`,
      {
        method: "POST",
        body: JSON.stringify({
          sourceRefName: `refs/heads/${sourceBranch}`,
          targetRefName: `refs/heads/${targetBranch}`,
          title,
          description,
        }),
      }
    );
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
   * List branches in a Git repo.
   * Returns an array of branch names (e.g. ["main", "develop"]).
   */
  async listBranches(project, repoId) {
    try {
      const r = await this._fetch(
        `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}` +
        `/refs?filter=heads/&api-version=7.1`
      );
      return (r.value || []).map(ref => ref.name?.replace("refs/heads/", "")).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Create a new branch in a Git repo from a source branch.
   * @param {string} project
   * @param {string} repoId
   * @param {string} newBranch  Branch name (without refs/heads/ prefix)
   * @param {string} [sourceBranch="main"]  Source branch to branch from
   * @returns {Promise<object>} The created ref
   */
  async createBranch(project, repoId, newBranch, sourceBranch = "main") {
    // Get the source branch HEAD OID
    const refsResp = await this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}` +
      `/refs?filter=heads/${encodeURIComponent(sourceBranch)}&api-version=7.1`
    );
    const refs = refsResp.value || [];
    const sourceRef = refs.find(r => r.name === `refs/heads/${sourceBranch}`) || refs[0];
    if (!sourceRef) throw new Error(`Source branch "${sourceBranch}" not found`);

    // Create the new branch ref pointing to the same commit
    const r = await this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/refs?api-version=7.1`,
      {
        method: "POST",
        body: JSON.stringify([{
          name: `refs/heads/${newBranch}`,
          oldObjectId: sourceRef.objectId,
        }]),
      }
    );
    return r;
  }

  /**
   * List items (files/directories) at a given path in a Git repo.
   * Returns an array of item objects with path, objectId, isFolder, etc.
   */
  async listGitItems(project, repoId, path = "/", branch = "main") {
    try {
      let url = `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/items` +
        `?scopePath=${encodeURIComponent(path)}&recursionLevel=OneLevel&api-version=7.1`;
      if (branch && branch !== "main") {
        url += `&versionDescriptor.version=${encodeURIComponent(branch)}&versionDescriptor.versionType=branch`;
      }
      const r = await this._fetch(url);
      return r.value || [];
    } catch {
      return [];
    }
  }

  /**
   * List all items recursively under a path in a Git repo.
   * Returns an array of item objects with path, objectId, isFolder, etc.
   */
  async listGitItemsRecursive(project, repoId, path = "/", branch = "main") {
    try {
      let url = `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/items` +
        `?scopePath=${encodeURIComponent(path)}&recursionLevel=Full&api-version=7.1`;
      if (branch && branch !== "main") {
        url += `&versionDescriptor.version=${encodeURIComponent(branch)}&versionDescriptor.versionType=branch`;
      }
      const r = await this._fetch(url);
      return r.value || [];
    } catch {
      return [];
    }
  }

  /**
   * Read the content of a single file from a Git repo.
   * Returns { content: string, objectId: string } or null if not found.
   */
  async readGitFile(project, repoId, filePath, branch = "main") {
    try {
      let url = `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}/items` +
        `?path=${encodeURIComponent(filePath)}&includeContent=true&api-version=7.1`;
      if (branch && branch !== "main") {
        url += `&versionDescriptor.version=${encodeURIComponent(branch)}&versionDescriptor.versionType=branch`;
      }
      const r = await this._fetch(url);
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
   * @param {string} [branch="main"]  Branch name to push to
   * @returns {Promise<object>} The push response from ADO
   */
  async pushGitFile(project, repoId, filePath, content, oldObjectId, commitMessage, authorName, authorEmail, branch = "main") {
    // Determine the branch's latest commit so we can push on top of it
    const refsResp = await this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/git/repositories/${repoId}` +
      `/refs?filter=heads/${encodeURIComponent(branch)}&api-version=7.1`
    );
    const refs = refsResp.value || [];
    const branchRef = refs.find(r => r.name === `refs/heads/${branch}`) || refs[0];

    // For brand-new repos the branch may not exist yet — use the null OID
    const oldRefObjectId = branchRef ? branchRef.objectId : "0000000000000000000000000000000000000000";

    // When no oldObjectId is supplied (new collection created in the browser),
    // probe whether the file already exists so we use "edit" rather than "add"
    // if a previous session already wrote it.
    let resolvedOldObjectId = oldObjectId;
    if (content !== null && !resolvedOldObjectId) {
      const existing = await this.readGitFile(project, repoId, filePath, branch);
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
      refUpdates: [{ name: `refs/heads/${branch}`, oldObjectId: oldRefObjectId }],
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

  async getWikiPagesForProject(project) {
    try {
      const wikis = await this.listWikis(project);
      const all = [];
      for (const wiki of wikis) {
        const url = `${this.base}/${encodeURIComponent(project)}/_apis/wiki/wikis/${encodeURIComponent(wiki.id)}/pages?api-version=7.1&recursionLevel=full`;
        try {
          const r = await this._fetch(url);
          const flatten = (pages) => {
            for (const p of (pages || [])) {
              const pagePath = (p.path || "").replace(/\.md$/i, "");
              all.push({
                id: `${wiki.id}:${pagePath}`,
                path: pagePath,
                name: (p.path || "").split("/").pop()?.replace(/\.md$/i, "") || "",
                wikiId: wiki.id,
                _wikiId: wiki.id,
                _wikiName: wiki.name,
                _pageId: p.id,
                wikiName: wiki.name,
                project,
                _projectName: project,
              });
              if (p.subPages) flatten(p.subPages);
            }
          };
          flatten(r.value);
        } catch { /* skip failed wiki */ }
      }
      return all;
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

  // ── Wiki Search API ──────────────────────────────────────────────────────

  /**
   * Search wiki pages using the ADO almsearch API.
   * Always uses server-side full-text search. projects is optional —
   * omit to search the entire org.
   */
  async searchWikiPages(searchText, projectNames = []) {
    const body = { searchText, $top: 20 };
    if (projectNames.length) {
      body.filters = { Project: projectNames };
    }
    const searchBase = `https://almsearch.dev.azure.com/${encodeURIComponent(this.org)}`;
    const r = await this._fetch(
      `${searchBase}/_apis/search/wikisearchresults?api-version=7.1`,
      { method: "POST", body: JSON.stringify(body) }
    );
    return (r.results || []).map(result => {
      const pagePath = (result.path || "").replace(/\.md$/i, "");
      return {
        id: `${result.wiki?.id || ""}:${pagePath}`,
        path: pagePath,
        name: (result.fileName || "").replace(/\.md$/i, ""),
        wikiId: result.wiki?.id || "",
        _wikiId: result.wiki?.id || "",
        _wikiName: result.wiki?.name || "",
        _pageId: null,
        wikiName: result.wiki?.name || "",
        project: result.project?.name || "",
        _projectName: result.project?.name || "",
      };
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
    const cacheKey = `wiki:content:${wikiId}:${pagePath || apiPageId}`;
    return this._cachedFetch(cacheKey, async () => {
      try {
        const projectPart = projectName ? `${encodeURIComponent(projectName)}/` : "";
        let url;
        if (apiPageId) {
          url = `${this.base}/${projectPart}_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages/${encodeURIComponent(apiPageId)}?includeContent=true&api-version=7.1`;
        } else {
          url = `${this.base}/${projectPart}_apis/wiki/wikis/${encodeURIComponent(wikiId)}/pages?path=${encodeURIComponent(pagePath)}&includeContent=true&api-version=7.1`;
        }
        const r = await this._fetch(url);
        let content = r.content;
        if (content && typeof content !== "string") {
          content = typeof content === "object" ? JSON.stringify(content) : String(content);
        }
        return content || "";
      } catch {
        return "";
      }
    });
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

  /**
   * Fetch the expanded YAML for a pipeline's most recent completed run.
   * Falls back to fetching the pipeline configuration repository file.
   */
  async getPipelineYaml(project, pipelineId) {
    // 1. Get recent runs
    const runs = await this.getPipelineRuns(project, pipelineId);
    const completed = (runs || []).find(r =>
      r.state === "completed" || r.result === "succeeded" ||
      r.result === "failed"  || r.result === "cancelled"
    ) || runs?.[0];
    if (!completed) throw new Error("No runs found for pipeline");

    // 2. Fetch the expanded YAML for that run
    return this._fetchText(
      `${this.base}/${encodeURIComponent(project)}/_apis/pipelines/${encodeURIComponent(pipelineId)}/runs/${encodeURIComponent(completed.id)}?$expand=finalYaml&api-version=7.1`
    );
  }

  /**
   * Concatenate all log segments for a build into a single string.
   */
  async getFullBuildLog(project, buildId) {
    const entries = await this.getBuildLogs(project, buildId);
    if (!entries.length) return "";
    const parts = await Promise.all(
      entries.map(e => this.getBuildLog(project, buildId, e.id).catch(() => ""))
    );
    return parts.join("\n");
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

  // ── Work Item CRUD (for workflows) ─────────────────────────────────────────

  /**
   * Create a child work item linked to a parent via hierarchy relation.
   * Uses the JSON Patch content type required by the WI PATCH API.
   */
  async createChildWorkItem(project, parentId, type, title, description, fields = {}) {
    const ops = [
      { op: "add", path: "/fields/System.Title", value: title },
    ];
    if (description) {
      ops.push({ op: "add", path: "/fields/System.Description", value: description });
    }
    for (const [key, val] of Object.entries(fields)) {
      ops.push({ op: "add", path: `/fields/${key}`, value: val });
    }
    // Link to parent
    ops.push({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "System.LinkTypes.Hierarchy-Reverse",
        url: `${this.base}/${encodeURIComponent(project)}/_apis/wit/workItems/${parentId}`,
      },
    });

    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.1`,
      {
        method: "PATCH",
        contentType: "application/json-patch+json",
        body: JSON.stringify(ops),
      }
    );
  }

  /**
   * Get child work items of a parent via WIQL.
   */
  async getChildWorkItems(project, parentId) {
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.Parent] = ${parentId}`;
    const r = await this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.1`,
      { method: "POST", body: JSON.stringify({ query: wiql }) }
    );
    if (!r.workItems?.length) return [];
    const ids = r.workItems.map(w => w.id).join(",");
    const fields = [
      "System.Id","System.Title","System.WorkItemType","System.State",
      "System.AssignedTo","System.Tags","System.ChangedDate",
    ].join(",");
    const detail = await this._fetch(
      `${this.base}/_apis/wit/workitems?ids=${ids}&fields=${fields}&api-version=7.1`
    );
    return detail.value || [];
  }

  /**
   * Update a work item field via JSON Patch.
   */
  async updateWorkItemField(project, wiId, field, value) {
    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/wit/workitems/${wiId}?api-version=7.1`,
      {
        method: "PATCH",
        contentType: "application/json-patch+json",
        body: JSON.stringify([{ op: "replace", path: `/fields/${field}`, value }]),
      }
    );
  }

  /**
   * Update a work item's state.
   */
  async updateWorkItemState(project, wiId, newState) {
    return this.updateWorkItemField(project, wiId, "System.State", newState);
  }

  /**
   * Add a tag to a work item.
   */
  async addWorkItemTag(project, wiId, tag) {
    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/wit/workitems/${wiId}/tags/${encodeURIComponent(tag)}?api-version=7.1`,
      { method: "POST" }
    );
  }

  /**
   * Get a work item with its relations (parent/child links).
   */
  async getWorkItemWithRelations(project, wiId) {
    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/wit/workitems/${wiId}?$expand=relations&api-version=7.1`
    );
  }

  // ── Pipeline Run & Approvals ───────────────────────────────────────────────

  /**
   * Trigger a pipeline run with optional template parameters.
   */
  async runPipeline(project, pipelineId, templateParameters = {}) {
    const body = {};
    if (Object.keys(templateParameters).length) {
      body.templateParameters = templateParameters;
    }
    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/pipelines/${encodeURIComponent(pipelineId)}/runs?api-version=7.1`,
      { method: "POST", body: JSON.stringify(body) }
    );
  }

  /**
   * Get pending approvals for the current user.
   */
  async getPendingApprovals(project) {
    try {
      const url = project
        ? `${this.base}/${encodeURIComponent(project)}/_apis/pipelines/approvals?statusFilter=pending&api-version=7.1`
        : `${this.base}/_apis/pipelines/approvals?statusFilter=pending&api-version=7.1`;
      const r = await this._fetch(url);
      return r.value || [];
    } catch { return []; }
  }

  /**
   * Respond to a pipeline approval (approve or reject).
   */
  async respondToApproval(project, approvalId, status, comment = "") {
    return this._fetch(
      `${this.base}/${encodeURIComponent(project)}/_apis/pipelines/approvals/${encodeURIComponent(approvalId)}?api-version=7.1`,
      {
        method: "PATCH",
        body: JSON.stringify({ status, comment }),
      }
    );
  }
}
