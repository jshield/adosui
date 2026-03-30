import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  syncCollectionToWiki,
  generateWikiPage,
} from '../../src/lib/wikiSync.js';

describe('wikiSync mutations', () => {
  let clientMock;
  let consoleSpy;

  beforeEach(() => {
    clientMock = {
      upsertWikiPage: vi.fn().mockResolvedValue({ path: 'Test' }),
    };
    consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('syncCollectionToWiki', () => {
    it('should return early when wikiId not provided', async () => {
      const result = await syncCollectionToWiki(
        clientMock,
        { project: 'MyProject' },
        { id: '1', name: 'Test' },
        'myorg'
      );
      expect(result).toBeUndefined();
      expect(clientMock.upsertWikiPage).not.toHaveBeenCalled();
    });

    it('should return early when project not provided', async () => {
      const result = await syncCollectionToWiki(
        clientMock,
        { wikiId: 'wiki-001' },
        { id: '1', name: 'Test' },
        'myorg'
      );
      expect(result).toBeUndefined();
    });

    it('should upsert wiki page with generated content', async () => {
      const collection = {
        id: 'col-1',
        name: 'Production',
        icon: '🚀',
        scope: 'shared',
        comments: [{ text: 'Important', author: 'Alice', createdAt: '2026-03-29T10:00:00Z' }],
        workItemIds: ['1001'],
        repos: [],
        pipelines: [{ id: '100', name: 'deploy', project: 'MyProject' }],
        prIds: [],
        serviceConnections: [],
        wikiPages: [],
      };

      await syncCollectionToWiki(
        clientMock,
        { project: 'MyProject', wikiId: 'wiki-001' },
        collection,
        'myorg'
      );

      expect(clientMock.upsertWikiPage).toHaveBeenCalledWith(
        'MyProject',
        'wiki-001',
        'ADO-SuperUI/Collections/Production',
        expect.stringContaining('# 🚀 Production')
      );
    });

    it('should handle errors gracefully and not throw', async () => {
      clientMock.upsertWikiPage.mockRejectedValueOnce(new Error('API Error'));

      const collection = { id: '1', name: 'Test' };

      const result = await syncCollectionToWiki(
        clientMock,
        { project: 'MyProject', wikiId: 'wiki-001' },
        collection,
        'myorg'
      );

      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('generateWikiPage content', () => {
    it('should generate valid markdown with all sections', () => {
      const collection = {
        id: '1',
        name: 'Test Collection',
        icon: '📦',
        color: '#10b981',
        scope: 'shared',
        comments: [],
        workItemIds: ['1001'],
        repos: [{ id: 'repo-1', name: 'api', project: 'MyProject' }],
        pipelines: [{ id: '100', name: 'api-deploy', project: 'MyProject' }],
        prIds: ['45'],
        serviceConnections: [],
        wikiPages: [{ id: 'wiki-1', name: 'Docs', wikiName: 'wiki', project: 'MyProject' }],
      };

      const md = generateWikiPage(collection, 'myorg');

      expect(md).toContain('# 📦 Test Collection');
      expect(md).toContain('**Scope:** Shared');
      expect(md).toContain('## Work Items');
      expect(md).toContain('## Repositories');
      expect(md).toContain('## Pipelines');
      expect(md).toContain('## Pull Requests');
      expect(md).toContain('## Wiki Pages');
    });

    it('should include collection notes when present', () => {
      const collection = {
        id: '1',
        name: 'Test',
        comments: [
          { text: 'First note', author: 'Alice', createdAt: '2026-03-28T10:00:00Z' },
        ],
      };

      const md = generateWikiPage(collection, 'org');
      expect(md).toContain('## Collection Notes');
      expect(md).toContain('First note');
    });
  });
});