import { describe, expect, it } from "vitest";
import {
  buildAutomaton,
  collectMatches,
  collectTermMatches,
  compileSearch,
  findTermMatches,
  getMatchRanges,
  hasConflictingSearch,
  scanAutomaton,
} from "../../src/search";
import type { CompiledSearch, StepCounter } from "../../src/search";
import type { TreeNode } from "../../src";
import { generateTree } from "../../stories/data/generateTree";

/** Brute-force reference: every (start, end, pattern) occurrence, sorted. */
function bruteForce(text: string, patterns: string[]): Array<[number, number, number]> {
  const found: Array<[number, number, number]> = [];
  patterns.forEach((p, id) => {
    for (let i = text.indexOf(p); i !== -1; i = text.indexOf(p, i + 1)) {
      found.push([i, i + p.length, id]);
    }
  });
  return found.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}

function triples(hits: number[]): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 0; i < hits.length; i += 3) out.push([hits[i]!, hits[i + 1]!, hits[i + 2]!]);
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}

const matchesOf = (label: string, terms: string[]) => {
  const c = compileSearch(terms)!;
  return findTermMatches(c.automaton, c.patternTermIndex, label).termMatches;
};

describe("Aho-Corasick automaton", () => {
  it("reports every occurrence, overlaps and nested patterns included", () => {
    const patterns = ["he", "she", "his", "hers", "e"];
    const text = "ushers she his hers";
    expect(triples(scanAutomaton(buildAutomaton(patterns), text))).toEqual(
      bruteForce(text, patterns),
    );
  });

  it("agrees with brute force on pseudo-random texts", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const word = (max: number) =>
      Array.from({ length: 1 + Math.floor(rnd() * max) }, () => "abc"[Math.floor(rnd() * 3)]).join("");
    for (let round = 0; round < 50; round++) {
      const patterns = [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => word(4)))];
      const text = word(60);
      expect(triples(scanAutomaton(buildAutomaton(patterns), text))).toEqual(
        bruteForce(text, patterns),
      );
    }
  });

  it("steps are <= 2*L + occurrences on a 10,000-char label, independent of k", () => {
    const label = "ab".repeat(2500) + "xyz".repeat(1666) + "qq"; // 10,000 chars
    expect(label.length).toBe(10_000);
    const stepsFor = (k: number) => {
      const terms = Array.from({ length: k }, (_, i) => (i === 0 ? "ab" : i === 1 ? "xyz" : `t${i}z`));
      const compiled = compileSearch(terms)!;
      const counter: StepCounter = { steps: 0 };
      const hits = scanAutomaton(compiled.automaton, label.toLowerCase(), counter);
      return { steps: counter.steps, occurrences: hits.length / 3 };
    };
    const one = stepsFor(1);
    const fifty = stepsFor(50);
    expect(one.occurrences).toBeGreaterThan(0);
    expect(fifty.occurrences).toBeGreaterThan(one.occurrences);
    for (const r of [one, fifty]) expect(r.steps).toBeLessThanOrEqual(2 * label.length + r.occurrences);
    // Not k * L: 50 terms cost roughly the same as the extra occurrences they produce.
    expect(fifty.steps - one.steps).toBeLessThanOrEqual(
      label.length + (fifty.occurrences - one.occurrences),
    );
  });

  it("steps also stay within 2*L + occurrences for adversarial, self-overlapping patterns", () => {
    const label = "a".repeat(10_000);
    const terms = Array.from({ length: 50 }, (_, i) => "a".repeat(i + 1));
    const compiled = compileSearch(terms)!;
    const counter: StepCounter = { steps: 0 };
    const hits = scanAutomaton(compiled.automaton, label, counter);
    expect(counter.steps).toBeLessThanOrEqual(2 * label.length + hits.length / 3);
  });
});

