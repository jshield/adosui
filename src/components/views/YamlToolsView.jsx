import { useState, useEffect, useCallback } from "react";
import yaml from "js-yaml";
import { T } from "../../lib/theme";
import { Btn, Spinner, Card, SelectableRow, EmptyState, SectionLabel, ResourceToggle } from "../ui";
import { SchemaForm } from "../ui/SchemaForm";
import { BranchCommitDialog } from "./BranchCommitDialog";
import {
  discoverTools,
  resolveSchema,
  readYamlArray,
  readYamlFilesByGlob,
  writeYamlArrayItem,
  generateBranchName,
  interpolateCommitMessage,
  isGlobPattern,
  BUILT_IN_TOOL_BUILDER,
} from "../../lib/yamlToolsManager";

/**
 * YamlToolsView — Main container for the YAML Tools feature.
 *
 * Phases:
 *   "loading"       → discovering tools from repos
 *   "tool-select"   → showing available tools
 *   "item-list"     → showing existing items + "Add New" button
 *   "add-form"      → schema form for new item
 *   "commit"        → branch/commit dialog
 *
 * @param {object} props
 * @param {import('../../lib/adoClient').ADOClient} props.client
 * @param {object} props.repoConfig - { project, repoId, repoName, branch? }
 * @param {Array} props.collections - All loaded collections
 * @param {{ id, displayName, emailAddress }} props.profile
 * @param {(msg: string, color?: string) => void} props.showToast
 * @param {Array} props.pinnedTools - Pinned tools from the personal pinned-tools collection
 * @param {(tool: object) => void} props.onTogglePinTool - Pin/unpin a tool to the personal collection
 * @param {(type: string, id: string, colId: string) => void} props.onResourceToggle - Add/remove tool from a collection
 * @param {string} props.activeColId - Currently active collection ID
 */
