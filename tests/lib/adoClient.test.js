import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ADOClient } from '../../src/lib/adoClient.js';
import { sampleProjects, samplePipelines, samplePipelineRuns, samplePullRequests, sampleWorkItems, sampleProfile } from '../fixtures/adoResponses.js';

describe('adoClient', () => {
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

  const mockError = (status, msg = 'Error') => {
    fetchMock.mockResolvedValue({
      ok: false,
      status,
      statusText: msg,
      json: () => Promise.resolve({ message: msg }),
    });
  };

  describe('constructor', () => {
    it('should initialize with org and pat', () => {
      expect(client.org).toBe('testorg');
      expect(client.pat).toBe('test-pat');
    });

    it('should trim trailing slash from org', () => {
      const c = new ADOClient('testorg/', 'pat');
      expect(c.org).toBe('testorg');
    });

    it('should set base URLs correctly', () => {
      expect(client.base).toBe('https://dev.azure.com/testorg');
      expect(client.feedsBase).toBe('https://feeds.dev.azure.com/testorg');
    });

    it('should set auth header', () => {
      expect(client._auth).toMatch(/^Basic /);
    });
  });

  describe('updatePat', () => {
    it('should update PAT and refresh auth header', () => {
      const oldAuth = client._auth;
      client.updatePat('new-pat');
      expect(client.pat).toBe('new-pat');
      expect(client._auth).not.toBe(oldAuth);
      expect(client._auth).toMatch(/^Basic /);
    });

    it('should clear cache on PAT update', () => {
      client.updatePat('new-pat');
      expect(client._projects).toEqual([]);
    });
  });

  describe('clearCache', () => {
    it('should clear projects', () => {
      client._projects = [{ id: '1' }];
      client.clearCache();
      expect(client._projects).toEqual([]);
    });
  });

  describe('getProjects', () => {
    it('should fetch projects', async () => {
      mockSuccess({ value: sampleProjects });
      const projects = await client.getProjects();
      expect(projects).toEqual(sampleProjects);
      expect(client._projects).toEqual(sampleProjects);
    });
  });

  describe('searchWorkItems', () => {
    it('should return empty when no results', async () => {
      mockSuccess({ workItems: [] });
      const results = await client.searchWorkItems('test');
      expect(results).toEqual([]);
    });
  });

  describe('getWorkItemsByIds', () => {
    it('should return empty array for empty ids', async () => {
      const results = await client.getWorkItemsByIds([]);
      expect(results).toEqual([]);
    });
  });

  describe('getWorkItemComments', () => {
    it('should return empty array on error', async () => {
      mockError(404);
      const result = await client.getWorkItemComments('1001', 'MyProject');
      expect(result).toEqual([]);
    });
  });

  describe('getPipelines', () => {
    it('should fetch pipelines for project', async () => {
      mockSuccess({ value: samplePipelines });
      const pipelines = await client.getPipelines('MyProject');
      expect(pipelines).toEqual(samplePipelines);
    });
  });

  describe('getPipelineRuns', () => {
    it('should fetch pipeline runs', async () => {
      mockSuccess({ value: samplePipelineRuns.slice(0, 3) });
      const runs = await client.getPipelineRuns('MyProject', '100');
      expect(runs).toHaveLength(3);
    });
  });

  describe('getPullRequests', () => {
    it('should fetch pull requests', async () => {
      mockSuccess({ value: samplePullRequests });
      const prs = await client.getPullRequests('MyProject');
      expect(prs.length).toBe(2);
    });
  });

  describe('getProfile', () => {
    it('should fetch and normalize profile', async () => {
      mockSuccess({
        authenticatedUser: {
          id: 'user-123',
          providerDisplayName: 'Test User',
          properties: { Account: { $value: 'test@email.com' } },
          descriptor: 'foo\\testuser',
        },
      });

      const profile = await client.getProfile();
      expect(profile.id).toBe('user-123');
      expect(profile.displayName).toBe('Test User');
      expect(profile.emailAddress).toBe('test@email.com');
    });
  });

  describe('URL encoding', () => {
    it('should encode org with spaces', () => {
      const c = new ADOClient('my org', 'pat');
      expect(c.base).toBe('https://dev.azure.com/my%20org');
    });
  });
});