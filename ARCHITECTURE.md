# ADO SuperUI — Architecture Guide

> **Purpose**: Rapid onboarding for agentic processes. Covers project structure, core patterns, data flow, and key integration points.

---

## 1. Project Overview

**ADO SuperUI** is a React SPA for managing Azure DevOps resources (work items, repos, pipelines, PRs, service connections, wiki pages, YAML tools, links). It uses collections to group related ADO resources, backed by YAML files stored in an ADO Git repo.

Resource types are defined in a config-driven registry (`collections/resource-types.yaml`). New resource types can be added via YAML with zero code changes.

| Attribute | Value |
|---|---|
| Framework | React 18 (JSX, no TypeScript) |
| Build tool | Vite 5 |
| State management | React `useState`/`useEffect` — no Redux/Zustand |
| Storage | ADO Git repo (YAML files via REST API) |
| Real-time | SignalR for pipeline log streaming |
| Local cache | `localStorage` (API cache, credentials), IndexedDB via Dexie (pipeline logs) |
| Auth | PAT stored encrypted (FIDO2 PRF or PBKDF2 passphrase) |
| Testing | Vitest + Testing Library (unit), Playwright (e2e) |

---

## 2. Project Structure

```
adosui/
├── src/
│   ├── main.jsx                    # ReactDOM entry point
│   ├── ui.jsx                      # Root App component (~750 lines, all state lives here)
│   ├── components/
│   │   ├── ui/                     # Atomic UI primitives
│   │   │   ├── index.jsx           # Pill, Dot, Card, Spinner, Btn, ResourceToggle, etc.
│   │   │   ├── CommentThread.jsx   # Comment thread UI
│   │   │   └── SchemaForm.jsx      # Dynamic form from YAML tool schema
│   │   └── views/                  # Feature views
│   │       ├── ConnectScreen.jsx   # Auth/login screen
│   │       ├── SetupScreen.jsx     # Config repo setup
│   │       ├── Rail.jsx            # Left sidebar (collections, navigation, profile)
│   │       ├── CollectionView.jsx  # Unified collection view (search, groups, tabs, links)
│   │       ├── TabBar.jsx          # Tab bar for tracking expanded resource details
│   │       ├── ResourceDetail.jsx  # Inline detail view (WI/Repo/Pipeline/PR/SC/Wiki)
│   │       ├── CollectionBuilder.jsx    # New collection wizard
│   │       ├── PipelinesView.jsx        # Pipelines dashboard with pinning
│   │       ├── PipelineLogsViewer.jsx   # Pipeline run logs + graph + comments
│   │       ├── LogViewer.jsx            # Virtualized log line viewer
│   │       ├── TimelineSidebar.jsx      # Phase/Job/Task tree sidebar
│   │       ├── RunTabs.jsx              # Run selector tabs
│   │       ├── CommentPanel.jsx         # Log comment side panel
│   │       ├── YamlToolsView.jsx        # YAML tools discovery + editing
│   │       ├── WorkerStatusView.jsx     # Background worker activity
│   │       ├── FilterPanel.jsx          # Work item filter controls
│   │       ├── BranchCommitDialog.jsx   # Branch/commit picker for YAML tools
│   │       ├── CollectionDropdown.jsx   # Project scope selector
│   │       ├── ErrorBoundary.jsx        # React error boundary
│   │       └── graph/                   # Pipeline graph visualization
│   │           ├── index.js
│   │           ├── PipelineGraph.jsx    # SVG-based graph renderer
│   │           ├── JobNode.jsx
│   │           ├── PhaseNode.jsx
│   │           └── ResourceNode.jsx
│   ├── hooks/
│   │   ├── index.js
│   │   ├── useLocalStorage.js
│   │   ├── useLogLines.js         # Fetches/caches log lines (Dexie + REST)
│   │   ├── usePipelineGraph.js    # Builds pipeline graph from timeline
│   │   └── usePipelineSignalR.js  # Live log streaming via SignalR
│   └── lib/
│       ├── index.js               # Re-exports: cache, T, wiUtils, resource types
│       ├── adoClient.js           # ADO REST API client (844 lines, all API calls)
│       ├── adoStorage.js          # Git-backed YAML collection storage
│       ├── backgroundWorker.js    # Background cache refresh worker (registry-driven)
│       ├── cache.js               # localStorage-backed TTL cache
│       ├── commentUtils.js        # Log comment creation/matching
│       ├── credentialStore.js     # PAT encryption (FIDO2 PRF + PBKDF2)
│       ├── encoding.js            # Base64/hex helpers
│       ├── lineMatching.js        # Deterministic line ID generation
│       ├── linkRules.js           # URL regex classification rules (load, match, format)
│       ├── pipelineGraphBuilder.js # Graph node/edge builder from timeline
│       ├── pipelineLogsDB.js      # Dexie IndexedDB for log lines
│       ├── pipelineParser.js      # YAML/log deployment target detection
│       ├── resourceApi.js         # Generic REST/file-backed API execution (config-driven)
│       ├── resourceDisplay.js     # Config-driven rendering helpers
│       ├── resourceTypes.js       # Central resource type registry (load, validate, helpers)
│       ├── theme.js               # Design tokens (T constant)
│       ├── timelineUtils.js       # Timeline tree builder + status helpers
│       ├── useCollectionData.js   # Shared data fetching hook
│       ├── wikiSync.js            # Markdown generation for wiki sync
│       ├── wiUtils.js             # Work item colors, status, URL helpers
│       └── yamlToolsManager.js    # YAML tool discovery, schema, CRUD
├── ado-server.js                  # Optional static file server (SPA hosting)
├── ado-proxy.js                   # CORS proxy (deprecated, ADO now allows CORS)
├── vite.config.js                 # Vite config (base: /adosui/)
├── vitest.config.js
├── playwright.config.js
└── tests/                         # Test suite
    ├── setup.js
    ├── fixtures/
    ├── mocks/
    ├── lib/                       # Unit tests for lib modules
    └── e2e/                       # Playwright e2e tests
```

