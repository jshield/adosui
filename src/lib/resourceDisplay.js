/**
 * resourceDisplay.js
 *
 * Config-driven rendering helpers for resource types.
 * Provides generic list row rendering and search result row rendering
 * driven by the resource type display config.
 */

import { T } from "./theme";
import { resolveField, getDisplayProps, getType } from "./resourceTypes";

// ── Generic list row for ResourcePanel ───────────────────────────────────────

/**
 * Build props for a ResourcePanel list row from a resource type config.
 *
 * @param {string} typeId - Resource type ID
 * @param {object} item - The data item
 * @returns {{ color: string, label: string, title: string, subtitle: string|null, status: object|null, idText: string|null, icon: string }}
 */
export function buildListRowProps(typeId, item) {
  const dp = getDisplayProps(typeId, item);
  if (!dp) {
    return {
      color: T.dim,
      label: typeId?.slice(0, 4).toUpperCase() || "?",
      title: String(item?.id || item?.name || "Unknown"),
      subtitle: null,
      status: null,
      idText: null,
      icon: "📄",
    };
  }
  return dp;
}

// ── Generic search result row for SearchResultsList ──────────────────────────

/**
 * Build props for a SearchResultsList row from a resource type config.
 */
export function buildSearchRowProps(typeId, item) {
  return buildListRowProps(typeId, item);
}

// ── Generic collection resource card for CollectionResources ─────────────────

/**
 * Build props for a CollectionResources card from a resource type config.
 */
export function buildCardProps(typeId, item) {
  return buildListRowProps(typeId, item);
}

// ── Section label generation ─────────────────────────────────────────────────

/**
 * Get the section label (plural name) for a resource type.
 */
export function getSectionLabel(typeId) {
  const rt = getType(typeId);
  if (!rt) return typeId?.toUpperCase() || "";
  return rt.name?.toUpperCase() || rt.id.toUpperCase();
}
