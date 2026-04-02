import { cache } from "../lib";
import { getWorkerTypes } from "./resourceTypes";
import { fetchForProject } from "./resourceApi";

const TICK_INTERVAL = 2 * 60 * 1000;
const BATCH_SIZE = 5;
const CACHE_TTL = 5 * 60 * 1000;
const RUNS_TTL = 60 * 1000; // 1 minute for latest pipeline runs

class BackgroundWorker {
  constructor() {
    this.client = null;
    this.projects = [];
    this.currentIndex = 0;
    this.scopedProjectNames = new Set();
    this.projectStatus = {};
    this.intervalId = null;
    this.isRunning = false;
    this.isLeader = false;
    this.isPaused = false;
    this.activityLog = [];
    this.lastRefresh = null;
    this.lastPipelineRunsRefresh = null;
    this.listeners = new Set();
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  setClient(client) {
    this.client = client;
    this.loadProjects();
  }

  setCollections(collections) {
    const names = new Set();
    for (const col of collections) {
      for (const p of col.projects || []) {
        names.add(p);
      }
    }
    this.scopedProjectNames = names;
    for (const name of Object.keys(this.projectStatus)) {
      this.projectStatus[name].scoped = names.has(name);
    }
  }

  _getProjectStatus(projectName) {
    if (!this.projectStatus[projectName]) {
      this.projectStatus[projectName] = {
        scoped: this.scopedProjectNames.has(projectName),
        lastRefresh: null,
        resources: {
          repos: { status: "pending", error: null, timestamp: null },
          pipelines: { status: "pending", error: null, timestamp: null },
          pipelineRuns: { status: "pending", error: null, timestamp: null },
          pullRequests: { status: "pending", error: null, timestamp: null },
          testRuns: { status: "pending", error: null, timestamp: null },
          serviceConnections: { status: "pending", error: null, timestamp: null },
        },
      };
    }
    return this.projectStatus[projectName];
  }

  _markResource(projectName, resource, error) {
    const ps = this._getProjectStatus(projectName);
    ps.resources[resource] = {
      status: error ? "error" : "ok",
      error: error ? error.message || String(error) : null,
      timestamp: new Date().toISOString(),
    };
  }

  async loadProjects() {
    if (!this.client) return;
    try {
      const incoming = await this.client.getProjects();
      // Reset rotation index when the project list changes
      const names = p => p.map(x => x.id).join(",");
      if (names(incoming) !== names(this.projects)) {
        this.currentIndex = 0;
      }
      this.projects = incoming;
      if (this.currentIndex >= this.projects.length) {
        this.currentIndex = 0;
      }
    } catch (e) {
      this.log(`Failed to load projects: ${e.message}`);
    }
  }

  log(message) {
    const entry = { message, timestamp: new Date().toISOString() };
    this.activityLog.unshift(entry);
    if (this.activityLog.length > 50) {
      this.activityLog.pop();
    }
    this.notify();
  }

  notify() {
    this.listeners.forEach(cb => cb({
      activityLog: this.activityLog,
      lastRefresh: this.lastRefresh,
      lastPipelineRunsRefresh: this.lastPipelineRunsRefresh,
      isRunning: this.isRunning,
      isLeader: this.isLeader,
      projectStatus: this.projectStatus,
      projects: this.projects,
      scopedProjectNames: this.scopedProjectNames,
    }));
  }

  subscribe(callback) {
    this.listeners.add(callback);
    callback({
      activityLog: this.activityLog,
      lastRefresh: this.lastRefresh,
      lastPipelineRunsRefresh: this.lastPipelineRunsRefresh,
      isRunning: this.isRunning,
      isLeader: this.isLeader,
      projectStatus: this.projectStatus,
      projects: this.projects,
      scopedProjectNames: this.scopedProjectNames,
    });
    return () => this.listeners.delete(callback);
  }

  async acquireLeadership() {
    const ctrl = new AbortController();
    this._releaseLock = () => ctrl.abort();
    navigator.locks.request("ado-background-worker", { signal: ctrl.signal }, async () => {
      this.isLeader = true;
      this.notify();
      this.log("This tab is the sync leader");
      await this.start();
      // Lock is held as long as this promise is pending
      return new Promise(() => {});
    }).catch(() => {
      // Lock rejected or released
      this.isLeader = false;
      this.notify();
    });
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isLeader = true;
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    this.log("Background worker started");
    this.notify();
    await this.loadProjects();
    this.tick();
    this.intervalId = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.isLeader = false;
    if (this._releaseLock) {
      this._releaseLock();
      this._releaseLock = null;
    }
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.log("Background worker stopped");
    this.notify();
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.isPaused = true;
      this.log("Worker paused (tab hidden)");
    } else {
      if (this.isPaused) {
        this.isPaused = false;
        this.log("Worker resumed (tab visible)");
        this.loadProjects();
        this.tick();
      }
    }
    this.notify();
  }

  getBatch() {
    if (!this.projects.length) return [];

    const scoped = this.projects.filter(p => this.scopedProjectNames.has(p.name));
    const nonScoped = this.projects.filter(p => !this.scopedProjectNames.has(p.name));

    const batch = [];
    const count = Math.min(BATCH_SIZE, this.projects.length);

    // Scoped projects always refreshed first
    for (const p of scoped) {
      if (batch.length >= count) break;
      batch.push(p);
    }

    // Fill remaining slots from non-scoped, rotating via currentIndex
    if (batch.length < count && nonScoped.length) {
      const remaining = count - batch.length;
      for (let i = 0; i < remaining; i++) {
        const idx = (this.currentIndex + i) % nonScoped.length;
        batch.push(nonScoped[idx]);
      }
      this.currentIndex = (this.currentIndex + remaining) % nonScoped.length;
    }

    return batch;
  }

