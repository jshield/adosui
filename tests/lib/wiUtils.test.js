import { describe, it, expect } from 'vitest';
import {
  WI_TYPE_COLOR,
  WI_TYPE_SHORT,
  stateColor,
  timeAgo,
  pipelineStatus,
  branchName,
  prStatus,
  isInCollection,
  workItemUrl,
  pipelineUrl,
  serviceConnectionUrl,
  wikiPageUrl,
  repoUrl,
  prUrl,
  getLatestRun,
  getRunBranch,
  getRunStatusVal,
  getLatestPerBranch,
} from '../../src/lib/wiUtils.js';

describe('wiUtils', () => {
  describe('WI_TYPE_COLOR', () => {
    it('should have correct colors for each work item type', () => {
      expect(WI_TYPE_COLOR.Epic).toBe('#F59E0B');
      expect(WI_TYPE_COLOR.Feature).toBe('#22D3EE');
      expect(WI_TYPE_COLOR['User Story']).toBe('#A78BFA');
      expect(WI_TYPE_COLOR.Bug).toBe('#F87171');
      expect(WI_TYPE_COLOR.Task).toBe('#94A3B8');
    });
  });

  describe('WI_TYPE_SHORT', () => {
    it('should have correct short labels', () => {
      expect(WI_TYPE_SHORT.Epic).toBe('EPIC');
      expect(WI_TYPE_SHORT.Feature).toBe('FEAT');
      expect(WI_TYPE_SHORT['User Story']).toBe('STORY');
      expect(WI_TYPE_SHORT.Bug).toBe('BUG');
      expect(WI_TYPE_SHORT.Task).toBe('TASK');
    });
  });

  describe('stateColor', () => {
    it('should return cyan for active states', () => {
      expect(stateColor('Active')).toBe('#22D3EE');
      expect(stateColor('In Progress')).toBe('#22D3EE');
      expect(stateColor('Doing')).toBe('#22D3EE');
    });

    it('should return green for completed states', () => {
      expect(stateColor('Done')).toBe('#4ADE80');
      expect(stateColor('Closed')).toBe('#4ADE80');
      expect(stateColor('Resolved')).toBe('#4ADE80');
      expect(stateColor('Complete')).toBe('#4ADE80');
    });

    it('should return red for blocked states', () => {
      expect(stateColor('Blocked')).toBe('#F87171');
    });

    it('should return muted for unknown states', () => {
      expect(stateColor('New')).toBe('#6B7280');
      expect(stateColor('')).toBe('#6B7280');
      expect(stateColor(null)).toBe('#6B7280');
    });

    it('should handle case insensitivity', () => {
      expect(stateColor('ACTIVE')).toBe('#22D3EE');
      expect(stateColor('DONE')).toBe('#4ADE80');
    });
  });

  describe('timeAgo', () => {
    it('should return "—" for null/undefined input', () => {
      expect(timeAgo(null)).toBe('—');
      expect(timeAgo(undefined)).toBe('—');
    });

    it('should return "just now" for timestamps less than a minute ago', () => {
      const now = new Date();
      expect(timeAgo(now)).toBe('just now');
    });

    it('should return minutes for timestamps less than an hour ago', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(timeAgo(fiveMinAgo)).toBe('5m ago');

      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      expect(timeAgo(thirtyMinAgo)).toBe('30m ago');
    });

    it('should return hours for timestamps less than a day ago', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(timeAgo(twoHoursAgo)).toBe('2h ago');

      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
      expect(timeAgo(twelveHoursAgo)).toBe('12h ago');
    });

    it('should return days for timestamps more than a day ago', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(timeAgo(twoDaysAgo)).toBe('2d ago');
    });
  });

  describe('pipelineStatus', () => {
    it('should return correct status for succeeded result', () => {
      expect(pipelineStatus('succeeded')).toEqual({ color: '#4ADE80', label: 'passing' });
      expect(pipelineStatus({ result: 'succeeded' })).toEqual({ color: '#4ADE80', label: 'passing' });
    });

    it('should return correct status for failed result', () => {
      expect(pipelineStatus('failed')).toEqual({ color: '#F87171', label: 'failing' });
      expect(pipelineStatus({ result: 'failed' })).toEqual({ color: '#F87171', label: 'failing' });
    });

    it('should return correct status for running state', () => {
      expect(pipelineStatus('running')).toEqual({ color: '#F59E0B', label: 'running' });
      expect(pipelineStatus('inProgress')).toEqual({ color: '#F59E0B', label: 'running' });
      expect(pipelineStatus({ state: 'inProgress' })).toEqual({ color: '#F59E0B', label: 'running' });
    });

    it('should return correct status for cancelled', () => {
      expect(pipelineStatus('canceled')).toEqual({ color: '#6B7280', label: 'cancelled' });
      expect(pipelineStatus('cancelled')).toEqual({ color: '#6B7280', label: 'cancelled' });
    });

    it('should return dim for unknown status', () => {
      expect(pipelineStatus('unknown')).toEqual({ color: '#374151', label: 'unknown' });
      expect(pipelineStatus('')).toEqual({ color: '#374151', label: 'unknown' });
      expect(pipelineStatus(null)).toEqual({ color: '#374151', label: 'unknown' });
    });

    it('should handle object without result/state/status', () => {
      expect(pipelineStatus({})).toEqual({ color: '#374151', label: 'unknown' });
    });
  });

  describe('branchName', () => {
    it('should remove refs/heads/ prefix', () => {
      expect(branchName('refs/heads/main')).toBe('main');
      expect(branchName('refs/heads/feature-branch')).toBe('feature-branch');
    });

    it('should return original string if no prefix', () => {
      expect(branchName('main')).toBe('main');
      expect(branchName('')).toBe('');
      expect(branchName(null)).toBe('');
    });
  });

  describe('prStatus', () => {
    it('should return cyan for active PRs', () => {
      expect(prStatus('active')).toEqual({ color: '#22D3EE', label: 'open' });
    });

    it('should return green for completed/merged PRs', () => {
      expect(prStatus('completed')).toEqual({ color: '#4ADE80', label: 'merged' });
    });

    it('should return muted for abandoned PRs', () => {
      expect(prStatus('abandoned')).toEqual({ color: '#6B7280', label: 'closed' });
    });

    it('should return dim for unknown status', () => {
      expect(prStatus('unknown')).toEqual({ color: '#374151', label: 'unknown' });
      expect(prStatus('')).toEqual({ color: '#374151', label: 'unknown' });
    });
  });

  describe('isInCollection', () => {
    const collection = {
      workItemIds: ['1001', '1002'],
      repos: [{ id: 'repo-001', comments: [] }, { id: 'repo-003', comments: [] }],
      pipelines: [{ id: '100', comments: [], runs: [] }, { id: '200', comments: [], runs: [] }],
      prIds: ['45', '46'],
      serviceConnections: [{ id: 'sc-001', comments: [] }],
      wikiPages: [{ id: 'wiki-001', comments: [] }],
    };

    it('should return false for null collection', () => {
      expect(isInCollection(null, 'workitem', '1001')).toBe(false);
    });

    it('should check work items', () => {
      expect(isInCollection(collection, 'workitem', '1001')).toBe(true);
      expect(isInCollection(collection, 'workitem', '9999')).toBe(false);
    });

    it('should check repositories', () => {
      expect(isInCollection(collection, 'repo', 'repo-001')).toBe(true);
      expect(isInCollection(collection, 'repo', 'repo-002')).toBe(false);
    });

    it('should check pipelines', () => {
      expect(isInCollection(collection, 'pipeline', '100')).toBe(true);
      expect(isInCollection(collection, 'pipeline', '999')).toBe(false);
    });

    it('should check pull requests', () => {
      expect(isInCollection(collection, 'pr', '45')).toBe(true);
      expect(isInCollection(collection, 'pr', '99')).toBe(false);
    });

    it('should check service connections', () => {
      expect(isInCollection(collection, 'serviceconnection', 'sc-001')).toBe(true);
      expect(isInCollection(collection, 'serviceconnection', 'sc-999')).toBe(false);
    });

    it('should check wiki pages', () => {
      expect(isInCollection(collection, 'wiki', 'wiki-001')).toBe(true);
      expect(isInCollection(collection, 'wiki', 'wiki-999')).toBe(false);
    });

    it('should return false for unknown type', () => {
      expect(isInCollection(collection, 'unknown', '123')).toBe(false);
    });
  });

  describe('URL helpers', () => {
    const org = 'myorg';
    const project = 'MyProject';

    describe('workItemUrl', () => {
      it('should generate correct URL', () => {
        expect(workItemUrl(org, '1001')).toBe('https://dev.azure.com/myorg/_workitems/edit/1001');
        expect(workItemUrl(org, 1001)).toBe('https://dev.azure.com/myorg/_workitems/edit/1001');
      });
    });

    describe('pipelineUrl', () => {
      it('should generate correct URL', () => {
        expect(pipelineUrl(org, project, '100')).toBe('https://dev.azure.com/myorg/MyProject/_build?definitionId=100');
      });
    });

    describe('serviceConnectionUrl', () => {
      it('should generate correct URL', () => {
        expect(serviceConnectionUrl(org, project, 'sc-001'))
          .toBe('https://dev.azure.com/myorg/MyProject/_settings/adminservices?resourceId=sc-001');
      });
    });

    describe('wikiPageUrl', () => {
      it('should generate correct URL with path', () => {
        expect(wikiPageUrl(org, project, 'wiki-001', '/Getting Started'))
          .toBe('https://dev.azure.com/myorg/MyProject/_wiki/wikis/wiki-001?path=%2FGetting%20Started');
      });

      it('should handle null project', () => {
        expect(wikiPageUrl(org, null, 'wiki-001', '/Page'))
          .toBe('https://dev.azure.com/myorg/_wiki/wikis/wiki-001?path=%2FPage');
      });
    });

    describe('repoUrl', () => {
      it('should generate correct URL', () => {
        expect(repoUrl(org, project, 'frontend-app'))
          .toBe('https://dev.azure.com/myorg/MyProject/_git/frontend-app');
      });
    });

    describe('prUrl', () => {
      it('should generate correct URL', () => {
        expect(prUrl(org, project, '45'))
          .toBe('https://dev.azure.com/myorg/MyProject/_git/pullrequests/45');
      });
    });
  });

  describe('getLatestRun', () => {
    it('should return null for null/undefined input', () => {
      expect(getLatestRun(null)).toBe(null);
      expect(getLatestRun(undefined)).toBe(null);
    });

    it('should return first element for array input', () => {
      const runs = [{ id: 1 }, { id: 2 }];
      expect(getLatestRun(runs)).toEqual({ id: 1 });
    });

    it('should return object as-is for non-array input', () => {
      const run = { id: 1 };
      expect(getLatestRun(run)).toEqual({ id: 1 });
    });
  });

  describe('getRunBranch', () => {
    it('should return empty string for null/undefined input', () => {
      expect(getRunBranch(null)).toBe('');
      expect(getRunBranch(undefined)).toBe('');
    });

    it('should extract branch from sourceBranch', () => {
      expect(getRunBranch({ sourceBranch: 'refs/heads/main' })).toBe('main');
    });

    it('should extract branch from sourceRefName', () => {
      expect(getRunBranch({ sourceRefName: 'refs/heads/feature' })).toBe('feature');
    });

    it('should extract branch from repository.refName', () => {
      expect(getRunBranch({ repository: { refName: 'refs/heads/main' } })).toBe('main');
    });

    it('should extract branch from repository.branch', () => {
      expect(getRunBranch({ repository: { branch: 'refs/heads/dev' } })).toBe('dev');
    });
  });

  describe('getRunStatusVal', () => {
    it('should return empty string for null/undefined input', () => {
      expect(getRunStatusVal(null)).toBe('');
    });

    it('should extract from result field', () => {
      expect(getRunStatusVal({ result: 'succeeded' })).toBe('succeeded');
    });

    it('should extract from state field when no result', () => {
      expect(getRunStatusVal({ state: 'inProgress' })).toBe('inProgress');
    });

    it('should extract from status field when no result or state', () => {
      expect(getRunStatusVal({ status: 'queued' })).toBe('queued');
    });

    it('should handle array input by getting first element', () => {
      const runs = [{ result: 'failed' }, { result: 'succeeded' }];
      expect(getRunStatusVal(runs)).toBe('failed');
    });
  });

  describe('getLatestPerBranch', () => {
    it('should return empty object for non-array input', () => {
      expect(getLatestPerBranch(null)).toEqual({});
      expect(getLatestPerBranch(undefined)).toEqual({});
      expect(getLatestPerBranch('not an array')).toEqual({});
    });

    it('should group runs by branch and sort by startTime descending', () => {
      const runs = [
        { id: 1, startTime: '2026-03-29T10:00:00Z', sourceBranch: 'refs/heads/main' },
        { id: 2, startTime: '2026-03-29T12:00:00Z', sourceBranch: 'refs/heads/main' },
        { id: 3, startTime: '2026-03-29T11:00:00Z', sourceBranch: 'refs/heads/feature' },
      ];

      const result = getLatestPerBranch(runs);

      expect(result.main).toHaveLength(2);
      expect(result.main[0].id).toBe(2); // newest first
      expect(result.main[1].id).toBe(1);

      expect(result.feature).toHaveLength(1);
      expect(result.feature[0].id).toBe(3);
    });

    it('should handle unknown branch for runs without branch info', () => {
      const runs = [{ id: 1 }];
      const result = getLatestPerBranch(runs);
      expect(result.unknown).toHaveLength(1);
    });

    it('should handle all possible branch sources', () => {
      const runs = [
        { id: 1, sourceBranch: 'refs/heads/a' },
        { id: 2, sourceRefName: 'refs/heads/b' },
        { id: 3, repository: { refName: 'refs/heads/c' } },
        { id: 4, repository: { branch: 'refs/heads/d' } },
        { id: 5, resources: { repositories: { self: { refName: 'refs/heads/e' } } } },
      ];

      const result = getLatestPerBranch(runs);
      expect(result.a).toHaveLength(1);
      expect(result.b).toHaveLength(1);
      expect(result.c).toHaveLength(1);
      expect(result.d).toHaveLength(1);
      expect(result.e).toHaveLength(1);
    });
  });
});