import { cache } from "../lib";

const TICK_INTERVAL = 2 * 60 * 1000;
const BATCH_SIZE = 5;
const CACHE_TTL = 5 * 60 * 1000;
const RUNS_TTL = 60 * 1000; // 1 minute for latest pipeline runs

class BackgroundWorker {
  constructor() {
    this.client = null;
    this.projects = [];
    this.currentIndex = 0;
    this.intervalId = null;
    this.isRunning = false;
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
    }));
  }

  subscribe(callback) {
    this.listeners.add(callback);
    callback({
      activityLog: this.activityLog,
      lastRefresh: this.lastRefresh,
      lastPipelineRunsRefresh: this.lastPipelineRunsRefresh,
      isRunning: this.isRunning,
    });
    return () => this.listeners.delete(callback);
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
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
    const count = Math.min(BATCH_SIZE, this.projects.length);
    const batch = [];
    for (let i = 0; i < count; i++) {
      const idx = (this.currentIndex + i) % this.projects.length;
      batch.push(this.projects[idx]);
    }
    this.currentIndex = (this.currentIndex + count) % this.projects.length;
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

    try {
      const repos = await this.client.getRepos(projectName);
      cache.set(keyPrefix + "repos", repos, CACHE_TTL);
    } catch (e) {}

    try {
      const pipelines = await this.client.getPipelines(projectName);
      cache.set(keyPrefix + "pipelines", pipelines, CACHE_TTL);
    } catch (e) {}

    // Fetch latest run for each pipeline using a batched builds call.
    try {
      const runsMap = {};
      let pipelines = [];
      try {
        pipelines = await this.client.getPipelines(projectName);
      } catch (e) {
        pipelines = [];
      }

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
    } catch (e) {
      this.log(`Failed to fetch pipeline runs for ${projectName}: ${e.message}`);
    }

    try {
      const prs = await this.client.getPullRequests(projectName);
      cache.set(keyPrefix + "prs", prs, CACHE_TTL);
    } catch (e) {}

    try {
      const testRuns = await this.client.getTestRuns(projectName);
      cache.set(keyPrefix + "testRuns", testRuns, CACHE_TTL);
    } catch (e) {}

    try {
      const serviceConnections = await this.client.getServiceConnections(projectName);
      cache.set(keyPrefix + "serviceConnections", serviceConnections, CACHE_TTL);
    } catch (e) {}

    try {
      const wikiPages = await this.client.getWikiPagesForProject(projectName);
      cache.set(keyPrefix + "wikiPages", wikiPages, CACHE_TTL);
    } catch (e) {}
  }
}

const backgroundWorker = new BackgroundWorker();
export default backgroundWorker;
