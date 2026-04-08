import { useState, useCallback, useRef, useEffect, createRef } from "react";
import { T } from "../../lib/theme";
import { branchName, getLatestRun, getRunBranch, getRunStatusVal, cache } from "../../lib";
import { matchLink, formatTemplate } from "../../lib/linkRules";
import { getType, getId, getDisplayProps, getCollectionTypes } from "../../lib/resourceTypes";
import { search as resourceSearch, fetchAll, fetchForProjects } from "../../lib/resourceApi";
import { useCollectionData } from "../../lib/useCollectionData";
import { ResourceDetail } from "./ResourceDetail";
import { WorkflowProgress } from "./WorkflowProgress";
import { TabBar } from "./TabBar";
import {
  Pill, Card, Spinner, CommentThread, ProjectScopeSelector,
  ResourceToggle, Input, EmptyState,
} from "../ui";

function RemoveBtn({ type, id, onRemove }) {
  return (
    <button onClick={() => onRemove(type, id)}
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: T.dim, fontSize: 12, flexShrink: 0 }}>
      × Remove
    </button>
  );
}

function Group({ id, title, items, children }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'",
          letterSpacing: "0.1em", textTransform: "uppercase",
          marginBottom: collapsed ? 0 : 10, padding: "0 4px",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          userSelect: "none",
        }}
      >
        <span style={{
          display: "inline-block", fontSize: 8,
          transition: "transform 0.15s",
          transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
        }}>▶</span>
        {title} ({items.length})
      </div>
      {!collapsed && items.map(children)}
    </div>
  );
}

/**
 * Unified collection view — merges ResourcePanel, CollectionResources,
 * and SearchResultsList into a single component with:
 *   - Tab bar for open resource detail tabs
 *   - Inline search that replaces groups with results
 *   - Collapsible groups with rich cards (dashboard mode)
 *   - Comment threads, collection notes, project scope
 *   - Link rule rendering
 */
