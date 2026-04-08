import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('interestWorker module', () => {
  let worker;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

    const mod = await import('../../src/lib/interestWorker.js');
    worker = mod.default;

    worker.clearInterests();
    worker._stopTick();
    worker._requestQueue = [];
    worker._inFlight.clear();

    const cacheMod = await import('../../src/lib/cache.js');
    cacheMod.default._data = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with empty state', () => {
      expect(worker._interests.size).toBe(0);
      expect(worker._tickInterval).toBeNull();
      expect(worker.listeners.size).toBe(0);
    });
  });

  describe('registerInterest', () => {
    it('should add interest to map with count 1', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });

      const key = worker._getInterestKey('pipelines', { projects: ['ProjA'] });
      const interest = worker._interests.get(key);

      expect(interest).toBeDefined();
      expect(interest.count).toBe(1);
      expect(interest.params.projects).toEqual(['ProjA']);
    });

    it('should increment count on duplicate register', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      worker.registerInterest('pipelines', { projects: ['ProjA'] });

      const key = worker._getInterestKey('pipelines', { projects: ['ProjA'] });
      const interest = worker._interests.get(key);

      expect(interest.count).toBe(2);
    });

    it('should start tick interval on first interest', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });

      expect(worker._tickInterval).not.toBeNull();
    });

    it('should trigger immediate fetch on register if stale', () => {
      const fetchSpy = vi.spyOn(worker, 'request');

      worker.client = {
        getPipelines: vi.fn().mockResolvedValue([{ id: 1, name: 'Pipeline 1' }]),
        getProjects: vi.fn().mockResolvedValue([]),
      };

      worker.registerInterest('pipelines', { projects: ['ProjA'] });

      expect(fetchSpy).toHaveBeenCalledWith('pipelines', { projects: ['ProjA'] });
    });

    it('should log interest registered message', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });

      const log = worker.activityLog.find(l => l.message.includes('Interest registered'));
      expect(log).toBeDefined();
    });
  });

  describe('unregisterInterest', () => {
    it('should decrement count', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      worker.unregisterInterest('pipelines', { projects: ['ProjA'] });

      const key = worker._getInterestKey('pipelines', { projects: ['ProjA'] });
      const interest = worker._interests.get(key);

      expect(interest.count).toBe(1);
    });

    it('should remove interest when count reaches 0', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      worker.unregisterInterest('pipelines', { projects: ['ProjA'] });

      const key = worker._getInterestKey('pipelines', { projects: ['ProjA'] });
      expect(worker._interests.has(key)).toBe(false);
    });

    it('should stop tick when no interests remain', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      expect(worker._tickInterval).not.toBeNull();

      worker.unregisterInterest('pipelines', { projects: ['ProjA'] });
      expect(worker._tickInterval).toBeNull();
    });

    it('should handle unregistering non-existent interest', () => {
      expect(() => {
        worker.unregisterInterest('pipelines', { projects: ['NonExistent'] });
      }).not.toThrow();
    });
  });

  describe('getInterests', () => {
    it('should return empty object when no interests', () => {
      const interests = worker.getInterests();
      expect(interests).toEqual({});
    });

    it('should return interests as object', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      worker.registerInterest('repos', { projects: ['ProjB'] });

      const interests = worker.getInterests();

      expect(Object.keys(interests).length).toBe(2);
      expect(interests['pipelines:ProjA']).toBeDefined();
      expect(interests['repos:ProjB']).toBeDefined();
    });
  });

  describe('clearInterests', () => {
    it('should remove all interests', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      worker.registerInterest('repos', { projects: ['ProjB'] });

      worker.clearInterests();

      expect(worker._interests.size).toBe(0);
    });

    it('should stop tick interval', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });

      worker.clearInterests();

      expect(worker._tickInterval).toBeNull();
    });
  });

  describe('subscribe', () => {
    it('should call callback immediately with current state', () => {
      const callback = vi.fn();
      worker.subscribe(callback);

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        interests: expect.any(Object),
        pipelines: expect.any(Array),
      }));
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = worker.subscribe(callback);

      unsub();
      expect(worker.listeners.has(callback)).toBe(false);
    });

    it('should notify on state changes', () => {
      const callback = vi.fn();
      worker.subscribe(callback);

      worker.log('test message');

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('getState', () => {
    it('should return complete state object', () => {
      const state = worker.getState();

      expect(state).toHaveProperty('activityLog');
      expect(state).toHaveProperty('interests');
      expect(state).toHaveProperty('projects');
      expect(state).toHaveProperty('pipelines');
      expect(state).toHaveProperty('repos');
      expect(state).toHaveProperty('prs');
      expect(state).toHaveProperty('serviceConnections');
      expect(state).toHaveProperty('pipelineRuns');
      expect(state).toHaveProperty('inFlight');
      expect(state).toHaveProperty('requestQueue');
    });

    it('should include in-flight requests', () => {
      worker._inFlight.set('test-key', {
        request: { type: 'pipelines', params: {} },
        retry: 0,
      });

      const state = worker.getState();

      expect(state.inFlight).toHaveLength(1);
      expect(state.inFlight[0].key).toBe('test-key');
    });

    it('should include request queue', () => {
      worker._requestQueue.push({ type: 'pipelines', params: {}, key: 'test-key' });

      const state = worker.getState();

      expect(state.requestQueue).toHaveLength(1);
    });
  });

  describe('_getInterestKey', () => {
    it('should generate key for projects', () => {
      const key = worker._getInterestKey('pipelines', { projects: ['ProjB', 'ProjA'] });
      expect(key).toBe('pipelines:ProjA,ProjB');
    });

    it('should generate key for single project', () => {
      const key = worker._getInterestKey('pipelineRuns', { project: 'MyProj' });
      expect(key).toBe('pipelineRuns:proj:MyProj');
    });

    it('should generate key for ids', () => {
      const key = worker._getInterestKey('workitems', { ids: [3, 1, 2] });
      expect(key).toBe('workitems:ids:1,2,3');
    });

    it('should generate key for query', () => {
      const key = worker._getInterestKey('search:workitem', { query: 'test' });
      expect(key).toBe('search:workitem:q:test');
    });

    it('should return just type for empty params', () => {
      const key = worker._getInterestKey('pipelines', {});
      expect(key).toBe('pipelines');
    });
  });

  describe('request', () => {
    it('should log request message', () => {
      worker.request('pipelines', { projects: ['NewProj'] });
      const log = worker.activityLog.find(l => l.message.includes('REQUEST:'));
      expect(log).toBeDefined();
    });

    it('should skip if already in flight', () => {
      worker._inFlight.set('pipelines:NewProj', { request: {} });
      worker.request('pipelines', { projects: ['NewProj'] });
      expect(worker._requestQueue.length).toBe(0);
    });

    it('should notify on cache hit', () => {
      const callback = vi.fn();
      worker.subscribe(callback);
      worker.request('pipelines', { projects: ['CachedProj'] });
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('getPipelines', () => {
    beforeEach(async () => {
      const cacheMod = await import('../../src/lib/cache.js');
      cacheMod.default._data = {};
    });

    it('should return empty array when no cache', () => {
      const pipelines = worker.getPipelines(['ProjA']);
      expect(pipelines).toEqual([]);
    });

    it('should merge from per-project cache keys', async () => {
      const cacheMod = await import('../../src/lib/cache.js');
      cacheMod.default._data['worker:pipelines:ProjA'] = {
        data: { items: [{ id: 1, name: 'Pipeline 1' }], _timestamp: Date.now() },
        timestamp: Date.now(),
        ttl: 300000,
      };
      cacheMod.default._data['worker:pipelines:ProjB'] = {
        data: { items: [{ id: 2, name: 'Pipeline 2' }], _timestamp: Date.now() },
        timestamp: Date.now(),
        ttl: 300000,
      };

      const pipelines = worker.getPipelines(['ProjA', 'ProjB']);

      expect(pipelines).toHaveLength(2);
      expect(pipelines[0].name).toBe('Pipeline 1');
      expect(pipelines[1].name).toBe('Pipeline 2');
    });

    it('should use scopedProjectNames when no projects provided', () => {
      worker.scopedProjectNames = new Set(['ScopedProj']);

      const pipelines = worker.getPipelines([]);

      expect(pipelines).toEqual([]);
      expect(worker.scopedProjectNames.has('ScopedProj')).toBe(true);
    });
  });

  describe('getPipelineRuns', () => {
    it('should return empty object when no cache', () => {
      const runs = worker.getPipelineRuns('ProjA');
      expect(runs).toEqual({});
    });

    it('should return cached runs for project', async () => {
      const cacheMod = await import('../../src/lib/cache.js');
      cacheMod.default._data['worker:pipelineRuns:ProjA'] = {
        data: { items: { '123': [{ id: 1 }] }, _timestamp: Date.now() },
        timestamp: Date.now(),
        ttl: 60000,
      };

      const runs = worker.getPipelineRuns('ProjA');

      expect(runs).toEqual({ '123': [{ id: 1 }] });

      delete cacheMod.default._data['worker:pipelineRuns:ProjA'];
    });
  });

  describe('tick', () => {
    it('should log tick activity', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });

      worker._tick();

      const tickLog = worker.activityLog.find(l => l.message.includes('Tick:'));
      expect(tickLog).toBeDefined();
    });

    it('should call _refreshInterest for stale interests', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      const refreshSpy = vi.spyOn(worker, '_refreshInterest');

      worker._tick();

      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  describe('integration', () => {
    it('multiple components registering same interest should increment count', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      worker.registerInterest('pipelines', { projects: ['ProjA'] });

      const key = worker._getInterestKey('pipelines', { projects: ['ProjA'] });
      expect(worker._interests.get(key).count).toBe(3);
    });

    it('all components unmounting should remove interest', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      worker.unregisterInterest('pipelines', { projects: ['ProjA'] });
      worker.unregisterInterest('pipelines', { projects: ['ProjA'] });

      const key = worker._getInterestKey('pipelines', { projects: ['ProjA'] });
      expect(worker._interests.has(key)).toBe(false);
      expect(worker._tickInterval).toBeNull();
    });

    it('re-registering after unregister should work', () => {
      worker.registerInterest('pipelines', { projects: ['ProjA'] });
      worker.unregisterInterest('pipelines', { projects: ['ProjA'] });
      worker.registerInterest('pipelines', { projects: ['ProjA'] });

      const key = worker._getInterestKey('pipelines', { projects: ['ProjA'] });
      expect(worker._interests.get(key).count).toBe(1);
      expect(worker._tickInterval).not.toBeNull();
    });
  });

  describe('different interest types', () => {
    it('should handle repos interest', () => {
      worker.registerInterest('repos', { projects: ['ProjA'] });

      const key = worker._getInterestKey('repos', { projects: ['ProjA'] });
      expect(worker._interests.has(key)).toBe(true);
    });

    it('should handle prs interest', () => {
      worker.registerInterest('prs', { projects: ['ProjA'] });

      const key = worker._getInterestKey('prs', { projects: ['ProjA'] });
      expect(worker._interests.has(key)).toBe(true);
    });

    it('should handle pipelineRuns interest', () => {
      worker.registerInterest('pipelineRuns', { project: 'MyProj' });

      const key = worker._getInterestKey('pipelineRuns', { project: 'MyProj' });
      expect(worker._interests.has(key)).toBe(true);
    });

    it('should handle workitems interest', () => {
      worker.registerInterest('workitems', { ids: [1, 2, 3] });

      const key = worker._getInterestKey('workitems', { ids: [1, 2, 3] });
      expect(worker._interests.has(key)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should continue fetching on individual project failure', async () => {
      const mockGetPipelines = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([{ id: 2 }]);

      worker.client = {
        getPipelines: mockGetPipelines,
        getProjects: vi.fn().mockResolvedValue([]),
      };

      await worker._fetchPipelines(['ProjA', 'ProjB']);

      expect(mockGetPipelines).toHaveBeenCalledTimes(2);
    });
  });
});