---

## 3. Core Architecture Patterns

### 3.1 Monolithic Root State (`ui.jsx`)

All application state lives in the root `App` component (`src/ui.jsx`). There is no external state library. State is passed down as props and updated via callbacks.

**Key state variables:**
- `client` — `ADOClient` instance (null when disconnected)
- `org` — Azure DevOps org name
- `profile` — User profile object
- `appPhase` — `"connect"` | `"setup"` | `"app"`
- `collections` — Array of collection objects
- `activeCol` — Currently selected collection ID
- `openTabs` — Array of `{ id, type, data, label }` for expanded resource details
- `activeTabId` — Currently focused tab ID (null = no detail focused)
- `view` — `"resources"` | `"newCollection"` | `"pipelines"` | `"workerStatus"` | `"yamlTools"`
- `searchResults`, `searchQuery`, `searching` — Inline search state
- `linkRules` — Regex classification rules for bookmarked links
- `syncStatus` — `"idle"` | `"saving"` | `"saved"` | `"error"`

### 3.2 Three-Phase App Flow

```
ConnectScreen → SetupScreen → Main App
     │               │            │
   PAT auth     Config repo    Collections
   + org name   selection      + resources
```

1. **Connect** (`ConnectScreen`): User enters org + PAT. PAT is encrypted and stored. `ADOClient` is created.
2. **Setup** (`SetupScreen`): User selects a config repo for storing collection YAML files.
3. **App** (main view): Full application with collections, search, pipelines, etc.

On first connection, the app auto-seeds `collections/resource-types.yaml` in the config repo with built-in type definitions.

### 3.3 Config-Driven Resource Type Registry

Resource types are defined in `collections/resource-types.yaml` in the config repo. The registry (`src/lib/resourceTypes.js`) loads this file, merges with built-in types, and provides generic helpers that replace all per-type if-else chains.

