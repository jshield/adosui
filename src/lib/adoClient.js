import { cache, CACHE_TTL, API_PROXY } from "../lib";

export class ADOClient {
  constructor(org, pat) {
    this.org = org.trim().replace(/\/$/, "");
    this.pat = pat;
    this.base = `https://dev.azure.com/${encodeURIComponent(this.org)}`;
    this.feedsBase = `https://feeds.dev.azure.com/${encodeURIComponent(this.org)}`;
    this._auth = `Basic ${btoa(":" + pat)}`;
    this._projects = [];
  }

  clearCache() {
    cache.clear();
    this._projects = [];
  }

  _getEndpoint(url) {
    return API_PROXY;
  }

  _getHeaders(opts = {}) {
    const headers = {
      "Authorization": this._auth,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Target-URL": opts.targetUrl || "",
    };
    return headers;
  }

  async _fetch(url, opts = {}) {
    const endpoint = this._getEndpoint(url);
    const fetchOpts = {
      method: opts.method || "GET",
      headers: this._getHeaders({ ...opts, targetUrl: url }),
      body: opts.body || undefined,
    };
    
    const res = await fetch(endpoint, fetchOpts);
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
      "System.ChangedDate","System.AreaPath",
    ].join(",");
    const detail = await this._fetch(
      `${this.base}/_apis/wit/workitems?ids=${ids.join(",")}&fields=${fields}&api-version=7.1`
    );
    return detail.value || [];
  }

  async getAllRepos(forceRefresh = false) {
    if (forceRefresh) cache.invalidate("repos-");
    return this._cachedFetch("repos-all", async () => {
      if (!this._projects.length) await this.getProjects();
      const all = [];
      for (const p of this._projects.slice(0, 10)) {
        try { all.push(...await this.getRepos(p.name)); } catch {}
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
        try { all.push(...await this.getPullRequests(p.name)); } catch {}
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

  async getProfile() {
    return this._cachedFetch("profile", () =>
      this._fetch(`https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1`)
    );
  }

  _patHash() {
    const enc = new TextEncoder().encode(this.pat);
    return crypto.subtle.digest("SHA-256", enc).then(buf =>
      Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
    );
  }

  async loadCollections(profileId) {
    try {
      const res = await fetch("/collections", {
        method: "GET",
        headers: {
          "Authorization": this._auth,
          "X-Profile-Id": profileId,
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data.collections) ? data.collections : null;
    } catch { return null; }
  }

  async saveCollections(profileId, collections) {
    try {
      const patHash = await this._patHash();
      await fetch("/collections", {
        method: "PUT",
        headers: {
          "Authorization": this._auth,
          "Content-Type": "application/json",
          "X-Profile-Id": profileId,
          "X-Pat-Hash": patHash,
        },
        body: JSON.stringify({ collections }),
      });
    } catch { /* fire-and-forget */ }
  }
}
