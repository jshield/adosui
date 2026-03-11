import { useState, useCallback, useEffect, useRef } from "react";
import { T, FONTS } from "./lib/theme";
import { ADOClient } from "./lib/adoClient";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { Btn } from "./components/ui";
import {
  ConnectScreen,
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

/* ─── ROOT ───────────────────────────────────────────────────── */
export default function App() {
  const [client,       setClient]       = useState(null);
  const [org,          setOrg]          = useState("");
  const [profile,      setProfile]      = useState(null);
  const [collectionKey, setCollectionKey] = useState("ado-superui-collections");
  const [collections,  setCollections]  = useLocalStorage(collectionKey, []);
  const [activeCol,    setActiveCol]    = useState(null);
  const [selectedWI,   setSelectedWI]   = useState(null);
  // view: "search" | "newCollection" | "resources" | "pipelines"
  const [view,         setView]         = useState("search");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching,    setSearching]    = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] = useState(null);
  const [syncStatus,   setSyncStatus]   = useState("idle"); // "idle"|"saving"|"saved"|"error"
  const saveTimerRef = useRef(null);

  /* ── Connect ─────────────────────────────────────────────────── */
  const handleConnect = useCallback(async (c, o) => {
    setClient(c); setOrg(o); setView("newCollection");
    try {
      const p = await c.getProfile();
      setProfile(p);
      const scopedKey = `ado-superui-collections-${p.id}`;
      setCollectionKey(scopedKey);
      // Load server-side collections; overwrite localStorage when available
      const serverCols = await c.loadCollections(p.id);
      if (serverCols && serverCols.length > 0) {
        try { localStorage.setItem(scopedKey, JSON.stringify(serverCols)); } catch {}
      }
    } catch {
      // PAT lacks vso.profile scope or server unreachable — fall back gracefully
    }
  }, []);

  /* ── Collection mutations ────────────────────────────────────── */
  const handleCollectionCreated = useCallback((col) => {
    setCollections(p => [...p, { ...col, filters: { types: [], states: [], assignee: "", areaPath: "" }, workItemIds: [], repoIds: [], pipelineIds: [], prIds: [] }]);
    setActiveCol(col.id);
    setView("resources");
  }, [setCollections]);

  const handleCollectionFilterChange = useCallback((filters) => {
    setCollections(cols => cols.map(c => c.id === activeCol ? { ...c, filters } : c));
  }, [activeCol, setCollections]);

  const handleCollectionDelete = useCallback((colId) => {
    setCollections(cols => cols.filter(c => c.id !== colId));
    if (activeCol === colId) { setActiveCol(null); setSelectedWI(null); }
  }, [activeCol, setCollections]);

  const handleWorkItemToggle = useCallback((colId, workItemId) => {
    setCollections(cols => cols.map(c => {
      if (c.id !== colId) return c;
      const ids    = c.workItemIds || [];
      const newIds = ids.includes(String(workItemId))
        ? ids.filter(id => id !== String(workItemId))
        : [...ids, String(workItemId)];
      return { ...c, workItemIds: newIds };
    }));
  }, [setCollections]);

  const handleResourceToggle = useCallback((type, resourceId, colId) => {
    setCollections(cols => cols.map(c => {
      if (c.id !== colId) return c;
      const rid = String(resourceId);
      if (type === "repo") {
        const ids = c.repoIds || [];
        return { ...c, repoIds: ids.includes(rid) ? ids.filter(id => id !== rid) : [...ids, rid] };
      }
      if (type === "pipeline") {
        const ids = c.pipelineIds || [];
        return { ...c, pipelineIds: ids.includes(rid) ? ids.filter(id => id !== rid) : [...ids, rid] };
      }
      if (type === "pr") {
        const ids = c.prIds || [];
        return { ...c, prIds: ids.includes(rid) ? ids.filter(id => id !== rid) : [...ids, rid] };
      }
      return c;
    }));
  }, [setCollections]);

  /* ── Debounced server sync ───────────────────────────────────── */
  useEffect(() => {
    if (!client || !profile) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus("saving");
      try {
        await client.saveCollections(profile.id, collections);
        setSyncStatus("saved");
        setTimeout(() => setSyncStatus("idle"), 2000);
      } catch {
        setSyncStatus("error");
        setTimeout(() => setSyncStatus("idle"), 3000);
      }
    }, 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [collections, client, profile]); // eslint-disable-line react-hooks/exhaustive-deps

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
        workItems: wi.status        === "fulfilled" ? wi.value.slice(0, 20)                                       : [],
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
    setClient(null); setCollections([]); setActiveCol(null);
    setProfile(null); setCollectionKey("ado-superui-collections");
  }, [setCollections]);

  const handleClearCache = useCallback(() => {
    client.clearCache();
    setSelectedWI(null);
    // Force a re-render of the active panel by briefly nulling and restoring activeCol
    const cur = activeCol;
    setActiveCol(null);
    setTimeout(() => setActiveCol(cur), 0);
  }, [client, activeCol]);

  /* ── Derived ─────────────────────────────────────────────────── */
  const collection = collections.find(c => c.id === activeCol);

  /* ── Connect screen ──────────────────────────────────────────── */
  if (!client) return <ConnectScreen onConnect={handleConnect} />;

  /* ── Main layout ─────────────────────────────────────────────── */
  return (
    <>
      <style>{FONTS + `
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1F2937; border-radius: 2px; }
        input::placeholder { color: #374151; }
      `}</style>

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
            <PipelinesView client={client} org={org} />
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
                  onResourceToggle={handleResourceToggle}
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
                  onWorkItemToggle={handleWorkItemToggle}
                  onResourceToggle={handleResourceToggle}
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