export function CollectionView({
  client,
  collection,
  profile,
  org,
  // Tab state
  openTabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onCardClick,
  // Search
  searchQuery,
  onSearch,
  onClearSearch,
  searching,
  searchProgress,
  searchResults,
  // Actions
  onWorkItemToggle,
  onResourceToggle,
  onAddComment,
  onAddCollectionNote,
  onProjectChange,
  onSaveLogComments,
  syncStatus,
  linkRules,
  workflowTemplates,
}) {
  const { fetchedItems, loading } = useCollectionData(collection, client);
  const searchTokenRef = useRef(0);
  const tabRefs = useRef({});

  const collectionTypes = getCollectionTypes();
  const authorName = profile?.displayName || "";

  // ── Scroll to active tab when it changes ────────────────────────────
  useEffect(() => {
    if (activeTabId && tabRefs.current[activeTabId]) {
      tabRefs.current[activeTabId].scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeTabId]);

  // ── Enrich fetched items (pipeline cached runs) ───────────────────────
  const enrichedItems = { ...fetchedItems };
  if (fetchedItems.pipeline?.length) {
    enrichedItems.pipeline = fetchedItems.pipeline.map(p => {
      const runObj = getLatestRun(
        (cache.get(`project:${p._projectName}:pipelineRuns`) || {})[String(p.id)]
        || p.latestRun || null
      ) || null;
      return runObj ? { ...p, latestRun: runObj } : p;
    });
  }

  // ── Comment lookup helper ──────────────────────────────────────────────
  const getComments = (typeId, itemId) => {
    const rt = getType(typeId);
    if (!rt?.collectionField || rt.collectionShape === "flat") return [];
    const items = collection[rt.collectionField] || [];
    return items.find(i => String(i[rt.idField]) === String(itemId))?.comments || [];
  };

  // ── Remove item ───────────────────────────────────────────────────────
  const removeItem = useCallback((type, id) => {
    if (type === "workitem") onWorkItemToggle(collection.id, id);
    else onResourceToggle(type, id, collection.id);
  }, [collection.id, onWorkItemToggle, onResourceToggle]);

  // ── Generic card (driven by registry display config) ──────────────────
  const renderGenericCard = (rt, item, opts = {}) => {
    const dp = getDisplayProps(rt.id, item);
    const id = getId(rt.id, item);
    if (!dp) return null;

    const isClickable = !!onCardClick;
    const showToggle = opts.showToggle;

    return (
      <div key={String(id)} style={{ marginBottom: 8 }}>
        <Card accent={dp.color}>
          <div
            style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-start",
              cursor: isClickable ? "pointer" : "default",
            }}
            onClick={() => isClickable && onCardClick(rt.id, item)}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                {dp.idText && <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>{dp.idText}</span>}
                <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dp.title}</span>
                {dp.status && <Pill label={dp.status.label} color={dp.status.color} />}
              </div>
              {dp.subtitle && <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", marginTop: 4 }}>{dp.subtitle}</div>}
              {rt.id === "workitem" && workflowTemplates && (
                <div style={{ marginTop: 6 }}>
                  <WorkflowProgress workItem={item} workflowTemplates={workflowTemplates} />
                </div>
              )}
              {rt.collectionShape !== "flat" && onAddComment && (
                <div style={{ marginTop: 6 }}>
                  <CommentThread
                    comments={getComments(rt.id, id)}
                    onAdd={(text) => onAddComment(collection.id, rt.id, id, text)}
                    authorName={authorName}
                    disabled={syncStatus === "saving"}
                  />
                </div>
              )}
            </div>
            {showToggle && !onCardClick ? (
              <ResourceToggle type={rt.id} item={item} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} />
            ) : showToggle && onCardClick ? (
              <ResourceToggle type={rt.id} item={item} collection={collection} onResourceToggle={onResourceToggle} onWorkItemToggle={onWorkItemToggle} />
            ) : (
              <RemoveBtn type={rt.id} id={id} onRemove={removeItem} />
            )}
          </div>
        </Card>
      </div>
    );
  };

  // ── Link card (special renderer for link rules) ───────────────────────
  const renderLinkCard = (link) => {
    const result = matchLink(link.url, linkRules?.rules || []);
    const rule = result?.rule;
    const params = result?.params || {};
    const displayLabel = link.label || (rule ? formatTemplate(rule.displayTemplate, params, link.url) : link.url);
    const accentColor = rule?.color || T.dim;

    return (
      <div key={link.url} style={{ marginBottom: 8 }}>
        <Card accent={accentColor}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>{rule?.icon || "🔗"}</span>
                <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayLabel}</span>
              </div>
              {Object.keys(params).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                  {Object.entries(params).map(([k, v]) => (
                    <span key={k} style={{
                      fontSize: 9, fontFamily: "'JetBrains Mono'",
                      background: `${accentColor}18`, border: `1px solid ${accentColor}33`,
                      color: accentColor, borderRadius: 3, padding: "1px 6px",
                    }}>{k}: {v}</span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 6 }}>{link.url}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                {rule?.linkTemplate && (
                  <a href={formatTemplate(rule.linkTemplate, params, link.url)} target="_blank" rel="noreferrer"
                    style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}33`, color: accentColor, padding: "4px 10px", borderRadius: 4, fontSize: 11, fontFamily: "'Barlow'", fontWeight: 500, textDecoration: "none" }}>
                    Open ↗
                  </a>
                )}
                {(rule?.links || []).map((lk, i) => (
                  <a key={i} href={formatTemplate(lk.template, params, link.url)} target="_blank" rel="noreferrer"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: T.muted, padding: "4px 10px", borderRadius: 4, fontSize: 11, fontFamily: "'Barlow'", textDecoration: "none" }}>
                    {lk.label} ↗
                  </a>
                ))}
                {!rule && (
                  <a href={link.url} target="_blank" rel="noreferrer"
                    style={{ background: `${T.dim}12`, border: `1px solid ${T.dim}33`, color: T.dim, padding: "4px 10px", borderRadius: 4, fontSize: 11, fontFamily: "'Barlow'", textDecoration: "none" }}>
                    Open ↗
                  </a>
                )}
              </div>
              {onAddComment && (
                <CommentThread
                  comments={(collection.links || []).find(l => l.url === link.url)?.comments || []}
                  onAdd={(text) => onAddComment(collection.id, "link", link.url, text)}
                  authorName={authorName}
                  disabled={syncStatus === "saving"}
                />
              )}
            </div>
            <RemoveBtn type="link" id={link.url} onRemove={removeItem} />
          </div>
        </Card>
      </div>
    );
  };

  // ── Empty check ───────────────────────────────────────────────────────
  const empty = collectionTypes.every(rt => {
    const items = collection[rt.collectionField];
    return !Array.isArray(items) || items.length === 0;
  });

  // ── Stats string ──────────────────────────────────────────────────────
  const statsStr = (() => {
    const parts = [];
    for (const rt of collectionTypes) {
      const count = (collection[rt.collectionField] || []).length;
      if (count > 0) parts.push(`${count} ${rt.shortLabel.toLowerCase()}`);
    }
    return parts.join(" · ");
  })();

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
      {/* Collection header */}
      <div style={{ padding: "18px 24px 16px", borderBottom: `1px solid ${T.border}`, background: T.panel, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>{collection.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 22, color: T.heading }}>{collection.name}</div>
              {syncStatus === "saving" && <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>↑ saving…</span>}
              {syncStatus === "saved"  && <span style={{ fontSize: 10, color: T.green, fontFamily: "'JetBrains Mono'" }}>✓ saved</span>}
              {syncStatus === "error"  && <span style={{ fontSize: 10, color: T.red, fontFamily: "'JetBrains Mono'" }}>⚠ sync failed</span>}
            </div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
              {statsStr}
              {collection.scope && (
                <span style={{ marginLeft: 10, color: collection.scope === "shared" ? T.cyan : T.violet, opacity: 0.7 }}>
                  · {collection.scope}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Collection notes */}
        {onAddCollectionNote && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <CommentThread
              comments={collection.comments || []}
              onAdd={(text) => onAddCollectionNote(collection.id, text)}
              authorName={authorName}
              disabled={syncStatus === "saving"}
            />
          </div>
        )}

        {/* Project scope */}
        {onProjectChange && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <ProjectScopeSelector
              client={client}
              selectedProjects={collection.projects || []}
              onChange={(projects) => onProjectChange(collection.id, projects)}
              toggleLabel="edit"
            />
          </div>
        )}
      </div>

      {/* Inline search bar */}
      <div style={{ padding: "10px 24px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Input
          value={searchQuery}
          onChange={onSearch}
          placeholder="🔍 Search all resources..."
          style={{ flex: 1 }}
        />
        {searchQuery && (
          <button onClick={onClearSearch}
            style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 16, padding: "0 4px" }}>
            ×
          </button>
        )}
        {searching && <Spinner size={14} />}
        {linkRules && collection && (
          <LinkPasteInput linkRules={linkRules} collection={collection} onResourceToggle={onResourceToggle} />
        )}
      </div>

      {/* Tab bar — tracks expanded resource details */}
      <TabBar
        openTabs={openTabs || []}
        activeTabId={activeTabId}
        onSelect={onTabSelect}
        onClose={onTabClose}
      />

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>

        {/* Expanded resource details (all open tabs) */}
        {(openTabs || []).map(tab => (
          <div
            key={tab.id}
            id={`tab-${tab.id}`}
            ref={el => { tabRefs.current[tab.id] = el; }}
            style={{
              marginBottom: 16,
              border: `1px solid ${T.border}`,
              borderRadius: 6,
              overflow: "hidden",
              background: tab.id === activeTabId ? "rgba(255,255,255,0.015)" : "transparent",
            }}
          >
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 16px", borderBottom: `1px solid ${T.border}`,
              background: T.panel,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {tab.label}
              </span>
              <button
                onClick={() => onTabClose(tab.id)}
                style={{
                  background: "none", border: "none", color: T.dim, cursor: "pointer",
                  fontSize: 16, padding: "0 4px", lineHeight: 1,
                }}
                title="Close"
              >×</button>
            </div>
            <ResourceDetail
              client={client}
              resource={{ type: tab.type, data: tab.data }}
              org={org}
              collection={collection}
              profile={profile}
              onResourceToggle={onResourceToggle}
              onWorkItemToggle={onWorkItemToggle}
              onAddComment={onAddComment}
              onSaveLogComments={onSaveLogComments}
              syncStatus={syncStatus}
              workflowTemplates={workflowTemplates}
            />
          </div>
        ))}

        {/* Search results (replaces groups when searching) */}
        {searchQuery.trim() ? (
          loading ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>
              <Spinner /> Searching...
            </div>
          ) : (
            <>
              {searching && searchProgress && searchProgress.total > 0 && (
                <div style={{ padding: "6px 0", fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", marginBottom: 12 }}>
                  {searchProgress.searched}/{searchProgress.total} projects searched
                </div>
              )}
              {collectionTypes.filter(rt => rt.source?.search).map(rt => {
                const items = searchResults?.[rt.id];
                if (!Array.isArray(items) || items.length === 0) return null;
                return (
                  <div key={rt.id}>
                    <div style={{
                      fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'",
                      letterSpacing: "0.1em", textTransform: "uppercase",
                      marginBottom: 10, padding: "0 4px",
                    }}>
                      {rt.name} ({items.length})
                    </div>
                    {items.map(item => renderGenericCard(rt, item, { showToggle: true }))}
                  </div>
                );
              })}
              {!searching && !searchResults && (
                <EmptyState icon="🔍" message="Type to search all resources" />
              )}
              {!searching && searchResults && Object.values(searchResults).every(v => !Array.isArray(v) || v.length === 0) && (
                <EmptyState icon="∅" message={`No results for "${searchQuery}"`} />
              )}
            </>
          )
        ) : loading ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'" }}>
            <Spinner /> Loading...
          </div>
        ) : (
          /* Collection groups */
          <>
            {collectionTypes.filter(rt => rt.id !== "link").map(rt => {
              const items = enrichedItems[rt.id] || collection[rt.collectionField] || [];
              return (
                <Group key={rt.id} id={rt.id} title={rt.name} items={items}>
                  {item => renderGenericCard(rt, item)}
                </Group>
              );
            })}

            {/* Links (custom renderer with rule matching) */}
            <Group id="link" title="Links" items={collection.links || []}>
              {link => renderLinkCard(link)}
            </Group>

            {empty && (
              <div style={{ color: T.dim, fontSize: 12, fontFamily: "'JetBrains Mono'", textAlign: "center", padding: 40 }}>
                No items in this collection.<br />Search for resources to add them.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LinkPasteInput({ linkRules, collection, onResourceToggle }) {
  const [url, setUrl] = useState("");
  const [match, setMatch] = useState(null);
  const [showDrop, setShowDrop] = useState(false);
  const [added, setAdded] = useState(false);
  const inputRef = useRef(null);

  const rules = linkRules?.rules || [];

  const handlePaste = useCallback(() => {
    setTimeout(() => {
      const val = inputRef.current?.value || "";
      if (val.startsWith("http://") || val.startsWith("https://")) {
        setMatch(matchLink(val, rules));
        setShowDrop(true);
        setAdded(false);
      } else {
        setMatch(null);
        setShowDrop(false);
      }
    }, 0);
  }, [rules]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter") {
      const val = inputRef.current?.value || "";
      if (val.startsWith("http://") || val.startsWith("https://")) {
        setMatch(matchLink(val, rules));
        setShowDrop(true);
        setAdded(false);
      }
    }
    if (e.key === "Escape") {
      setShowDrop(false);
      setUrl("");
      setMatch(null);
    }
  }, [rules]);

  const handleAdd = useCallback(() => {
    const val = inputRef.current?.value || "";
    if (!val || !collection) return;
    const label = match ? formatTemplate(match.rule.displayTemplate, match.params, val) : "";
    onResourceToggle("link", val, collection.id, { label });
    setAdded(true);
    setTimeout(() => {
      setUrl("");
      setMatch(null);
      setShowDrop(false);
      setAdded(false);
      if (inputRef.current) inputRef.current.value = "";
    }, 1200);
  }, [match, collection, onResourceToggle]);

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        value={url}
        onChange={e => { setUrl(e.target.value); setAdded(false); }}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (url && showDrop) setShowDrop(true); }}
        onBlur={() => { setTimeout(() => setShowDrop(false), 200); }}
        placeholder="🔗 Paste link..."
        style={{
          width: 180, background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
          outline: "none", color: T.text, padding: "7px 12px", fontSize: 12,
          fontFamily: "'Barlow'", boxSizing: "border-box",
        }}
      />
      {showDrop && url && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, width: 300,
          background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)", padding: "10px 14px", zIndex: 200,
        }}>
          {match ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>{match.rule.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: match.rule.color }}>
                  {formatTemplate(match.rule.displayTemplate, match.params, url)}
                </span>
              </div>
              {Object.keys(match.params).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {Object.entries(match.params).map(([k, v]) => (
                    <span key={k} style={{
                      fontSize: 9, fontFamily: "'JetBrains Mono'",
                      background: `${match.rule.color}18`, border: `1px solid ${match.rule.color}33`,
                      color: match.rule.color, borderRadius: 3, padding: "1px 6px",
                    }}>{k}: {v}</span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 10 }}>{url}</div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 10 }}>
              <span style={{ marginRight: 6 }}>🔗</span>
              No rule matched — will add as generic link
            </div>
          )}
          <button onClick={handleAdd} disabled={added} style={{
            width: "100%",
            background: added ? `${T.green}18` : `${T.amber}18`,
            border: `1px solid ${added ? T.green + "44" : T.amber + "44"}`,
            borderRadius: 5, color: added ? T.green : T.amber, fontSize: 12,
            fontFamily: "'Barlow'", fontWeight: 500, padding: "6px 12px",
            cursor: added ? "default" : "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            {added ? "✓ Added" : `+ Add to "${collection.name}"`}
          </button>
        </div>
      )}
    </div>
  );
}
