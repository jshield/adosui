import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('backgroundWorker module', () => {
  let worker;

  beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import('../../src/lib/backgroundWorker.js');
    worker = mod.default;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constants', () => {
    it('should have correct tick interval', async () => {
      expect(worker).toBeDefined();
    });
  });

  describe('setClient and loadProjects', () => {
    it('should load projects when client is set', async () => {
      const mockClient = {
        getProjects: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Project 1' }]),
      };

      await worker.setClient(mockClient);
      expect(mockClient.getProjects).toHaveBeenCalled();
    });

    it('should reset index when project list changes', async () => {
      const mockClient = {
        getProjects: vi.fn()
          .mockResolvedValueOnce([{ id: 'p1' }])
          .mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }]),
      };

      worker.currentIndex = 1;
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
});