**Config schema:**

```yaml
resourceTypes:
  - id: repo
    name: Repositories
    icon: "📁"
    color: "#22D3EE"
    shortLabel: REPO

    # Collection storage
    collectionField: repos          # field name on collection object
    collectionShape: object         # "flat" = string[], "object" = [{ id, ... }]
    idField: id                     # property name for ID extraction
    defaultShape:
      id: ""
      comments: []

    # ADO API (data-driven endpoints)
    source:
      type: rest
      api:
        baseUrl: "{org}"
        endpoints:
          fetchProject:
            method: GET
            url: "{baseUrl}/{project}/_apis/git/repositories?api-version=7.1"
            responsePath: value
        cacheKeyPrefix: repos
      search:
        mode: filter                # fetch all, filter client-side
        filterField: name           # dotpath field to filter on

    # Background worker
    worker:
      enabled: true
      cacheKey: repos

    # Display (config-driven rendering)
    display:
      titleField: name              # dotpath expression
      subtitleField: defaultBranch
      subtitleTransform: stripRefsHeads

    # Detail view (custom component name, or null for generic)
    detail: RepoDetail

    # URL generation
    urlTemplate: "{baseUrl}/{project}/_git/{name}"
```

**Built-in types**: `workitem`, `repo`, `pipeline`, `pr`, `serviceconnection`, `wiki`, `testrun`, `yamltool`, `link`. All are defined as constants in `resourceTypes.js` and seeded to the YAML file on first load.

**Two source types supported:**
- `type: rest` — ADO REST API endpoints with URL interpolation (`{org}`, `{project}`)
- `type: file` — YAML/JSON files in Git repos (supports specific paths and glob patterns)

**File-backed types** support CRUD via `crud` config (schema form + branch + PR workflow).

### 3.4 Unified CollectionView

The app uses a single-column layout: **Rail** (left sidebar) + **CollectionView** (main area). The previous three-column layout (Rail + ResourcePanel + CollectionResources) has been unified.

**CollectionView** (`src/components/views/CollectionView.jsx`) combines:
- **Collection header**: name, stats, sync status, notes, project scope
- **Search bar**: inline search that replaces groups with results + link paste input
- **Tab bar**: tracks expanded resource details (via `TabBar` component)
- **Expanded details**: `ResourceDetail` renders inline for each open tab
- **Collapsible groups**: registry-driven groups with config-driven cards
- **Link cards**: special renderer for regex-classified bookmarked links

**Tab system**: Clicking a card opens its detail inline. The `TabBar` shows all open tabs. Clicking a tab scrolls to it. Multiple details can be expanded simultaneously.

### 3.5 Link Rules

`src/lib/linkRules.js` manages URL classification rules stored in `collections/link-rules.yaml`:

```yaml
rules:
  - id: servicenow-change
    name: ServiceNow Change
    icon: "🔄"
    color: "#F59E0B"
    match: "^https?://([^.]+)\\.service-now\\.com/change_request\\.do\\?sys_id=([a-f0-9]+)"
    params:
      - name: instance
        group: 1
      - name: sysId
        group: 2
    displayTemplate: "SN Change {instance}/{sysId}"
    linkTemplate: "https://{instance}.service-now.com/nav_to.do?uri=change_request.do?sys_id={sysId}"
    links:
      - label: "Open Approval"
        template: "https://{instance}.service-now.com/nav_to.do?uri=sysapproval_approver.do?sysapproval={sysId}"
```

**Functions**: `loadLinkRules()`, `matchLink()`, `formatTemplate()`

**UI**: Links are pasted via the `LinkPasteInput` in the search bar. Matched rules show extracted params as pills and generate action buttons.

### 3.6 Git-Backed Collection Storage

Collections are persisted as YAML files in an ADO Git repository:

