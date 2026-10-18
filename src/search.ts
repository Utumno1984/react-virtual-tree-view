import type { TreeNode } from "./types";

type TreeId = TreeNode["id"];

/** One highlighted, non-overlapping occurrence: `[start, end)` UTF-16 offsets into the label. */
export interface TermMatch {
  range: [number, number];
  /** Index of the term in `searchTerms` (0 for `searchQuery`). */
  termIndex: number;
}

/** Active (non-empty, de-duplicated) search terms plus the multi-term automaton. */
export interface CompiledSearch {
  /**
   * Identity of the search: equal keys mean equal visibility, matches and highlights.
   * For a plain `searchQuery` it is the trimmed query.
   */
  key: string;
  /** Every input term as given (`searchQuery`: the trimmed query), with its canonical pattern. */
  inputs: Array<{ term: string; termIndex: number; active: boolean; pattern: number }>;
  /** Pattern -> `termIndex` (ascending, so the lowest index also has the lowest pattern id). */
  patternTermIndex: number[];
  automaton: Automaton;
}

export interface SearchCollection<T = unknown> {
  /** Same as `CompiledSearch.key`; for a plain `searchQuery`, the normalized (trimmed) query. */
  query: string;
  /** Nodes whose label contains at least one term. */
  matches: ReadonlySet<TreeNode<T>>;
  /** Matches plus all their ancestors: the only nodes that stay in the tree. */
  visible: ReadonlySet<TreeNode<T>>;
  /** Ids of the nodes that have a visible descendant: expanded while searching. */
  expandedIds: ReadonlySet<TreeId>;
  /** Highlight ranges of every match, computed once during the pass. */
  termMatches: ReadonlyMap<TreeNode<T>, TermMatch[]>;
  /** Per input term (same order as `CompiledSearch.inputs`): nodes whose label contains it. */
  termCounts: number[];
  compiled: CompiledSearch;
}

/** The query actually used for matching: surrounding whitespace is ignored. */
export function normalizeQuery(query: string | undefined | null): string {
  return typeof query === "string" ? query.trim() : "";
}

// ---------------------------------------------------------------------------------------
// Aho-Corasick automaton over UTF-16 code units.
// ---------------------------------------------------------------------------------------

export interface Automaton {
  next: Array<Map<number, number>>;
  fail: number[];
  /** Pattern ending exactly at this state, or -1. */
  out: number[];
  /** Nearest proper-suffix state that has an `out`, or -1. */
  dict: number[];
  lengths: number[];
}

/** Builds the automaton once per set of (already lowercased, unique, non-empty) patterns. */
export function buildAutomaton(patterns: ReadonlyArray<string>): Automaton {
  const next: Array<Map<number, number>> = [new Map()];
  const out: number[] = [-1];
  const lengths: number[] = [];
  patterns.forEach((pattern, id) => {
    lengths.push(pattern.length);
    let state = 0;
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern.charCodeAt(i);
      let to = next[state]!.get(c);
      if (to === undefined) {
        to = next.length;
        next.push(new Map());
        out.push(-1);
        next[state]!.set(c, to);
      }
      state = to;
    }
    if (out[state] === -1) out[state] = id;
  });
  const fail: number[] = new Array<number>(next.length).fill(0);
  const dict: number[] = new Array<number>(next.length).fill(-1);
  const queue: number[] = [];
  for (const child of next[0]!.values()) queue.push(child);
  for (let head = 0; head < queue.length; head++) {
    const state = queue[head]!;
    for (const [c, child] of next[state]!) {
      let f = fail[state]!;
      while (f !== 0 && !next[f]!.has(c)) f = fail[f]!;
      fail[child] = next[f]!.get(c) ?? 0;
      const via = fail[child]!;
      dict[child] = out[via]! !== -1 ? via : dict[via]!;
      queue.push(child);
    }
  }
  return { next, fail, out, dict, lengths };
}

/** Optional instrumentation, only used by the unit tests: internal steps of the scans. */
export interface StepCounter {
  steps: number;
}

/**
 * Scans `text` once and returns a flat list of `[start, end, pattern]` triples, one for every
 * occurrence of every pattern (overlaps included). Cost: O(text + occurrences), whatever the
 * number of patterns: each consumed character, each failure hop (amortized <= one per
 * character) and each reported occurrence counts as one step.
 */
