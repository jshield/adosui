/**
 * linkRules.js
 *
 * Manages link classification rules stored in collections/link-rules.yaml
 * in the config repo. Rules define URL regex patterns that:
 *   1. Classify bookmarked links (e.g. ServiceNow changes, Jira tickets)
 *   2. Extract named parameters via capture groups
 *   3. Generate display labels and deep links to external systems
 */

import yaml from "js-yaml";

const LINK_RULES_PATH = "collections/link-rules.yaml";

// ── Load ──────────────────────────────────────────────────────────────────────

/**
 * Load link rules from the config repo.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {{ project: string, repoId: string, branch?: string }} config
 * @returns {Promise<{ rules: Array, objectId: string|null }>}
 */
export async function loadLinkRules(client, config) {
  try {
    const file = await client.readGitFile(
      config.project,
      config.repoId,
      LINK_RULES_PATH,
      config.branch || "main"
    );
    if (!file?.content) return { rules: [], objectId: null };

    const parsed = yaml.load(file.content);
    if (!parsed || !Array.isArray(parsed.rules)) return { rules: [], objectId: file.objectId };

    // Validate and compile regexes
    const rules = parsed.rules
      .map(r => validateRule(r))
      .filter(Boolean);

    return { rules, objectId: file.objectId };
  } catch {
    return { rules: [], objectId: null };
  }
}

/**
 * Validate and normalise a single rule definition.
 * Returns null if the rule is invalid (missing required fields or bad regex).
 */
function validateRule(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.id || !raw.match) return null;

  // Test regex compiles
  try {
    new RegExp(raw.match);
  } catch {
    console.warn(`[linkRules] Invalid regex for rule "${raw.id}": ${raw.match}`);
    return null;
  }

  return {
    id:               raw.id,
    name:             raw.name || raw.id,
    icon:             raw.icon || "🔗",
    color:            raw.color || "#F59E0B",
    match:            raw.match,
    params:           Array.isArray(raw.params) ? raw.params : [],
    displayTemplate:  raw.displayTemplate || "",
    linkTemplate:     raw.linkTemplate || "",
    links:            Array.isArray(raw.links) ? raw.links : [],
  };
}

// ── Save ──────────────────────────────────────────────────────────────────────

/**
 * Save link rules to the config repo.
 *
 * @param {import('./adoClient').ADOClient} client
 * @param {{ project: string, repoId: string, branch?: string }} config
 * @param {Array} rules - Array of rule objects
 * @param {string|null} objectId - Current file objectId for optimistic locking
 * @param {{ displayName: string, emailAddress: string }} [author]
 * @returns {Promise<string|null>} Fresh objectId
 */
export async function saveLinkRules(client, config, rules, objectId, author) {
  const content = yaml.dump(
    { rules: rules.map(sanitiseRuleForSave) },
    { lineWidth: 120, quotingType: '"' }
  );

  await client.pushGitFile(
    config.project,
    config.repoId,
    LINK_RULES_PATH,
    content,
    objectId || null,
    "superui: update link rules",
    author?.displayName,
    author?.emailAddress,
    config.branch || "main"
  );

  // Re-read to get fresh objectId
  try {
    const refreshed = await client.readGitFile(
      config.project, config.repoId, LINK_RULES_PATH, config.branch || "main"
    );
    return refreshed?.objectId || null;
  } catch {
    return null;
  }
}

function sanitiseRuleForSave(r) {
  return {
    id:              r.id,
    name:            r.name || r.id,
    icon:            r.icon || "🔗",
    color:           r.color || "#F59E0B",
    match:           r.match,
    params:          (r.params || []).map(p => ({ name: p.name, group: p.group })),
    displayTemplate: r.displayTemplate || "",
    linkTemplate:    r.linkTemplate || "",
    links:           (r.links || []).map(l => ({ label: l.label || "", template: l.template || "" })),
  };
}

// ── Match ─────────────────────────────────────────────────────────────────────

/**
 * Test a URL against all rules and return the first match with extracted params.
 *
 * @param {string} url - The URL to classify
 * @param {Array} rules - Array of validated rule objects
 * @returns {{ rule: object, params: Record<string, string> } | null}
 */
export function matchLink(url, rules) {
  if (!url || !Array.isArray(rules)) return null;

  for (const rule of rules) {
    try {
      const re = new RegExp(rule.match);
      const m = re.exec(url);
      if (!m) continue;

      // Extract named params from capture groups
      const params = {};
      for (const p of (rule.params || [])) {
        if (p.group != null && m[p.group] != null) {
          params[p.name] = m[p.group];
        }
      }

      return { rule, params };
    } catch {
      // Skip rules with invalid regex (should have been caught at load time)
      continue;
    }
  }

  return null;
}

// ── Format ────────────────────────────────────────────────────────────────────

/**
 * Replace {paramName} placeholders in a template string with values from params.
 * Special placeholder {url} is replaced with the original URL.
 *
 * @param {string} template - Template string e.g. "SN Change {instance}/{sysId}"
 * @param {Record<string, string>} params - Extracted parameter values
 * @param {string} [url] - Original URL (for {url} fallback)
 * @returns {string}
 */
export function formatTemplate(template, params, url) {
  if (!template) return url || "";
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (key === "url") return url || match;
    return params[key] != null ? params[key] : match;
  });
}
