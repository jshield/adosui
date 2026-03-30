import { describe, it, expect } from 'vitest';
import {
  createLogComment,
  getCommentedLineIndices,
  getCommentLineRange,
  upsertRunComments,
  getRunComments,
} from '../../src/lib/commentUtils.js';

describe('commentUtils', () => {
  describe('createLogComment', () => {
    it('should create comment with generated ID', () => {
      const comment = createLogComment({
        runId: '500',
        pipelineId: '100',
        recordId: 'task-1',
        startLine: 10,
        endLine: 20,
        author: 'Alice',
        authorId: 'user-001',
        text: 'Found issue here',
      });

      expect(comment.id).toMatch(/^comment-/);
      expect(comment.author).toBe('Alice');
      expect(comment.authorId).toBe('user-001');
      expect(comment.text).toBe('Found issue here');
      expect(comment.resolved).toBe(false);
      expect(comment.createdAt).toBeDefined();
      expect(comment.lineRefs).toHaveLength(11); // 10-20 inclusive
    });

    it('should handle single line comment', () => {
      const comment = createLogComment({
        runId: '500',
        recordId: 'task-1',
        startLine: 5,
        endLine: 5,
        text: 'Line 5 only',
      });

      expect(comment.lineRefs).toHaveLength(1);
      expect(comment.lineRefs[0]).toBe('task-1-5');
    });

    it('should use defaults for optional fields', () => {
      const comment = createLogComment({
        recordId: 'task-1',
        startLine: 1,
        endLine: 3,
      });

      expect(comment.author).toBe('');
      expect(comment.authorId).toBe('');
      expect(comment.text).toBe('');
    });
  });

  describe('getCommentedLineIndices', () => {
    const lines = [
      { lineNumber: 1, content: 'line1' },
      { lineNumber: 2, content: 'line2' },
      { lineNumber: 3, content: 'line3' },
      { lineNumber: 4, content: 'line4' },
      { lineNumber: 5, content: 'line5' },
    ];

    it('should return empty set for null inputs', () => {
      expect(getCommentedLineIndices(null, 'task-1', lines)).toEqual(new Set());
      expect(getCommentedLineIndices([], null, lines)).toEqual(new Set());
      expect(getCommentedLineIndices([], 'task-1', null)).toEqual(new Set());
    });

    it('should return indices of commented lines', () => {
      const comments = [
        { lineRefs: ['task-1-1', 'task-1-2', 'task-1-3'], resolved: false },
        { lineRefs: ['task-1-5'], resolved: false },
      ];

      const indices = getCommentedLineIndices(comments, 'task-1', lines);
      expect(indices).toContain(0); // line 1
      expect(indices).toContain(1); // line 2
      expect(indices).toContain(2); // line 3
      expect(indices).toContain(4); // line 5
      expect(indices.size).toBe(4);
    });

    it('should exclude resolved comments', () => {
      const comments = [
        { lineRefs: ['task-1-1'], resolved: true },
        { lineRefs: ['task-1-2'], resolved: false },
      ];

      const indices = getCommentedLineIndices(comments, 'task-1', lines);
      expect(indices).not.toContain(0);
      expect(indices).toContain(1);
    });

    it('should only match comments for current recordId', () => {
      const comments = [
        { lineRefs: ['task-1-1'], resolved: false },
        { lineRefs: ['task-2-1'], resolved: false }, // different record
      ];

      const indices = getCommentedLineIndices(comments, 'task-1', lines);
      expect(indices).toContain(0);
      expect(indices.size).toBe(1);
    });
  });

  describe('getCommentLineRange', () => {
    it('should return "General" for no line refs', () => {
      const comment = { lineRefs: [] };
      expect(getCommentLineRange(comment)).toBe('General');
    });

    it('should return "Line X" for single line', () => {
      const comment = { lineRefs: ['task-1-42'] };
      expect(getCommentLineRange(comment)).toBe('Line 42');
    });

    it('should return "Lines X-Y" for range', () => {
      const comment = { lineRefs: ['task-1-5', 'task-1-6', 'task-1-7'] };
      expect(getCommentLineRange(comment)).toBe('Lines 5-7');
    });

    it('should handle non-sequential lines', () => {
      const comment = { lineRefs: ['task-1-1', 'task-1-10', 'task-1-20'] };
      expect(getCommentLineRange(comment)).toBe('Lines 1-20');
    });
  });

  describe('upsertRunComments', () => {
    it('should add new run comments', () => {
      const runs = [];
      const result = upsertRunComments(runs, '500', [{ text: 'comment1' }]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('500');
      expect(result[0].comments).toHaveLength(1);
    });

    it('should update existing run comments', () => {
      const runs = [
        { id: '500', comments: [{ text: 'old comment' }] },
      ];
      const result = upsertRunComments(runs, '500', [{ text: 'new comment' }]);

      expect(result).toHaveLength(1);
      expect(result[0].comments).toHaveLength(1);
      expect(result[0].comments[0].text).toBe('new comment');
    });

    it('should cap runs at 5 - keeping newest', () => {
      let runs = [];
      for (let i = 1; i <= 6; i++) {
        runs = upsertRunComments(runs, String(i), [{ text: `run ${i}` }]);
      }

      // When exceeding 5, code removes oldest entry (splice(0, count-5))
      expect(runs).toHaveLength(5);
      expect(runs[0].id).toBe('2'); // oldest (1) was removed when 6 was added
      expect(runs[4].id).toBe('6'); // newest kept
    });
  });

  describe('getRunComments', () => {
    const collection = {
      pipelines: [
        {
          id: '100',
          runs: [
            { id: '500', comments: [{ text: 'found bug' }] },
            { id: '501', comments: [] },
          ],
        },
      ],
    };

    it('should return comments for matching pipeline and run', () => {
      const comments = getRunComments(collection, '100', '500');
      expect(comments).toHaveLength(1);
      expect(comments[0].text).toBe('found bug');
    });

    it('should return empty array when run not found', () => {
      const comments = getRunComments(collection, '100', '999');
      expect(comments).toEqual([]);
    });

    it('should return empty array when pipeline not found', () => {
      const comments = getRunComments(collection, '999', '500');
      expect(comments).toEqual([]);
    });

    it('should return empty array for null collection', () => {
      expect(getRunComments(null, '100', '500')).toEqual([]);
    });
  });
});