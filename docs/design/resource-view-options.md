# Resource View Design Options

## Current State

```
Collections (sidebar)
  → Work Items List (centre panel)
    → ResourceDetail (right panel) - requires selecting a work item first
```

Resources are nested under work items - you must select a work item first to see its related resources.

---

## Option A: Top-Level Tabs in Main View

```
┌─────────────────────────────────────────────────────┐
│ Collections (sidebar)                               │
│ ────────────────────────────────────────────────── │
│ [Work Items] [Repos] [Pipelines] [PRs] [Tests] ← Tabs │
│ ────────────────────────────────────────────────── │
│ ┌─────────────────┐ ┌─────────────────────────────┐ │
│ │ List            │ │ Details + Toggle            │ │
│ │ (scrollable)    │ │                             │ │
│ └─────────────────┘ └─────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Implementation:**
- Add state for `activeResourceType` (workitems | repos | pipelines | prs | tests)
- Replace centre panel content based on selected tab
- Each tab renders its own list + detail pane
- Collections becomes a filter in sidebar or stays as-is

**Pros:** Clean separation, each resource type has dedicated view
**Cons:** Significant restructuring of App component

---

## Option B: Expand Sidebar Navigation

```
┌─────────────────────────────────────────────────────┐
│ [Collections] ← Current                             │
│ [Work Items]                                        │
│ [Repositories]                                      │
│ [Pipelines]                                        │
│ [Pull Requests]                                    │
│ [Test Runs]                                        │
└─────────────────────────────────────────────────────┘
```

**Implementation:**
- Add resource types to sidebar alongside collections
- Clicking a resource type shows its list in centre panel
- Collections remain in sidebar but become optional filter

**Pros:** Resources always accessible, minimal structural change
**Cons:** Sidebar gets more crowded

---

## Option C: Toggle Button in Header

```
┌─────────────────────────────────────────────────────┐
│ [Collections] ← sidebar                             │
│ ────────────────────────────────────────────────── │
│ [Work Items] [Resources] ← Toggle in header        │
│ ────────────────────────────────────────────────── │
│ If Work Items: current flow                         │
│ If Resources: tabs (Repos | Pipelines | PRs | Tests)│
└─────────────────────────────────────────────────────┘
```

**Implementation:**
- Add "Work Items" / "Resources" toggle in header
- Resources view is independent of work item selection
- Uses similar tab structure to current ResourceDetail

**Pros:** Less restructuring, keeps current work item flow
**Cons:** Still somewhat nested

---

## Option D: Unified Search/Browser (IMPLEMENTED)

```
┌─────────────────────────────────────────────────────┐
│ [🔍 Search all resources...           ] ← Header  │
├─────────────────────────────────────────────────────┤
│ Collections (sidebar)                               │
│ ────────────────────────────────────────────────── │
│ ┌─────────────────────────────────────────────────┐│
│ │ Collection Name (when selected)                  ││
│ │ ─────────────────────────────────────────────── ││
│ │ WORK ITEMS (count)                             ││
│ │   [item 1] [item 2] ...                       ││
│ │ REPOSITORIES (count)                           ││
│ │   [repo 1] [repo 2] ...                       ││
│ │ PIPELINES (count)                              ││
│ │   [pipeline 1] ...                            ││
│ │ PULL REQUESTS (count)                         ││
│ │   [pr 1] ...                                  ││
│ └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

**Implementation:**
- Global search in header bar - searches across all resource types
- Collection view shows unified list grouped by type (no tabs)
- Each group collapsible with item count
- Search results shown in dropdown below search input

**Pros:** Maximum flexibility, unified discovery, resources at same level as work items
**Cons:** Most complex to implement

---

## Implementation Status

| Feature | Status |
|---------|--------|
| Global Search in header | ✅ Implemented |
| Collection view unified list | ✅ Implemented |
| Grouped by type | ✅ Implemented |

---

## Related Files

- `src/ui.jsx` - Main UI component containing:
  - `ResourceDetail` - Work item detail view with resources (still nested)
  - `WorkItemPanel` - Work items list
  - `CollectionResources` - Unified collection view with grouped resources
  - `App` - Root component with global search
