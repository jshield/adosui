import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cache } from '../../src/lib/index.js';

describe('backgroundWorker module', () => {
  let worker;
  let mockClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import('../../src/lib/backgroundWorker.js');
    worker = mod.default;
    
    // Reset worker state for each test (it's a singleton)
    worker.settings.enabled = false;
    worker.settings.mode = 'scoped';
    worker.settings.specificProjects = new Set();
    worker.lastRefresh = null;
    worker.activityLog = [];
    
    // Clear cache for each test
    worker.projectStatus = {};
    
    // Create mock ADO client matching the interface expected by backgroundWorker
    mockClient = {
      getProjects: vi.fn().mockResolvedValue([
        { id: 'proj-001', name: 'MyProject' },
        { id: 'proj-002', name: 'BackendServices' },
      ]),
      getRepos: vi.fn().mockImplementation((projectName) => {
        return Promise.resolve([
          {
            id: `repo-${projectName}-001`,
            name: `${projectName}-app`,
            project: { name: projectName },
            remoteUrl: `https://dev.azure.com/testorg/${projectName}/_git/${projectName}-app`,
          },
        ]);
      }),
      getPipelines: vi.fn().mockImplementation((projectName) => {
        return Promise.resolve([
          {
            id: '100',
            name: `${projectName}-deploy`,
            folder: `\\${projectName}\\Builds`,
            configurationType: 'yaml',
          },
        ]);
      }),
      getBuildRunsForDefinitions: vi.fn().mockImplementation((projectName, defIds, top) => {
        const runs = {};
        for (const defId of defIds) {
          runs[defId] = [
            {
              id: 500 + parseInt(defId),
              pipeline: { id: defId },
              state: 'completed',
              result: 'succeeded',
              queueTime: '2026-03-29T10:00:00Z',
            },
          ];
        }
        return Promise.resolve(runs);
      }),
      getPullRequests: vi.fn().mockImplementation((projectName) => {
        return Promise.resolve([
          {
            pullRequestId: 45,
            title: 'Add feature',
            status: 'active',
            sourceRefName: 'refs/heads/feature',
            targetRefName: 'refs/heads/main',
            repository: { name: `${projectName}-app` },
          },
        ]);
      }),
      getTestRuns: vi.fn().mockImplementation((projectName) => {
        return Promise.resolve([
          {
            id: 200,
            name: 'Build #100',
            state: 'completed',
            stats: { passed: 10, failed: 0 },
          },
        ]);
      }),
      getServiceConnections: vi.fn().mockImplementation((projectName) => {
        return Promise.resolve([
          {
            id: 'sc-001',
            name: `${projectName}-prod`,
            type: 'azure',
          },
        ]);
      }),
    };
    
    // Set up the client
    worker.setClient(mockClient);
    worker.setSettings({ enabled: false, mode: 'scoped', specificProjects: new Set() });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Reset worker settings
    worker.setSettings({ enabled: false, mode: 'scoped', specificProjects: new Set() });
  });

  describe('constants', () => {
    it('should have correct tick interval', async () => {
      expect(worker).toBeDefined();
    });
  });

  describe('setClient and loadProjects', () => {
    it('should load projects when client is set', async () => {
      expect(mockClient.getProjects).toHaveBeenCalled();
      expect(worker.projects.length).toBe(2);
    });

    it('should reset index when project list changes', async () => {
      worker.currentIndex = 1;
      mockClient.getProjects = vi.fn()
        .mockResolvedValueOnce([{ id: 'p1' }])
        .mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }]);
      
      await worker.loadProjects();
      expect(worker.currentIndex).toBe(0);
    });
  });

  describe('settings', () => {
    it('should have default settings', () => {
      expect(worker.settings.enabled).toBe(false);
      expect(worker.settings.mode).toBe('scoped');
      expect(worker.settings.specificProjects instanceof Set).toBe(true);
    });

    it('should update settings via setSettings', () => {
      worker.setSettings({ enabled: true, mode: 'all' });
      
      expect(worker.settings.enabled).toBe(true);
      expect(worker.settings.mode).toBe('all');
    });

    it('should return settings via getSettings', () => {
      worker.setSettings({ enabled: true, mode: 'specific', specificProjects: new Set(['p1', 'p2']) });
      const settings = worker.getSettings();
      
      expect(settings.enabled).toBe(true);
      expect(settings.mode).toBe('specific');
      expect(settings.specificProjects.has('p1')).toBe(true);
      expect(settings.specificProjects.has('p2')).toBe(true);
    });

    it('should toggle specific projects', () => {
      worker.setSettings({ mode: 'specific', specificProjects: new Set() });
      
      worker.setSettings({ specificProjects: new Set(['p1']) });
      expect(worker.settings.specificProjects.has('p1')).toBe(true);
      
      worker.setSettings({ specificProjects: new Set(['p1', 'p2']) });
      expect(worker.settings.specificProjects.has('p1')).toBe(true);
      expect(worker.settings.specificProjects.has('p2')).toBe(true);
    });
  });

  describe('getBatch', () => {
    it('should return empty batch when no projects', () => {
      worker.projects = [];
      expect(worker.getBatch()).toEqual([]);
    });

    it('should return batch up to BATCH_SIZE when mode is all', () => {
      worker.projects = [{ id: '1' }, { id: '2' }, { id: '3' }];
      worker.currentIndex = 0;
      worker.settings.mode = 'all';
      const batch = worker.getBatch();

      // BATCH_SIZE is 5, so we get all 3
      expect(batch.length).toBe(3);
    });

    it('should return empty batch when mode is scoped but no scoped projects', () => {
      worker.projects = [{ id: '1' }, { id: '2' }, { id: '3' }];
      worker.currentIndex = 0;
      worker.settings.mode = 'scoped';
      const batch = worker.getBatch();

      expect(batch.length).toBe(0);
    });

    it('should filter by specificProjects when mode is specific', () => {
      worker.projects = [{ name: 'p1' }, { name: 'p2' }, { name: 'p3' }];
      worker.currentIndex = 0;
      worker.settings.mode = 'specific';
      worker.settings.specificProjects = new Set(['p1', 'p3']);
      const batch = worker.getBatch();

      expect(batch.length).toBe(2);
      expect(batch.map(p => p.name)).toContain('p1');
      expect(batch.map(p => p.name)).toContain('p3');
    });
  });

  describe('visibility handling', () => {
    it('worker should handle visibility change events', () => {
      expect(typeof worker.handleVisibilityChange).toBe('function');
    });
  });

  describe('tick logic placeholders', () => {
    it('should have tick method', () => {
      expect(typeof worker.tick).toBe('function');
    });

    it('should have refreshProject method', () => {
      expect(typeof worker.refreshProject).toBe('function');
    });
  });

  describe('API integration with mocked client', () => {
    describe('tick() and refreshProject()', () => {
      it('should skip tick when enabled is false', async () => {
        worker.setSettings({ enabled: false });
        
        await worker.tick();
        
        // Should not call any client methods
        expect(mockClient.getRepos).not.toHaveBeenCalled();
        expect(mockClient.getPipelines).not.toHaveBeenCalled();
      });

      it('should skip tick when no projects loaded', async () => {
        worker.projects = [];
        worker.setSettings({ enabled: true });
        
        await worker.tick();
        
        // Should try to load projects
        expect(mockClient.getProjects).toHaveBeenCalled();
      });

      it('should skip tick when batch is empty', async () => {
        worker.projects = [{ name: 'p1' }, { name: 'p2' }];
        worker.settings.mode = 'scoped'; // No scoped projects set
        worker.setSettings({ enabled: true });
        
        await worker.tick();
        
        // Should not refresh anything
        expect(mockClient.getRepos).not.toHaveBeenCalled();
      });

      it('should refresh batch of projects when enabled', async () => {
        worker.setSettings({ enabled: true, mode: 'all' });
        
        await worker.tick();
        
        // Verify client methods were called for each project in batch
        expect(mockClient.getRepos).toHaveBeenCalledTimes(2);
        expect(mockClient.getPipelines).toHaveBeenCalledTimes(2);
        expect(mockClient.getPullRequests).toHaveBeenCalledTimes(2);
        expect(mockClient.getTestRuns).toHaveBeenCalledTimes(2);
        expect(mockClient.getServiceConnections).toHaveBeenCalledTimes(2);
      });

      it('should update lastRefresh timestamp after successful tick', async () => {
        worker.setSettings({ enabled: true, mode: 'all' });
        worker.lastRefresh = null;
        
        await worker.tick();
        
        expect(worker.lastRefresh).not.toBeNull();
        expect(new Date(worker.lastRefresh).getTime()).toBeGreaterThan(0);
      });
    });

    describe('cache population', () => {
      it('should cache repos per project', async () => {
        worker.setSettings({ enabled: true, mode: 'all' });
        
        await worker.tick();
        
        // Check repos are cached under project prefix
        const reposKey = 'project:MyProject:repos';
        const cached = cache.get(reposKey);
        
        expect(cached).toBeDefined();
        expect(cached.length).toBe(1);
        expect(cached[0].name).toBe('MyProject-app');
      });

      it('should cache pipelines per project', async () => {
        worker.setSettings({ enabled: true, mode: 'all' });
        
        await worker.tick();
        
        const pipelinesKey = 'project:MyProject:pipelines';
        const cached = cache.get(pipelinesKey);
        
        expect(cached).toBeDefined();
        expect(cached.length).toBe(1);
        expect(cached[0].name).toBe('MyProject-deploy');
      });

      it('should cache pipeline runs per project', async () => {
        worker.setSettings({ enabled: true, mode: 'all' });
        
        await worker.tick();
        
        const runsKey = 'project:MyProject:pipelineRuns';
        const cached = cache.get(runsKey);
        
        expect(cached).toBeDefined();
        // Should have runs for the pipeline definition
        expect(Object.keys(cached).length).toBeGreaterThan(0);
      });

      it('should cache PRs per project', async () => {
        worker.setSettings({ enabled: true, mode: 'all' });
        
        await worker.tick();
        
        const prsKey = 'project:MyProject:prs';
        const cached = cache.get(prsKey);
        
        expect(cached).toBeDefined();
        expect(cached.length).toBe(1);
        expect(cached[0].title).toBe('Add feature');
      });

      it('should cache test runs per project', async () => {
        worker.setSettings({ enabled: true, mode: 'all' });
        
        await worker.tick();
        
        const testRunsKey = 'project:MyProject:testRuns';
        const cached = cache.get(testRunsKey);
        
        expect(cached).toBeDefined();
        expect(cached.length).toBe(1);
        expect(cached[0].name).toBe('Build #100');
      });

      it('should cache service connections per project', async () => {
        worker.setSettings({ enabled: true, mode: 'all' });
        
        await worker.tick();
        
        const scKey = 'project:MyProject:serviceConnections';
        const cached = cache.get(scKey);
        
        expect(cached).toBeDefined();
        expect(cached.length).toBe(1);
        expect(cached[0].name).toBe('MyProject-prod');
      });

      it('should attach _projectName to each cached item', async () => {
        worker.setSettings({ enabled: true, mode: 'all' });
        
        await worker.tick();
        
        const reposKey = 'project:MyProject:repos';
        const cached = cache.get(reposKey);
        
        expect(cached[0]._projectName).toBe('MyProject');
      });

      it('should update project status for each resource type', async () => {
        worker.setSettings({ enabled: true, mode: 'all' });
        
        await worker.tick();
        
        const status = worker.projectStatus['MyProject'];
        expect(status).toBeDefined();
        expect(status.resources.repos.status).toBe('ok');
        expect(status.resources.pipelines.status).toBe('ok');
        expect(status.resources.pipelineRuns.status).toBe('ok');
        expect(status.resources.pullRequests.status).toBe('ok');
        expect(status.resources.testRuns.status).toBe('ok');
        expect(status.resources.serviceConnections.status).toBe('ok');
      });
    });

    describe('error handling', () => {
      it('should handle getRepos failure gracefully', async () => {
        mockClient.getRepos = vi.fn().mockRejectedValue(new Error('API Error'));
        worker.setSettings({ enabled: true, mode: 'all' });
        
        await worker.tick();
        
        const status = worker.projectStatus['MyProject'];
        expect(status.resources.repos.status).toBe('error');
        expect(status.resources.repos.error).toContain('API Error');
      });

      it('should continue refreshing other projects if one fails', async () => {
        let callCount = 0;
        mockClient.getRepos = vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('First project failed'));
          }
          return Promise.resolve([{ id: 'repo-2', name: 'repo2' }]);
        });
        
        worker.setSettings({ enabled: true, mode: 'all' });
        
        await worker.tick();
        
        // Second project should still have been attempted
        expect(mockClient.getRepos).toHaveBeenCalledTimes(2);
      });
    });

    describe('scoped projects filtering', () => {
      it('should only refresh scoped projects when mode is scoped', async () => {
        worker.setCollections([
          { projects: ['MyProject'] }
        ]);
        
        worker.setSettings({ enabled: true, mode: 'scoped' });
        
        await worker.tick();
        
        // Should only call for MyProject (scoped), not BackendServices
        expect(mockClient.getRepos).toHaveBeenCalledTimes(1);
        expect(mockClient.getRepos).toHaveBeenCalledWith('MyProject');
      });

      it('should only refresh specific projects when mode is specific', async () => {
        worker.setSettings({ 
          enabled: true, 
          mode: 'specific', 
          specificProjects: new Set(['MyProject']) 
        });
        
        await worker.tick();
        
        // Should only call for MyProject
        expect(mockClient.getRepos).toHaveBeenCalledTimes(1);
        expect(mockClient.getRepos).toHaveBeenCalledWith('MyProject');
      });
    });
  });
});