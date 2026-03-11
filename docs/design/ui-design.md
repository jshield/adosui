# ADO SuperUI — UI Design Reference

This document describes the current UI design of ADO SuperUI in enough detail to reconstruct it from scratch.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Colour Theme](#colour-theme)
3. [Typography](#typography)
4. [Global Layout](#global-layout)
5. [Header Bar](#header-bar)
6. [Left Rail](#left-rail)
7. [Centre Panel](#centre-panel)
8. [Right Panel](#right-panel)
9. [Components: Search](#components-search)
10. [Components: Work Items](#components-work-items)
11. [Components: Resource Detail](#components-resource-detail)
12. [Components: Collection Resources](#components-collection-resources)
13. [Components: Collection Builder](#components-collection-builder)
14. [Components: Connect Screen](#components-connect-screen)
15. [Atoms](#atoms)
16. [Interactive States](#interactive-states)

---

## Design Principles

- **Dark-only.** The entire UI uses a near-black background with low-contrast surfaces. There is no light mode.
- **Dense information display.** Rows are compact (8–10 px padding); type sizes stay small (10–13 px for most content). The design prioritises showing many items at once over generous whitespace.
- **Monospace for metadata, proportional for prose.** `JetBrains Mono` is used for IDs, counts, dates, field labels, and status text. `Barlow` is used for names, titles, and interactive text. `Barlow Condensed` is used for headings and panel titles.
- **Colour as type signal.** Each resource type has a consistent accent colour used for badges, left-border highlights, and toggle states. Amber is the brand/primary action colour.
- **Inline actions over modals.** Toggle buttons sit directly on list rows. Detail panes open in the right panel without any overlay or modal.

---

## Colour Theme

All colours live in the `T` constant.

| Token | Hex | Role |
|---|---|---|
| `T.bg` | `#0A0B0E` | Page background; outermost shell |
| `T.panel` | `#0D0F13` | Surface colour — rail, centre panel, header, card backgrounds |
| `T.border` | `rgba(255,255,255,0.06)` | All structural dividers — panel edges, row separators, tab underlines |
| `T.text` | `#E5E7EB` | Primary readable text — titles, selected items, field values |
| `T.muted` | `#6B7280` | Secondary text — un-selected items, labels, ghost button text |
| `T.dim` | `#374151` | Tertiary text — section headers, field label column, placeholder colour |
| `T.dimmer` | `#1F2937` | Scrollbar thumb, very-faded text (email, IDs) |
| `T.amber` | `#F59E0B` | Brand accent — wordmark, primary buttons, avatar fill, active tab underline |
| `T.cyan` | `#22D3EE` | Repository type — REPO badge, repo names, repos tab accent |
| `T.blue` | `#60A5FA` | "Open in ADO" links, User Story type badge, "active" state colour |
| `T.violet` | `#A78BFA` | User Story work item type badge; assignee filter pills |
| `T.purple` | `#A78BFA` | PR type badge in search results (same value as violet) |
| `T.red` | `#F87171` | Bug type, failed state, error messages, PR abandoned |
| `T.green` | `#4ADE80` | Done/closed state, sync "saved", "✓ in collection" toggle state |

### Additional literal colours (used directly, not via T)

| Value | Where |
|---|---|
| `#F9FAFB` | Work item title in ResourceDetail header and detail pane titles |
| `#94A3B8` | Task work item type badge |
| `#F472B6` | CollectionBuilder colour swatch (pink) |
| `#FB923C` | CollectionBuilder colour swatch (orange) |
| `#34D399` | CollectionBuilder colour swatch (teal) |
| `#4B5563` | PAT scope hint text on ConnectScreen |
| `#000` | Text on amber avatar circle (black on amber for contrast) |

### Background dot grid (ConnectScreen only)
`radial-gradient(circle at 1px 1px, rgba(245,158,11,0.04) 1px, transparent 0)` tiled at `32×32 px`. Fixed, full-bleed, `pointer-events: none`.

### Scrollbar (global)
Width `4px`, track `transparent`, thumb `#1F2937`, `border-radius 2px`.

---

## Typography

Three Google Fonts families loaded via a single `@import` in the injected `<style>` tag:

```
Barlow Condensed — weights 400, 600, 700
JetBrains Mono   — weights 400, 500
Barlow           — weights 300, 400, 500, 600
```

| Family | Where used |
|---|---|
| **Barlow Condensed** | Wordmarks, panel headings, work item titles (22 px / 700), resource sub-panel titles (20 px / 700), avatar circle initials, ConnectScreen step labels |
| **JetBrains Mono** | IDs, counts, dates, field label column (11 px), section header labels, type/status badges, status indicators (searching, saving, saved), org/email in rail, proxy code snippet |
| **Barlow** | All default body text, list item names, search inputs, tab button labels (12 px / 500), toggle button labels, display name in header, "Open in ADO" links |

### Key font sizes

| Size | Usage |
|---|---|
| 9 px | Type badge text in search rows |
| 10 px | Pill labels, section header counts, filter chip labels |
| 11 px | Field label column, rail org/email, "Open in ADO" links, proxy status text |
| 12 px | Most list row body text, tab labels, sync status, profile display name |
| 13 px | Header search input, ConnectScreen inputs, CollectionBuilder name input |
| 15 px | Rail wordmark |
| 17 px | SearchResultDetail workitem/repo titles |
| 20 px | ResourceDetail sub-panel titles |
| 22 px | WorkItemPanel collection name, ResourceDetail header title |
| 36 px | ConnectScreen wordmark |

---

## Global Layout

The app is a fixed `100vh` flex-row with `padding-top: 50px` to clear the fixed header bar.

```
┌─────────────────────────────────────────────────────────────────────────┐
│              HEADER BAR  (position: fixed, height: 50px)                │
├────────────────┬──────────────────────────┬────────────────────────────┤
│   LEFT RAIL    │      CENTRE PANEL        │       RIGHT PANEL          │
│   width: 215px │      width: 370px        │       flex: 1              │
│   T.panel      │      T.panel             │       T.bg                 │
│   flex-column  │      flex-column         │       flex-column          │
│                │      overflow: hidden    │       overflow: hidden     │
└────────────────┴──────────────────────────┴────────────────────────────┘
```

Both left panels have `border-right: 1px solid T.border`. The right panel has `min-width: 0` and `flex: 1`. Internal scrolling is enabled per-section via `overflow-y: auto` on inner containers.

---

## Header Bar

```
position: absolute; top: 0; left: 0; right: 0
height: 50px
background: T.panel
border-bottom: 1px solid T.border
display: flex; align-items: center; padding: 0 20px
z-index: 100
```

**Elements (left → right):**

### Search input wrapper
`flex: 1; max-width: 500px; position: relative; display: flex; align-items: center`

**Input:**
- Background: `rgba(255,255,255,0.06)`
- Border: `1px solid rgba(255,255,255,0.1)`, border-radius `6px`
- Padding: `8px 14px`; font: Barlow 13px `T.text`
- Placeholder: `"🔍 Search all resources..."` in colour `T.dim`
- `width: 100%`, `outline: none`
- `onChange` fires `handleSearch` immediately (no debounce)

**Clear button (×):**
- Only visible when `searchQuery` is non-empty
- Positioned `absolute; right: 8px`
- `background: none; border: none; color: T.dim; font-size: 16px; cursor: pointer`
- Clears `searchQuery`, `searchResults`, `selectedSearchResult`

### Status indicators (inline, left of profile block)

| Condition | Text | Colour |
|---|---|---|
| `searching === true` | `"searching…"` | `T.dim` |
| `syncStatus === "saving"` | `"↑ saving…"` | `T.dim` |
| `syncStatus === "saved"` | `"✓ saved"` | `T.green` |
| `syncStatus === "error"` | `"⚠ sync failed"` | `T.red` |

All status text: `font-size: 10–11px; font-family: JetBrains Mono; margin-left: 12px`

### Profile block
Only rendered when `profile` is non-null. `margin-left: auto; display: flex; align-items: center; gap: 8px`

- **Display name:** `font-size: 12px; color: T.muted; font-family: Barlow`
- **Avatar circle:** `28×28px; border-radius: 50%; background: T.amber; color: #000; font-family: Barlow Condensed; font-weight: 700; font-size: 13px`
  - Content: first character of `profile.displayName` uppercased
  - `title` tooltip: `"displayName · emailAddress"`

---

## Left Rail

```
width: 215px
background: T.panel
border-right: 1px solid T.border
display: flex; flex-direction: column; flex-shrink: 0
```

### App title block
`padding: 14px 14px 12px; border-bottom: 1px solid T.border`

**Wordmark:** Barlow Condensed 700, 15px, `T.amber`, `letter-spacing: 0.05em` — `"ADO SUPERUI"`

**With profile loaded:**
`display: flex; align-items: center; gap: 8px; margin-top: 8px`
- Avatar circle: 28×28px, amber fill, black text, initials
- Name stack (min-width: 0):
  - Display name: 12px / 600 / `T.text` — truncated with ellipsis
  - Email: 10px / `T.dimmer` / JetBrains Mono — truncated
  - Org slug: 9px / `T.dimmer` / JetBrains Mono / `opacity: 0.6`

**Without profile:** org name only — `10px; T.dimmer; JetBrains Mono`

### Collections list
`flex: 1; overflow-y: auto; padding-top: 10px`

**Section label:** `font-size: 10px; color: T.dim; JetBrains Mono; letter-spacing: 0.1em; text-transform: uppercase; padding: 0 14px 8px`

**Collection row:**
```
display: flex; align-items: center; gap: 9px
padding: 9px 14px
cursor: pointer
transition: all 0.12s
border-left: 2px solid (active ? c.color : transparent)
background: (active ? ${c.color}10 : transparent)
```
Contents (left → right):
1. Icon emoji — `font-size: 15px`
2. Name — `font-size: 12px; font-weight: 500; color: (active ? T.text : T.muted); overflow: ellipsis`
3. `Dot` in `c.color`
4. Delete `×` button — `font-size: 12px; color: T.dim; opacity: 0.4; background: none; border: none`

**Empty state:** `"No collections.\nCreate one to begin."` — `11px; T.dim; JetBrains Mono; line-height: 1.6`

### Footer actions
`padding: 12px 14px; border-top: 1px solid T.border`

All rows: `display: flex; align-items: center; gap: 7px; cursor: pointer; transition: opacity 0.15s`

| Action | Default opacity | Hover opacity | Icon | Text |
|---|---|---|---|---|
| New Collection | 0.6 | 1.0 | `＋` in `T.amber` | `"New Collection"` |
| Clear Cache | 0.35 | 0.7 | — | `"↻ Clear Cache"` |
| Disconnect | 0.35 | 0.7 | — | `"⏻ Disconnect"` |

Text: `font-size: 11–12px; color: T.muted / T.dim; font-family: Barlow / JetBrains Mono`

---

## Centre Panel

```
width: 370px
background: T.panel
border-right: 1px solid T.border
display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden
```

**Priority order (mutually exclusive):**

1. `searchQuery.trim()` is non-empty → **SearchResultsList**
2. Collection is active and no search → **WorkItemPanel**
3. Neither → placeholder: hexagon icon `⬡` (30px) + `"Select a collection"` (Barlow Condensed 13px, `T.dim`)

---

## Right Panel

```
flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0
```

**Priority order (mutually exclusive):**

| Priority | Condition | Content |
|---|---|---|
| 1 | `view === "newCollection"` | **CollectionBuilder** |
| 2 | `selectedWI` is set | **ResourceDetail** |
| 3 | `selectedSearchResult` is set | **SearchResultDetail** |
| 4 | Collection is active | **CollectionResources** |
| 5 | None | Placeholder |

**Placeholder:** `⬡` icon (38px) + `"Create a collection to begin"` (Barlow Condensed 20px) + primary `"+ New Collection"` button.

---

## Components: Search

### SearchResultsList

Fills the centre panel when `searchQuery` is non-empty. Container: `flex: 1; overflow-y: auto`.

#### States

**Loading** (`searching === true`):
Centred column — amber spinner (22px) + `"Searching…"` (JetBrains Mono 12px, `T.dim`)

**No-query** (results is null):
Centred column — `🔍` (28px) + `"Type to search all resources"` (Barlow Condensed 13px, `T.dim`)

**Empty** (results exist, total count = 0):
Centred column — `∅` (26px) + `"No results for "{query}""` (Barlow Condensed 13px, `T.dim`)

#### Section header
```
padding: 10px 14px 6px
font-size: 10px; color: T.dim; JetBrains Mono; letter-spacing: 0.12em
background: rgba(255,255,255,0.02)
border-bottom: 1px solid T.border
display: flex; justify-content: space-between
```
Left: label (`WORK ITEMS` / `REPOSITORIES` / `PIPELINES` / `PULL REQUESTS`)
Right: item count in `T.dimmer`

#### Result row (common)
```
display: flex; align-items: center; gap: 8px
padding: 9px 14px; cursor: pointer
border-bottom: 1px solid T.border
border-left: 3px solid (selected ? T.amber : transparent)
background: (selected ? rgba(245,158,11,0.07) : transparent)
transition: background 0.1s
```
Hover (not selected): `background: rgba(255,255,255,0.04)`

**Work item row:**
`[TYPE badge] [#id] [title — flex 1] [state text] [toggle btn]`
- Type badge: 9px bold JetBrains Mono, colour by type (Bug→red, Epic→amber, Feature→purple, else→blue), `${colour}22` background, 3px border-radius
- ID: 10px, `T.dimmer`, JetBrains Mono
- State: 10px, colour by state (done→green, active→blue, new→dim, else→muted)

**Repo row:**
`[REPO badge — cyan] [name — cyan, flex 1] [default branch — dimmer] [toggle btn]`

**Pipeline row:**
`[PIPE badge — amber] [name — flex 1] [folder — dimmer] [toggle btn]`

**PR row:**
`[PR badge — purple] [#id — dimmer] [title — flex 1] [status — stateColor] [toggle btn]`

#### Toggle button (on search rows)
```
font-size: 11px; font-family: JetBrains Mono; border-radius: 4px; padding: 2px 8px
background: (added ? ${T.green}22 : rgba(255,255,255,0.06))
border: 1px solid (added ? T.green : rgba(255,255,255,0.12))
color: (added ? T.green : T.dim)
transition: all 0.15s
```
Content: `"✓"` when added, `"+"` when not. Stops click propagation. Hidden entirely when no collection is active.

---

### SearchResultDetail

Shown in the right panel when a search result row is selected. Container: `flex: 1; overflow-y: auto; padding: 24px`

**Shared sub-components:**

**ToggleSection:**
- With collection: button `font-size: 12px; Barlow; border-radius: 5px; padding: 6px 14px`
  - Added: `background ${T.green}22; border ${T.green}; color T.green` → `"✓ In "{name}""`
  - Not added: `background rgba(255,255,255,0.06); border rgba(255,255,255,0.15); color T.muted` → `"+ Add to "{name}""`
- Without collection: `"Select a collection to add this item"` — 11px, `T.dim`, JetBrains Mono

**Field row:**
`display: flex; gap: 12px; padding: 7px 0; border-bottom: 1px solid T.border`
- Label: 11px, `T.dim`, JetBrains Mono, `min-width: 110px`
- Value: 12px, `T.text`, `word-break: break-all`; empty → `"—"` in `T.dimmer`

**"Open in ADO ↗" link:**
`font-size: 11px; color: T.blue; text-decoration: none; display: inline-block; margin-bottom: 18px`
Only rendered when `org` and required fields (project name, repo name) are present.

---

**Workitem:**
- Badges row: type pill (coloured) + `#id` (T.dimmer, 11px) + state (T.text on `rgba(255,255,255,0.08)` background, Barlow Condensed 11px)
- Title: 17px / 600 / `T.text`
- ToggleSection → Open in ADO link → Fields: State, Type, Area Path, Assigned To, Created

**Repo:**
- Header badge: `REPO` in cyan
- Title: 17px / 600 / `T.cyan`
- ToggleSection → Open in ADO link → Fields: Default Branch, Size, URL, Project

**Pipeline:**
- Header badge: `PIPELINE` in amber
- Title: 17px / 600 / `T.text`
- ToggleSection → Open in ADO link → Fields: Folder, Definition ID

**PR:**
- Header badges: `PR` in purple + status pill (active→blue, completed→green, abandoned→red) + `#id` in `T.dimmer`
- Title: 16px / 600 / `T.text`
- ToggleSection → Open in ADO link → Fields: Author, Source Branch, Target Branch, Created, Reviewers, Description

---

## Components: Work Items

### WorkItemPanel

Fills the centre panel when a collection is active and no search is active.

#### Header block
`padding: 14px 14px 10px; border-bottom: 1px solid T.border; flex-shrink: 0`

**Collection identity row:**
Icon emoji (18px) + name (Barlow Condensed 700, 18px, `T.text`) + `Dot` in collection colour + saved count (10px, `T.dim`, JetBrains Mono) if any saved

**Search + filter row:**
Search input (Barlow 12px, `rgba(255,255,255,0.04)` background, 1px border, `border-radius: 5px`, padding `7px 11px`) + filter button (amber-tinted when active)

**Active filter pills** (when filters set):
Small 9px JetBrains Mono pills in the type/state/assignee/area-path accent colour with `×` to remove each.

#### Work item rows
```
display: flex; align-items: center; gap: 8px
padding: 8px 14px; cursor: pointer
border-left: 2px solid (selected ? collection.color : transparent)
background: (selected ? ${collection.color}08 : transparent)
transition: all 0.12s
```
Hover: `background: rgba(255,255,255,0.025)`

Contents: type abbreviation (9px, JetBrains Mono, type colour, 42px fixed width) + `#id` (10px, `T.dim`, 38px fixed width) + title (12px, flex 1, `T.muted` default → `T.text` selected) + state `Pill` + toggle button

**Toggle button (on work item rows):**
- Not in collection: `rgba(255,255,255,0.04)` bg, `rgba(255,255,255,0.08)` border, `T.muted` text → `"+"`
- In collection: `${collection.color}18` bg, `${collection.color}44` border, `collection.color` text → `"✓"`

**Work item type colours:**
| Type | Colour |
|---|---|
| Epic | `T.amber` |
| Feature | `T.cyan` |
| User Story | `T.violet` |
| Bug | `T.red` |
| Task | `#94A3B8` |

---

## Components: Resource Detail

### ResourceDetail

Shown in the right panel when a work item is selected from the WorkItemPanel.

#### Header (above tabs)
`padding: 18px 24px 16px; border-bottom: 1px solid T.border; background: T.panel`

Left block:
- Badges row: type `Pill` + `#id` (11px, `T.dim`, JetBrains Mono) + state `Pill` + area path (11px, `T.dim`, JetBrains Mono, `↳ project` format)
- Title: Barlow Condensed 700, 22px, `#F9FAFB`, `line-height: 1.2`, `letter-spacing: 0.02em`

Right: **"Open in ADO ↗"** button
`background: ${T.amber}12; border: 1px solid ${T.amber}33; color: T.amber; padding: 6px 13px; border-radius: 4px; font-size: 12px; font-family: Barlow 500; text-decoration: none`

#### Tab bar
`display: flex; gap: 4px; border-bottom: 1px solid T.border; padding: 0 24px; background: T.panel`

Each tab:
```
background: transparent; border: none
border-bottom: 2px solid (active ? T.amber : transparent)
color: (active ? T.text : T.dim)
padding: 10px 16px; font-size: 12px; Barlow 500
cursor: pointer; margin-bottom: -1px
```
Tabs: **Details**, **Repositories (N)**, **Pipelines (N)**, **Pull Requests (N)**, **Test Runs (N)**

#### Details tab
`padding: 20px 24px`

Repeats the badges + title from the header. Below that, a fields table (`border-top: 1px solid T.border; padding-top: 16px`) showing all non-system work item fields. Each row:
- Label column: `width: 140px; font-size: 11px; color: T.dim; JetBrains Mono`
- Value column: `flex: 1; font-size: 12px; color: T.text; JetBrains Mono; word-break: break-word`

Excluded fields: TeamProject, Rev, AuthorizedAs, StateChangedDate, Watermark, IsDeleted, AcceleratedCardData. Key names have `System.` / `Microsoft.VSTS.` / `SFCC.` prefixes stripped.

#### Resource tabs (Repositories / Pipelines / Pull Requests / Test Runs)

All four use the same **split-pane layout:**
```
display: flex; flex: 1; overflow: hidden
```

**List pane (left, width: 45%):**
`border-right: 1px solid T.border; display: flex; flex-direction: column`

- Search input at top (`padding: 12px; border-bottom: 1px solid T.border`)
- List rows below: same row style as WorkItemPanel (2px left border, accent background tint, hover rgba 0.025)
  - Repos accent: `T.cyan`; Pipelines: status colour; PRs: status colour; Tests: pass/fail colour
  - Items in the active collection are highlighted with the collection colour on their name text

**Detail pane (right, flex: 1):**
`overflow-y: auto; padding: 20px 24px`

Nothing selected: centred `"Select a repository to view details"` (or equivalent) in Barlow 13px `T.dim`

Something selected:
- Title: Barlow Condensed 700, 20px, `#F9FAFB`
- Toggle button row: **"+ Add to Collection"** / **"✓ In Collection"** (collection-colour tinted)
- **"Open in ADO ↗"** link (repos, pipelines, PRs only) — same style as SearchResultDetail link
- Fields table (same row structure as Details tab)

---

## Components: Collection Resources

Shown in the right panel when a collection is active with no selection.

### Header
`padding: 18px 24px 16px; border-bottom: 1px solid T.border; background: T.panel`

Row: icon emoji (24px) + name (Barlow Condensed 700, 22px, `#F9FAFB`) + `Dot` + summary line (11px, `T.dim`, JetBrains Mono: `"N work items · N repos · N pipelines · N PRs"`)

### Content
`flex: 1; overflow-y: auto; padding: 16px 24px`

Group section header: `font-size: 10px; T.dim; JetBrains Mono; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 10px`
Text: `"WORK ITEMS (N)"` / `"REPOSITORIES (N)"` / `"PIPELINES (N)"` / `"PULL REQUESTS (N)"`

Each item is a `Card` atom:
```
background: rgba(255,255,255,0.025)
border: 1px solid rgba(255,255,255,0.06)
border-left: 3px solid accentColour
border-radius: 6px; padding: 10px 14px
```

Accent colours: Work items → type colour; Repos → `T.cyan`; Pipelines → status colour; PRs → status colour

Each card has a **"× Remove"** button (right-aligned):
`background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; padding: 4px 10px; font-size: 12px; color: T.dim; cursor: pointer`

**Empty state:** `"No items in this collection.\nSearch for resources to add them."` — `12px; T.dim; JetBrains Mono; text-align: center; padding: 40px`

---

## Components: Collection Builder

Shown in the right panel when `view === "newCollection"`.

Container: `padding: 26px; height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: 22px`

### Heading
- Title: Barlow Condensed 700, 22px, `T.text` — `"New Collection"`
- Subtitle: 12px, `T.muted`, JetBrains Mono — `"Create a work-centric workspace"`

### Name field
Label: 11px uppercase JetBrains Mono `T.muted`
Input: `width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 5px; color: T.text; padding: 9px 13px; font-size: 13px; font-family: Barlow`
Placeholder: `"e.g. My Tasks"`

### Icon picker
Label + grid of 12 emoji icons (`📦 💳 🔐 📊 🚀 🔧 ⚡ 🎯 🌐 🔬 🛡️ 🎨`)
Each: `font-size: 18px; padding: 5px; border-radius: 5px; cursor: pointer`
- Selected: `background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14)`
- Not selected: `background: transparent; border: 1px solid transparent`

### Colour picker
Label + grid of 8 circular swatches (22×22px, `border-radius: 50%`)
Colours: `T.amber`, `T.cyan`, `T.violet`, `T.red`, `T.green`, `#F472B6`, `#FB923C`, `#34D399`
- Selected: `outline: 2px solid ${colour}; outline-offset: 2px`
- Not selected: no outline

### Create button
Primary `Btn` — `"Create Collection →"` — disabled when name is empty.

---

## Components: Connect Screen

Full-page centred layout:
```
min-height: 100vh; background: T.bg
display: flex; align-items: center; justify-content: center; font-family: Barlow
```

Background dot grid (fixed, full-bleed, pointer-events: none).

Content card: `width: 480px; position: relative`

### Wordmark block
- Title: Barlow Condensed 700, 36px, `T.amber`, `letter-spacing: 0.06em` — `"ADO SUPERUI"`
- Subtitle: 12px, `T.dim`, JetBrains Mono — `"work-centric azure devops workspace"`

### Proxy step block (when `USE_PROXY === true`)
`background: ${T.cyan}08; border: 1px solid ${T.cyan}22; border-radius: 8px; padding: 16px 18px; margin-bottom: 24px`
- Heading: `"STEP 1 — START THE PROXY"` — Barlow Condensed 700 12px `T.cyan`
- Command: inline code block with `background: rgba(0,0,0,0.4); color: T.amber` — `"node ado-proxy.js"`
- Status row: `Dot` (green/amber-pulse/dim) + status text (JetBrains Mono 11px) + **"Check proxy"** button (cyan-tinted, right-aligned)

### Direct mode block (when `USE_PROXY === false`)
`background: ${T.green}08; border: 1px solid ${T.green}22` — heading `"DIRECT MODE"` in `T.green`

### Connect form card
`background: T.panel; border: 1px solid T.border; border-radius: 10px; padding: 28px`

**Step label:** Barlow Condensed 600, 16px, `T.muted` — `"STEP 2 — CONNECT"` (or `"STEP 1"` in direct mode)

**Organisation input:**
Prefix `"dev.azure.com/"` (JetBrains Mono 11px, `T.dim`, right-bordered) + text input (`font-size: 13px; JetBrains Mono; T.text`)

**PAT input:**
`type="password"`, same styling, with hint: `"Scopes: Code·Read · Work Items·Read · Build·Read · Test·Read"` in `#4B5563`

**Error message (conditional):** `background: ${T.red}10; border: 1px solid ${T.red}33; font-size: 12px; color: T.red; JetBrains Mono`

**Connect button:**
`width: 100%; background: ${T.amber}18; border-radius: 5px; font-size: 14px; Barlow Condensed 700; letter-spacing: 0.08em`
- Enabled: `border: 1px solid ${T.amber}44; color: T.amber; cursor: pointer`
- Disabled: `border: 1px solid ${T.amber}22; color: ${T.amber}55; cursor: not-allowed`
- Loading: Spinner (13px) + `"CONNECTING…"`
- Ready: `"CONNECT →"`

### Footer
`font-size: 11px; color: T.dimmer; text-align: center; JetBrains Mono; line-height: 1.8`
`"PAT held in memory only · never stored"` + proxy/direct mode description in `T.dim`

---

## Atoms

### `Btn`
```
padding: 7px 16px; border-radius: 5px; font-size: 12px; Barlow 500
display: inline-flex; align-items: center; gap: 6px; cursor: pointer
```
- **Primary:** `background: ${T.amber}18; border: 1px solid ${T.amber}44; color: T.amber`
- **Ghost:** `background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: T.muted`
- Disabled (both): `opacity: 0.5; cursor: not-allowed`

### `Pill`
`font-size: 10px; JetBrains Mono; border-radius: 3px; padding: 2px 7px`
`background: ${color}18; color: color`

### `Dot`
`width: 7px; height: 7px; border-radius: 50%; background: color; flex-shrink: 0`
Pulse mode: `box-shadow: 0 0 6px ${color}`

### `Spinner`
`width: Npx; height: Npx; border: 2px solid T.dim; border-top-color: T.amber; border-radius: 50%; animation: spin 0.7s linear infinite`

---

## Interactive States

| Element | Default | Hover | Selected / Active |
|---|---|---|---|
| Collection row (rail) | transparent bg, 2px transparent left-border | — | `${c.color}10` bg, `2px solid ${c.color}` left-border |
| New Collection action | `opacity: 0.6` | `opacity: 1` | — |
| Clear Cache / Disconnect | `opacity: 0.35` | `opacity: 0.7` | — |
| Work item row | transparent | `rgba(255,255,255,0.025)` bg | `${collection.color}08` bg, 2px colour left-border |
| Search result row | transparent | `rgba(255,255,255,0.04)` bg | `rgba(245,158,11,0.07)` bg, 3px amber left-border |
| Resource tab sub-list row | transparent | `rgba(255,255,255,0.025)` bg | `${accent}08` bg, 2px accent left-border |
| ResourceDetail tab | `T.dim` text, no underline | — | `T.text`, 2px amber underline |
| Toggle btn (row) | rgba bg, dim text, `"+"` | — | `${T.green}22` bg, green border/text, `"✓"` |
| Toggle section (detail) | rgba bg, muted text | — | `${T.green}22` bg, green border/text |
| renderToggleButton (resource tabs) | rgba bg, muted text, `"+ Add"` | — | `${collection.color}18` bg, colour border/text, `"✓ In Collection"` |
| Connect button | amber-tinted | — | — (disabled: opacity reduced) |
| Icon picker swatch | transparent bg/border | — | `rgba(255,255,255,0.08)` bg, rgba border |
| Colour picker swatch | no outline | — | `2px solid colour; outline-offset: 2px` |
| Filter chip | `rgba(255,255,255,0.04)` bg, transparent border | — | `${colour}22` bg, `${colour}44` border |