export function scanAutomaton(automaton: Automaton, text: string, counter?: StepCounter): number[] {
  const { next, fail, out, dict, lengths } = automaton;
  const hits: number[] = [];
  let state = 0;
  let steps = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    steps++;
    while (state !== 0 && !next[state]!.has(c)) {
      state = fail[state]!;
      steps++;
    }
    state = next[state]!.get(c) ?? 0;
    for (let o = out[state]! !== -1 ? state : dict[state]!; o !== -1; o = dict[o]!) {
      steps++;
      const pattern = out[o]!;
      hits.push(i + 1 - lengths[pattern]!, i + 1, pattern);
    }
  }
  if (counter) counter.steps += steps;
  return hits;
}

/** Lowercased label, plus (only when lowercasing changes its length) the source span of each char. */
function lowerWithMap(label: string): {
  lowered: string;
  spanStart: number[] | null;
  spanEnd: number[];
} {
  let lowered = label.toLowerCase();
  if (lowered.length === label.length) return { lowered, spanStart: null, spanEnd: [] };
  // Some characters change length when lowercased (e.g. "İ"): keep, for every index of the
  // lowered string, the source span it came from, so ranges stay valid on `label`.
  const spanStart: number[] = [];
  const spanEnd: number[] = [];
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
  return { lowered, spanStart, spanEnd };
}

export interface LabelMatch {
  /** Non-overlapping highlights, ordered by start. */
  termMatches: TermMatch[];
  /** Distinct patterns that occur in the label, even if hidden by an overlap. */
  patterns: number[];
}

const NO_MATCH: LabelMatch = { termMatches: [], patterns: [] };

/**
 * Matches one label against the automaton. Overlaps: the leftmost start wins, then the
 * longest, then the lowest pattern; scanning resumes after the winner's end.
 * `patternTermIndex` maps a pattern id to the `termIndex` reported.
 */
export function findTermMatches(
  automaton: Automaton,
  patternTermIndex: ReadonlyArray<number>,
  label: string,
  counter?: StepCounter,
): LabelMatch {
  if (typeof label !== "string" || label === "") return NO_MATCH;
  const { lowered, spanStart, spanEnd } = lowerWithMap(label);
  const hits = scanAutomaton(automaton, lowered, counter);
  if (hits.length === 0) return NO_MATCH;

  const length = lowered.length;
  const bestEnd = new Int32Array(length);
  const bestPattern = new Int32Array(length);
  const seen = new Set<number>();
  for (let h = 0; h < hits.length; h += 3) {
    const start = hits[h]!;
    const end = hits[h + 1]!;
    const pattern = hits[h + 2]!;
    seen.add(pattern);
    if (end > bestEnd[start]! || (end === bestEnd[start] && pattern < bestPattern[start]!)) {
      bestEnd[start] = end;
      bestPattern[start] = pattern;
    }
  }

  const termMatches: TermMatch[] = [];
  let prevEnd = 0;
  for (let pos = 0; pos < length; ) {
    const end = bestEnd[pos]!;
    if (end === 0) {
      pos++;
      continue;
    }
    const termIndex = patternTermIndex[bestPattern[pos]!]!;
    if (spanStart) {
      // Mapped spans can overlap (one source char lowercases to several chars): clip.
      const rangeStart = Math.max(spanStart[pos] ?? 0, prevEnd);
      const rangeEnd = spanEnd[end - 1] ?? label.length;
      if (rangeStart < rangeEnd) {
        termMatches.push({ range: [rangeStart, rangeEnd], termIndex });
        prevEnd = rangeEnd;
      }
    } else {
      termMatches.push({ range: [pos, end], termIndex });
    }
    pos = end;
  }
  return { termMatches, patterns: [...seen] };
}

// ---------------------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------------------

const TERMS_PREFIX = "terms\u0000";

/**
 * Cheap identity of a search (O(total length of the terms)): lets the caller memoize
 * `compileSearch` even when `searchTerms` is a new array on every render.
 * `null` when nothing is searched.
 */
export function searchKey(
  searchTerms: ReadonlyArray<string> | undefined | null,
  searchQuery: string | undefined | null,
): string | null {
  const terms = Array.isArray(searchTerms) ? searchTerms : [];
  let key = TERMS_PREFIX;
  let any = false;
  terms.forEach((raw, i) => {
    const term = normalizeQuery(raw).toLowerCase();
    if (term !== "") {
      any = true;
      key += `${i}:${term}\u0000`;
    }
  });
  if (any) return key;
  const q = normalizeQuery(searchQuery);
  return q === "" ? null : q;
}

