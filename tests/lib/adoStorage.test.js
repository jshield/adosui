import { describe, it, expect } from 'vitest';
import {
  migrateCollection,
  PINNED_PIPELINES_ID,
} from '../../src/lib/adoStorage.js';
import { sampleLegacyCollection, sampleCollection } from '../fixtures/adoResponses.js';

describe('adoStorage', () => {
  describe('migrateCollection', () => {
    it('should return empty comments array when no comments', () => {
      const col = { id: '1', name: 'Test' };
      const migrated = migrateCollection(col);
      expect(migrated.comments).toEqual([]);
    });

    it('should migrate repoIds to repos array', () => {
      const legacy = { id: '1', repoIds: ['repo-1', 'repo-2'] };
      const migrated = migrateCollection(legacy);
      
      expect(migrated.repos).toHaveLength(2);
      expect(migrated.repos[0].id).toBe('repo-1');
      expect(migrated.repos[0].comments).toEqual([]);
      expect(migrated.repoIds).toBeUndefined();
    });

    it('should migrate pipelineIds to pipelines array', () => {
      const legacy = { id: '1', pipelineIds: ['100', '200'] };
      const migrated = migrateCollection(legacy);
      
      expect(migrated.pipelines).toHaveLength(2);
      expect(migrated.pipelines[0].id).toBe('100');
      expect(migrated.pipelines[0].comments).toEqual([]);
      expect(migrated.pipelines[0].runs).toEqual([]);
      expect(migrated.pipelineIds).toBeUndefined();
    });

    it('should preserve existing repos structure', () => {
      const col = {
        id: '1',
        repos: [
          { id: 'repo-1', comments: [{ text: 'note1' }] },
          { id: 'repo-2' },
        ],
      };
      const migrated = migrateCollection(col);
      
      expect(migrated.repos[0].comments).toEqual([{ text: 'note1' }]);
      expect(migrated.repos[1].comments).toEqual([]);
    });

    it('should ensure workItemIds is array of strings', () => {
      const col = { id: '1', workItemIds: [1001, 1002] };
      const migrated = migrateCollection(col);
      
      expect(migrated.workItemIds).toEqual(['1001', '1002']);
    });

    it('should ensure prIds is array of strings', () => {
      const col = { id: '1', prIds: [45, 46] };
      const migrated = migrateCollection(col);
      
      expect(migrated.prIds).toEqual(['45', '46']);
    });

    it('should migrate serviceConnections', () => {
      const col = { id: '1', serviceConnections: ['sc-1', 'sc-2'] };
      const migrated = migrateCollection(col);
      
      expect(migrated.serviceConnections).toHaveLength(2);
      expect(migrated.serviceConnections[0].id).toBe('sc-1');
      expect(migrated.serviceConnections[0].comments).toEqual([]);
    });

    it('should migrate wikiPages', () => {
      const col = { id: '1', wikiPages: ['wiki-1'] };
      const migrated = migrateCollection(col);
      
      expect(migrated.wikiPages).toHaveLength(1);
      expect(migrated.wikiPages[0].id).toBe('wiki-1');
      expect(migrated.wikiPages[0].comments).toEqual([]);
    });

    it('should ensure filters object exists', () => {
      const col = { id: '1' };
      const migrated = migrateCollection(col);
      
      expect(migrated.filters).toEqual({ types: [], states: [], assignee: '', areaPath: '' });
    });

    it('should preserve existing comments', () => {
      const col = {
        id: '1',
        comments: [
          { text: 'note1', author: 'Alice' },
          { text: 'note2', author: 'Bob' },
        ],
      };
      const migrated = migrateCollection(col);
      
      expect(migrated.comments).toHaveLength(2);
      expect(migrated.comments[0].text).toBe('note1');
    });

    it('should handle fully migrated collection', () => {
      const col = { ...sampleCollection };
      const migrated = migrateCollection(col);
      
      expect(migrated.id).toBe(col.id);
      expect(migrated.name).toBe(col.name);
      expect(migrated.scope).toBe('shared');
      expect(migrated.repos).toHaveLength(1);
      expect(migrated.pipelines).toHaveLength(1);
    });
  });

  describe('PINNED_PIPELINES_ID', () => {
    it('should have correct constant value', () => {
      expect(PINNED_PIPELINES_ID).toBe('pinned-pipelines');
    });
  });
});