```
collections/
  shared/{id}.yaml              # Team-wide collections
  users/{profileId}/{id}.yaml   # Personal collections (pinned pipelines, etc.)
  resource-types.yaml           # Resource type definitions (auto-seeded)
  link-rules.yaml               # Link classification rules
```

Key files:
- `src/lib/adoStorage.js` — `ADOStorage` class: `loadAll()`, `save()`, `delete()`
- `src/lib/adoClient.js` — Git REST API calls: `readGitFile()`, `pushGitFile()`, `createBranch()`

### 3.7 Background Worker

`src/lib/backgroundWorker.js` runs a 2-minute tick cycle that:
1. Rotates through all ADO projects
2. Fetches resources for types with `worker.enabled: true` in the registry
3. Caches results in localStorage via `cache.js`
4. Publishes activity log to subscribed UI components

The worker is partially registry-driven — new types defined in `resource-types.yaml` with `worker.enabled: true` are automatically refreshed. Built-in types with complex fetch logic (repos, pipelines, PRs, service connections, test runs) retain hardcoded handlers.

### 3.8 Credential Security

`src/lib/credentialStore.js` implements two encryption modes:
- **FIDO2 PRF**: Hardware authenticator derives AES-256 key via WebAuthn PRF extension
- **Passphrase (PBKDF2)**: Fallback using 310k iterations of PBKDF2

Both modes store encrypted ciphertext in `localStorage`, cache the AES key in `sessionStorage` for the tab lifetime.

---

## 4. Data Flow

### 4.1 Collection Lifecycle

```
User action → updateCollection() → setCollections() → useEffect debounce → persistCollection()
                                                                              │
                                                              ADOStorage.save() → Git commit
                                                                              │
                                                              wikiSync (optional) → Wiki API
```

### 4.2 Search Flow (Config-Driven)

```
handleSearch(query)
  │
  └── for each searchable type in registry:
        ├── mode: "filter"  → fetchAll() → filter by filterField
        ├── mode: "post"    → POST to search.url with bodyTemplate
        └── preset: "workItems" → WIQL query (special handling)
  
  (all in parallel via Promise.allSettled)
  
  → mergeResults(typeId, items) → setSearchResults()
```

### 4.3 Resource Toggle (Generic)

```
handleResourceToggle(typeId, resourceId, collectionId)
  │
  └── toggleInCollection(typeId, collection, resourceId, wikiItem)
        │
        ├── getType(typeId) → registry lookup
        ├── collectionShape: "flat"   → add/remove string from array
        └── collectionShape: "object" → add/remove { ...defaultShape, id } from array
```

### 4.4 Pipeline Log Streaming

```
PipelineLogsViewer
  │
  ├── usePipelineGraph() → fetchTimeline() + buildGraphData() → SVG graph
  │
  ├── usePipelineSignalR() → SignalR WebSocket → appendSignalRLines() → Dexie
  │
  └── useLogLines() → Dexie live query → LogViewer (virtualized)
```

**SignalR connection flow:**
1. `usePipelineSignalR` connects only when `isRunning === true`
2. Negotiates via ADO REST API to get WebSocket URL + access token
3. Subscribes to `timeline` and `console` channels
4. Appends lines to Dexie via `appendSignalRLines()`
5. `useLogLines` uses Dexie `useLiveQuery` for reactive updates

---

## 5. Component Hierarchy