describe("findTermMatches: overlaps", () => {
  it("longest wins at the same start: ['app','apple'] on 'apple pie'", () => {
    expect(matchesOf("apple pie", ["app", "apple"])).toEqual([{ range: [0, 5], termIndex: 1 }]);
  });

  it("leftmost wins and the hidden term is skipped: ['pp','ple'] on 'apple'", () => {
    expect(matchesOf("apple", ["pp", "ple"])).toEqual([{ range: [1, 3], termIndex: 0 }]);
  });

  it("resumes after the winner's end", () => {
    expect(matchesOf("abcabc", ["abc", "ca"])).toEqual([
      { range: [0, 3], termIndex: 0 },
      { range: [3, 6], termIndex: 0 },
    ]);
  });

  it("non-overlapping occurrences of different terms are ordered by start", () => {
    expect(matchesOf("beta alpha", ["alpha", "beta"])).toEqual([
      { range: [0, 4], termIndex: 1 },
      { range: [5, 10], termIndex: 0 },
    ]);
  });

  it("a single term behaves like the old left-to-right scan ('aa' in 'aaa')", () => {
    expect(getMatchRanges("aaa", "aa")).toEqual([[0, 2]]);
  });

  it("treats regex characters as text", () => {
    expect(matchesOf("a.*[b]", [".*", "[b"])).toEqual([
      { range: [1, 3], termIndex: 0 },
      { range: [3, 5], termIndex: 1 },
    ]);
    expect(matchesOf("axxb", [".*"])).toEqual([]);
  });

  it("maps ranges back to the original label when lowercasing changes its length", () => {
    const label = "xİy";
    expect("İ".toLowerCase().length).toBe(2);
    const m = matchesOf(label, ["i̇y"]); // "i" + combining dot above + "y"
    expect(m).toEqual([{ range: [1, 3], termIndex: 0 }]);
    // Every range is a valid slice of the original label.
    for (const { range } of matchesOf("İİ ab İ", ["i", "ab"])) {
      expect(range[0]).toBeGreaterThanOrEqual(0);
      expect(range[1]).toBeLessThanOrEqual("İİ ab İ".length);
      expect(range[0]).toBeLessThan(range[1]);
    }
    expect(getMatchRanges("İab", "ab")).toEqual([[1, 3]]);
  });
});

describe("compileSearch: normalization", () => {
  it("ignores empty terms but keeps their index", () => {
    const c = compileSearch(["", "  ", "x"])!;
    expect(c.inputs.map((i) => [i.termIndex, i.active])).toEqual([
      [0, false],
      [1, false],
      [2, true],
    ]);
    expect(matchesOf("an x", ["", "  ", "x"])).toEqual([{ range: [3, 4], termIndex: 2 }]);
  });

  it("merges duplicates (trim + lowercase) under the lowest index", () => {
    const c = compileSearch(["Foo", "foo "])!;
    expect(c.patternTermIndex).toEqual([0]);
    expect(c.inputs.map((i) => i.pattern)).toEqual([0, 0]);
    expect(matchesOf("FOO", ["Foo", "foo "])).toEqual([{ range: [0, 3], termIndex: 0 }]);
  });

  it("returns null with no active term, and falls back to searchQuery", () => {
    expect(compileSearch([], "")).toBeNull();
    expect(compileSearch(["", " "], "  ")).toBeNull();
    expect(compileSearch(undefined, undefined)).toBeNull();
    const fallback = compileSearch([], " foo ")!;
    expect(fallback.key).toBe("foo");
    expect(fallback.inputs).toEqual([{ term: "foo", termIndex: 0, active: true, pattern: 0 }]);
    expect(compileSearch(["", ""], "foo")!.key).toBe("foo");
  });

  it("searchTerms win over searchQuery", () => {
    const c = compileSearch(["a"], "zzz")!;
    expect(c.inputs.map((i) => i.term)).toEqual(["a"]);
    expect(hasConflictingSearch(["a"], "zzz")).toBe(true);
    expect(hasConflictingSearch([], "zzz")).toBe(false);
    expect(hasConflictingSearch([" "], "zzz")).toBe(false);
    expect(hasConflictingSearch(["a"], " ")).toBe(false);
  });

  it("the key ignores array identity and surrounding spaces, not order", () => {
    expect(compileSearch(["Foo", "bar"])!.key).toBe(compileSearch([" Foo ", "bar"])!.key);
    expect(compileSearch(["foo", "bar"])!.key).not.toBe(compileSearch(["bar", "foo"])!.key);
  });
});

const tree: TreeNode[] = [
  {
    id: "src",
    label: "src",
    children: [
      { id: "app", label: "apple pie" },
      { id: "both", label: "Alpha and BETA" },
      { id: "deep", label: "folder", children: [{ id: "leaf", label: "beta.ts" }] },
    ],
  },
  { id: "none", label: "nothing here", children: [{ id: "n2", label: "zzz" }] },
  { id: "locked", label: "alpha locked", isDisabled: true },
];

