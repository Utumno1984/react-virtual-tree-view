import type { TreeId } from "./tree-utils";
import type { TreeViewPersistableState } from "./types";

export interface NormalizedPersistableState {
  state: TreeViewPersistableState;
  /** Human-readable descriptions of what was invalid and replaced with an empty value. */
  problems: string[];
}

const isTreeId = (value: unknown): value is TreeId =>
  typeof value === "string" || (typeof value === "number" && Number.isFinite(value));

/**
 * Turns whatever the consumer passed as `initialState` (typically `JSON.parse` of something
 * stored long ago) into a valid state. Never throws: invalid parts become empty values and are
 * listed in `problems`.
 */
export function normalizePersistableState(value: unknown): NormalizedPersistableState {
  const problems: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      state: { expandedIds: [], selectedId: null, searchQuery: "" },
      problems: ["it is not an object, treated as an empty state"],
    };
  }
  const raw = value as Record<string, unknown>;

  let expandedIds: TreeId[] = [];
  if (Array.isArray(raw.expandedIds)) {
    const items: unknown[] = raw.expandedIds;
    expandedIds = items.filter(isTreeId);
    if (expandedIds.length !== items.length) {
      problems.push("expandedIds contains items that are not a string or a finite number");
    }
  } else {
    problems.push("expandedIds is missing or not an array");
  }

  let selectedId: TreeId | null = null;
  if (isTreeId(raw.selectedId)) selectedId = raw.selectedId;
  else if (raw.selectedId !== null)
    problems.push("selectedId is missing or not a string/number/null");

  let searchQuery = "";
  if (typeof raw.searchQuery === "string") searchQuery = raw.searchQuery;
  else problems.push("searchQuery is missing or not a string");

  return { state: { expandedIds, selectedId, searchQuery }, problems };
}

/** Same set of ids, regardless of order. O(n). */
export function sameIdSet(a: ReadonlySet<TreeId>, b: ReadonlySet<TreeId>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