```
App (ui.jsx)
├── ConnectScreen           [appPhase === "connect"]
├── SetupScreen             [appPhase === "setup"]
└── Main App                [appPhase === "app"]
    ├── Rail                 (left sidebar: collections, navigation, profile)
    └── Content Area
        ├── WorkerStatusView [view === "workerStatus"]
        ├── PipelinesView    [view === "pipelines"]
        │   └── ResourceDetail → PipelineLogsViewer
        │       ├── PipelineGraph (SVG graph)
        │       ├── TimelineSidebar
        │       ├── LogViewer (virtualized)
        │       └── CommentPanel
        ├── YamlToolsView    [view === "yamlTools"]
        ├── CollectionBuilder [view === "newCollection"]
        └── CollectionView   [collection selected]
            ├── Header        (name, stats, sync status, notes, project scope)
            ├── Search Bar    (inline search + link paste input)
            ├── TabBar        (tracks expanded resource details)
            ├── Expanded Detail (ResourceDetail for each open tab)
            ├── Search Results (replaces groups when searching)
            └── Collection Groups (collapsible, registry-driven)
                ├── Work Items (config-driven cards)
                ├── Repositories
                ├── Pipelines
                ├── Pull Requests
                ├── Service Connections
                ├── Wiki Pages
                ├── YAML Tools
                └── Links (regex-classified, custom renderer)
```

---

## 6. Resource Type Registry

### 6.1 Generic Helpers

The registry (`src/lib/resourceTypes.js`) provides generic functions that replace all per-type if-else chains:

| Function | Purpose |
|---|---|
| `getType(id)` | Get resource type definition by ID |
| `getAllTypes()` | Get all registered types |
| `getCollectionTypes()` | Get types stored in collections |
| `getSearchableTypes()` | Get types that support search |
| `getWorkerTypes()` | Get types refreshed by background worker |
| `getId(typeId, item)` | Extract ID from item using `idField` config |
| `getCollectionField(typeId)` | Get collection field name |
| `getItemDefault(typeId)` | Get default shape for new item |
| `isInCollection(typeId, collection, itemId)` | Check membership |
| `toggleInCollection(typeId, collection, itemId, wikiItem)` | Add/remove item |
| `addCommentToCollection(typeId, collection, resourceId, comment)` | Add comment |
| `getDisplayProps(typeId, item)` | Get display properties (color, title, subtitle, status, id) |
| `resolveField(item, expr)` | Evaluate dotpath/bracket expression |
| `buildUrl(rt, item, org)` | Generate URL from template |

### 6.2 Display Config

The `display` block on each type drives rendering:

| Field | Purpose | Example |
|---|---|---|
| `titleField` | Dotpath to title text | `"name"`, `"fields['System.Title']"` |
| `subtitleField` | Dotpath to subtitle text | `"defaultBranch"`, `"type"` |
| `subtitleTransform` | Named transform for subtitle | `"stripRefsHeads"` |
| `subtitleFn` | Named function for complex subtitle | `"pipelineBranch"`, `"prSubtitle"` |
| `statusField` | Dotpath to status value | `"status"`, `"fields['System.State']"` |
| `statusFn` | Named function returning `{label, color}` | `"pipelineStatus"`, `"prStatus"` |
| `colorFn` | Named function for dynamic accent color | `"wiTypeColor"` |
| `idField` | Dotpath to ID value | `"id"`, `"pullRequestId"` |
| `idPrefix` | Prefix for ID display | `"#"` |
| `iconField` | Dotpath to icon value | `"icon"` |

### 6.3 Adding a New Resource Type

**Option A: Edit `collections/resource-types.yaml`** (zero code changes)

```yaml
resourceTypes:
  - id: environment
    name: Environments
    icon: "🌐"
    color: "#4ADE80"
    shortLabel: ENV
    collectionField: environments
    collectionShape: object
    idField: id
    defaultShape:
      id: ""
      name: ""
      project: ""
      comments: []
    source:
      type: rest
      api:
        baseUrl: "{org}"
        endpoints:
          fetchProject:
            method: GET
            url: "{baseUrl}/{project}/_apis/distributedtask/environments?api-version=7.1"
            responsePath: value
        cacheKeyPrefix: environments
      search:
        mode: filter
        filterField: name
    worker:
      enabled: true
      cacheKey: environments
    display:
      titleField: name
    detail: null
    urlTemplate: "{baseUrl}/{project}/_environments/{id}"
```

**Option B: Add to `BUILT_IN_TYPES` in `resourceTypes.js`** (for types needing custom display logic)

