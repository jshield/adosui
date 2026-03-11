import { useState, useCallback, useEffect, useRef } from "react";
import { T, FONTS } from "./lib/theme";
import { ADOClient } from "./lib/adoClient";
import { ADOStorage, ADOStorage as _ADOStorage, PINNED_PIPELINES_ID, ConflictError, migrateCollection } from "./lib/adoStorage";
import { syncCollectionToWiki } from "./lib/wikiSync";
import { Btn } from "./components/ui";
import {
  ConnectScreen,
  SetupScreen,
  CollectionBuilder,
  WorkItemPanel,
  ResourceDetail,
  CollectionResources,
  SearchResultsList,
  SearchResultDetail,
  PipelinesView,
  AppHeader,
  Rail,
} from "./components/views";

// localStorage key for config repo pointer (non-sensitive, org-scoped)
const REPO_CONFIG_KEY = "ado-superui-repo-config";

function loadRepoConfig() {
  try { return JSON.parse(localStorage.getItem(REPO_CONFIG_KEY) || "null"); } catch { return null; }
}
function saveRepoConfig(cfg) {
  try { localStorage.setItem(REPO_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}
function clearRepoConfig() {
  try { localStorage.removeItem(REPO_CONFIG_KEY); } catch {}
}

/* ─── ROOT ───────────────────────────────────────────────────── */
export default function App() {
  // Auth state
  const [client,   setClient]   = useState(null);
  const [org,      setOrg]      = useState("");
  const [profile,  setProfile]  = useState(null);

  // Setup / onboarding
  // "connect" | "setup" | "app"
  const [appPhase, setAppPhase] = useState("connect");
  const [pendingClient, setPendingClient] = useState(null);
  const [pendingOrg,    setPendingOrg]    = useState("");

  // Storage
  const [storage,    setStorage]    = useState(null);  // ADOStorage instance
  const [repoConfig, setRepoConfig] = useState(null);  // { project, repoId, repoName, wikiId, wikiProject }

  // Collections
  const [collections,  setCollections]  = useState([]);
  const [activeCol,    setActiveCol]    = useState(null);
  const [selectedWI,   setSelectedWI]   = useState(null);

  // View
  // "search" | "newCollection" | "resources" | "pipelines"
  const [view, setView] = useState("search");

  // Search
  const [searchQuery,           setSearchQuery]           = useState("");
  const [searchResults,         setSearchResults]         = useState(null);
  const [searching,             setSearching]             = useState(false);
  const [selectedSearchResult,  setSelectedSearchResult]  = useState(null);

  // Sync
  const [syncStatus,  setSyncStatus]  = useState("idle"); // "idle"|"saving"|"saved"|"error"
  const [toast,       setToast]       = useState(null);   // { message, color }
  const saveTimerRef  = useRef(null);
  const pendingSaves  = useRef(new Set()); // collection IDs queued for save

  /* ── Helpers ─────────────────────────────────────────────────── */
  const showToast = useCallback((message, color = T.amber) => {
    setToast({ message, color });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* ── Connect ─────────────────────────────────────────────────── */
  const handleConnect = useCallback(async (c, o) => {
    setPendingClient(c);
    setPendingOrg(o);
    try {
      const p = await c.getProfile();
      // Check if we have a stored repo config
      const cfg = loadRepoConfig();
      if (cfg && p) {
        // Config found and profile loaded — go straight to app
        const stor = new ADOStorage(c, cfg, p);
        setClient(c);
        setOrg(o);
        setProfile(p);
        setStorage(stor);
        setRepoConfig(cfg);
        // Load collections
        setSyncStatus("saving");
        try {
          const cols = await stor.loadAll();
          setCollections(cols);
          setSyncStatus("idle");
        } catch (e) {
          setSyncStatus("error");
          showToast(`Failed to load collections: ${e.message}`, T.red);
        }
        setView("newCollection");
        setAppPhase("app");
      } else {
        // No config — go to setup
        setAppPhase("setup");
      }
    } catch {
      // Profile fetch failed (no vso.profile scope) — still go to setup
      setAppPhase("setup");
    }
  }, [showToast]);

  /* ── Setup complete ──────────────────────────────────────────── */
  const handleSetupComplete = useCallback(async (cfg) => {
    saveRepoConfig(cfg);
    setRepoConfig(cfg);
    // Fetch profile; re-try once in case it failed during connect
    let p = profile;
    try { p = await pendingClient.getProfile(); } catch {}
    if (!p) {
      showToast(
        "Could not load your ADO profile — check your PAT has the vso.profile scope, then reconnect.",
        T.red
      );
      clearRepoConfig();
      setRepoConfig(null);
      return;
    }
    const stor = new ADOStorage(pendingClient, cfg, p);
    setClient(pendingClient);
    setOrg(pendingOrg);
    setProfile(p);
    setStorage(stor);
    // Load collections (empty repo is fine — returns [])
    setSyncStatus("saving");
    try {
      const cols = await stor.loadAll();
      setCollections(cols);
      setSyncStatus("idle");
    } catch (e) {
      setSyncStatus("error");
      showToast(`Failed to load collections: ${e.message}`, T.red);
    }
    setView("newCollection");
    setAppPhase("app");
  }, [pendingClient, pendingOrg, profile, showToast]);

  /* ── Persist a single collection (debounced per-collection) ─── */
  const persistCollection = useCallback(async (collection) => {
    if (!storage) return;
    setSyncStatus("saving");
    try {
      const newObjectId = await storage.save(collection);
      // Stamp the fresh objectId back so the next save goes straight to "edit"
      if (newObjectId && newObjectId !== collection._objectId) {
        setCollections(cols =>
          cols.map(c => c.id === collection.id ? { ...c, _objectId: newObjectId } : c)
        );
      }
      // Wiki sync (fire-and-forget, non-blocking)
      if (repoConfig?.wikiId) {
        syncCollectionToWiki(client, { project: repoConfig.wikiProject || repoConfig.project, wikiId: repoConfig.wikiId }, collection, org).catch(() => {});
      }
      setSyncStatus("saved");
      setTimeout(() => setSyncStatus(s => s === "saved" ? "idle" : s), 2000);
    } catch (e) {
      if (e instanceof ConflictError) {
        showToast(e.message, T.red);
      } else {
        showToast(`Save failed: ${e.message}`, T.red);
      }
      setSyncStatus("error");
      setTimeout(() => setSyncStatus(s => s === "error" ? "idle" : s), 3000);
    }
  }, [storage, client, org, repoConfig, showToast]);

  // Debounced save on any collection change
  useEffect(() => {
    if (!storage || !collections.length) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Only save collections that are marked dirty
    const dirty = collections.filter(c => pendingSaves.current.has(c.id));
    if (!dirty.length) return;
    saveTimerRef.current = setTimeout(async () => {
      for (const col of dirty) {
        pendingSaves.current.delete(col.id);
        await persistCollection(col);
      }
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [collections, storage, persistCollection]);

  // Mark a collection dirty and update state
  const updateCollection = useCallback((id, updater) => {
    setCollections(cols => {
      const next = cols.map(c => c.id === id ? updater(c) : c);
      pendingSaves.current.add(id);
      return next;
    });
  }, []);

  /* ── Collection mutations ────────────────────────────────────── */
  const handleCollectionCreated = useCallback(async (col) => {
    const newCol = migrateCollection({
      ...col,
      scope: "shared",
      owner: null,
      filters: { types: [], states: [], assignee: "", areaPath: "" },
      workItemIds: [],
      repos: [],
      pipelines: [],
      prIds: [],
      comments: [],
    });
    setCollections(p => [...p, newCol]);
    pendingSaves.current.add(newCol.id);
    setActiveCol(newCol.id);
    setView("resources");
  }, []);

  const handleCollectionFilterChange = useCallback((filters) => {
    if (!activeCol) return;
    updateCollection(activeCol, c => ({ ...c, filters }));
  }, [activeCol, updateCollection]);

  const handleCollectionDelete = useCallback(async (colId) => {
    const col = collections.find(c => c.id === colId);
    setCollections(cols => cols.filter(c => c.id !== colId));
    if (activeCol === colId) { setActiveCol(null); setSelectedWI(null); }
    if (col && storage) {
      try { await storage.delete(col); } catch (e) {
        showToast(`Delete failed: ${e.message}`, T.red);
      }
    }
  }, [activeCol, collections, storage, showToast]);

  const handleWorkItemToggle = useCallback((colId, workItemId) => {
    updateCollection(colId, c => {
      const ids    = c.workItemIds || [];
      const newIds = ids.includes(String(workItemId))
        ? ids.filter(id => id !== String(workItemId))
        : [...ids, String(workItemId)];
      return { ...c, workItemIds: newIds };
    });
  }, [updateCollection]);

  const handleResourceToggle = useCallback((type, resourceId, colId) => {
    updateCollection(colId, c => {
      const rid = String(resourceId);
      if (type === "repo") {
        const repos = c.repos || [];
        const exists = repos.some(r => r.id === rid);
        return { ...c, repos: exists ? repos.filter(r => r.id !== rid) : [...repos, { id: rid, comments: [] }] };
      }
      if (type === "pipeline") {
        const pipes = c.pipelines || [];
        const exists = pipes.some(p => String(p.id) === rid);
        return { ...c, pipelines: exists ? pipes.filter(p => String(p.id) !== rid) : [...pipes, { id: rid, name: "", project: "", folder: "", configurationType: "", comments: [] }] };
      }
      if (type === "pr") {
        const prIds = c.prIds || [];
        return { ...c, prIds: prIds.includes(rid) ? prIds.filter(id => id !== rid) : [...prIds, rid] };
      }
      return c;
    });
  }, [updateCollection]);

  /* ── Comment handlers ────────────────────────────────────────── */
  const handleAddComment = useCallback((colId, resourceType, resourceId, text) => {
    if (!profile) return;
    const comment = {
      text,
      author:    profile.displayName || "",
      authorId:  profile.id || "",
      createdAt: new Date().toISOString(),
    };
    updateCollection(colId, c => {
      if (resourceType === "repo") {
        return {
          ...c,
          repos: (c.repos || []).map(r =>
            r.id === String(resourceId)
              ? { ...r, comments: [...(r.comments || []), comment] }
              : r
          ),
        };
      }
      if (resourceType === "pipeline") {
        return {
          ...c,
          pipelines: (c.pipelines || []).map(p =>
            String(p.id) === String(resourceId)
              ? { ...p, comments: [...(p.comments || []), comment] }
              : p
          ),
        };
      }
      return c;
    });
  }, [profile, updateCollection]);

  const handleAddCollectionNote = useCallback((colId, text) => {
    if (!profile) return;
    const comment = {
      text,
      author:    profile.displayName || "",
      authorId:  profile.id || "",
      createdAt: new Date().toISOString(),
    };
    updateCollection(colId, c => ({ ...c, comments: [...(c.comments || []), comment] }));
  }, [profile, updateCollection]);

  /* ── Pinned pipelines (personal collection) ──────────────────── */
  const pinnedCollection = ADOStorage.getPinnedCollection(collections, profile);

  const handleTogglePin = useCallback((pipeline) => {
    const existing = collections.find(c => c.id === PINNED_PIPELINES_ID && c.scope === "personal");
    const colId    = PINNED_PIPELINES_ID;
    const pid      = String(pipeline.id);

    if (!existing) {
      // Create the personal pinned-pipelines collection
      const newCol = {
        ...pinnedCollection,
        pipelines: [{
          id:                pid,
          name:              pipeline.name || "",
          project:           pipeline.project || pipeline._projectName || "",
          folder:            pipeline.folder || "",
          configurationType: pipeline.configurationType || pipeline.configuration?.type || "",
          comments:          [],
        }],
      };
      setCollections(p => [...p, newCol]);
      pendingSaves.current.add(colId);
      return;
    }

    updateCollection(colId, c => {
      const pipes  = c.pipelines || [];
      const exists = pipes.some(p => String(p.id) === pid);
      if (exists) {
        return { ...c, pipelines: pipes.filter(p => String(p.id) !== pid) };
      }
      return {
        ...c,
        pipelines: [...pipes, {
          id:                pid,
          name:              pipeline.name || "",
          project:           pipeline.project || pipeline._projectName || "",
          folder:            pipeline.folder || "",
          configurationType: pipeline.configurationType || pipeline.configuration?.type || "",
          comments:          [],
        }],
      };
    });
  }, [collections, pinnedCollection, updateCollection]);

  /* ── Global search ───────────────────────────────────────────── */
  const handleSearch = useCallback(async (query) => {
    setSearchQuery(query);
    setSelectedSearchResult(null);
    if (!query.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const q = query.toLowerCase();
      const [wi, repos, pipelines, prs] = await Promise.allSettled([
        client.searchWorkItems(q, {}),
        client.getAllRepos(),
        client.getAllPipelines(),
        client.getAllPullRequests(),
      ]);
      setSearchResults({
        workItems: wi.status        === "fulfilled" ? wi.value.slice(0, 20)                                                    : [],
        repos:     repos.status     === "fulfilled" ? repos.value.filter(r => r.name?.toLowerCase().includes(q)).slice(0, 20)      : [],
        pipelines: pipelines.status === "fulfilled" ? pipelines.value.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 20) : [],
        prs:       prs.status       === "fulfilled" ? prs.value.filter(pr => pr.title?.toLowerCase().includes(q)).slice(0, 20)    : [],
      });
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setSearching(false);
    }
  }, [client]);

  /* ── Disconnect / cache clear ────────────────────────────────── */
  const handleDisconnect = useCallback(() => {
    setClient(null); setOrg(""); setProfile(null);
    setCollections([]); setActiveCol(null); setStorage(null);
    setRepoConfig(null);
    setAppPhase("connect");
    setPendingClient(null); setPendingOrg("");
  }, []);

  const handleClearCache = useCallback(() => {
    client.clearCache();
    setSelectedWI(null);
    const cur = activeCol;
    setActiveCol(null);
    setTimeout(() => setActiveCol(cur), 0);
  }, [client, activeCol]);

  /* ── Derived ─────────────────────────────────────────────────── */
  const collection = collections.find(c => c.id === activeCol);

  /* ── Phase: connect ──────────────────────────────────────────── */
  if (appPhase === "connect") return <ConnectScreen onConnect={handleConnect} />;

  /* ── Phase: setup ────────────────────────────────────────────── */
  if (appPhase === "setup") return (
    <SetupScreen
      client={pendingClient}
      org={pendingOrg}
      onSetupComplete={handleSetupComplete}
      onBack={() => { setAppPhase("connect"); setPendingClient(null); setPendingOrg(""); }}
    />
  );

  /* ── Phase: app ──────────────────────────────────────────────── */
  return (
    <>
      <style>{FONTS + `
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1F2937; border-radius: 2px; }
        input::placeholder { color: #374151; }
        textarea::placeholder { color: #374151; }
      `}</style>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: "fixed", top: 60, right: 20, zIndex: 9999,
          background: T.panel, border: `1px solid ${toast.color}44`,
          borderRadius: 6, padding: "10px 18px",
          fontSize: 12, color: toast.color,
          fontFamily: "'JetBrains Mono'",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          maxWidth: 360,
        }}>
          {toast.message}
        </div>
      )}

      <div style={{ display: "flex", height: "100vh", background: T.bg, color: T.text, fontFamily: "'Barlow'", overflow: "hidden", paddingTop: 50 }}>

        <AppHeader
          searchQuery={searchQuery}
          onSearch={handleSearch}
          onClearSearch={() => { setSearchQuery(""); setSearchResults(null); setSelectedSearchResult(null); }}
          searching={searching}
          syncStatus={syncStatus}
          profile={profile}
        />

        <Rail
          profile={profile}
          org={org}
          collections={collections}
          activeCol={activeCol}
          activeView={view}
          syncStatus={syncStatus}
          onSelectCollection={(id, deleteId) => {
            if (deleteId) { handleCollectionDelete(deleteId); return; }
            setActiveCol(id);
            setSelectedWI(null);
            setView("resources");
          }}
          onNewCollection={() => { setView("newCollection"); setSelectedWI(null); }}
          onClearCache={handleClearCache}
          onDisconnect={handleDisconnect}
          onShowPipelines={() => setView("pipelines")}
        />

        {/* ── Pipelines full-width view ────────────────────────── */}
        {view === "pipelines" ? (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <PipelinesView
              client={client}
              org={org}
              pinnedCollection={pinnedCollection}
              onTogglePin={handleTogglePin}
            />
          </div>
        ) : (
          <>
            {/* ── Centre column ─────────────────────────────────── */}
            <div style={{ width: 370, background: T.panel, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
              {searchQuery.trim() ? (
                <SearchResultsList
                  results={searchResults}
                  searching={searching}
                  searchQuery={searchQuery}
                  collection={collection}
                  selectedResult={selectedSearchResult}
                  onSelect={r => { setSelectedSearchResult(r); setSelectedWI(null); }}
                  onWorkItemToggle={handleWorkItemToggle}
                  onResourceToggle={handleResourceToggle}
                />
              ) : collection ? (
                <WorkItemPanel
                  client={client}
                  collection={collection}
                  onSelect={wi => { setSelectedWI(wi); setSelectedSearchResult(null); setView("resources"); }}
                  selected={selectedWI}
                  onFilterChange={handleCollectionFilterChange}
                  onWorkItemToggle={handleWorkItemToggle}
                />
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: T.dim }}>
                  <span style={{ fontSize: 30 }}>⬡</span>
                  <span style={{ fontSize: 13, fontFamily: "'Barlow Condensed'", letterSpacing: "0.05em" }}>Select a collection</span>
                </div>
              )}
            </div>

            {/* ── Right column ──────────────────────────────────── */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
              {view === "newCollection" ? (
                <CollectionBuilder onDone={handleCollectionCreated} />
              ) : selectedWI ? (
                <ResourceDetail
                  client={client}
                  workItem={selectedWI}
                  org={org}
                  collection={collection}
                  profile={profile}
                  onResourceToggle={handleResourceToggle}
                  onAddComment={handleAddComment}
                  syncStatus={syncStatus}
                />
              ) : selectedSearchResult ? (
                <SearchResultDetail
                  result={selectedSearchResult}
                  collection={collection}
                  org={org}
                  onWorkItemToggle={handleWorkItemToggle}
                  onResourceToggle={handleResourceToggle}
                />
              ) : collection ? (
                <CollectionResources
                  client={client}
                  collection={collection}
                  profile={profile}
                  onWorkItemToggle={handleWorkItemToggle}
                  onResourceToggle={handleResourceToggle}
                  onAddComment={handleAddComment}
                  onAddCollectionNote={handleAddCollectionNote}
                  syncStatus={syncStatus}
                />
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: T.dim }}>
                  <span style={{ fontSize: 38 }}>⬡</span>
                  <span style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, letterSpacing: "0.05em" }}>Create a collection to begin</span>
                  <Btn variant="primary" onClick={() => setView("newCollection")}>+ New Collection</Btn>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
