import { describe, it, expect } from 'vitest';
import {
  buildLineId,
  buildLineIdsForRange,
  parseLineId,
} from '../../src/lib/lineMatching.js';

describe('lineMatching', () => {
  describe('buildLineId', () => {
    it('should build line ID with recordId and lineNumber', () => {
      expect(buildLineId('task-1', 1)).toBe('task-1-1');
      expect(buildLineId('job-abc', 42)).toBe('job-abc-42');
    });

    it('should handle numeric line numbers', () => {
      expect(buildLineId('rec', 100)).toBe('rec-100');
    });
  });

  describe('buildLineIdsForRange', () => {
    it('should build array of line IDs for a range', () => {
      const ids = buildLineIdsForRange('task-1', 1, 3);
      expect(ids).toEqual(['task-1-1', 'task-1-2', 'task-1-3']);
    });

    it('should handle single line range', () => {
      const ids = buildLineIdsForRange('task-1', 5, 5);
      expect(ids).toEqual(['task-1-5']);
    });

    it('should handle large ranges', () => {
      const ids = buildLineIdsForRange('rec', 1, 10);
      expect(ids).toHaveLength(10);
      expect(ids[0]).toBe('rec-1');
      expect(ids[9]).toBe('rec-10');
    });
  });

  describe('parseLineId', () => {
    it('should parse valid line ID', () => {
      const result = parseLineId('task-1-42');
      expect(result.recordId).toBe('task-1');
      expect(result.lineNumber).toBe(42);
    });

    it('should return null for invalid format', () => {
      expect(parseLineId('invalid')).toBe(null);
      expect(parseLineId('')).toBe(null);
      expect(parseLineId(null)).toBe(null);
      expect(parseLineId('task-noNumber')).toBe(null);
    });

    it('should handle line IDs with hyphens in recordId', () => {
      const result = parseLineId('job-with-dashes-1-5');
      expect(result.recordId).toBe('job-with-dashes-1');
      expect(result.lineNumber).toBe(5);
    });
  });
});