The generic layer handles: tabs, list rows, search, collection toggle, serialization, background refresh, wiki sync, and basic card rendering.

---

## 7. API Integration (`adoClient.js`)

`ADOClient` is the single API client for all Azure DevOps REST calls. Key methods:

| Category | Methods |
|---|---|
| **Auth** | `testConnection()`, `getProfile()` |
| **Projects** | `getProjects()`, `getProjectId()`, `getOrganizationId()` |
| **Work Items** | `searchWorkItems()`, `getWorkItemsByIds()` |
| **Repos** | `getAllRepos()`, `getReposForProjects()`, `readGitFile()`, `pushGitFile()` |
| **Pipelines** | `getAllPipelines()`, `getPipelinesForProjects()`, `getPipelineRuns()`, `getBuildRuns()`, `getBuildTimeline()`, `getBuildLog()` |
| **Pull Requests** | `getAllPullRequests()`, `getPullRequestsForProjects()` |
| **Service Connections** | `getAllServiceConnections()`, `getServiceConnectionsForProjects()` |
| **Wiki** | `searchWikiPages()`, `getWikiPage()`, `upsertWikiPage()` |
| **Git** | `listGitItems()`, `createBranch()`, `createPullRequest()` |

**Caching**: `_cachedFetch(key, fetcher, ttl)` wraps API calls with localStorage TTL cache (5 min default).

**Authentication**: All requests use `Basic ${btoa(":" + PAT)}` header.

**Data-driven API** (`src/lib/resourceApi.js`): REST endpoints are configured in `resource-types.yaml`. The generic `fetchForProject()`, `fetchAll()`, and `search()` functions interpolate URLs, make requests, and extract responses based on config.

---

## 8. Collection Data Model

```javascript
{
  id: string,                    // Unique ID
  name: string,                  // Display name
  icon: string,                  // Emoji icon
  color: string,                 // Accent color hex
  scope: "shared" | "personal",  // Visibility scope
  owner: string | null,          // Profile ID for personal
  projects: string[],            // ADO project names
  filters: {                     // Work item filters
    types: string[],
    states: string[],
    assignee: string,
    areaPath: string
  },
  workItemIds: string[],         // Pinned work items
  repos: [{ id, comments }],     // Repos with comments
  pipelines: [{ id, name, project, folder, configurationType, comments, runs }],
  prIds: string[],               // Pull request IDs
  serviceConnections: [{ id, project, type, comments }],
  wikiPages: [{ id, path, wikiId, wikiName, project, comments }],
  yamlTools: [{ id, name, icon, comments }],
  links: [{ url, label, comments, addedAt }],  // Bookmarked links (regex-classified)
  comments: [],                  // Collection-level notes
  _objectId: string              // Git file object ID for optimistic concurrency
}
```

Reserved collections:
- `pinned-pipelines` (personal) — Pinned pipelines for quick access
- `pinned-tools` (personal) — Pinned YAML tools

---

## 9. Pipeline Graph System

### 9.1 Hierarchy

```
Stage → Phase → Job → Task
```

### 9.2 Graph Builder (`pipelineGraphBuilder.js`)

- Input: `timeline.records[]`, `run.resources`, `artifacts[]`
- Output: `{ nodes[], edges[], width, height }`
- Layout: `dagre` library for automatic graph layout
- Single-stage pipelines (`__default`) auto-collapse the stage node

### 9.3 Node Types

| Type | Component | Description |
|---|---|---|
| Stage | `StageNode` | Container for phases |
| Phase | `PhaseNode` | Container for jobs |
| Job | `JobNode` | Clickable job node |
| Repository | `ResourceNode` | Source repo |
| Artifact | `ResourceNode` | Build artifact |
| Environment | `ResourceNode` | Deployment target |
| ServiceConnection | `ResourceNode` | Service connection |

---

## 10. YAML Tools System