/** True when `searchTerms` has an active term and `searchQuery` is non-empty too. */
export function hasConflictingSearch(
  searchTerms: ReadonlyArray<string> | undefined | null,
  searchQuery: string | undefined | null,
): boolean {
  const key = searchKey(searchTerms, "");
  return key !== null && normalizeQuery(searchQuery) !== "";
}

/**
 * Normalizes the terms once and builds the automaton. Active terms are the non-empty ones
 * after `trim`; with none, `searchQuery` is used. Duplicates (after `trim` + lowercase) count
 * as one term, with the lowest index. Returns `null` when there is nothing to search.
 */
export function compileSearch(
  searchTerms: ReadonlyArray<string> | undefined | null,
  searchQuery?: string | null,
): CompiledSearch | null {
  const key = searchKey(searchTerms, searchQuery);
  if (key === null) return null;
  const patterns: string[] = [];
  const patternTermIndex: number[] = [];
  const inputs: CompiledSearch["inputs"] = [];
  if (key.startsWith(TERMS_PREFIX)) {
    const byTerm = new Map<string, number>();
    (searchTerms as ReadonlyArray<string>).forEach((raw, termIndex) => {
      const lowered = normalizeQuery(raw).toLowerCase();
      if (lowered === "") {
        inputs.push({ term: typeof raw === "string" ? raw : "", termIndex, active: false, pattern: -1 });
        return;
      }
      let pattern = byTerm.get(lowered);
      if (pattern === undefined) {
        pattern = patterns.length;
        byTerm.set(lowered, pattern);
        patterns.push(lowered);
        patternTermIndex.push(termIndex);
      }
      inputs.push({ term: raw, termIndex, active: true, pattern });
    });
  } else {
    patterns.push(key.toLowerCase());
    patternTermIndex.push(0);
    inputs.push({ term: key, termIndex: 0, active: true, pattern: 0 });
  }
  return { key, inputs, patternTermIndex, automaton: buildAutomaton(patterns) };
}

/**
 * Single O(n) pass over the tree, however many terms there are: each node's `label` and
 * `children` are read once, the label is lowercased once and matched with the automaton.
 * Sets hold node objects, not ids, so duplicate ids cannot make a non-matching node visible.
 */
export function collectTermMatches<T>(
  tree: TreeNode<T>[],
  compiled: CompiledSearch,
): SearchCollection<T> {
  const { automaton, patternTermIndex } = compiled;
  const matches = new Set<TreeNode<T>>();
  const visible = new Set<TreeNode<T>>();
  const expandedIds = new Set<TreeId>();
  const termMatches = new Map<TreeNode<T>, TermMatch[]>();
  const patternCounts: number[] = new Array<number>(patternTermIndex.length).fill(0);

  // Returns true when the node or any descendant matches.
  const visit = (node: TreeNode<T>): boolean => {
    const label = node.label;
    const children = node.children;
    const found = findTermMatches(automaton, patternTermIndex, label);
    for (const pattern of found.patterns) patternCounts[pattern]!++;
    let keep = found.termMatches.length > 0;
    if (keep) {
      matches.add(node);
      termMatches.set(node, found.termMatches);
    }
    let hasVisibleChild = false;
    if (children) {
      for (const child of children) {
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
  const termCounts = compiled.inputs.map((input) =>
    input.active ? patternCounts[input.pattern]! : 0,
  );
  return {
    query: compiled.key,
    matches,
    visible,
    expandedIds,
    termMatches,
    termCounts,
    compiled,
  };
}

/**
 * Single-query form of `collectTermMatches`. Returns `null` for an empty (or whitespace-only)
 * query. Matching is a case-insensitive substring test, never a regular expression.
 */
export function collectMatches<T>(
  tree: TreeNode<T>[],
  query: string | undefined | null,
): SearchCollection<T> | null {
  const compiled = compileSearch(undefined, query);
  return compiled ? collectTermMatches(tree, compiled) : null;
}

/**
 * `[start, end)` ranges (UTF-16 offsets into `label`) of every non-overlapping,
 * case-insensitive occurrence of the trimmed `query`. Empty array when nothing matches.
 */
export function getMatchRanges(label: string, query: string): Array<[number, number]> {
  const compiled = compileSearch(undefined, query);
  if (!compiled) return [];
  return findTermMatches(compiled.automaton, compiled.patternTermIndex, label).termMatches.map(
    (m) => m.range,
  );
}
