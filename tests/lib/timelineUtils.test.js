import { describe, it, expect } from 'vitest';
import {
  buildTimelineTree,
  getRecordStatus,
  getAggregateStatus,
  getJobsForPhase,
  getTasksForJob,
  findRecordById,
} from '../../src/lib/timelineUtils.js';
import { sampleTimelineRecords } from '../fixtures/adoResponses.js';

describe('timelineUtils', () => {
  describe('getRecordStatus', () => {
    it('should return pending for null input', () => {
      expect(getRecordStatus(null)).toBe('pending');
    });

    it('should return result when state is completed', () => {
      expect(getRecordStatus({ state: 'completed', result: 'succeeded' })).toBe('succeeded');
      expect(getRecordStatus({ state: 'completed', result: 'failed' })).toBe('failed');
    });

    it('should return inProgress when state is inProgress', () => {
      expect(getRecordStatus({ state: 'inProgress' })).toBe('inProgress');
    });

    it('should return state when not completed or inProgress', () => {
      expect(getRecordStatus({ state: 'queued' })).toBe('queued');
    });

    it('should return pending when no state or result', () => {
      expect(getRecordStatus({})).toBe('pending');
    });
  });

  describe('getAggregateStatus', () => {
    it('should return pending for empty/null children', () => {
      expect(getAggregateStatus(null)).toBe('pending');
      expect(getAggregateStatus([])).toBe('pending');
    });

    it('should return failed if any child failed', () => {
      const children = [{ state: 'completed', result: 'succeeded' }, { state: 'completed', result: 'failed' }];
      expect(getAggregateStatus(children)).toBe('failed');
    });

    it('should return inProgress if any child in progress', () => {
      const children = [{ state: 'completed', result: 'succeeded' }, { state: 'inProgress' }];
      expect(getAggregateStatus(children)).toBe('inProgress');
    });

    it('should return cancelled if any child cancelled', () => {
      const children = [{ state: 'completed', result: 'succeeded' }, { state: 'completed', result: 'cancelled' }];
      expect(getAggregateStatus(children)).toBe('cancelled');
    });

    it('should return succeededWithIssues if any child has issues', () => {
      const children = [{ state: 'completed', result: 'succeeded' }, { state: 'completed', result: 'succeededWithIssues' }];
      expect(getAggregateStatus(children)).toBe('succeededWithIssues');
    });

    it('should return succeeded if all children succeeded', () => {
      const children = [{ state: 'completed', result: 'succeeded' }, { state: 'completed', result: 'succeeded' }];
      expect(getAggregateStatus(children)).toBe('succeeded');
    });

    it('should return skipped if all children skipped', () => {
      const children = [{ state: 'completed', result: 'skipped' }, { state: 'completed', result: 'skipped' }];
      expect(getAggregateStatus(children)).toBe('skipped');
    });
  });

  describe('buildTimelineTree', () => {
    it('should return empty stages for null/empty input', () => {
      expect(buildTimelineTree(null).stages).toEqual([]);
      expect(buildTimelineTree([]).stages).toEqual([]);
    });

    it('should build tree with stages', () => {
      const records = [
        { id: 'stage-1', type: 'Stage', name: 'Build' },
        { id: 'phase-1', type: 'Phase', parentId: 'stage-1' },
        { id: 'job-1', type: 'Job', parentId: 'phase-1' },
      ];

      const result = buildTimelineTree(records);
      expect(result.stages).toHaveLength(1);
      expect(result.stages[0].name).toBe('Build');
      expect(result.stages[0].phases).toHaveLength(1);
      expect(result.stages[0].phases[0].jobs).toHaveLength(1);
    });

    it('should create synthetic stage when no stages exist', () => {
      const records = [
        { id: 'phase-1', type: 'Phase' },
        { id: 'job-1', type: 'Job', parentId: 'phase-1' },
      ];

      const result = buildTimelineTree(records);
      expect(result.stages).toHaveLength(1);
      expect(result.stages[0]._synthetic).toBe(true);
      expect(result.stages[0].name).toBe('Pipeline');
    });

    it('should create synthetic phase when no phases exist', () => {
      const records = [
        { id: 'job-1', type: 'Job' },
        { id: 'task-1', type: 'Task', parentId: 'job-1' },
      ];

      const result = buildTimelineTree(records);
      expect(result.stages).toHaveLength(1);
      expect(result.stages[0].phases).toHaveLength(1);
      expect(result.stages[0].phases[0]._synthetic).toBe(true);
    });
  });

  describe('getJobsForPhase', () => {
    it('should filter jobs by parentId', () => {
      const jobs = getJobsForPhase(sampleTimelineRecords, 'phase-1');
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe('Build_Job');
    });

    it('should return empty array when no matches', () => {
      const jobs = getJobsForPhase(sampleTimelineRecords, 'unknown-phase');
      expect(jobs).toHaveLength(0);
    });
  });

  describe('getTasksForJob', () => {
    it('should filter tasks by parentId', () => {
      const tasks = getTasksForJob(sampleTimelineRecords, 'job-1');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe('npm install');
    });
  });

  describe('findRecordById', () => {
    it('should find record by id', () => {
      const record = findRecordById(sampleTimelineRecords, 'job-1');
      expect(record.name).toBe('Build_Job');
    });

    it('should return null when not found', () => {
      expect(findRecordById(sampleTimelineRecords, 'nonexistent')).toBe(null);
    });
  });
});