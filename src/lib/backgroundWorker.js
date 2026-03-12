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

    // Fetch latest run for each pipeline (limited concurrency)
    try {
      const runsMap = {};
      const pipelineFetchers = (await (async () => {
        try { return await this.client.getPipelines(projectName); } catch { return []; }
      })()).map(pl => async () => {
        try {
          // Prefer the builds endpoint because it reliably includes repository
          // and branch information needed by the UI. Fall back to pipeline
          // runs if builds returns nothing.
          let runs = [];
          try {
            runs = await this.client.getBuildRuns(projectName, pl.id);
          } catch (e) {
            // ignore and try pipeline runs below
          }
          if (!runs || runs.length === 0) {
            try {
              runs = await this.client.getPipelineRuns(projectName, pl.id);
            } catch (e) {
              runs = [];
            }
          }
          runsMap[pl.id] = (runs && runs[0]) || null;
        } catch (e) {
          runsMap[pl.id] = null;
        }
      });

      for (let i = 0; i < pipelineFetchers.length; i += BATCH_SIZE) {
        const chunk = pipelineFetchers.slice(i, i + BATCH_SIZE).map(fn => fn());
        await Promise.all(chunk);
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
