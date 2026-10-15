import type { TreeNode } from "./types";

type TreeId = TreeNode["id"];

export interface SearchResult<T = unknown> {
  /** Normalized (trimmed) query the result was computed for. Never empty. */
  query: string;
  /** Nodes whose label contains the query. */
  matches: ReadonlySet<TreeNode<T>>;
  /** Matches plus all their ancestors: the only nodes that stay in the tree. */
  visible: ReadonlySet<TreeNode<T>>;
  /** Ids of the nodes that have a visible descendant: expanded while searching. */
  expandedIds: ReadonlySet<TreeId>;
}

/** The query actually used for matching: surrounding whitespace is ignored. */
export function normalizeQuery(query: string | undefined | null): string {
  return typeof query === "string" ? query.trim() : "";
}

/**
 * Single O(n) pass over the tree. Returns `null` for an empty (or whitespace-only) query.
 * Sets hold node objects, not ids, so duplicate ids cannot make a non-matching node visible.
 * Matching is a case-insensitive substring test, never a regular expression.
 */
export function collectMatches<T>(
  tree: TreeNode<T>[],
  query: string | undefined | null,
): SearchResult<T> | null {
  const q = normalizeQuery(query);
  if (q === "") return null;
  const matches = new Set<TreeNode<T>>();
  const visible = new Set<TreeNode<T>>();
  const expandedIds = new Set<TreeId>();

  // Returns true when the node or any descendant matches.
  const visit = (node: TreeNode<T>): boolean => {
    // Same function as the highlighting, so `isMatch` and `matchRanges` can never disagree.
    let keep = typeof node.label === "string" && getMatchRanges(node.label, q).length > 0;
    if (keep) matches.add(node);
    let hasVisibleChild = false;
    if (node.children) {
      for (const child of node.children) {
        if (visit(child)) hasVisibleChild = true;
      }
    }
    if (hasVisibleChild) {
      expandedIds.add(node.id);
      keep = true;
    }
    if (keep) visible.add(node);
    return keep;
  };
  for (const node of tree) visit(node);
  return { query: q, matches, visible, expandedIds };
}

/**
 * `[start, end)` ranges (UTF-16 offsets into `label`) of every non-overlapping,
 * case-insensitive occurrence of the trimmed `query`. Empty array when nothing matches.
 */
export function getMatchRanges(label: string, query: string): Array<[number, number]> {
  const q = normalizeQuery(query).toLowerCase();
  if (q === "" || typeof label !== "string") return [];
  const ranges: Array<[number, number]> = [];

  let lowered = label.toLowerCase();
  // Some characters change length when lowercased (e.g. "İ"): then keep, for every index of
  // the lowered string, the source span it came from, so ranges stay valid on `label`.
  let spanStart: number[] | null = null;
  let spanEnd: number[] = [];
  if (lowered.length !== label.length) {
    spanStart = [];
    spanEnd = [];
    lowered = "";
    let source = 0;
    for (const ch of label) {
      const piece = ch.toLowerCase();
      for (let i = 0; i < piece.length; i++) {
        spanStart.push(source);
        spanEnd.push(source + ch.length);
      }
      lowered += piece;
      source += ch.length;
    }
  }

  let from = 0;
  for (;;) {
    const at = lowered.indexOf(q, from);
    if (at === -1) break;
    const last = at + q.length;
    if (spanStart) {
      // Mapped spans can overlap (one source char lowercases to several chars): clip.
      const prevEnd = ranges.length > 0 ? ranges[ranges.length - 1]![1] : 0;
      const rangeStart = Math.max(spanStart[at] ?? 0, prevEnd);
      const rangeEnd = spanEnd[last - 1] ?? label.length;
      if (rangeStart < rangeEnd) ranges.push([rangeStart, rangeEnd]);
    } else ranges.push([at, last]);
    from = last;
  }
  return ranges;
}
