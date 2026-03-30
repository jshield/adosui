import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ADOClient } from '../../src/lib/adoClient.js';

describe('adoClient write operations', () => {
  let client;
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    client = new ADOClient('testorg', 'test-pat');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockSuccess = (data) => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    });
  };

  describe('pushGitFile', () => {
    it('should call pushGitFile when file content provided', async () => {
      mockSuccess({ value: [{ name: 'refs/heads/main', objectId: 'abc' }] });
      mockSuccess({ pushId: 1 });

      await client.pushGitFile('proj', 'repo', '/test.yaml', 'content', null, 'msg', 'user', 'email@e');

      expect(fetchMock).toHaveBeenCalled();
    });
  });

  describe('createRepo', () => {
    it('should exist on client', () => {
      expect(typeof client.createRepo).toBe('function');
    });
  });

  describe('addWorkItemComment', () => {
    it('should exist on client', () => {
      expect(typeof client.addWorkItemComment).toBe('function');
    });
  });

  describe('upsertWikiPage', () => {
    it('should exist on client', () => {
      expect(typeof client.upsertWikiPage).toBe('function');
    });
  });

  describe('listWikis', () => {
    it('should exist on client', () => {
      expect(typeof client.listWikis).toBe('function');
    });
  });

  describe('getWikiPagesForProject', () => {
    it('should exist on client', () => {
      expect(typeof client.getWikiPagesForProject).toBe('function');
    });
  });

  describe('getBuildRuns', () => {
    it('should exist on client', () => {
      expect(typeof client.getBuildRuns).toBe('function');
    });
  });

  describe('getBuildRunsForDefinitions', () => {
    it('should exist on client', () => {
      expect(typeof client.getBuildRunsForDefinitions).toBe('function');
    });
  });
});