  async tick() {
    if (!this.client || !this.projects.length) {
      await this.loadProjects();
      return;
    }

    const batch = this.getBatch();
    if (!batch.length) return;

    const projectNames = batch.map(p => p.name).join(", ");
    this.log(`Refreshing ${batch.length} projects: ${projectNames}`);

    for (const project of batch) {
      try {
        await this.refreshProject(project.name);
      } catch (e) {
        this.log(`Error refreshing ${project.name}: ${e.message}`);
      }
    }

    this.lastRefresh = new Date().toISOString();
    this.log(`Refresh complete for ${batch.length} projects`);
    this.notify();
  }

  async refreshProject(projectName) {
    const keyPrefix = `project:${projectName}:`;
    const ps = this._getProjectStatus(projectName);
    ps.scoped = this.scopedProjectNames.has(projectName);

    // Registry-driven refresh for generic REST types
    const workerTypes = getWorkerTypes();
    for (const rt of workerTypes) {
      const cacheKey = rt.worker?.cacheKey;
      if (!cacheKey || rt.source?.type !== "rest") continue;

      // Skip types with special handling (pipeline runs are handled separately below)
      if (cacheKey === "pipelineRuns" || cacheKey === "pipelines" || cacheKey === "repos" || cacheKey === "prs" || cacheKey === "testRuns" || cacheKey === "serviceConnections") continue;

      try {
        const items = await fetchForProject(this.client, rt, projectName);
        items.forEach(item => { item._projectName = projectName; });
        cache.set(keyPrefix + cacheKey, items, CACHE_TTL);
        this._markResource(projectName, cacheKey, null);
      } catch (e) {
        this._markResource(projectName, cacheKey, e);
      }
    }

    // Keep existing hardcoded handlers for types with complex logic (repos, pipelines, PRs, etc.)
    let repos = [];
    try {
      repos = await this.client.getRepos(projectName);
      repos.forEach(r => { r._projectName = projectName; });
      cache.set(keyPrefix + "repos", repos, CACHE_TTL);
      this._markResource(projectName, "repos", null);
    } catch (e) { this._markResource(projectName, "repos", e); }

    let pipelines = [];
    try {
      pipelines = await this.client.getPipelines(projectName);
      pipelines.forEach(p => { p._projectName = projectName; });
      cache.set(keyPrefix + "pipelines", pipelines, CACHE_TTL);
      this._markResource(projectName, "pipelines", null);
    } catch (e) { this._markResource(projectName, "pipelines", e); }

    // Fetch latest run for each pipeline using a batched builds call.
    let runsError = null;
    try {
      const runsMap = {};
      if (pipelines.length) {
        // Batch definition IDs into chunks to reduce requests
        const defIds = pipelines.map(p => p.id);
        const CHUNK_DEFS = 20;
        for (let i = 0; i < defIds.length; i += CHUNK_DEFS) {
          const chunk = defIds.slice(i, i + CHUNK_DEFS);
          try {
            const map = await this.client.getBuildRunsForDefinitions(projectName, chunk, 3);
            // map: definitionId -> array of builds (newest first) or []
            // Ensure keys are strings when merging
            for (const k of Object.keys(map)) runsMap[String(k)] = map[k];
          } catch (e) {
            // On failure, mark these ids as empty arrays and continue
            for (const id of chunk) runsMap[String(id)] = [];
          }
        }

        // For any definitions with no builds returned, fall back to pipeline runs
        const missing = Object.keys(runsMap).filter(k => runsMap[k] == null || (Array.isArray(runsMap[k]) && runsMap[k].length === 0));
        if (missing.length) {
          for (let i = 0; i < missing.length; i += BATCH_SIZE) {
            const chunk = missing.slice(i, i + BATCH_SIZE);
            await Promise.all(chunk.map(async (defId) => {
              try {
                const r = await this.client.getPipelineRuns(projectName, defId);
                // store an array (may be empty) to keep shape consistent
                runsMap[String(defId)] = (r && r) || [];
              } catch (e) {
                runsMap[String(defId)] = [];
              }
            }));
          }
        }
      }

      cache.set(keyPrefix + "pipelineRuns", runsMap, RUNS_TTL);
      this.lastPipelineRunsRefresh = new Date().toISOString();
      this._markResource(projectName, "pipelineRuns", null);
    } catch (e) {
      runsError = e;
      this.log(`Failed to fetch pipeline runs for ${projectName}: ${e.message}`);
      this._markResource(projectName, "pipelineRuns", e);
    }

    try {
      const prs = await this.client.getPullRequests(projectName);
      prs.forEach(pr => { pr._projectName = projectName; });
      cache.set(keyPrefix + "prs", prs, CACHE_TTL);
      this._markResource(projectName, "pullRequests", null);
    } catch (e) { this._markResource(projectName, "pullRequests", e); }

    try {
      const testRuns = await this.client.getTestRuns(projectName);
      cache.set(keyPrefix + "testRuns", testRuns, CACHE_TTL);
      this._markResource(projectName, "testRuns", null);
    } catch (e) { this._markResource(projectName, "testRuns", e); }

    try {
      const serviceConnections = await this.client.getServiceConnections(projectName);
      serviceConnections.forEach(sc => { sc._projectName = projectName; });
      cache.set(keyPrefix + "serviceConnections", serviceConnections, CACHE_TTL);
      this._markResource(projectName, "serviceConnections", null);
    } catch (e) { this._markResource(projectName, "serviceConnections", e); }

    ps.lastRefresh = new Date().toISOString();
  }
}

const backgroundWorker = new BackgroundWorker();
export default backgroundWorker;