describe("collectTermMatches", () => {
  const collect = (terms: string[], data = tree) =>
    collectTermMatches(data, compileSearch(terms)!);
  const ids = (s: ReadonlySet<TreeNode>) => [...s].map((n) => n.id).sort();

  it("keeps nodes containing any term and their ancestors, and expands the ancestors", () => {
    const r = collect(["alpha", "beta"]);
    expect(ids(r.matches)).toEqual(["both", "leaf", "locked"]);
    expect(ids(r.visible)).toEqual(["both", "deep", "leaf", "locked", "src"]);
    expect([...r.expandedIds].sort()).toEqual(["deep", "src"]);
    expect(r.visible.has(tree[1]!)).toBe(false);
  });

  it("counts per term the nodes containing it, even when an overlap hides it", () => {
    const r = collect(["app", "apple", "pie", "p"]);
    // "apple pie": app, apple, pie, p all occur; the highlight keeps only 'apple' and 'pie'.
    expect(r.termCounts).toEqual([1, 1, 1, 3]);
    expect(r.termMatches.get(tree[0]!.children![0]!)!.map((m) => m.termIndex)).toEqual([1, 2]);
  });

  it("counts empty terms as 0 and duplicates like their first occurrence", () => {
    const r = collect(["Alpha", " ", "alpha "]);
    expect(r.termCounts).toEqual([2, 0, 2]);
    expect(r.matches.size).toBe(2);
  });

  it("every termIndex is 0 for the single-query form, which stays identical to the old output", () => {
    const r = collectMatches(tree, "alpha")!;
    for (const list of r.termMatches.values()) {
      for (const m of list) expect(m.termIndex).toBe(0);
    }
    expect(r.query).toBe("alpha");
    expect(ids(r.matches)).toEqual(["both", "locked"]);
  });

  it("handles an empty tree", () => {
    const r = collect(["a", "b"], []);
    expect(r.matches.size).toBe(0);
    expect(r.termCounts).toEqual([0, 0]);
  });

  it("a single childless node can match one of the terms", () => {
    const r = collect(["nope", "solo"], [{ id: "s", label: "Solo" }]);
    expect(r.matches.size).toBe(1);
    expect(r.termCounts).toEqual([0, 1]);
  });

  it("keeps sets per node object, not per id, with duplicate ids", () => {
    const data: TreeNode[] = [
      { id: "d", label: "match" },
      { id: "d", label: "other" },
    ];
    const r = collect(["match"], data);
    expect(r.visible.has(data[0]!)).toBe(true);
    expect(r.visible.has(data[1]!)).toBe(false);
  });

  it("matchRanges equals termMatches.map(range) for the single-query helper", () => {
    const label = "Foo bar foo";
    const c: CompiledSearch = compileSearch(undefined, "foo")!;
    const direct = findTermMatches(c.automaton, c.patternTermIndex, label).termMatches;
    expect(getMatchRanges(label, "foo")).toEqual(direct.map((m) => m.range));
  });
});

describe("structural performance: node reads do not depend on k", () => {
  function countReads(k: number) {
    const raw = generateTree({ count: 10_000, maxDepth: 5, seed: 3 });
    const reads = { label: 0, children: 0 };
    const wrap = (node: TreeNode): TreeNode =>
      new Proxy(node, {
        get(target, prop, receiver) {
          if (prop === "label") reads.label++;
          if (prop === "children") reads.children++;
          const value = Reflect.get(target, prop, receiver) as unknown;
          if (prop === "children" && Array.isArray(value)) return (value as TreeNode[]).map(wrap);
          return value;
        },
      });
    const data = raw.map(wrap);
    const terms = Array.from({ length: k }, (_, i) => (i === 0 ? "node 1" : `zz${i}`));
    collectTermMatches(data, compileSearch(terms)!);
    return reads;
  }

  it("reads label and children the same number of times with k=1 and k=50 on 10,000 nodes", () => {
    const one = countReads(1);
    const fifty = countReads(50);
    expect(fifty).toEqual(one);
    // Constant per node: one read of `label`, one of `children` (the wrapper reads data once more).
    expect(one.label).toBe(10_000);
    expect(one.children).toBe(10_000);
  });
});
