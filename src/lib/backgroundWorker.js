import { cache } from "../lib";
import { getWorkerTypes } from "./resourceTypes";
import { fetchForProject } from "./resourceApi";

const TICK_INTERVAL = 2 * 60 * 1000;
const BATCH_SIZE = 5;
const CACHE_TTL = 5 * 60 * 1000;
const RUNS_TTL = 60 * 1000; // 1 minute for latest pipeline runs
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s with jitter
const SETTINGS_KEY = "ado-superui-worker-settings";

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
    
    // Settings with localStorage persistence
    this.settings = {
      enabled: false,
      mode: "scoped", // "all" | "scoped" | "specific"
      specificProjects: new Set(),
    };
    this._loadSettings();
    
    // Request queue and state
    this._requestQueue = [];
    this._inFlight = new Map();
    this._progress = new Map();
    this._processing = false;
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

  _loadSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.settings = {
          enabled: parsed.enabled ?? false,
          mode: parsed.mode || "scoped",
          specificProjects: new Set(parsed.specificProjects || []),
        };
        this.log(`Settings loaded: enabled=${this.settings.enabled}, mode=${this.settings.mode}, specificCount=${this.settings.specificProjects.size}`);
      }
    } catch (e) {
      this.log(`Failed to load settings: ${e.message}`);
    }
  }

  _saveSettings() {
    try {
      const toSave = {
        enabled: this.settings.enabled,
        mode: this.settings.mode,
        specificProjects: [...this.settings.specificProjects],
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave));
    } catch (e) {
      this.log(`Failed to save settings: ${e.message}`);
    }
  }

  setSettings(newSettings) {
    const prevEnabled = this.settings.enabled;
    this.settings = {
      ...this.settings,
      ...newSettings,
      specificProjects: newSettings.specificProjects instanceof Set
        ? newSettings.specificProjects
        : new Set(newSettings.specificProjects || []),
    };
    this._saveSettings();
    this.log(`Settings updated: enabled=${this.settings.enabled}, mode=${this.settings.mode}, specificCount=${this.settings.specificProjects.size}`);
    
    if (!prevEnabled && this.settings.enabled && this.isRunning) {
      this.tick();
    }
    
    if (prevEnabled && !this.settings.enabled) {
      this.log("Background refresh disabled - stopping tick");
    }
    
    this.notify();
  }

  getSettings() {
    return {
      enabled: this.settings.enabled,
      mode: this.settings.mode,
      specificProjects: new Set(this.settings.specificProjects),
    };
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
    this.listeners.forEach(cb => cb(this.getState()));
  }

  // DATA GETTERS — read from cache internally, views use these instead of cache.get()

  getPipelines(projects) {
    const all = [];
    for (const project of (projects || [])) {
      const cached = cache.get(`worker:pipelines:${project}`);
      if (cached) {
        all.push(...(cached.items || cached.data?.items || cached.data || []));
      }
    }
    return all;
  }

  getPipelineRuns(project) {
    const cached = cache.get(`worker:pipelineRuns:${project}`);
    if (!cached) return {};
    return cached.items || cached.data?.items || cached.data || {};
  }

  getRepos(projects) {
    const key = (projects || []).sort().join(',') || 'all';
    const cached = cache.get(`worker:repos:${key}`);
    if (!cached) return [];
    return cached.items || cached.data?.items || cached.data || [];
  }

  getPRs(projects) {
    const key = (projects || []).sort().join(',') || 'all';
    const cached = cache.get(`worker:prs:${key}`);
    if (!cached) return [];
    return cached.items || cached.data?.items || cached.data || [];
  }

  getServiceConnections(projects) {
    const key = (projects || []).sort().join(',') || 'all';
    const cached = cache.get(`worker:serviceConnections:${key}`);
    if (!cached) return [];
    return cached.items || cached.data?.items || cached.data || [];
  }

  getWorkItems(ids) {
    if (!ids?.length) return [];
    const key = ids.sort().join(',');
    const cached = cache.get(`worker:workitems:${key}`);
    if (!cached) return [];
    return cached.items || cached.data?.items || cached.data || [];
  }

  // NEW: Request API - called by UI components
  request(type, params = {}) {
    const req = {
      type,
      params,
      priority: params.priority || 'background',
      timestamp: Date.now(),
      key: this._getRequestKey(type, params),
    };
    
    this.log(`REQUEST: ${type} key=${req.key} priority=${req.priority} params=${JSON.stringify(params).slice(0, 50)}`);
    
    // Dedupe: if already queued, don't add again
    const existingQueued = this._requestQueue.find(r => r.key === req.key);
    if (existingQueued) {
      this.log(`REQUEST SKIPPED (already queued): ${type} key=${req.key}`);
      return;
    }
    
    // Dedupe: if in flight, don't add again
    if (this._inFlight.has(req.key)) {
      this.log(`REQUEST SKIPPED (in flight): ${type} key=${req.key}`);
      return;
    }
    
    // Check cache first — if all data is cached, notify immediately without queuing
    if (this._isCacheHit(type, params)) {
      this.log(`CACHE HIT: ${type} key=${req.key} — notifying immediately`);
      this.notify();
      return;
    }
    
    if (req.priority === 'user') {
      this._requestQueue.unshift(req);
    } else {
      this._requestQueue.push(req);
    }
    
    this.log(`REQUEST ADDED to queue: ${type}, queue length=${this._requestQueue.length}`);
    this.notify();
    this._processQueue();
  }

  _isCacheHit(type, params) {
    if (type === 'pipelines' && params.projects?.length) {
      return params.projects.every(p => cache.get(`worker:pipelines:${p}`) !== null);
    }
    if (type === 'pipelineRuns' && params.project) {
      return cache.get(`worker:pipelineRuns:${params.project}`) !== null;
    }
    if (type === 'repos' && params.projects?.length) {
      const key = params.projects.sort().join(',') || 'all';
      return cache.get(`worker:repos:${key}`) !== null;
    }
    if (type === 'prs' && params.projects?.length) {
      const key = params.projects.sort().join(',') || 'all';
      return cache.get(`worker:prs:${key}`) !== null;
    }
    if (type === 'serviceConnections' && params.projects?.length) {
      const key = params.projects.sort().join(',') || 'all';
      return cache.get(`worker:serviceConnections:${key}`) !== null;
    }
    if (type === 'workitems' && params.ids?.length) {
      const key = params.ids.sort().join(',');
      return cache.get(`worker:workitems:${key}`) !== null;
    }
    return false;
  }

  // NEW: Get full state for UI
  getState() {
    const inFlightList = [];
    for (const [key, entry] of this._inFlight) {
      inFlightList.push({
        key,
        type: entry.request.type,
        params: entry.request.params,
        priority: entry.request.priority,
        progress: this._progress.get(key) || null,
        retry: entry.retry || 0,
      });
    }
    
    const queueList = this._requestQueue.map(req => ({
      type: req.type,
      params: req.params,
      priority: req.priority,
      timestamp: req.timestamp,
      key: req.key,
    }));
    
    return {
      activityLog: this.activityLog,
      lastRefresh: this.lastRefresh,
      lastPipelineRunsRefresh: this.lastPipelineRunsRefresh,
      isRunning: this.isRunning,
      isLeader: this.isLeader,
      projectStatus: this.projectStatus,
      projects: this.projects,
      scopedProjectNames: this.scopedProjectNames,
      inFlight: inFlightList,
      requestQueue: queueList,
      settings: this.getSettings(),
    };
  }

  // Get state enriched with data from cache — used by views
  getFullState(params = {}) {
    const base = this.getState();
    const projects = params.projects || this.scopedProjectNames ? [...this.scopedProjectNames] : [];
    
    return {
      ...base,
      pipelines: this.getPipelines(projects),
      pipelineRuns: projects.length > 0
        ? Object.assign({}, ...projects.map(p => this.getPipelineRuns(p)))
        : {},
      repos: this.getRepos(projects),
      prs: this.getPRs(projects),
      serviceConnections: this.getServiceConnections(projects),
    };
  }

  // NEW: Update progress for a request
  _setProgress(key, progress) {
    this._progress.set(key, progress);
    this.notify();
  }

  _getRequestKey(type, params) {
    if (params.ids?.length) return `${type}:ids:${params.ids.sort().join(',')}`;
    if (params.query) return `${type}:q:${params.query}`;
    if (params.projects?.length) return `${type}:${params.projects.sort().join(',')}`;
    if (params.project) return `${type}:proj:${params.project}`;
    return type;
  }

  async _processQueue() {
    this.log(`PROCESS QUEUE: _processing=${this._processing} queue.length=${this._requestQueue.length}`);
    if (this._processing || !this._requestQueue.length) return;
    this._processing = true;
    
    while (this._requestQueue.length) {
      const req = this._requestQueue.shift();
      this.log(`DEQUEUED: ${req.type} key=${req.key}, remaining=${this._requestQueue.length}`);
      await this._executeRequest(req);
    }
    
    this._processing = false;
    this.log(`QUEUE DONE: _processing=${this._processing}`);
  }

  async _executeRequest(req) {
    const { key } = req;
    
    this.log(`EXECUTE REQUEST: ${req.type} key=${key}`);
    
    // Dedupe: skip if already in flight
    if (this._inFlight.has(key)) {
      this.log(`SKIP (already in flight): ${key}`);
      return;
    }
    
    const entry = {
      promise: null,
      request: req,
      retry: 0,
    };
    
    const promise = this._doFetchWithRetry(req);
    entry.promise = promise;
    this._inFlight.set(key, entry);
    this.log(`IN FLIGHT: ${req.type} key=${key}, inFlight.size=${this._inFlight.size}`);
    this.notify();
    
    try {
      await promise;
      this.log(`COMPLETED: ${req.type} key=${key}`);
    } catch (e) {
      this.log(`Request failed: ${req.type} - ${e.message}`);
    } finally {
      this._inFlight.delete(key);
      this._progress.delete(key);
      this.log(`REMOVED FROM FLIGHT: ${key}, remaining=${this._inFlight.size}`);
      this.notify();
    }
  }

  async _doFetchWithRetry(req) {
    const { type, params } = req;
    
    this.log(`FETCH: ${type} with params: ${JSON.stringify(params).slice(0, 80)}`);
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (type === 'search:workitem') {
          return await this._searchWorkItems(params.query, params.projects);
        } else if (type === 'search:repo') {
          return await this._searchRepos(params.query, params.projects);
        } else if (type === 'repos') {
          return await this._fetchRepos(params.projects);
        } else if (type === 'pipelines') {
          return await this._fetchPipelines(params.projects);
        } else if (type === 'pipelineRuns') {
          return await this._fetchPipelineRuns(params.project, params.pipelineIds);
        } else if (type === 'workitems') {
          return await this._fetchWorkItems(params.ids);
        } else if (type === 'prs') {
          return await this._fetchPRs(params.projects);
        } else if (type === 'serviceConnections') {
          return await this._fetchServiceConnections(params.projects);
        } else {
          this.log(`UNKNOWN TYPE: ${type} - not handled`);
          return [];
        }
      } catch (e) {
        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAYS[attempt] + Math.random() * 500;
          this.log(`Retry ${attempt + 1}/${MAX_RETRIES} for ${type}: ${e.message}`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
  }

  async _searchWorkItems(query, projects) {
    const projectsKey = (projects || []).sort().join(',') || 'all';
    const workerKey = `worker:search:workitem:${projectsKey}:q:${query}`;
    
    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this.loadProjects();
      projectNames = this.projects.map(p => p.name);
    }
    
    const total = projectNames.length;
    let searched = 0;
    const allItems = [];
    
    for (const projectName of projectNames) {
      try {
        const items = await this.client.searchWorkItems(query, {}, [projectName]);
        allItems.push(...items);
      } catch (e) {
        // Continue on error
      }
      
      searched++;
      this._setProgress(workerKey, {
        current: searched,
        total,
        percent: Math.round((searched / total) * 100),
        currentProject: projectName,
      });
    }
    
    cache.set(workerKey, { items: allItems, _timestamp: Date.now() }, CACHE_TTL);
    return allItems;
  }

  async _searchRepos(query, projects) {
    const projectsKey = (projects || []).sort().join(',') || 'all';
    const workerKey = `worker:search:repo:${projectsKey}:q:${query}`;
    
    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this.loadProjects();
      projectNames = this.projects.map(p => p.name);
    }
    
    const total = projectNames.length;
    let searched = 0;
    const allItems = [];
    
    for (const projectName of projectNames) {
      try {
        const repos = await this.client.getRepos(projectName);
        const filtered = repos.filter(r => 
          r.name?.toLowerCase().includes(query.toLowerCase())
        );
        filtered.forEach(r => { r._projectName = projectName; });
        allItems.push(...filtered);
      } catch (e) {
        // Continue on error
      }
      
      searched++;
      this._setProgress(workerKey, {
        current: searched,
        total,
        percent: Math.round((searched / total) * 100),
        currentProject: projectName,
      });
    }
    
    cache.set(workerKey, { items: allItems, _timestamp: Date.now() }, CACHE_TTL);
    return allItems;
  }

  async _fetchRepos(projects) {
    const projectsKey = (projects || []).sort().join(',') || 'all';
    const workerKey = `worker:repos:${projectsKey}`;
    
    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this.loadProjects();
      projectNames = this.projects.map(p => p.name);
    }
    
    const total = projectNames.length;
    let searched = 0;
    const allItems = [];
    
    for (const projectName of projectNames) {
      try {
        const repos = await this.client.getRepos(projectName);
        repos.forEach(r => { r._projectName = projectName; });
        allItems.push(...repos);
      } catch (e) {
        // Continue on error
      }
      
      searched++;
      this._setProgress(workerKey, {
        current: searched,
        total,
        percent: Math.round((searched / total) * 100),
        currentProject: projectName,
      });
    }
    
    cache.set(workerKey, { items: allItems, _timestamp: Date.now() }, CACHE_TTL);
    return allItems;
  }

  async _fetchPipelines(projects) {
    // Request key for deduplication (aggregated)
    const requestKey = `pipelines:${(projects || []).sort().join(',')}`;
    
    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this.loadProjects();
      projectNames = this.projects.map(p => p.name);
    }
    
    const total = projectNames.length;
    let searched = 0;
    
    // Fetch EACH project individually and cache separately
    for (const projectName of projectNames) {
      // Skip if already cached (TTL respected)
      const cacheKey = `worker:pipelines:${projectName}`;
      if (cache.get(cacheKey) !== null) {
        this.log(`SKIP (cached): ${cacheKey}`);
        searched++;
        this._setProgress(requestKey, {
          current: searched,
          total,
          percent: Math.round((searched / total) * 100),
          currentProject: projectName,
          perProject: { [projectName]: 'cached' },
        });
        continue;
      }

      try {
        const pipelines = await this.client.getPipelines(projectName);
        pipelines.forEach(p => { p._projectName = projectName; });
        
        // PER-PROJECT cache key
        cache.set(cacheKey, { items: pipelines, _timestamp: Date.now() }, CACHE_TTL);
      } catch (e) {
        this.log(`Failed to fetch pipelines for ${projectName}: ${e.message}`);
      }
      
      searched++;
      this._setProgress(requestKey, {
        current: searched,
        total,
        percent: Math.round((searched / total) * 100),
        currentProject: projectName,
        perProject: { [projectName]: 'completed' },
      });
    }
    
    return []; // Data is in per-project cache keys
  }

  async _fetchPipelineRuns(project, pipelineIds) {
    const workerKey = `worker:pipelineRuns:${project}`;
    
    if (!project) return [];
    
    try {
      const pipelines = await this.client.getPipelines(project);
      const defIds = pipelineIds?.length 
        ? pipelineIds 
        : pipelines.map(p => p.id);
      
      const runsMap = {};
      const CHUNK_DEFS = 20;
      
      for (let i = 0; i < defIds.length; i += CHUNK_DEFS) {
        const chunk = defIds.slice(i, i + CHUNK_DEFS);
        try {
          const map = await this.client.getBuildRunsForDefinitions(project, chunk, 3);
          for (const k of Object.keys(map)) runsMap[String(k)] = map[k];
        } catch (e) {
          for (const id of chunk) runsMap[String(id)] = [];
        }
      }
      
      this._setProgress(workerKey, {
        current: defIds.length,
        total: defIds.length,
        percent: 100,
        currentProject: project,
      });
      
      cache.set(workerKey, { items: runsMap, _timestamp: Date.now() }, RUNS_TTL);
      return runsMap;
    } catch (e) {
      this.log(`Failed to fetch pipeline runs for ${project}: ${e.message}`);
      return {};
    }
  }

  async _fetchWorkItems(ids) {
    if (!ids?.length) return [];
    
    try {
      const items = await this.client.getWorkItemsByIds(ids);
      const workerKey = `worker:workitems:${ids.sort().join(',')}`;
      cache.set(workerKey, { items, _timestamp: Date.now() }, CACHE_TTL);
      return items;
    } catch (e) {
      this.log(`Failed to fetch work items: ${e.message}`);
      return [];
    }
  }

  async _fetchPRs(projects) {
    const projectsKey = (projects || []).sort().join(',') || 'all';
    const workerKey = `worker:prs:${projectsKey}`;
    
    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this.loadProjects();
      projectNames = this.projects.map(p => p.name);
    }
    
    const total = projectNames.length;
    let searched = 0;
    const allItems = [];
    
    for (const projectName of projectNames) {
      try {
        const prs = await this.client.getPullRequests(projectName);
        prs.forEach(pr => { pr._projectName = projectName; });
        allItems.push(...prs);
      } catch (e) {
        // Continue on error
      }
      
      searched++;
      this._setProgress(workerKey, {
        current: searched,
        total,
        percent: Math.round((searched / total) * 100),
        currentProject: projectName,
      });
    }
    
    cache.set(workerKey, { items: allItems, _timestamp: Date.now() }, CACHE_TTL);
    return allItems;
  }

  async _fetchServiceConnections(projects) {
    const projectsKey = (projects || []).sort().join(',') || 'all';
    const workerKey = `worker:serviceConnections:${projectsKey}`;
    
    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this.loadProjects();
      projectNames = this.projects.map(p => p.name);
    }
    
    const total = projectNames.length;
    let searched = 0;
    const allItems = [];
    
    for (const projectName of projectNames) {
      try {
        const scs = await this.client.getServiceConnections(projectName);
        scs.forEach(sc => { sc._projectName = projectName; });
        allItems.push(...scs);
      } catch (e) {
        // Continue on error
      }
      
      searched++;
      this._setProgress(workerKey, {
        current: searched,
        total,
        percent: Math.round((searched / total) * 100),
        currentProject: projectName,
      });
    }
    
    cache.set(workerKey, { items: allItems, _timestamp: Date.now() }, CACHE_TTL);
    return allItems;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    callback(this.getState());
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

    let eligibleProjects;
    const mode = this.settings.mode;
    const specificSet = this.settings.specificProjects;

    if (mode === "all") {
      eligibleProjects = this.projects;
    } else if (mode === "scoped") {
      eligibleProjects = this.projects.filter(p => this.scopedProjectNames.has(p.name));
    } else if (mode === "specific") {
      eligibleProjects = this.projects.filter(p => specificSet.has(p.name));
    } else {
      eligibleProjects = this.projects.filter(p => this.scopedProjectNames.has(p.name));
    }

    const scoped = eligibleProjects.filter(p => this.scopedProjectNames.has(p.name));
    const nonScoped = eligibleProjects.filter(p => !this.scopedProjectNames.has(p.name));

    const batch = [];
    const count = Math.min(BATCH_SIZE, eligibleProjects.length);

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
    if (!this.settings.enabled) {
      this.log("Tick skipped - background refresh disabled");
      return;
    }

    if (!this.client || !this.projects.length) {
      await this.loadProjects();
      return;
    }

    const batch = this.getBatch();
    if (!batch.length) {
      this.log("Tick skipped - no projects in batch");
      return;
    }

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
