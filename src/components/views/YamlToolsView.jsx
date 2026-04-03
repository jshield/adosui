import { useState, useEffect, useCallback } from "react";
import yaml from "js-yaml";
import { T } from "../../lib/theme";
import { Btn, Spinner, Card, SelectableRow, EmptyState, SectionLabel, ResourceToggle } from "../ui";
import { SchemaForm } from "../ui/SchemaForm";
import { BranchCommitDialog } from "./BranchCommitDialog";
import { TemplateList, TemplateEditor } from "./WorkflowEditor";
import { SchemaEditor } from "./SchemaEditor";
import { loadWorkflowTemplates, saveWorkflowTemplates } from "../../lib/workflowManager";
import {
  discoverTools,
  resolveSchema,
  readYamlArray,
  readYamlFilesByGlob,
  writeYamlArrayItem,
  writeYamlArrayUpdate,
  writeYamlArrayDelete,
  generateBranchName,
  interpolateCommitMessage,
  isGlobPattern,
  loadAvailableRepos,
  BUILT_IN_TOOL_BUILDER,
  BUILT_IN_LINK_RULES,
  BUILT_IN_WORKFLOW_BUILDER,
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
  const [availableRepos, setAvailableRepos] = useState([]); // [{ project, repoId, repoName }] for tool builder

  // Workflow builder state
  const [workflowEditTemplate, setWorkflowEditTemplate] = useState(null); // template being edited
  const [workflowIsNew, setWorkflowIsNew] = useState(false); // creating new template
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [workflowError, setWorkflowError] = useState(null);

  // Edit mode state (for non-workflow tools)
  const [selectedEditItem, setSelectedEditItem] = useState(null);
  const [selectedEditFilePath, setSelectedEditFilePath] = useState(null);
  const [selectedEditMatchKey, setSelectedEditMatchKey] = useState(null); // id or index
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

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
        // Load tools and available repos in parallel
        const [discovered, repos] = await Promise.all([
          discoverTools(client, repoConfig, collections),
          loadAvailableRepos(client),
        ]);
        if (!cancelled) {
          // Always inject the built-in tools at the top (tool-builder, workflow-builder, link-rules)
          const withBuiltIn = [
            BUILT_IN_TOOL_BUILDER,
            BUILT_IN_WORKFLOW_BUILDER,
            BUILT_IN_LINK_RULES,
            ...discovered.filter(t => t.id !== BUILT_IN_TOOL_BUILDER.id && t.id !== BUILT_IN_LINK_RULES.id && t.id !== BUILT_IN_WORKFLOW_BUILDER.id),
          ];
          setTools(withBuiltIn);
          setAvailableRepos(repos);
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
    setCommitTarget(null);
    setSelectedFilePath(null);
    setToolFiles([]);
    setError(null);

    // Workflow Builder — load templates from config repo
    if (tool._isWorkflowBuilder) {
      setActiveTool(tool);
      setPhase("item-list");
      setWorkflowEditTemplate(null);
      setWorkflowIsNew(false);
      setWorkflowError(null);
      setToolFields([]);
      setToolLoading(true);
      setError(null);
      try {
        const { templates, objectId } = await loadWorkflowTemplates(client, repoConfig);
        setToolItems(templates);
        setToolObjectId(objectId);
      } catch (e) {
        setError(e.message || "Failed to load workflow templates");
        setToolItems([]);
        setToolObjectId(null);
      } finally {
        setToolLoading(false);
      }
      return;
    }

    setPhase("item-list");
    setToolLoading(true);
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
    if (activeTool.id === BUILT_IN_TOOL_BUILDER.id) {
      // Tool Builder — transform form values into a proper tool definition
      const toolDef = transformToolBuilderValues(values);
      setPendingItem(toolDef);

      // Look up the selected target repo from available repos
      const targetRepo = availableRepos.find(
        r => r.project === values.targetProject && r.repoName === values.targetRepo
      );
      if (targetRepo) {
        setCommitTarget({
          project:  targetRepo.project,
          repoId:   targetRepo.repoId,
          branch:   targetRepo.defaultBranch,
          filePath: activeTool.target.file,
          arrayPath: activeTool.target.arrayPath,
        });
      } else {
        // Fallback to config repo
        setCommitTarget({
          project:  repoConfig.project,
          repoId:   repoConfig.repoId,
          branch:   repoConfig.branch || "main",
          filePath: activeTool.target.file,
          arrayPath: activeTool.target.arrayPath,
        });
      }
    } else if (activeTool._isBuiltIn) {
      // Other built-in tools (e.g. Link Rules) — commit to config repo
      setPendingItem(values);
      setCommitTarget({
        project:  repoConfig.project,
        repoId:   repoConfig.repoId,
        branch:   repoConfig.branch || "main",
        filePath: activeTool.target.file,
        arrayPath: activeTool.target.arrayPath,
      });
    } else {
      setPendingItem(values);
      setCommitTarget(null); // use tool's own source repo
    }

    const name = generateBranchName(activeTool);
    const msg = activeTool.id === BUILT_IN_TOOL_BUILDER.id
      ? `Add tool "${values.name || values.id}" via Tool Builder`
      : interpolateCommitMessage(activeTool.commitMessageTemplate, activeTool, values);
    setBranchName(name);
    setCommitMessage(msg);
    setPhase("commit");
  }, [activeTool, repoConfig, availableRepos]);

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

    // Write the item to the YAML file
    let freshObjectId;
    freshObjectId = await writeYamlArrayItem(
        client, project, repoId,
        filePath, arrayPath,
        pendingItem, targetObjectId, bName, cMsg,
        { displayName: profile?.displayName, emailAddress: profile?.emailAddress }
      );

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

  // ── Workflow builder handlers ─────────────────────────────────────────────────

  const handleWorkflowEdit = useCallback((template) => {
    setWorkflowEditTemplate(template);
    setWorkflowIsNew(false);
    setWorkflowError(null);
    setPhase("workflow-edit");
  }, []);

  const handleWorkflowNew = useCallback(() => {
    setWorkflowEditTemplate({
      id: `workflow-${Date.now()}`,
      name: "New Workflow",
      icon: "⚡",
      color: "#F59E0B",
      wiType: "User Story",
      description: "",
      params: [],
      tracks: [],
    });
    setWorkflowIsNew(true);
    setWorkflowError(null);
    setPhase("workflow-edit");
  }, []);

  const handleWorkflowDelete = useCallback(async (templateId) => {
    if (!confirm("Delete this template?")) return;
    setWorkflowSaving(true);
    setWorkflowError(null);
    try {
      const remaining = toolItems.filter(t => t.id !== templateId);
      await saveWorkflowTemplates(client, repoConfig, remaining, toolObjectId, profile);
      setToolItems(remaining);
      showToast("Template deleted", T.green);
    } catch (e) {
      setWorkflowError(e.message || "Delete failed");
    } finally {
      setWorkflowSaving(false);
    }
  }, [toolItems, toolObjectId, client, repoConfig, profile, showToast]);

  const handleWorkflowSave = useCallback(async (template) => {
    setWorkflowSaving(true);
    setWorkflowError(null);
    try {
      let merged;
      if (workflowIsNew) {
        merged = [...toolItems.filter(t => t.id !== template.id), template];
      } else {
        merged = toolItems.map(t => t.id === template.id ? template : t);
      }
      const freshId = await saveWorkflowTemplates(client, repoConfig, merged, toolObjectId, profile);
      setToolItems(merged);
      setToolObjectId(freshId);
      setWorkflowEditTemplate(template);
      setWorkflowIsNew(false);
      setPhase("item-list");
      showToast("Template saved", T.green);
    } catch (e) {
      setWorkflowError(e.message || "Save failed");
    } finally {
      setWorkflowSaving(false);
    }
  }, [workflowIsNew, toolItems, toolObjectId, client, repoConfig, profile, showToast]);

  const handleWorkflowBack = useCallback(() => {
    setWorkflowEditTemplate(null);
    setWorkflowIsNew(false);
    setWorkflowError(null);
    setPhase("item-list");
  }, []);

  // ── Edit mode handlers ─────────────────────────────────────────────────────────

  const handleEditItem = useCallback((item, filePath, itemIndex) => {
    setSelectedEditItem(item);
    setSelectedEditFilePath(filePath || null);
    // Prefer id (unambiguous); fall back to original index in file items (for items without id)
    // Look up the item's position in toolFiles to get a stable index
    let matchKey = item.id ?? null;
    if (matchKey === null && filePath) {
      const file = toolFiles.find(f => f.path === filePath);
      if (file) {
        const idx = file.items.indexOf(item);
        if (idx !== -1) matchKey = idx;
      }
    } else if (matchKey === null && !filePath) {
      const idx = toolItems.indexOf(item);
      if (idx !== -1) matchKey = idx;
    }
    setSelectedEditMatchKey(matchKey);
    setEditError(null);
    setPhase("edit-mode");
  }, [toolFiles, toolItems]);

  const handleEditCancel = useCallback(() => {
    setSelectedEditItem(null);
    setSelectedEditFilePath(null);
    setSelectedEditMatchKey(null);
    setEditError(null);
    setPhase("item-list");
  }, []);

    const handleEditDelete = useCallback(async (item, filePath, itemIndex) => {
    const matchKey = item.id ?? itemIndex ?? null;
    const idStr = item.id ? `"${item.id}"` : `index ${itemIndex}`;
    if (!confirm(`Delete ${idStr}?`)) return;

    let project, repoId, filePath2, arrayPath, baseBranch, objectId;
    if (activeTool._isMultiFile && filePath) {
      const sourceRepo = activeTool._sourceRepo;
      project = sourceRepo.project;
      repoId = sourceRepo.repoId;
      filePath2 = filePath;
      arrayPath = activeTool.target.arrayPath;
      baseBranch = sourceRepo.branch || "main";
      const fileEntry = toolFiles.find(f => f.path === filePath);
      objectId = fileEntry?.objectId || null;
    } else {
      const sourceRepo = activeTool._sourceRepo;
      project = sourceRepo.project;
      repoId = sourceRepo.repoId;
      filePath2 = activeTool.target.file;
      arrayPath = activeTool.target.arrayPath;
      baseBranch = sourceRepo.branch || "main";
      objectId = toolObjectId;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const branchName = generateBranchName(activeTool) + "-delete";
      await writeYamlArrayDelete(
        client, project, repoId, filePath2, arrayPath,
        matchKey, objectId, baseBranch,
        `Delete item via YAML Tools`,
        { displayName: profile?.displayName, emailAddress: profile?.emailAddress }
      );

      // Update local state
      if (activeTool._isMultiFile && filePath) {
        setToolFiles(prev => {
          const updated = prev.map(f => {
            if (f.path !== filePath) return f;
            // Find current index of the item being deleted
            const itemToDelete = f.items.find(itm =>
              typeof matchKey === "number" ? f.items.indexOf(itm) === matchKey : itm.id === matchKey
            );
            if (!itemToDelete) return f;
            const currentIdx = f.items.indexOf(itemToDelete);
            const items = f.items.filter((_, i) => i !== currentIdx);
            return { ...f, items };
          });
          const newToolItems = updated.flatMap(f => f.items.map(itm => ({ ...itm, _filePath: f.path })));
          setToolItems(newToolItems);
          return updated;
        });
      } else {
        setToolItems(prev => prev.filter((itm, i) => !(itm && (typeof matchKey === "number" ? i === matchKey : itm.id === matchKey))));
      }

      showToast("Item deleted", T.green);
    } catch (e) {
      setEditError(e.message || "Delete failed");
    } finally {
      setEditSaving(false);
    }
  }, [activeTool, toolFiles, toolObjectId, client, profile, showToast]);

  const handleEditSave = useCallback(async (values) => {
    let project, repoId, filePath2, arrayPath, baseBranch, objectId;
    if (activeTool._isMultiFile && selectedEditFilePath) {
      const sourceRepo = activeTool._sourceRepo;
      project = sourceRepo.project;
      repoId = sourceRepo.repoId;
      filePath2 = selectedEditFilePath;
      arrayPath = activeTool.target.arrayPath;
      baseBranch = sourceRepo.branch || "main";
      const fileEntry = toolFiles.find(f => f.path === selectedEditFilePath);
      objectId = fileEntry?.objectId || null;
    } else {
      const sourceRepo = activeTool._sourceRepo;
      project = sourceRepo.project;
      repoId = sourceRepo.repoId;
      filePath2 = activeTool.target.file;
      arrayPath = activeTool.target.arrayPath;
      baseBranch = sourceRepo.branch || "main";
      objectId = toolObjectId;
    }

    setEditSaving(true);
    setEditError(null);
    try {
      const freshId = await writeYamlArrayUpdate(
        client, project, repoId, filePath2, arrayPath,
        values, selectedEditMatchKey, objectId, baseBranch,
        `Update item via YAML Tools`,
        { displayName: profile?.displayName, emailAddress: profile?.emailAddress }
      );

      // Update local state
      if (activeTool._isMultiFile && selectedEditFilePath) {
        setToolFiles(prev => {
          const updated = prev.map(f => {
            if (f.path !== selectedEditFilePath) return f;
            const items = f.items.map((itm, i) => {
              if (typeof selectedEditMatchKey === "number" ? i === selectedEditMatchKey : itm?.id === selectedEditMatchKey) {
                return values;
              }
              return itm;
            });
            return { ...f, objectId: freshId || f.objectId, items };
          });
          const newToolItems = updated.flatMap(f => f.items.map(itm => ({ ...itm, _filePath: f.path })));
          setToolItems(newToolItems);
          return updated;
        });
      } else {
        setToolItems(prev => prev.map((itm, i) => {
          if (typeof selectedEditMatchKey === "number" ? i === selectedEditMatchKey : itm?.id === selectedEditMatchKey) {
            return values;
          }
          return itm;
        }));
      }

      setToolObjectId(freshId || toolObjectId);
      showToast("Item saved", T.green);
      handleEditCancel();
    } catch (e) {
      setEditError(e.message || "Save failed");
    } finally {
      setEditSaving(false);
    }
  }, [activeTool, toolFiles, toolObjectId, selectedEditFilePath, selectedEditMatchKey, client, profile, showToast, handleEditCancel]);

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
            <button onClick={phase === "commit" ? handleBackToItems : phase === "workflow-edit" ? handleWorkflowBack : phase === "edit-mode" ? handleEditCancel : handleBackToTools}
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

        {phase === "item-list" && activeTool && activeTool._isWorkflowBuilder && (
          <TemplateList
            templates={toolItems}
            onEdit={handleWorkflowEdit}
            onDelete={handleWorkflowDelete}
            onNew={handleWorkflowNew}
            saving={workflowSaving}
          />
        )}

        {phase === "workflow-edit" && workflowEditTemplate && (
          <TemplateEditor
            template={workflowEditTemplate}
            isNew={workflowIsNew}
            saving={workflowSaving}
            error={workflowError}
            onSave={handleWorkflowSave}
            onCancel={handleWorkflowBack}
          />
        )}

        {phase === "item-list" && activeTool && !activeTool._isWorkflowBuilder && (
          <ItemList
            tool={activeTool}
            items={toolItems}
            fields={toolFields}
            files={toolFiles}
            loading={toolLoading}
            onAdd={handleStartAdd}
            onEdit={handleEditItem}
            onDelete={handleEditDelete}
            saving={editSaving}
          />
        )}

        {phase === "edit-mode" && selectedEditItem && (
          <SchemaEditor
            item={selectedEditItem}
            fields={toolFields}
            context={{ availableRepos }}
            onSave={handleEditSave}
            onCancel={handleEditCancel}
            saving={editSaving}
            error={editError}
            isNew={false}
          />
        )}

        {phase === "add-form" && (
          <SchemaEditor
            item={{}}
            fields={toolFields}
            context={{ availableRepos }}
            onSave={(values) => {
              setPendingItem(values);
              const name = generateBranchName(activeTool);
              const msg = activeTool.id === BUILT_IN_TOOL_BUILDER.id
                ? `Add tool "${values.name || values.id}" via Tool Builder`
                : interpolateCommitMessage(activeTool.commitMessageTemplate, activeTool, values);
              setBranchName(name);
              setCommitMessage(msg);
              setPhase("commit");
            }}
            onCancel={handleBackToItems}
            saving={false}
            error={null}
            isNew={true}
          />
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

function ItemList({ tool, items, fields, files, loading, onAdd, onEdit, onDelete, saving }) {
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
                  <div key={idx} style={{ padding: "8px 20px 8px 32px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <ItemSummary item={item} fields={fields} />
                    </div>
                    <ItemActions item={item} idx={idx} filePath={file.path} onEdit={onEdit} onDelete={onDelete} saving={saving} />
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
          <div key={idx} style={{ padding: "10px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ItemSummary item={item} fields={fields} />
            </div>
            <ItemActions item={item} idx={idx} filePath={null} onEdit={onEdit} onDelete={onDelete} saving={saving} />
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

function ItemActions({ item, idx, filePath, onEdit, onDelete, saving }) {
  return (
    <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 12 }}>
      <button
        onClick={() => onEdit(item, filePath, idx)}
        disabled={saving}
        style={{
          background: `${T.amber}12`,
          border: `1px solid ${T.amber}33`,
          borderRadius: 4,
          color: T.amber,
          cursor: saving ? "not-allowed" : "pointer",
          fontSize: 10,
          fontFamily: "'JetBrains Mono'",
          padding: "3px 10px",
          opacity: saving ? 0.5 : 1,
        }}
      >
        Edit
      </button>
      <button
        onClick={() => onDelete(item, filePath, idx)}
        disabled={saving}
        style={{
          background: `${T.red}10`,
          border: `1px solid ${T.red}33`,
          borderRadius: 4,
          color: T.red,
          cursor: saving ? "not-allowed" : "pointer",
          fontSize: 10,
          fontFamily: "'JetBrains Mono'",
          padding: "3px 10px",
          opacity: saving ? 0.5 : 1,
        }}
      >
        Delete
      </button>
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
 *   - targetProject/targetRepo are stripped (meta-fields for commit targeting)
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