export function YamlToolsView({ client, repoConfig, collections, profile, showToast, pinnedTools = [], onTogglePinTool, onResourceToggle, activeColId }) {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active tool state
  const [activeTool, setActiveTool] = useState(null);
  const [toolFields, setToolFields] = useState([]);
  const [toolItems, setToolItems] = useState([]);
  const [toolObjectId, setToolObjectId] = useState(null);
  const [toolLoading, setToolLoading] = useState(false);
  const [toolFiles, setToolFiles] = useState([]); // [{ path, items, objectId, raw }] for multi-file mode
  const [selectedFilePath, setSelectedFilePath] = useState(null); // file path selected for adding items

  // View phase
  const [phase, setPhase] = useState("loading");

  // Commit state
  const [pendingItem, setPendingItem] = useState(null);
  const [branchName, setBranchName] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [commitTarget, setCommitTarget] = useState(null); // { project, repoId, branch } override for tool builder

  // ── Load tools on mount ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const discovered = await discoverTools(client, repoConfig, collections);
        if (!cancelled) {
          // Always inject the built-in tool builder at the top
          const withBuiltIn = [BUILT_IN_TOOL_BUILDER, ...discovered.filter(t => t.id !== BUILT_IN_TOOL_BUILDER.id)];
          setTools(withBuiltIn);
          setPhase("tool-select");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || "Failed to load tools");
          setPhase("tool-select");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [client, repoConfig, collections]);

  // ── Select a tool ────────────────────────────────────────────────────────
  const handleSelectTool = useCallback(async (tool) => {
    setActiveTool(tool);
    setPhase("item-list");
    setToolLoading(true);
    setCommitTarget(null);
    setSelectedFilePath(null);
    setToolFiles([]);
    setError(null);
    try {
      const sourceRepo = tool._sourceRepo;

      // Resolve schema (built-in tools have inline schemas, no fetch needed)
      const fields = tool._isBuiltIn
        ? (tool.schema?.fields || [])
        : await resolveSchema(tool, client, sourceRepo.project, sourceRepo.repoId, sourceRepo.branch);
      setToolFields(fields);

      if (tool._isBuiltIn) {
        // Built-in tool builder — always reads from config repo
        const { items, objectId } = await readYamlArray(
          client, repoConfig.project, repoConfig.repoId,
          tool.target.file, tool.target.arrayPath, repoConfig.branch || "main"
        );
        setToolItems(items);
        setToolObjectId(objectId);
      } else if (tool._isMultiFile) {
        // Multi-file glob mode
        const { files, totalItems } = await readYamlFilesByGlob(
          client, sourceRepo.project, sourceRepo.repoId,
          tool.target.file, tool.target.arrayPath, sourceRepo.branch
        );
        setToolFiles(files);
        setToolItems(files.flatMap(f => f.items.map(item => ({ ...item, _filePath: f.path }))));
        setToolObjectId(null); // per-file objectIds in toolFiles
      } else {
        // Single-file mode
        const { items, objectId } = await readYamlArray(
          client, sourceRepo.project, sourceRepo.repoId,
          tool.target.file, tool.target.arrayPath, sourceRepo.branch
        );
        setToolItems(items);
        setToolObjectId(objectId);
      }
    } catch (e) {
      setError(e.message || "Failed to load tool data");
    } finally {
      setToolLoading(false);
    }
  }, [client, repoConfig]);

  // ── Start add form ───────────────────────────────────────────────────────
  const handleStartAdd = useCallback((filePath) => {
    setPhase("add-form");
    setPendingItem(null);
    if (filePath) setSelectedFilePath(filePath);
  }, []);

  // ── Form submit → go to commit dialog ────────────────────────────────────
  const handleFormSubmit = useCallback((values) => {
    if (activeTool._isBuiltIn) {
      // Transform tool builder form values into a proper tool definition
      const toolDef = transformToolBuilderValues(values);
      setPendingItem(toolDef);

      // Determine commit target based on location
      if (values.location === "central") {
        // Write to config repo's central tools directory
        const toolsPath = repoConfig.toolsPath || "/config/tools";
        const centralFile = `${toolsPath}/${toolDef.id}.yml`;
        setCommitTarget({
          project: repoConfig.project,
          repoId:   repoConfig.repoId,
          branch:   repoConfig.branch || "main",
          filePath: centralFile,
          arrayPath: "",  // root is the tools array in the file
        });
      } else {
        // Write to the config repo's .superui/tools.yml (per-repo equivalent)
        setCommitTarget({
          project: repoConfig.project,
          repoId:   repoConfig.repoId,
          branch:   repoConfig.branch || "main",
          filePath: activeTool.target.file,
          arrayPath: activeTool.target.arrayPath,
        });
      }
    } else {
      setPendingItem(values);
      setCommitTarget(null); // use tool's own source repo
    }

    const name = generateBranchName(activeTool);
    const msg = activeTool._isBuiltIn
      ? `Add tool "${values.name || values.id}" via Tool Builder`
      : interpolateCommitMessage(activeTool.commitMessageTemplate, activeTool, values);
    setBranchName(name);
    setCommitMessage(msg);
    setPhase("commit");
  }, [activeTool, repoConfig]);

  // ── Commit handler ───────────────────────────────────────────────────────
  const handleCommit = useCallback(async (bName, cMsg) => {
    let project, repoId, filePath, arrayPath, baseBranch, targetObjectId;

    if (commitTarget) {
      // Tool builder mode — use explicit target
      project = commitTarget.project;
      repoId = commitTarget.repoId;
      filePath = commitTarget.filePath;
      arrayPath = commitTarget.arrayPath;
      baseBranch = commitTarget.branch;
      targetObjectId = toolObjectId;
    } else if (activeTool._isMultiFile && selectedFilePath) {
      // Multi-file mode — commit to the selected file
      const sourceRepo = activeTool._sourceRepo;
      project = sourceRepo.project;
      repoId = sourceRepo.repoId;
      filePath = selectedFilePath;
      arrayPath = activeTool.target.arrayPath;
      baseBranch = sourceRepo.branch || "main";
      const fileEntry = toolFiles.find(f => f.path === selectedFilePath);
      targetObjectId = fileEntry?.objectId || null;
    } else {
      // Single-file mode — use tool's source repo
      const sourceRepo = activeTool._sourceRepo;
      project = sourceRepo.project;
      repoId = sourceRepo.repoId;
      filePath = activeTool.target.file;
      arrayPath = activeTool.target.arrayPath;
      baseBranch = sourceRepo.branch || "main";
      targetObjectId = toolObjectId;
    }

    // Create branch
    await client.createBranch(project, repoId, bName, baseBranch);

    // For tool builder central mode, write a single-file tool definition
    let freshObjectId;
    if (commitTarget && commitTarget.arrayPath === "") {
      const content = yaml.dump({ tools: [pendingItem] }, { lineWidth: 120, quotingType: '"' });
      await client.pushGitFile(
        project, repoId, filePath, content, null, cMsg,
        profile?.displayName, profile?.emailAddress, bName
      );
      try {
        const refreshed = await client.readGitFile(project, repoId, filePath, bName);
        freshObjectId = refreshed?.objectId || null;
      } catch { freshObjectId = null; }
    } else {
      freshObjectId = await writeYamlArrayItem(
        client, project, repoId,
        filePath, arrayPath,
        pendingItem, targetObjectId, bName, cMsg,
        { displayName: profile?.displayName, emailAddress: profile?.emailAddress }
      );
    }

    // Update local state
    const itemWithFile = activeTool._isMultiFile && selectedFilePath
      ? { ...pendingItem, _filePath: selectedFilePath }
      : pendingItem;
    setToolItems(prev => [...prev, itemWithFile]);

    if (activeTool._isMultiFile && selectedFilePath) {
      setToolFiles(prev => prev.map(f =>
        f.path === selectedFilePath
          ? { ...f, objectId: freshObjectId, items: [...f.items, pendingItem] }
          : f
      ));
    } else {
      setToolObjectId(freshObjectId);
    }

    showToast(`Item committed to ${bName}`, T.green);
  }, [client, activeTool, pendingItem, toolObjectId, toolFiles, selectedFilePath, commitTarget, profile, showToast]);

  // ── Create PR handler ────────────────────────────────────────────────────
  const handleCreatePR = useCallback(async (bName) => {
    let project, repoId, baseBranch;

    if (commitTarget) {
      project = commitTarget.project;
      repoId = commitTarget.repoId;
      baseBranch = commitTarget.branch;
    } else {
      const sourceRepo = activeTool._sourceRepo;
      project = sourceRepo.project;
      repoId = sourceRepo.repoId;
      baseBranch = sourceRepo.branch || "main";
    }

    const title = commitMessage;
    const description = `Created by YAML Tools — ${activeTool.name}`;
    return client.createPullRequest(project, repoId, title, description, bName, baseBranch);
  }, [client, activeTool, commitMessage, commitTarget]);

  // ── Back to tool list ────────────────────────────────────────────────────
  const handleBackToTools = useCallback(() => {
    setActiveTool(null);
    setToolFields([]);
    setToolItems([]);
    setToolObjectId(null);
    setToolFiles([]);
    setSelectedFilePath(null);
    setCommitTarget(null);
    setPhase("tool-select");
    setError(null);
  }, []);

  // ── Back to item list ────────────────────────────────────────────────────
  const handleBackToItems = useCallback(() => {
    setPhase("item-list");
    setPendingItem(null);
    setError(null);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading || phase === "loading") {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Spinner size={20} />
          <span style={{ fontSize: 13, color: T.muted }}>Discovering tools…</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
        {phase === "tool-select" ? (
          <>
            <span style={{ fontSize: 18 }}>🛠️</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>YAML Tools</span>
            <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", marginLeft: "auto" }}>
              {tools.length} tool{tools.length !== 1 ? "s" : ""} available
            </span>
          </>
        ) : (
          <>
            <button onClick={phase === "commit" ? handleBackToItems : handleBackToTools}
              style={{ background: "none", border: "none", color: T.dim, cursor: "pointer", fontSize: 13, padding: 0 }}
            >
              ← Back
            </button>
            <span style={{ fontSize: 16 }}>{activeTool?.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{activeTool?.name}</span>
            {activeTool?._sourceRepo && (
              <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", marginLeft: "auto" }}>
                {activeTool._sourceRepo.project}/{activeTool._sourceRepo.repoId?.slice(0, 8)}
              </span>
            )}
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 20px", background: `${T.red}08`, borderBottom: `1px solid ${T.red}22` }}>
          <span style={{ fontSize: 12, color: T.red, fontFamily: "'JetBrains Mono'" }}>{error}</span>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {phase === "tool-select" && (
          <ToolList
            tools={tools}
            pinnedTools={pinnedTools}
            onSelect={handleSelectTool}
            onTogglePin={onTogglePinTool}
            onResourceToggle={onResourceToggle}
            activeColId={activeColId}
            collections={collections}
          />
        )}

        {phase === "item-list" && activeTool && (
          <ItemList
            tool={activeTool}
            items={toolItems}
            fields={toolFields}
            files={toolFiles}
            loading={toolLoading}
            onAdd={handleStartAdd}
          />
        )}

        {phase === "add-form" && (
          <div style={{ padding: 20, maxWidth: 500 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.text, marginBottom: 16 }}>
              Add new item
            </div>
            <SchemaForm
              fields={toolFields}
              onSubmit={handleFormSubmit}
              onCancel={handleBackToItems}
              submitLabel="Next →"
            />
          </div>
        )}

        {phase === "commit" && (
          <BranchCommitDialog
            branchName={branchName}
            commitMessage={commitMessage}
            targetBranch={activeTool?._sourceRepo?.branch || "main"}
            onCommit={handleCommit}
            onCancel={handleBackToItems}
            onCreatePR={handleCreatePR}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ToolList({ tools, pinnedTools, onSelect, onTogglePin, onResourceToggle, activeColId, collections }) {
  const pinnedIds = new Set((pinnedTools || []).map(t => String(t.id)));
  const activeCol = collections?.find(c => c.id === activeColId);
  const unpinnedTools = tools.filter(t => !pinnedIds.has(String(t.id)));

  if (tools.length === 0) {
    return (
      <EmptyState icon="🛠️" message="No YAML tools configured">
        <div style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'", textAlign: "center", maxWidth: 320, lineHeight: 1.6 }}>
          Add a <code style={{ color: T.amber, background: `${T.amber}12`, padding: "1px 5px", borderRadius: 3 }}>.superui/tools.yml</code> file
          to a repository in your collections, or configure tools in the central tools directory.
        </div>
      </EmptyState>
    );
  }

  return (
    <div>
      {/* Pinned tools section */}
      {pinnedTools.length > 0 && (
        <>
          <div style={{ padding: "8px 14px", fontSize: 10, color: T.amber, background: "rgba(245,158,11,0.05)", borderBottom: `1px solid ${T.border}`, fontWeight: 600, letterSpacing: "0.05em" }}>
            Pinned ({pinnedTools.length})
          </div>
          {pinnedTools.map(tool => (
            <ToolRow
              key={tool.id}
              tool={tool}
              isPinned={true}
              activeCol={activeCol}
              onSelect={onSelect}
              onTogglePin={onTogglePin}
              onResourceToggle={onResourceToggle}
            />
          ))}
        </>
      )}

      {/* All tools section */}
      {unpinnedTools.length > 0 && (
        <>
          {pinnedTools.length > 0 && (
            <div style={{ padding: "8px 14px", fontSize: 10, color: T.dim, borderBottom: `1px solid ${T.border}`, letterSpacing: "0.05em" }}>
              All Tools ({unpinnedTools.length})
            </div>
          )}
          {unpinnedTools.map(tool => (
            <ToolRow
              key={tool.id}
              tool={tool}
              isPinned={false}
              activeCol={activeCol}
              onSelect={onSelect}
              onTogglePin={onTogglePin}
              onResourceToggle={onResourceToggle}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ToolRow({ tool, isPinned, activeCol, onSelect, onTogglePin, onResourceToggle }) {
  const isInActiveCol = activeCol && Array.isArray(activeCol.yamlTools) && activeCol.yamlTools.some(yt => String(yt.id) === String(tool.id));

  return (
    <SelectableRow onClick={() => onSelect(tool)} selColor={T.amber}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{tool.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{tool.name}</div>
        {tool.description && (
          <div style={{ fontSize: 11, color: T.dimmer, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {tool.description}
          </div>
        )}
      </div>
      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {tool._isMultiFile && (
          <span style={{ fontSize: 8, color: T.amber, background: `${T.amber}12`, padding: "0px 4px", borderRadius: 2 }}>
            multi-file
          </span>
        )}
        <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>
          {tool.target.file}
        </span>
        {/* Pin to personal collection */}
        {onTogglePin && !tool._isBuiltIn && (
          <button
            onClick={e => { e.stopPropagation(); onTogglePin(tool); }}
            title={isPinned ? "Unpin from Pinned Tools" : "Pin to Pinned Tools"}
            style={{
              background: isPinned ? `${T.amber}15` : "none",
              border: `1px solid ${isPinned ? T.amber + "44" : "transparent"}`,
              borderRadius: 4, cursor: "pointer", fontSize: 12, padding: "2px 6px",
              opacity: isPinned ? 1 : 0.4,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = isPinned ? 1 : 0.4}
          >
            📌
          </button>
        )}
        {/* Add/remove from active collection */}
        {onResourceToggle && activeCol && !tool._isBuiltIn && (
          <ResourceToggle
            type="yamltool"
            item={tool}
            collection={activeCol}
            onResourceToggle={onResourceToggle}
          />
        )}
      </div>
    </SelectableRow>
  );
}

function ItemList({ tool, items, fields, files, loading, onAdd }) {
  if (loading) {
    return (
      <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <Spinner size={16} />
        <span style={{ fontSize: 12, color: T.muted }}>Loading items…</span>
      </div>
    );
  }

  const isMultiFile = tool._isMultiFile && files.length > 0;

  return (
    <div>
      {/* File info header */}
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: T.muted, fontWeight: 500 }}>
            {tool.target.file}
            {isMultiFile && (
              <span style={{ fontSize: 9, color: T.amber, background: `${T.amber}12`, padding: "1px 6px", borderRadius: 3, marginLeft: 8 }}>
                {files.length} file{files.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", marginTop: 2 }}>
            {items.length} item{items.length !== 1 ? "s" : ""}
            {tool.target.arrayPath && ` in .${tool.target.arrayPath}`}
          </div>
        </div>
        {!isMultiFile && <Btn variant="primary" onClick={() => onAdd()}>+ Add New</Btn>}
      </div>

      {/* Grouped by file (multi-file mode) */}
      {isMultiFile ? (
        files.length === 0 ? (
          <EmptyFileList />
        ) : (
          files.map(file => (
            <div key={file.path}>
              {/* File group header */}
              <div style={{
                padding: "8px 20px",
                background: "rgba(255,255,255,0.02)",
                borderBottom: `1px solid ${T.border}`,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: T.dim, fontFamily: "'JetBrains Mono'" }}>📄</span>
                  <span style={{ fontSize: 11, color: T.muted, fontFamily: "'JetBrains Mono'" }}>{file.path}</span>
                  <span style={{ fontSize: 9, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>
                    ({file.items.length})
                  </span>
                </div>
                <button
                  onClick={() => onAdd(file.path)}
                  style={{
                    background: `${T.amber}12`, border: `1px solid ${T.amber}33`,
                    borderRadius: 4, color: T.amber, cursor: "pointer",
                    fontSize: 10, fontFamily: "'JetBrains Mono'", padding: "3px 10px",
                  }}
                >
                  + Add
                </button>
              </div>
              {/* Items in this file */}
              {file.items.length === 0 ? (
                <div style={{ padding: "10px 20px", fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>
                  No items in this file
                </div>
              ) : (
                file.items.map((item, idx) => (
                  <div key={idx} style={{ padding: "8px 20px 8px 32px", borderBottom: `1px solid ${T.border}` }}>
                    <ItemSummary item={item} fields={fields} />
                  </div>
                ))
              )}
            </div>
          ))
        )
      ) : items.length === 0 ? (
        <EmptyFileList />
      ) : (
        items.map((item, idx) => (
          <div key={idx} style={{ padding: "10px 20px", borderBottom: `1px solid ${T.border}` }}>
            <ItemSummary item={item} fields={fields} />
          </div>
        ))
      )}
    </div>
  );
}

function EmptyFileList() {
  return (
    <div style={{ padding: 30, textAlign: "center" }}>
      <div style={{ fontSize: 13, color: T.dim, marginBottom: 8 }}>No items yet</div>
      <div style={{ fontSize: 11, color: T.dimmer, fontFamily: "'JetBrains Mono'" }}>
        Click "+ Add New" to create the first item
      </div>
    </div>
  );
}

function ItemSummary({ item, fields }) {
  if (typeof item !== "object" || item === null) {
    return <span style={{ fontSize: 12, color: T.muted }}>{String(item)}</span>;
  }

  // Show key fields as a compact summary
  const summaryFields = fields.slice(0, 3);
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      {summaryFields.map(f => (
        <div key={f.key} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9, color: T.dimmer, fontFamily: "'JetBrains Mono'", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {f.label}
          </div>
          <div style={{ fontSize: 12, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
            {f.type === "boolean" ? (item[f.key] ? "✓" : "✗") : String(item[f.key] ?? "—")}
          </div>
        </div>
      ))}
      {/* Show remaining fields count */}
      {fields.length > 3 && (
        <span style={{ fontSize: 10, color: T.dimmer, fontFamily: "'JetBrains Mono'", flexShrink: 0 }}>
          +{fields.length - 3} more
        </span>
      )}
    </div>
  );
}

// ── Tool builder value transformer ─────────────────────────────────────────────

/**
 * Transform tool builder form values into a proper tool definition suitable
 * for writing to .superui/tools.yml.
 *
 * Handles:
 *   - schemaMode "ref" → schema.ref
 *   - schemaMode "inline" (default) → schema.fields
 *   - location is stripped (meta-field for commit targeting)
 *
 * @param {object} values - Raw form values from SchemaForm
 * @returns {object} Proper tool definition for tools.yml
 */
function transformToolBuilderValues(values) {
  // Build schema — either inline fields or external ref
  let schema;
  if (values.schemaMode === "ref" && values.schemaRef?.trim()) {
    schema = { ref: values.schemaRef.trim() };
  } else {
    schema = {
      fields: (values.schemaFields || []).map(f => {
        const field = {
          key:   f.key,
          label: f.label || f.key,
          type:  f.type || "string",
        };
        if (f.required) field.required = true;
        if (f.description) field.description = f.description;
        if (f.default !== undefined && f.default !== "") field.default = f.default;
        if (f.type === "select" && f.options) {
          field.options = Array.isArray(f.options) ? f.options : [];
        }
        return field;
      }),
    };
  }

  const tool = {
    id:                    values.id,
    name:                  values.name || values.id,
    description:           values.description || "",
    icon:                  values.icon || "📄",
    target: {
      file:      values.target?.file || "",
      arrayPath: values.target?.arrayPath || "",
    },
    schema,
    branch: {
      prefix: values.branch?.prefix || "yaml-tool/",
    },
    commitMessageTemplate: values.commitMessageTemplate || `Add item to {tool:name}`,
  };
  return tool;
}
