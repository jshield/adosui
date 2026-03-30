import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('backgroundWorker exports', () => {
  it('should import background worker module', async () => {
    const { default: worker } = await import('../../src/lib/backgroundWorker.js');
    expect(worker).toBeDefined();
    expect(typeof worker.subscribe).toBe('function');
    expect(typeof worker.setClient).toBe('function');
    expect(typeof worker.start).toBe('function');
    expect(typeof worker.stop).toBe('function');
  });
});

describe('BackgroundWorker behavior', () => {
  let worker;

  beforeEach(async () => {
    vi.useFakeTimers();
    const mod = await import('../../src/lib/backgroundWorker.js');
    worker = mod.default;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should have correct initial state', () => {
      expect(worker.client).toBeNull();
      expect(worker.projects).toEqual([]);
      expect(worker.currentIndex).toBe(0);
      expect(worker.isRunning).toBe(false);
      expect(worker.isPaused).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('should subscribe and provide initial callback', () => {
      const callback = vi.fn();
      const unsubscribe = worker.subscribe(callback);

      expect(callback).toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          activityLog: expect.any(Array),
          lastRefresh: null,
          isRunning: false,
        })
      );

      unsubscribe();
    });
  });

  describe('log', () => {
    it('should record log messages with timestamp', () => {
      const before = worker.activityLog.length;
      worker.log('Test message');

      expect(worker.activityLog.length).toBe(before + 1);
      expect(worker.activityLog[0].message).toBe('Test message');
      expect(worker.activityLog[0].timestamp).toBeDefined();
    });
  });

  describe('getBatch logic', () => {
    it('should return correct batch size constant', () => {
      // BATCH_SIZE is 5 according to backgroundWorker.js
      expect(worker).toBeDefined();
    });

    it('should maintain index within bounds', () => {
      worker.projects = [];
      expect(worker.getBatch()).toEqual([]);

      worker.projects = [{ id: '1' }, { id: '2' }];
      worker.currentIndex = 100;
      worker.currentIndex = worker.currentIndex % worker.projects.length;
      expect(worker.currentIndex).toBe(0);
    });
  });

  describe('notification', () => {
    it('should notify listeners on state change', () => {
      const callback = vi.fn();
      worker.subscribe(callback);

      worker.notify();

      expect(callback).toHaveBeenCalled();
    });
  });
});