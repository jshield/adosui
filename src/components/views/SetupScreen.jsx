import { useState, useEffect } from "react";
import { T, FONTS } from "../../lib/theme";
import { Spinner, Btn, Input, formLabelStyle } from "../ui";

/**
 * SetupScreen
 *
 * Shown once after successful authentication when no config-repo pointer
 * exists in localStorage. The user picks:
 *   1. ADO project
 *   2. Config repo (existing or new, with a name input)
 *   3. Wiki (optional)
 *
 * On confirm, calls onSetupComplete with:
 *   { project, repoId, repoName, wikiId, wikiProject }
 */
export function SetupScreen({ client, org, onSetupComplete, onBack }) {
  const [projects,  setProjects]  = useState([]);
  const [project,   setProject]   = useState("");

  const [repos,     setRepos]     = useState([]);
  const [repoMode,  setRepoMode]  = useState("existing"); // "existing" | "create"
  const [repoId,    setRepoId]    = useState("");
  const [newRepoName, setNewRepoName] = useState("superui-config");

  const [wikis,     setWikis]     = useState([]);
  const [wikiId,    setWikiId]    = useState("");
  const [wikiSkip,  setWikiSkip]  = useState(false);

  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingRepos,    setLoadingRepos]    = useState(false);
  const [loadingWikis,    setLoadingWikis]    = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState("");

  // Load projects on mount
  useEffect(() => {
    client.getProjects().then(ps => {
      setProjects(ps);
      if (ps.length > 0) setProject(ps[0].name);
    }).catch(() => {}).finally(() => setLoadingProjects(false));
  }, [client]);

  // Load repos and wikis whenever project changes
  useEffect(() => {
    if (!project) return;
    setLoadingRepos(true);
    setRepos([]);
    setRepoId("");
    client.listReposInProject(project)
      .then(rs => {
        setRepos(rs);
        // Pre-select "superui-config" if it exists, otherwise switch to create mode
        const existing = rs.find(r => r.name.toLowerCase() === "superui-config");
        if (existing) {
          setRepoMode("existing");
          setRepoId(existing.id);
        } else {
          setRepoMode("create");
          setRepoId("");
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRepos(false));

    setLoadingWikis(true);
    setWikis([]);
    setWikiId("");
    client.listWikis(project)
      .then(ws => {
        setWikis(ws);
        if (ws.length > 0) setWikiId(ws[0].id);
        else setWikiSkip(true);
      })
      .catch(() => setWikiSkip(true))
      .finally(() => setLoadingWikis(false));
  }, [project, client]);

  const canConfirm = project && (
    (repoMode === "existing" && repoId) ||
    (repoMode === "create"   && newRepoName.trim())
  );

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSaving(true);
    setError("");
    try {
      let finalRepoId   = repoId;
      let finalRepoName = repoMode === "existing"
        ? (repos.find(r => r.id === repoId)?.name || repoId)
        : newRepoName.trim();

      if (repoMode === "create") {
        const created = await client.createRepo(project, newRepoName.trim());
        finalRepoId   = created.id;
        finalRepoName = created.name;
      }

      const selectedWiki = wikis.find(w => w.id === wikiId);
      onSetupComplete({
        project,
        repoId:      finalRepoId,
        repoName:    finalRepoName,
        wikiId:      wikiSkip ? null : (wikiId || null),
        wikiProject: wikiSkip ? null : (selectedWiki?.projectId ? project : project),
      });
    } catch (e) {
      setError(`Setup failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow'" }}>
      <style>{FONTS + `@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ position: "fixed", inset: 0, backgroundImage: "radial-gradient(circle at 1px 1px, rgba(245,158,11,0.04) 1px, transparent 0)", backgroundSize: "32px 32px", pointerEvents: "none" }} />

      <div style={{ width: 520, position: "relative" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'Barlow Condensed'", fontWeight: 700, fontSize: 36, color: T.amber, letterSpacing: "0.06em" }}>ADO SUPERUI</div>
          <div style={{ fontSize: 12, color: T.dim, fontFamily: "'JetBrains Mono'", marginTop: 5 }}>set up config repository</div>
        </div>

        <div style={{ background: `${T.cyan}08`, border: `1px solid ${T.cyan}22`, borderRadius: 8, padding: "14px 18px", marginBottom: 22, fontSize: 12, color: T.muted, lineHeight: 1.7 }}>
          Collections are stored as YAML files in an ADO Git repository. Pick an existing repo or create a new one. A wiki page will be generated automatically per collection.
        </div>

        <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: 28 }}>

          {/* Project */}
          <div style={{ marginBottom: 20 }}>
            <label style={formLabelStyle}>Project</label>
            {loadingProjects ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: T.dim, fontSize: 12 }}><Spinner size={13} /> Loading projects…</div>
            ) : (
              <select
                value={project}
                onChange={e => setProject(e.target.value)}
                style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, outline: "none", color: T.text, padding: "9px 12px", fontSize: 13, fontFamily: "'Barlow'", cursor: "pointer" }}
              >
                {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            )}
          </div>

          {/* Config repo */}
          <div style={{ marginBottom: 20 }}>
            <label style={formLabelStyle}>Config Repository</label>
            {loadingRepos ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: T.dim, fontSize: 12 }}><Spinner size={13} /> Loading repositories…</div>
            ) : (
              <>
                {/* Mode toggle */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {["existing", "create"].map(mode => (
                    <button key={mode}
                      onClick={() => setRepoMode(mode)}
                      style={{
                        padding: "5px 14px", borderRadius: 4, cursor: "pointer", fontSize: 11,
                        fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: "0.06em",
                        background:  repoMode === mode ? `${T.amber}18` : "rgba(255,255,255,0.04)",
                        border:      `1px solid ${repoMode === mode ? T.amber + "44" : "rgba(255,255,255,0.08)"}`,
                        color:       repoMode === mode ? T.amber : T.dim,
                      }}>
                      {mode === "existing" ? "USE EXISTING" : "CREATE NEW"}
                    </button>
                  ))}
                </div>

                {repoMode === "existing" ? (
                  repos.length > 0 ? (
                    <select
                      value={repoId}
                      onChange={e => setRepoId(e.target.value)}
                      style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, outline: "none", color: T.text, padding: "9px 12px", fontSize: 13, fontFamily: "'Barlow'", cursor: "pointer" }}
                    >
                      <option value="">— select a repo —</option>
                      {repos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  ) : (
                    <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", padding: "8px 0" }}>No repositories found in this project.</div>
                  )
                ) : (
                  <Input
                    value={newRepoName}
                    onChange={e => setNewRepoName(e.target.value)}
                    placeholder="superui-config"
                  />
                )}
              </>
            )}
          </div>

          {/* Wiki */}
          <div style={{ marginBottom: 24 }}>
            <label style={formLabelStyle}>Wiki (optional)</label>
            {loadingWikis ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: T.dim, fontSize: 12 }}><Spinner size={13} /> Loading wikis…</div>
            ) : wikis.length === 0 ? (
              <div style={{ fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'", lineHeight: 1.7 }}>
                No wiki found in this project. Wiki sync will be disabled.<br />
                You can enable it later by provisioning a wiki in Azure DevOps.
              </div>
            ) : (
              <>
                <select
                  value={wikiId}
                  onChange={e => { setWikiId(e.target.value); setWikiSkip(!e.target.value); }}
                  disabled={wikiSkip}
                  style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 5, outline: "none", color: wikiSkip ? T.dim : T.text, padding: "9px 12px", fontSize: 13, fontFamily: "'Barlow'", cursor: wikiSkip ? "default" : "pointer", marginBottom: 8 }}
                >
                  {wikis.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: T.dim, fontFamily: "'JetBrains Mono'" }}>
                  <input type="checkbox" checked={wikiSkip} onChange={e => setWikiSkip(e.target.checked)} />
                  Skip wiki sync
                </label>
              </>
            )}
          </div>

          {error && (
            <div style={{ background: `${T.red}10`, border: `1px solid ${T.red}33`, borderRadius: 5, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: T.red, fontFamily: "'JetBrains Mono'", lineHeight: 1.6 }}>{error}</div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onBack}
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: T.muted, padding: "10px 18px", borderRadius: 5, cursor: "pointer", fontSize: 13, fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: "0.06em" }}>
              ← Back
            </button>
            <button onClick={handleConfirm} disabled={saving || !canConfirm}
              style={{ flex: 1, background: `${T.amber}18`, border: `1px solid ${T.amber}${saving || !canConfirm ? "22" : "44"}`, color: saving || !canConfirm ? `${T.amber}55` : T.amber, padding: "10px", borderRadius: 5, cursor: saving || !canConfirm ? "not-allowed" : "pointer", fontSize: 14, fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: "0.08em", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {saving ? <><Spinner size={13} /> SETTING UP…</> : "CONFIRM →"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 11, color: T.dimmer, textAlign: "center", fontFamily: "'JetBrains Mono'", lineHeight: 1.8 }}>
          Connecting to <span style={{ color: T.dim }}>dev.azure.com/{org}</span>
        </div>
      </div>
    </div>
  );
}