**Purpose**: Schema-driven forms for editing YAML arrays in ADO Git repos.

**Discovery**: Scans repos for `.superui/tools.yml` files, also loads from central tools directory in config repo. Two built-in tool definitions are always available: Tool Builder and Link Rules.

**Key files**:
- `src/lib/yamlToolsManager.js` — Discovery, schema normalization, CRUD operations
- `src/components/ui/SchemaForm.jsx` — Dynamic form renderer
- `src/components/views/YamlToolsView.jsx` — Tool list + editing UI
- `src/components/views/BranchCommitDialog.jsx` — Branch/commit workflow

**Supported field types**: `string`, `textarea`, `number`, `boolean`, `select`, `tags`, `object`, `array`

**Workflow**: Read YAML → Edit via form → Create branch → Commit → (Optional) Create PR

---

## 11. Key Dependencies

| Package | Purpose |
|---|---|
| `@microsoft/signalr` | Pipeline log streaming |
| `dagre` | Graph layout for pipeline visualization |
| `dexie` / `dexie-react-hooks` | IndexedDB for log line caching |
| `js-yaml` | YAML parse/stringify for collections + tools |
| `marked` | Markdown rendering (wiki, descriptions) |
| `react-virtualized-auto-sizer` / `react-window` | Virtualized log viewer |
| `hkdf` | Key derivation for credential encryption |

---

## 12. Testing

| Framework | Scope | Config |
|---|---|---|
| Vitest | Unit tests | `vitest.config.js` |
| Testing Library | Component tests | `@testing-library/react` |
| Playwright | E2E tests | `playwright.config.js` |
| MSW | API mocking | `src/mocks/` (if present) |

**Commands**:
```bash
npm run test          # Vitest watch mode
npm run test:run      # Vitest single run
npm run test:coverage # Coverage report
npm run e2e           # Playwright tests
npm run e2e:ui        # Playwright with UI
```

---

## 13. Design Principles

1. **Dark-only** — No light mode support
2. **Dense information** — Compact rows, small type sizes
3. **Monospace for metadata** — JetBrains Mono for IDs, dates, status
4. **Proportional for prose** — Barlow for names, titles
5. **Color as type signal** — Consistent accent colors per resource type
6. **Inline actions** — Toggle buttons on list rows, no modals
7. **No external state** — All state in React hooks at root level
8. **Config over code** — Resource types, API endpoints, and display rendering driven by YAML config

---

## 14. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_USE_PROXY` | `true` | Use local CORS proxy |
| `VITE_PROXY_URL` | `http://localhost:3131` | Proxy server URL |
| `PORT` | `3000` | Server port (ado-server.js) |

---

## 15. File Index (Quick Lookup)

| File | Purpose | Lines |
|---|---|---|
| `src/ui.jsx` | Root app component | ~750 |
| `src/lib/adoClient.js` | ADO REST client | 844 |
| `src/lib/resourceTypes.js` | Resource type registry | ~770 |
| `src/lib/resourceApi.js` | Generic API execution | ~280 |
| `src/lib/adoStorage.js` | Git-backed YAML storage | ~420 |
| `src/lib/backgroundWorker.js` | Cache refresh worker | ~310 |
| `src/lib/yamlToolsManager.js` | YAML tools CRUD | ~680 |
| `src/lib/credentialStore.js` | PAT encryption | 369 |
| `src/lib/linkRules.js` | URL classification rules | ~190 |
| `src/lib/wiUtils.js` | Work item helpers | ~170 |
| `src/components/views/CollectionView.jsx` | Unified collection view | ~530 |
| `src/components/views/ResourceDetail.jsx` | Resource detail views | ~810 |
| `src/components/views/PipelineLogsViewer.jsx` | Pipeline logs + graph | 480 |
| `src/components/views/PipelinesView.jsx` | Pipelines dashboard | 297 |
| `src/lib/pipelineGraphBuilder.js` | Graph layout | 281 |
