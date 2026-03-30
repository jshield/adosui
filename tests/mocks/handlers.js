import { http, HttpResponse } from 'msw';
import {
  sampleProjects,
  sampleRepos,
  samplePipelines,
  samplePipelineRuns,
  samplePullRequests,
  sampleWorkItems,
  sampleTestRuns,
  sampleServiceConnections,
  sampleWikiPages,
  sampleProfile,
} from '../fixtures/adoResponses.js';

export const adoHandlers = [
  // Connection test
  http.get('https://dev.azure.com/:org/_apis/projects', () => {
    return HttpResponse.json({ value: sampleProjects });
  }),

  // Profile
  http.get('https://dev.azure.com/:org/_apis/connectionData', () => {
    return HttpResponse.json({
      authenticatedUser: {
        id: sampleProfile.id,
        providerDisplayName: sampleProfile.displayName,
        properties: { Account: { $value: sampleProfile.emailAddress } },
        descriptor: 'foo\\testuser',
      },
    });
  }),

  // Work Items Search
  http.post('https://dev.azure.com/:org/_apis/wit/wiql', ({ request }) => {
    return HttpResponse.json({
      workItems: sampleWorkItems.map(wi => ({ id: wi.id })),
    });
  }),

  // Work Items By IDs
  http.get('https://dev.azure.com/:org/_apis/wit/work', ({ request }) => {
    const url = new URL(request.url);
    const ids = url.searchParams.get('ids');
    if (!ids) return HttpResponse.json({ value: [] });

    const idList = ids.split(',');
    const items = sampleWorkItems.filter(wi => idList.includes(wi.id));
    return HttpResponse.json({ value: items.map(wi => ({ ...wi.fields, ...wi })) });
  }),

  // Work Item Comments
  http.get('https://dev.azure.com/:org/:project/_apis/wit/workItems/:id/comments', () => {
    return HttpResponse.json({
      comments: [
        { id: 'c1', text: 'Fixed in this PR', author: { displayName: 'Alice' }, createdDate: '2026-03-28T10:00:00Z' },
      ],
    });
  }),

  // Repositories
  http.get('https://dev.azure.com/:org/:project/_apis/git/repositories', () => {
    return HttpResponse.json({ value: sampleRepos });
  }),

  // Pipelines
  http.get('https://dev.azure.com/:org/:project/_apis/pipelines', () => {
    return HttpResponse.json({ value: samplePipelines });
  },

  // Pipeline Runs
  http.get('https://dev.azure.com/:org/:project/_apis/pipelines/:pipelineId/runs', () => {
    return HttpResponse.json({ value: samplePipelineRuns.slice(0, 5) });
  }),

  // Build Runs (legacy)
  http.get('https://dev.azure.com/:org/:project/_apis/build/builds', ({ request }) => {
    const url = new URL(request.url);
    const defId = url.searchParams.get('definitions');
    return HttpResponse.json({
      value: samplePipelineRuns.filter(r => r.pipeline?.id === defId),
    });
  }),

  // Pull Requests
  http.get('https://dev.azure.com/:org/:project/_apis/git/pullrequests', () => {
    return HttpResponse.json({ value: samplePullRequests });
  }),

  // Test Runs
  http.get('https://dev.azure.com/:org/:project/_apis/test/runs', () => {
    return HttpResponse.json({ value: sampleTestRuns });
  }),

  // Service Connections
  http.get('https://dev.azure.com/:org/:project/_apis/serviceendpoint/endpoints', () => {
    return HttpResponse.json({ value: sampleServiceConnections });
  }),

  // Wikis
  http.get('https://dev.azure.com/:org/:project/_apis/wiki/wikis', () => {
    return HttpResponse.json({ value: sampleWikiPages });
  },

  http.get('https://dev.azure.com/:org/_apis/wiki/wikis', () => {
    return HttpResponse.json({ value: sampleWikiPages });
  }),

  // Git refs (for pushGitFile)
  http.get('https://dev.azure.com/:org/:project/_apis/git/repositories/:repoId/refs', () => {
    return HttpResponse.json({
      value: [{ name: 'refs/heads/main', objectId: 'abc1230000000000000000000000000000000000' }],
    });
  }),

  // Git items (for reading files)
  http.get('https://dev.azure.com/:org/:project/_apis/git/repositories/:repoId/items', ({ request }) => {
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    if (!path) return HttpResponse.json({ value: [] });

    // Return mock file content for collection YAML files
    if (path.includes('collections/')) {
      return HttpResponse.json({
        objectId: 'abc123',
        content: 'id: test-col\nname: Test Collection\n',
      });
    }
    return HttpResponse.json({ value: [] });
  }),

  // Git push (for saving collections)
  http.post('https://dev.azure.com/:org/:project/_apis/git/repositories/:repoId/pushes', () => {
    return HttpResponse.json({ value: [{ pushId: 1 }] });
  }),

  // Wiki page upsert
  http.put('https://dev.azure.com/:org/:project/_apis/wiki/wikis/:wikiId/pages', () => {
    return HttpResponse.json({ path: 'ADO-SuperUI/Collections/Test' });
  }),
];