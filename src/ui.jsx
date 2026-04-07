import { useState, useCallback, useEffect, useRef } from "react";
import { T, FONTS } from "./lib/theme";
import { ADOClient } from "./lib/adoClient";
import { ADOStorage, PINNED_PIPELINES_ID, PINNED_TOOLS_ID, ConflictError, migrateCollection } from "./lib/adoStorage";
import { syncCollectionToWiki } from "./lib/wikiSync";
import { loadLinkRules } from "./lib/linkRules";
import { loadWorkflowTemplates } from "./lib/workflowManager";
import { loadResourceTypes, getType, getSearchableTypes, getId, getDisplayProps, toggleInCollection, addCommentToCollection, mapItemToCollection } from "./lib/resourceTypes";
import { search as resourceSearch, fetchAll, fetchForProjects } from "./lib/resourceApi";
import { cache } from "./lib";
import {
  ConnectScreen,
  SetupScreen,
  CollectionBuilder,
  CollectionView,
  ResourceDetail,
  PipelinesView,
  Rail,
  WorkerStatusView,
  YamlToolsView,
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

  // Tab state (resource detail tabs)
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);

  // View
  const [view, setView] = useState("search"); // "search" | "newCollection" | "resources" | "pipelines"

  // Search
  const [searchQuery,           setSearchQuery]           = useState("");
  const [searchResults,         setSearchResults]         = useState(null);
  const [searching,             setSearching]             = useState(false);
  const [searchProgress,        setSearchProgress]        = useState(null);
  const searchTokenRef = useRef(0);

  // Sync status
  const [syncStatus,  setSyncStatus]  = useState("idle");
  const [toast,       setToast]       = useState(null);
  const [workerActivity, setWorkerActivity] = useState({ activityLog: [], lastRefresh: null, isRunning: false });

  // Link rules (regex classification for bookmarked URLs)
  const [linkRules, setLinkRules] = useState({ rules: [], objectId: null });

  // Workflow templates
  const [workflowTemplates, setWorkflowTemplates] = useState({ templates: [], byId: new Map(), objectId: null });

  // Resource types registry
  const [resourceTypesLoaded, setResourceTypesLoaded] = useState(false);
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
          const [cols, rules] = await Promise.all([
            stor.loadAll(),
            loadLinkRules(c, cfg),
          ]);
          setCollections(cols);
          setLinkRules(rules);
          // Load resource types and workflow templates (non-blocking)
          loadResourceTypes(c, cfg).then(() => setResourceTypesLoaded(true)).catch(() => {});
          loadWorkflowTemplates(c, cfg).then(setWorkflowTemplates).catch(() => {});
          setSyncStatus("idle");
        } catch (e) {
          setSyncStatus("error");
          showToast(`Failed to load collections: ${e.message}`, T.red);
        }
        setAppPhase("app");
        setView("newCollection");
        backgroundWorker.setClient(c);
        backgroundWorker.acquireLeadership();
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
        const [cols, rules] = await Promise.all([
          stor.loadAll(),
          loadLinkRules(client, cfg),
        ]);
        setCollections(cols);
        setLinkRules(rules);
        // Load resource types and workflow templates (non-blocking)
        loadResourceTypes(client, cfg).then(() => setResourceTypesLoaded(true)).catch(() => {});
        loadWorkflowTemplates(client, cfg).then(setWorkflowTemplates).catch(() => {});
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
      projects: col.projects || [],
      workItemIds: [],
      repos: [],
      pipelines: [],
      prIds: [],
      comments: [],
      links: [],
    });
    setCollections(p => [...p, newCol]);
    pendingSaves.current.add(newCol.id);
    setActiveCol(newCol.id);
    setView("resources");
  }, []);

  useEffect(() => {
    if (client) backgroundWorker.setCollections(collections);
  }, [collections, client]);

  const handleCollectionFilterChange = useCallback((filters) => {
    if (!activeCol) return;
    updateCollection(activeCol, c => ({ ...c, filters }));
  }, [activeCol, updateCollection]);

  const handleCollectionProjectChange = useCallback((colId, projects) => {
    updateCollection(colId, c => ({ ...c, projects }));
  }, [updateCollection]);

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

  const handleResourceToggle = useCallback((type, resourceId, colId, wikiItem) => {
    updateCollection(colId, c => {
      const rid = String(resourceId);

      // Use registry-based toggle if type is defined
      const rt = getType(type);
      if (rt && rt.collectionField) {
        return toggleInCollection(type, c, rid, wikiItem);
      }

      // Fallback for unknown types
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
    updateCollection(colId, c => addCommentToCollection(resourceType, c, String(resourceId), comment));
  }, [profile, updateCollection]);

  // ── Tab management ────────────────────────────────────────────────────
  const openTab = useCallback((type, item) => {
    const id = getId(type, item);
    const dp = getDisplayProps(type, item);
    const tabId = `${type}:${id}`;
    setOpenTabs(prev => {
      if (prev.some(t => t.id === tabId)) return prev;
      return [...prev, { id: tabId, type, data: item, label: dp?.title || String(id) }];
    });
    setActiveTabId(tabId);
  }, []);

  const closeTab = useCallback((tabId) => {
    setOpenTabs(prev => prev.filter(t => t.id !== tabId));
    setActiveTabId(prev => prev === tabId ? null : prev);
  }, []);

  const handleCardClick = useCallback((type, item) => {
    openTab(type, item);
  }, [openTab]);

  const handleSearchSelect = useCallback((result) => {
    openTab(result.type, result.item);
  }, [openTab]);

  const handleSaveLogComments = useCallback((colId, pipelineId, runId, comments) => {
    if (!colId) return;
    updateCollection(colId, c => ({
      ...c,
      pipelines: (c.pipelines || []).map(p =>
        String(p.id) === String(pipelineId)
          ? {
              ...p,
              runs: (() => {
                const runs = [...(p.runs || [])];
                const idx = runs.findIndex(r => r.id === runId);
                if (idx >= 0) {
                  runs[idx] = { ...runs[idx], comments };
                } else {
                  runs.push({ id: runId, comments });
                }
                // Cap at 5 most recent runs
                return runs.slice(-5);
              })(),
            }
          : p
      ),
    }));
  }, [updateCollection]);

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

  // Pinned tools personal collection
  const pinnedToolsCollection = ADOStorage.getPinnedToolsCollection(collections, profile);

  const handleTogglePinTool = useCallback((tool) => {
    const existing = collections.find(c => c.id === PINNED_TOOLS_ID && c.scope === "personal");
    const colId = PINNED_TOOLS_ID;
    const tid = String(tool.id);

    if (!existing) {
      const newCol = {
        ...pinnedToolsCollection,
        yamlTools: [{
          id:       tid,
          name:     tool.name || "",
          icon:     tool.icon || "📄",
          comments: [],
        }],
      };
      setCollections(p => [...p, newCol]);
      pendingSaves.current.add(colId);
      return;
    }

    updateCollection(colId, c => {
      const yts = c.yamlTools || [];
      const exists = yts.some(yt => String(yt.id) === tid);
      if (exists) {
        return { ...c, yamlTools: yts.filter(yt => String(yt.id) !== tid) };
      }
      return {
        ...c,
        yamlTools: [...yts, {
          id:       tid,
          name:     tool.name || "",
          icon:     tool.icon || "📄",
          comments: [],
        }],
      };
    });
  }, [collections, pinnedToolsCollection, updateCollection]);

  // Global search - uses worker for streaming results
  const handleSearch = useCallback(async (qOrEvent) => {
    const q = typeof qOrEvent === "string" ? qOrEvent : qOrEvent?.target?.value ?? "";
    setSearchQuery(q);
    setSearchProgress(null);
    if (!q.trim()) { setSearchResults(null); return; }

    const token = ++searchTokenRef.current;
    setSearching(true);

    const searchableTypes = getSearchableTypes();
    const empty = {};
    searchableTypes.forEach(rt => {
      empty[rt.id] = [];
    });
    setSearchResults(empty);

    const col = collections.find(c => c.id === activeCol);
    const projects = col?.projects?.length ? col.projects : [];

    // Request search from worker for each type
    searchableTypes.forEach(rt => {
      const searchConf = rt.source?.search;
      if (!searchConf) return;
      
      const type = searchConf.preset === "workItem" 
        ? "search:workitem" 
        : `search:${rt.id}`;
      
      backgroundWorker.request(type, {
        query: q,
        projects,
        priority: 'user',
      });
    });

    // Subscribe to cache for incremental results
    const unsubs = searchableTypes.map(rt => {
      const searchConf = rt.source?.search;
      if (!searchConf) return () => {};

      const type = searchConf.preset === "workItem" 
        ? "search:workitem" 
        : `search:${rt.id}`;
      
      const cacheKey = `worker:${type}:q:${q}:${(projects || []).sort().join(',')}`;
      
      return cache.subscribe((changedKey, entry) => {
        if (searchTokenRef.current !== token) return;
        
        if (changedKey === cacheKey) {
          const items = entry.data?.items || entry.data || [];
          setSearchResults(prev => ({ ...(prev || empty), [rt.id]: items }));
          
          // Check if all types have results
          const allHaveResults = Object.keys(prev || empty).every(key => 
            key === rt.id || (prev[key] && prev[key].length > 0) || entry.data?.items
          );
          if (allHaveResults && searchTokenRef.current === token) {
            setSearching(false);
          }
        }
      });
    });

    return () => { unsubs.forEach(u => u()); };
  }, [collections, activeCol]);

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
    setOpenTabs([]);
    setActiveTabId(null);
    const cur = activeCol;
    setActiveCol(null);
    setTimeout(() => setActiveCol(cur), 0);
  }, [client, activeCol]);

  // PAT update handler (called from Rail when user updates PAT)
  const handleUpdatePat = useCallback(() => {
    showToast("PAT updated successfully", T.green);
  }, [showToast]);

  // Reconfigure config repo settings
  const handleReconfigure = useCallback(() => {
    setAppPhase("setup");
  }, []);

  const handleReconfigureCancel = useCallback(() => {
    setAppPhase("app");
  }, []);

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
              const [cols, rules] = await Promise.all([
                stor.loadAll(),
                loadLinkRules(c, cfg),
              ]);
              setCollections(cols);
              setLinkRules(rules);
              // Load resource types and workflow templates (non-blocking)
              loadResourceTypes(c, cfg).then(() => setResourceTypesLoaded(true)).catch(() => {});
              loadWorkflowTemplates(c, cfg).then(setWorkflowTemplates).catch(() => {});
              setSyncStatus("idle");
            } catch (e) {
              setSyncStatus("error");
              showToast(`Failed to load collections: ${e.message}`, T.red);
            }
            setAppPhase("app");
            setView("newCollection");
            backgroundWorker.setClient(c);
            backgroundWorker.acquireLeadership();
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
    onBack={repoConfig ? handleReconfigureCancel : handleDisconnect}
    initialConfig={repoConfig || undefined}
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

      <div style={{ display: "flex", height: "100vh", background: T.bg, color: T.text, fontFamily: "'Barlow'", overflow: "hidden" }}>

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
            setOpenTabs([]);
            setActiveTabId(null);
            setView("resources");
          }}
          onNewCollection={() => { setView("newCollection"); setSelectedWI(null); setOpenTabs([]); setActiveTabId(null); }}
          onClearCache={handleClearCache}
          onDisconnect={handleDisconnect}
          onShowPipelines={() => setView("pipelines")}
          onShowWorkerStatus={() => setView("workerStatus")}
          onShowYamlTools={() => setView("yamlTools")}
          client={client}
          onUpdatePat={handleUpdatePat}
          onReconfigure={handleReconfigure}
        />

        {/* ── Worker Status full-width view ────────────────────────── */}
        {view === "workerStatus" ? (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <WorkerStatusView collections={collections} />
          </div>
        ) : view === "pipelines" ? (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <PipelinesView
              client={client}
              org={org}
              pinnedCollection={pinnedCollection}
              onTogglePin={handleTogglePin}
              profile={profile}
              onResourceToggle={handleResourceToggle}
              onAddComment={handleAddComment}
              onSaveLogComments={handleSaveLogComments}
              syncStatus={syncStatus}
            />
          </div>
        ) : view === "yamlTools" ? (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <YamlToolsView
              client={client}
              repoConfig={repoConfig}
              collections={collections}
              profile={profile}
              showToast={showToast}
              pinnedTools={pinnedToolsCollection?.yamlTools || []}
              onTogglePinTool={handleTogglePinTool}
              onResourceToggle={handleResourceToggle}
              activeColId={activeCol}
            />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {view === "newCollection" ? (
              <CollectionBuilder onDone={handleCollectionCreated} client={client} />
            ) : collection ? (
              <CollectionView
                client={client}
                collection={collection}
                profile={profile}
                org={org}
                openTabs={openTabs}
                activeTabId={activeTabId}
                onTabSelect={setActiveTabId}
                onTabClose={closeTab}
                onCardClick={handleCardClick}
                searchQuery={searchQuery}
                onSearch={handleSearch}
                onClearSearch={() => { setSearchQuery(""); setSearchResults(null); setSearchProgress(null); searchTokenRef.current++; }}
                searching={searching}
                searchProgress={searchProgress}
                searchResults={searchResults}
                onWorkItemToggle={handleWorkItemToggle}
                onResourceToggle={handleResourceToggle}
                onAddComment={handleAddComment}
                onAddCollectionNote={handleAddCollectionNote}
                onProjectChange={handleCollectionProjectChange}
                onSaveLogComments={handleSaveLogComments}
                syncStatus={syncStatus}
                linkRules={linkRules}
                workflowTemplates={workflowTemplates}
              />
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: T.dim }}>
                <span style={{ fontSize: 38 }}>⬡</span>
                <span style={{ fontFamily: "'Barlow Condensed'", fontSize: 20, letterSpacing: "0.05em" }}>Create a collection to begin</span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
