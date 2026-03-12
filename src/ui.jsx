import { useState, useCallback, useEffect, useRef } from "react";
import { T, FONTS } from "./lib/theme";
import { ADOClient } from "./lib/adoClient";
import { ADOStorage, PINNED_PIPELINES_ID, ConflictError, migrateCollection } from "./lib/adoStorage";
import { syncCollectionToWiki } from "./lib/wikiSync";
import {
  ConnectScreen,
  SetupScreen,
  CollectionBuilder,
  WorkItemPanel,
  ResourcePanel,
  ResourceDetail,
  CollectionResources,
  SearchResultsList,
  SearchResultDetail,
  PipelinesView,
  AppHeader,
  Rail,
} from "./components/views";
import { hasStoredCredentials, clearCredentials, loadPAT, clearSessionKey } from "./lib/credentialStore";
import backgroundWorker from "./lib/backgroundWorker";

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

  // App flow phase
  const [appPhase, setAppPhase] = useState("connect"); // "connect" | "setup" | "app"

  // Storage (repo config)
  const [storage,    setStorage]    = useState(null);
  const [repoConfig, setRepoConfig] = useState(null);

  // Collections
  const [collections,  setCollections]  = useState([]);
  const [activeCol,    setActiveCol]    = useState(null);
  const [selectedWI,   setSelectedWI]   = useState(null);
  const [selectedResource, setSelectedResource] = useState(null); // { type: 'workitem'|'repo'|'pipeline'|'pr', data: object }

  // View
  const [view, setView] = useState("search"); // "search" | "newCollection" | "resources" | "pipelines"

  // Search
  const [searchQuery,           setSearchQuery]           = useState("");
  const [searchResults,         setSearchResults]         = useState(null);
  const [searching,             setSearching]             = useState(false);
  const [selectedSearchResult,  setSelectedSearchResult]  = useState(null);

  // Sync status
  const [syncStatus,  setSyncStatus]  = useState("idle");
  const [toast,       setToast]       = useState(null);
  const [workerActivity, setWorkerActivity] = useState({ activityLog: [], lastRefresh: null, isRunning: false });
  const saveTimerRef  = useRef(null);
  const pendingSaves  = useRef(new Set());

  // Toast helper
  const showToast = useCallback((message, color = T.amber) => {
    setToast({ message, color });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Subscribe to background worker activity
  useEffect(() => {
    const unsub = backgroundWorker.subscribe(setWorkerActivity);
    return unsub;
  }, []);

  // Handle connect (auth via stored credentials or new login)
  const handleConnect = useCallback(async (c, orgName, authInfo) => {
    // `authInfo` contains: authMode, passphrase (if passphrase mode)
    // We already know the PAT is stored and decrypted by ConnectScreen
    try {
      const p = await c.getProfile();
      const cfg = loadRepoConfig();

      const stor = new ADOStorage(c, cfg || { project: "", repoId: "", repoName: "" }, p);
      setClient(c);
      setOrg(orgName);
      setProfile(p);
      setStorage(stor);
      setRepoConfig(cfg);

      // If we have a repo config, try to load collections; else go to setup
      if (cfg) {
        setSyncStatus("saving");
        try {
          const cols = await stor.loadAll();
          setCollections(cols);
          setSyncStatus("idle");
        } catch (e) {
          setSyncStatus("error");
          showToast(`Failed to load collections: ${e.message}`, T.red);
        }
        setAppPhase("app");
        setView("newCollection");
        backgroundWorker.setClient(c);
        backgroundWorker.start();
      } else {
        setAppPhase("setup");
      }
    } catch (e) {
      showToast(`Connect failed: ${e.message}`, T.red);
    }
  }, [showToast]);

  // Setup screen completed (repo configured)
  const handleSetupComplete = useCallback(async (cfg) => {
    saveRepoConfig(cfg);
    setRepoConfig(cfg);

    // The client and profile should already be set from handleConnect
    // Reload the collections now that we have a repo config
    if (client && profile) {
      const stor = new ADOStorage(client, cfg, profile);
      setStorage(stor);
      setSyncStatus("saving");
      try {
        const cols = await stor.loadAll();
        setCollections(cols);
        setSyncStatus("idle");
      } catch (e) {
        setSyncStatus("error");
        showToast(`Failed to load collections: ${e.message}`, T.red);
      }
    }
    setAppPhase("app");
    setView("newCollection");
  }, [client, profile, showToast]);

  // Persist a single collection (debounced)
  const persistCollection = useCallback(async (collection) => {
    if (!storage) return;
    setSyncStatus("saving");
    try {
      const newObjectId = await storage.save(collection);
      if (newObjectId && newObjectId !== collection._objectId) {
        setCollections(cols =>
          cols.map(c => c.id === collection.id ? { ...c, _objectId: newObjectId } : c)
        );
      }
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

  const updateCollection = useCallback((id, updater) => {
    setCollections(cols => {
      const next = cols.map(c => c.id === id ? updater(c) : c);
      pendingSaves.current.add(id);
      return next;
    });
  }, []);

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
      const ids = c.workItemIds || [];
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
      if (type === "serviceconnection") {
        const scs = c.serviceConnections || [];
        const exists = scs.some(sc => String(sc.id) === rid);
        return { ...c, serviceConnections: exists ? scs.filter(sc => String(sc.id) !== rid) : [...scs, { id: rid, project: "", type: "", comments: [] }] };
      }
      if (type === "wiki") {
        const wps = c.wikiPages || [];
        const exists = wps.some(wp => String(wp.id) === rid);
        return { ...c, wikiPages: exists ? wps.filter(wp => String(wp.id) !== rid) : [...wps, { id: rid, path: "", wikiId: "", wikiName: "", project: "", comments: [] }] };
      }
      return c;
    });
  }, [updateCollection]);

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
      if (resourceType === "serviceconnection") {
        return {
          ...c,
          serviceConnections: (c.serviceConnections || []).map(sc =>
            String(sc.id) === String(resourceId)
              ? { ...sc, comments: [...(sc.comments || []), comment] }
              : sc
          ),
        };
      }
      if (resourceType === "wiki") {
        return {
          ...c,
          wikiPages: (c.wikiPages || []).map(wp =>
            String(wp.id) === String(resourceId)
              ? { ...wp, comments: [...(wp.comments || []), comment] }
              : wp
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

  // Pinned pipelines personal collection
  const pinnedCollection = ADOStorage.getPinnedCollection(collections, profile);

  const handleTogglePin = useCallback((pipeline) => {
    const existing = collections.find(c => c.id === PINNED_PIPELINES_ID && c.scope === "personal");
    const colId = PINNED_PIPELINES_ID;
    const pid = String(pipeline.id);

    if (!existing) {
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

  // Global search
  const handleSearch = useCallback(async (q) => {
    setSearchQuery(q);
    setSelectedSearchResult(null);
    if (!q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const lower = q.toLowerCase();
      const [wi, repos, pipelines, prs, scs, wikis] = await Promise.allSettled([
        client.searchWorkItems(q, {}),
        client.getAllRepos(),
        client.getAllPipelines(),
        client.getAllPullRequests(),
        client.getAllServiceConnections(),
        client.getAllWikiPages(),
      ]);
      setSearchResults({
        workItems:         wi.status === "fulfilled" ? wi.value.slice(0, 20) : [],
        repos:             repos.status === "fulfilled" ? repos.value.filter(r => r.name?.toLowerCase().includes(lower)).slice(0, 20) : [],
        pipelines:         pipelines.status === "fulfilled" ? pipelines.value.filter(p => p.name?.toLowerCase().includes(lower)).slice(0, 20) : [],
        prs:               prs.status === "fulfilled" ? prs.value.filter(pr => pr.title?.toLowerCase().includes(lower)).slice(0, 20) : [],
        serviceConnections: scs.status === "fulfilled" ? scs.value.filter(sc => sc.name?.toLowerCase().includes(lower)).slice(0, 20) : [],
        wikiPages:         wikis.status === "fulfilled" ? wikis.value.filter(wp => (wp.path || "").toLowerCase().includes(lower) || (wp.name || "").toLowerCase().includes(lower)).slice(0, 20) : [],
      });
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setSearching(false);
    }
  }, [client]);

  // Disconnect
  const handleDisconnect = useCallback(() => {
    backgroundWorker.stop();
    setClient(null); setOrg(""); setProfile(null);
    setCollections([]); setActiveCol(null); setStorage(null);
    setRepoConfig(null);
    setAppPhase("connect");
    clearCredentials();
    clearRepoConfig();
  }, []);

  const handleClearCache = useCallback(() => {
    client.clearCache();
    setSelectedWI(null);
    setSelectedResource(null);
    const cur = activeCol;
    setActiveCol(null);
    setTimeout(() => setActiveCol(cur), 0);
  }, [client, activeCol]);

  // PAT update handler (called from Rail when user updates PAT)
  const handleUpdatePat = useCallback(() => {
    showToast("PAT updated successfully", T.green);
  }, [showToast]);

  // Auto-resume session on mount if credentials exist
  useEffect(() => {
    // If we already have a client, don't auto-resume
    if (client) return;

    // Try to auto-resume from stored credentials
    const resume = async () => {
      try {
        const stored = await loadPAT();
        if (stored && stored.pat && stored.data) {
          const { pat, data } = stored;
          const c = new ADOClient(data.org, pat);
          await c.testConnection();
          const p = await c.getProfile();
          const cfg = loadRepoConfig();
          const stor = new ADOStorage(c, cfg || { project: "", repoId: "", repoName: "" }, p);
          setClient(c);
          setOrg(data.org);
          setProfile(p);
          setStorage(stor);
          setRepoConfig(cfg);

          if (cfg) {
            setSyncStatus("saving");
            try {
              const cols = await stor.loadAll();
              setCollections(cols);
              setSyncStatus("idle");
            } catch (e) {
              setSyncStatus("error");
              showToast(`Failed to load collections: ${e.message}`, T.red);
            }
            setAppPhase("app");
            setView("newCollection");
            backgroundWorker.setClient(c);
            backgroundWorker.start();
          } else {
            setAppPhase("setup");
          }
        }
      } catch {
        // Cannot auto-resume — stay on connect screen
      }
    };
    resume();
  }, [client, showToast]);

  const collection = collections.find(c => c.id === activeCol);

  /* ── Render: Connect screen ───────────────────────────────────── */
  if (appPhase === "connect") return <ConnectScreen onConnect={handleConnect} />;

  /* ── Render: Setup screen ─────────────────────────────────────── */
  if (appPhase === "setup") return <SetupScreen
    client={client}
    org={org}
    onSetupComplete={handleSetupComplete}
    onBack={handleDisconnect}
  />;

  /* ── Render: App ──────────────────────────────────────────────── */
  return (
    <>
      <style>{FONTS + `@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

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
          workerActivity={workerActivity}
          onSelectCollection={(id, deleteId) => {
            if (deleteId) { handleCollectionDelete(deleteId); return; }
            setActiveCol(id);
            setSelectedWI(null);
            setSelectedResource(null);
            setView("resources");
          }}
          onNewCollection={() => { setView("newCollection"); setSelectedWI(null); setSelectedResource(null); }}
          onClearCache={handleClearCache}
          onDisconnect={handleDisconnect}
          onShowPipelines={() => setView("pipelines")}
          client={client}
          onUpdatePat={handleUpdatePat}
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
                  onSelect={r => { setSelectedSearchResult(r); setSelectedWI(null); setSelectedResource(null); setView("resources"); }}
                  onWorkItemToggle={handleWorkItemToggle}
                  onResourceToggle={handleResourceToggle}
                />
              ) : collection ? (
                <ResourcePanel
                  client={client}
                  collection={collection}
                  selectedResource={selectedResource}
                  onSelect={(type, data) => { setSelectedResource({ type, data }); setSelectedWI(null); setSelectedSearchResult(null); setView("resources"); }}
                  onFilterChange={handleCollectionFilterChange}
                  onWorkItemToggle={handleWorkItemToggle}
                  onResourceToggle={handleResourceToggle}
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
              ) : selectedResource ? (
                <ResourceDetail
                  client={client}
                  resource={selectedResource}
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
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
