import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildGraphData,
  layoutGraph,
  buildPipelineGraph,
} from '../../src/lib/pipelineGraphBuilder.js';

describe('pipelineGraphBuilder', () => {
  describe('buildGraphData', () => {
    it('should return empty nodes for null timeline', () => {
      const result = buildGraphData(null, {}, []);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('should return empty for empty records', () => {
      const result = buildGraphData({ records: [] }, {}, []);
      expect(result.nodes).toEqual([]);
    });

    it('should build stage nodes when multiple stages', () => {
      const timeline = {
        records: [
          { id: 'stage-1', type: 'Stage', name: 'Build', state: 'completed', result: 'succeeded' },
          { id: 'stage-2', type: 'Stage', name: 'Deploy', state: 'inProgress' },
        ],
      };

      const result = buildGraphData(timeline, {}, []);
      expect(result.nodes.filter(n => n.type === 'stage')).toHaveLength(2);
    });

    it('should skip stage for single default stage pipeline', () => {
      const timeline = {
        records: [
          { id: 'stage-1', type: 'Stage', name: '__default', state: 'completed', result: 'succeeded' },
          { id: 'phase-1', type: 'Phase', name: 'Phase_1', parentId: 'stage-1' },
        ],
      };

      const result = buildGraphData(timeline, {}, []);
      expect(result.nodes.some(n => n.type === 'stage')).toBe(false);
    });

    it('should build phase nodes', () => {
      const timeline = {
        records: [
          { id: 'stage-1', type: 'Stage', name: 'Build' },
          { id: 'phase-1', type: 'Phase', name: 'BuildPhase', parentId: 'stage-1' },
        ],
      };

      const result = buildGraphData(timeline, {}, []);
      expect(result.nodes.some(n => n.type === 'phase')).toBe(true);
    });

    it('should build job nodes with status', () => {
      const timeline = {
        records: [
          { id: 'stage-1', type: 'Stage', name: 'Build' },
          { id: 'phase-1', type: 'Phase', name: 'Phase', parentId: 'stage-1' },
          { id: 'job-1', type: 'Job', name: 'BuildJob', parentId: 'phase-1', state: 'completed', result: 'succeeded', startTime: '2026-03-29T10:00:00Z', finishTime: '2026-03-29T10:05:00Z', workerName: 'agent1', errorCount: 0, warningCount: 2 },
        ],
      };

      const result = buildGraphData(timeline, {}, []);
      const job = result.nodes.find(n => n.type === 'job');
      expect(job.name).toBe('BuildJob');
      expect(job.status).toBe('succeeded');
      expect(job.data.workerName).toBe('agent1');
      expect(job.data.warningCount).toBe(2);
    });

    it('should create edges for stage contains phase', () => {
      const timeline = {
        records: [
          { id: 'stage-1', type: 'Stage', name: 'Build' },
          { id: 'phase-1', type: 'Phase', name: 'p1', parentId: 'stage-1' },
        ],
      };

      const result = buildGraphData(timeline, {}, []);
      expect(result.edges.some(e => e.type === 'contains')).toBe(true);
    });

    it('should create edges for phase contains job', () => {
      const timeline = {
        records: [
          { id: 'stage-1', type: 'Stage', name: 'Build' },
          { id: 'phase-1', type: 'Phase', name: 'p1', parentId: 'stage-1' },
          { id: 'job-1', type: 'Job', name: 'j1', parentId: 'phase-1' },
        ],
      };

      const result = buildGraphData(timeline, {}, []);
      expect(result.edges).toHaveLength(2);
    });
  });

  describe('layoutGraph', () => {
    it('should add x/y positions to nodes', () => {
      const nodes = [
        { id: '1', type: 'stage', width: 100, height: 50 },
        { id: '2', type: 'phase', width: 80, height: 40 },
      ];
      const edges = [{ source: '1', target: '2', type: 'contains' }];

      const result = layoutGraph(nodes, edges);
      expect(result.nodes[0].x).toBeDefined();
      expect(result.nodes[0].y).toBeDefined();
    });

    it('should add points to edges', () => {
      const nodes = [
        { id: '1', type: 'stage', width: 100, height: 50 },
        { id: '2', type: 'phase', width: 80, height: 40 },
      ];
      const edges = [{ source: '1', target: '2', type: 'contains' }];

      const result = layoutGraph(nodes, edges);
      expect(result.edges[0].points).toBeDefined();
    });

    it('should set graph dimensions', () => {
      const nodes = [{ id: '1', type: 'stage', width: 100, height: 50 }];
      const result = layoutGraph(nodes, []);

      expect(result.width).toBeDefined();
      expect(result.height).toBeDefined();
    });
  });

  describe('buildPipelineGraph', () => {
    it('should combine buildGraphData and layoutGraph', () => {
      const timeline = {
        records: [
          { id: 'stage-1', type: 'Stage', name: 'Build' },
          { id: 'phase-1', type: 'Phase', name: 'Phase1', parentId: 'stage-1' },
          { id: 'job-1', type: 'Job', name: 'Job1', parentId: 'phase-1', state: 'inProgress' },
        ],
      };

      const result = buildPipelineGraph(timeline, {}, []);
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.edges.length).toBeGreaterThan(0);
      expect(result.width).toBeDefined();
    });
  });
});