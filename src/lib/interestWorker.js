import cache, { CACHE_TTL } from "./cache";

const TICK_INTERVAL = 2 * 60 * 1000;
const RUNS_TTL = 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

class InterestWorker {
  constructor() {
    this.client = null;
    this.projects = [];
    this.scopedProjectNames = new Set();
    this.listeners = new Set();
    this.activityLog = [];

    this._interests = new Map();
    this._tickInterval = null;
    this._started = false;

    this._requestQueue = [];
    this._inFlight = new Map();
    this._progress = new Map();
    this._processing = false;

    this.lastRefresh = null;
    this.lastPipelineRunsRefresh = null;
  }

  setClient(client) {
    this.client = client;
    this._loadProjects();
  }

  setCollections(collections) {
    const names = new Set();
    for (const col of collections) {
      for (const p of col.projects || []) {
        names.add(p);
      }
    }
    this.scopedProjectNames = names;
  }

  async _loadProjects() {
    if (!this.client) return;
    try {
      const incoming = await this.client.getProjects();
      this.projects = incoming;
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
    this._notify();
  }

  _notify() {
    this.listeners.forEach(cb => cb(this.getState()));
  }

  subscribe(callback) {
    this.listeners.add(callback);
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

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

    const interestsObj = {};
    for (const [key, info] of this._interests) {
      interestsObj[key] = {
        count: info.count,
        params: info.params,
        lastFetch: info.lastFetch,
        stale: Date.now() - info.lastFetch > CACHE_TTL,
      };
    }

    return {
      activityLog: this.activityLog,
      lastRefresh: this.lastRefresh,
      lastPipelineRunsRefresh: this.lastPipelineRunsRefresh,
      inFlight: inFlightList,
      requestQueue: queueList,
      interests: interestsObj,
      projects: this.projects,
      scopedProjectNames: this.scopedProjectNames,
      pipelines: this.getPipelines(),
      repos: this.getRepos(),
      prs: this.getPRs(),
      serviceConnections: this.getServiceConnections(),
      pipelineRuns: this.getAllPipelineRuns(),
    };
  }

  getInterests() {
    return Object.fromEntries(this._interests);
  }

  clearInterests() {
    this._interests.clear();
    this._stopTick();
    this._notify();
  }

  _getInterestKey(type, params) {
    if (params.ids?.length) return `${type}:ids:${params.ids.sort().join(',')}`;
    if (params.query) return `${type}:q:${params.query}`;
    if (params.projects?.length) return `${type}:${params.projects.sort().join(',')}`;
    if (params.project) return `${type}:proj:${params.project}`;
    return type;
  }

  registerInterest(type, params = {}) {
    const key = this._getInterestKey(type, params);
    const existing = this._interests.get(key);

    if (existing) {
      existing.count++;
      this.log(`Interest count++: ${key} (now ${existing.count})`);
    } else {
      this._interests.set(key, {
        count: 1,
        params,
        lastFetch: 0,
        type,
      });
      this.log(`Interest registered: ${key}`);
    }

    this._startTick();

    const interest = this._interests.get(key);
    const age = Date.now() - interest.lastFetch;
    if (interest.lastFetch === 0 || age > CACHE_TTL) {
      this.log(`Interest stale, triggering fetch: ${key} (age: ${age}ms)`);
      this.request(type, params);
    }

    this._notify();
  }

  unregisterInterest(type, params = {}) {
    const key = this._getInterestKey(type, params);
    const interest = this._interests.get(key);

    if (interest) {
      interest.count--;
      this.log(`Interest count--: ${key} (now ${interest.count})`);

      if (interest.count <= 0) {
        this._interests.delete(key);
        this.log(`Interest removed: ${key}`);
      }
    }

    if (this._interests.size === 0) {
      this._stopTick();
    }

    this._notify();
  }

  _startTick() {
    if (this._tickInterval || this._interests.size === 0) return;
    if (typeof setInterval === 'undefined') return; // SSR guard
    this._tickInterval = setInterval(() => this._tick(), TICK_INTERVAL);
    this.log(`Tick started (${this._interests.size} active interests)`);
  }

  _stopTick() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
      this.log(`Tick stopped`);
    }
  }

  async _tick() {
    this.log(`Tick: checking ${this._interests.size} interests`);

    for (const [key, interest] of this._interests) {
      const age = Date.now() - interest.lastFetch;
      if (age > CACHE_TTL) {
        this.log(`Refreshing interest: ${key} (age: ${age}ms)`);
        await this._refreshInterest(key, interest);
      }
    }

    this.lastRefresh = new Date().toISOString();
    this._notify();
  }

  async _refreshInterest(key, interest) {
    const { type, params } = interest;
    try {
      await this._fetchData(type, params);
      interest.lastFetch = Date.now();
    } catch (e) {
      this.log(`Failed to refresh interest ${key}: ${e.message}`);
    }
  }

  request(type, params = {}) {
    const req = {
      type,
      params,
      priority: params.priority || 'background',
      timestamp: Date.now(),
      key: this._getRequestKey(type, params),
    };

    this.log(`REQUEST: ${type} key=${req.key}`);

    const existingQueued = this._requestQueue.find(r => r.key === req.key);
    if (existingQueued) {
      this.log(`REQUEST SKIPPED (queued): ${type}`);
      return;
    }

    if (this._inFlight.has(req.key)) {
      this.log(`REQUEST SKIPPED (in flight): ${type}`);
      return;
    }

    if (this._isCacheHit(type, params)) {
      this.log(`CACHE HIT: ${type} - notifying immediately`);
      this._notify();
      return;
    }

    this._requestQueue.push(req);
    this._processQueue();
  }

  _getRequestKey(type, params) {
    if (params.ids?.length) return `${type}:ids:${params.ids.sort().join(',')}`;
    if (params.query) return `${type}:q:${params.query}`;
    if (params.projects?.length) return `${type}:${params.projects.sort().join(',')}`;
    if (params.project) return `${type}:proj:${params.project}`;
    return type;
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

  async _processQueue() {
    if (this._processing || !this._requestQueue.length) return;
    this._processing = true;

    while (this._requestQueue.length) {
      const req = this._requestQueue.shift();
      await this._executeRequest(req);
    }

    this._processing = false;
  }

  async _executeRequest(req) {
    const { key, type, params } = req;

    if (this._inFlight.has(key)) return;

    const entry = { promise: null, request: req, retry: 0 };
    const promise = this._fetchData(type, params);
    entry.promise = promise;
    this._inFlight.set(key, entry);
    this._notify();

    try {
      await promise;
      this.log(`COMPLETED: ${type} key=${key}`);
    } catch (e) {
      this.log(`Request failed: ${type} - ${e.message}`);
    } finally {
      this._inFlight.delete(key);
      this._progress.delete(key);
      this._notify();
    }
  }

  async _fetchData(type, params) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (type === 'pipelines') return await this._fetchPipelines(params.projects);
        if (type === 'pipelineRuns') return await this._fetchPipelineRuns(params.project, params.pipelineIds);
        if (type === 'repos') return await this._fetchRepos(params.projects);
        if (type === 'prs') return await this._fetchPRs(params.projects);
        if (type === 'serviceConnections') return await this._fetchServiceConnections(params.projects);
        if (type === 'workitems') return await this._fetchWorkItems(params.ids);
        if (type === 'search:workitem') return await this._searchWorkItems(params.query, params.projects);
        if (type === 'search:repo') return await this._searchRepos(params.query, params.projects);
        this.log(`Unknown type: ${type}`);
        return [];
      } catch (e) {
        if (attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAYS[attempt] + Math.random() * 500;
          this.log(`Retry ${attempt + 1}/${MAX_RETRIES} for ${type}: ${e.message}`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    return [];
  }

  getPipelines(projects = []) {
    const all = [];
    const projectList = projects.length > 0 ? projects : [...this.scopedProjectNames];
    for (const project of projectList) {
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

  getAllPipelineRuns() {
    const runs = {};
    for (const project of this.scopedProjectNames) {
      const cached = cache.get(`worker:pipelineRuns:${project}`);
      if (cached) {
        const data = cached.items || cached.data?.items || cached.data || {};
        Object.assign(runs, data);
      }
    }
    return runs;
  }

  getRepos(projects = []) {
    const key = (projects.length > 0 ? projects : [...this.scopedProjectNames]).sort().join(',') || 'all';
    const cached = cache.get(`worker:repos:${key}`);
    if (!cached) return [];
    return cached.items || cached.data?.items || cached.data || [];
  }

  getPRs(projects = []) {
    const key = (projects.length > 0 ? projects : [...this.scopedProjectNames]).sort().join(',') || 'all';
    const cached = cache.get(`worker:prs:${key}`);
    if (!cached) return [];
    return cached.items || cached.data?.items || cached.data || [];
  }

  getServiceConnections(projects = []) {
    const key = (projects.length > 0 ? projects : [...this.scopedProjectNames]).sort().join(',') || 'all';
    const cached = cache.get(`worker:serviceConnections:${key}`);
    if (!cached) return [];
    return cached.items || cached.data?.items || cached.data || [];
  }

  async _fetchPipelines(projects) {
    const requestKey = `pipelines:${(projects || []).sort().join(',')}`;

    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this._loadProjects();
      projectNames = this.projects.map(p => p.name);
    }

    const total = projectNames.length;
    let fetched = 0;

    for (const projectName of projectNames) {
      const cacheKey = `worker:pipelines:${projectName}`;
      if (cache.get(cacheKey) !== null) {
        this.log(`SKIP (cached): ${cacheKey}`);
        fetched++;
        continue;
      }

      try {
        const pipelines = await this.client.getPipelines(projectName);
        pipelines.forEach(p => { p._projectName = projectName; });
        cache.set(cacheKey, { items: pipelines, _timestamp: Date.now() }, CACHE_TTL);
      } catch (e) {
        this.log(`Failed to fetch pipelines for ${projectName}: ${e.message}`);
      }

      fetched++;
    }

    return [];
  }

  async _fetchPipelineRuns(project, pipelineIds) {
    if (!project) return {};

    try {
      const pipelines = await this.client.getPipelines(project);
      const defIds = pipelineIds?.length ? pipelineIds : pipelines.map(p => p.id);

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

      cache.set(`worker:pipelineRuns:${project}`, { items: runsMap, _timestamp: Date.now() }, RUNS_TTL);
      this.lastPipelineRunsRefresh = new Date().toISOString();
      return runsMap;
    } catch (e) {
      this.log(`Failed to fetch pipeline runs for ${project}: ${e.message}`);
      return {};
    }
  }

  async _fetchRepos(projects) {
    const projectsKey = (projects || []).sort().join(',') || 'all';
    const workerKey = `worker:repos:${projectsKey}`;

    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this._loadProjects();
      projectNames = this.projects.map(p => p.name);
    }

    const allItems = [];
    for (const projectName of projectNames) {
      try {
        const repos = await this.client.getRepos(projectName);
        repos.forEach(r => { r._projectName = projectName; });
        allItems.push(...repos);
      } catch (e) {
        // Continue on error
      }
    }

    cache.set(workerKey, { items: allItems, _timestamp: Date.now() }, CACHE_TTL);
    return allItems;
  }

  async _fetchPRs(projects) {
    const projectsKey = (projects || []).sort().join(',') || 'all';
    const workerKey = `worker:prs:${projectsKey}`;

    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this._loadProjects();
      projectNames = this.projects.map(p => p.name);
    }

    const allItems = [];
    for (const projectName of projectNames) {
      try {
        const prs = await this.client.getPullRequests(projectName);
        prs.forEach(pr => { pr._projectName = projectName; });
        allItems.push(...prs);
      } catch (e) {
        // Continue on error
      }
    }

    cache.set(workerKey, { items: allItems, _timestamp: Date.now() }, CACHE_TTL);
    return allItems;
  }

  async _fetchServiceConnections(projects) {
    const projectsKey = (projects || []).sort().join(',') || 'all';
    const workerKey = `worker:serviceConnections:${projectsKey}`;

    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this._loadProjects();
      projectNames = this.projects.map(p => p.name);
    }

    const allItems = [];
    for (const projectName of projectNames) {
      try {
        const scs = await this.client.getServiceConnections(projectName);
        scs.forEach(sc => { sc._projectName = projectName; });
        allItems.push(...scs);
      } catch (e) {
        // Continue on error
      }
    }

    cache.set(workerKey, { items: allItems, _timestamp: Date.now() }, CACHE_TTL);
    return allItems;
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

  async _searchWorkItems(query, projects) {
    const projectsKey = (projects || []).sort().join(',') || 'all';
    const workerKey = `worker:search:workitem:${projectsKey}:q:${query}`;

    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this._loadProjects();
      projectNames = this.projects.map(p => p.name);
    }

    const allItems = [];
    for (const projectName of projectNames) {
      try {
        const items = await this.client.searchWorkItems(query, {}, [projectName]);
        allItems.push(...items);
      } catch (e) {
        // Continue on error
      }
    }

    cache.set(workerKey, { items: allItems, _timestamp: Date.now() }, CACHE_TTL);
    return allItems;
  }

  async _searchRepos(query, projects) {
    const projectsKey = (projects || []).sort().join(',') || 'all';
    const workerKey = `worker:search:repo:${projectsKey}:q:${query}`;

    let projectNames = projects;
    if (!projectNames?.length) {
      if (!this.projects.length) await this._loadProjects();
      projectNames = this.projects.map(p => p.name);
    }

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
    }

    cache.set(workerKey, { items: allItems, _timestamp: Date.now() }, CACHE_TTL);
    return allItems;
  }
}

const interestWorker = new InterestWorker();
export default interestWorker;