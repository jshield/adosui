// Sample ADO API responses for testing
export const sampleProjects = [
  { id: 'proj-001', name: 'MyProject', description: 'Test project' },
  { id: 'proj-002', name: 'Backend Services', description: 'Backend team project' },
];

export const sampleRepos = [
  {
    id: 'repo-001',
    name: 'frontend-app',
    project: { name: 'MyProject' },
    remoteUrl: 'https://dev.azure.com/myorg/MyProject/_git/frontend-app',
  },
  {
    id: 'repo-002',
    name: 'api-service',
    project: { name: 'MyProject' },
    remoteUrl: 'https://dev.azure.com/myorg/MyProject/_git/api-service',
  },
];

export const samplePipelines = [
  {
    id: '100',
    name: 'frontend-deploy',
    folder: '\\MyProject\\Builds',
    configurationType: 'yaml',
  },
  {
    id: '101',
    name: 'api-deploy',
    folder: '\\MyProject\\Builds',
    configurationType: 'yaml',
  },
];

export const samplePipelineRuns = [
  {
    id: 500,
    pipeline: { id: '100' },
    state: 'completed',
    result: 'succeeded',
    queueTime: '2026-03-29T10:00:00Z',
    startTime: '2026-03-29T10:01:00Z',
    finishTime: '2026-03-29T10:15:00Z',
    sourceBranch: 'refs/heads/main',
    sourceRefName: 'refs/heads/main',
    repository: { refName: 'refs/heads/main' },
  },
  {
    id: 501,
    pipeline: { id: '100' },
    state: 'inProgress',
    result: null,
    queueTime: '2026-03-29T11:00:00Z',
    startTime: '2026-03-29T11:01:00Z',
    sourceBranch: 'refs/heads/feature-branch',
    sourceRefName: 'refs/heads/feature-branch',
  },
  {
    id: 502,
    pipeline: { id: '101' },
    state: 'completed',
    result: 'failed',
    queueTime: '2026-03-29T09:00:00Z',
    startTime: '2026-03-29T09:01:00Z',
    finishTime: '2026-03-29T09:25:00Z',
    sourceBranch: 'refs/heads/main',
  },
];

export const samplePullRequests = [
  {
    pullRequestId: 45,
    title: 'Add user authentication',
    status: 'active',
    sourceRefName: 'refs/heads/feature-auth',
    targetRefName: 'refs/heads/main',
    repository: { name: 'frontend-app' },
  },
  {
    pullRequestId: 46,
    title: 'Fix memory leak in cache',
    status: 'completed',
    sourceRefName: 'refs/heads/fix/cache-leak',
    targetRefName: 'refs/heads/main',
    repository: { name: 'api-service' },
  },
];

export const sampleWorkItems = [
  {
    id: '1001',
    fields: {
      'System.Id': 1001,
      'System.Title': 'Implement login page',
      'System.WorkItemType': 'Feature',
      'System.State': 'In Progress',
      'Microsoft.VSTS.Common.Priority': 2,
      'System.AssignedTo': { displayName: 'Alice Smith' },
      'System.ChangedDate': '2026-03-28T10:00:00Z',
      'System.AreaPath': 'MyProject\\Frontend',
    },
  },
  {
    id: '1002',
    fields: {
      'System.Id': 1002,
      'System.Title': 'Database migration failed',
      'System.WorkItemType': 'Bug',
      'System.State': 'Active',
      'Microsoft.VSTS.Common.Priority': 1,
      'System.AssignedTo': { displayName: 'Bob Jones' },
      'System.ChangedDate': '2026-03-29T08:00:00Z',
      'System.AreaPath': 'MyProject\\Backend',
    },
  },
];

export const sampleTestRuns = [
  {
    id: 200,
    name: 'Build #500',
    state: 'completed',
    stats: { passed: 45, failed: 3, blocked: 0 },
  },
];

export const sampleServiceConnections = [
  {
    id: 'sc-001',
    name: 'Azure-Production',
    type: 'azure',
  },
  {
    id: 'sc-002',
    name: 'AWS-Dev',
    type: 'aws',
  },
];

export const sampleWikiPages = [
  {
    id: 'wiki-001',
    name: 'Getting Started',
    path: '/Getting Started',
  },
];

export const sampleTimelineRecords = [
  {
    id: 'stage-1',
    type: 'Stage',
    name: 'Build',
    state: 'completed',
    result: 'succeeded',
  },
  {
    id: 'stage-2',
    type: 'Stage',
    name: 'Deploy',
    state: 'inProgress',
  },
  {
    id: 'phase-1',
    type: 'Phase',
    name: 'Build_Phase',
    parentId: 'stage-1',
  },
  {
    id: 'job-1',
    type: 'Job',
    name: 'Build_Job',
    parentId: 'phase-1',
    state: 'completed',
    result: 'succeeded',
    startTime: '2026-03-29T10:00:00Z',
    finishTime: '2026-03-29T10:05:00Z',
    workerName: 'azepool123',
    errorCount: 0,
    warningCount: 2,
  },
  {
    id: 'task-1',
    type: 'Task',
    name: 'npm install',
    parentId: 'job-1',
    order: 1,
    result: 'succeeded',
  },
];

export const sampleProfile = {
  id: 'user-001',
  displayName: 'Test User',
  emailAddress: 'testuser@azuredevops.com',
};

export const sampleCollection = {
  id: 'col-001',
  name: 'Production Deployments',
  icon: '🚀',
  color: '#10b981',
  scope: 'shared',
  owner: null,
  filters: { types: [], states: [], assignee: '', areaPath: '' },
  comments: [
    { id: 'c1', text: 'Note for team', author: 'Alice', createdAt: '2026-03-28T10:00:00Z' },
  ],
  workItemIds: ['1001', '1002'],
  repos: [
    { id: 'repo-001', comments: [] },
  ],
  pipelines: [
    { id: '100', name: 'frontend-deploy', project: 'MyProject', comments: [], runs: [] },
  ],
  prIds: ['45'],
  serviceConnections: [],
  wikiPages: [],
};

export const sampleLegacyCollection = {
  id: 'col-legacy',
  name: 'Old Collection',
  repoIds: ['repo-001', 'repo-002'],
  pipelineIds: ['100'],
  workItemIds: ['1001'],
};