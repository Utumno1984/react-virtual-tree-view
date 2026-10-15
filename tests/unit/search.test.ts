import { describe, expect, it } from "vitest";
import { collectMatches, getMatchRanges, normalizeQuery } from "../../src/search";
import { flattenTree } from "../../src/tree-utils";
import type { TreeNode } from "../../src";
import { generateTree } from "../../stories/data/generateTree";

const tree: TreeNode[] = [
  {
    id: "docs",
    label: "Documents",
    children: [
      { id: "cv", label: "CV.pdf" },
      { id: "reports", label: "Reports", children: [{ id: "q1", label: "Q1 Foo.xlsx" }] },
    ],
  },
  { id: "pics", label: "Pictures", children: [{ id: "h", label: "Holiday.png" }] },
  { id: "foo", label: "FOO notes", isDisabled: true },
];

const ids = (set: ReadonlySet<TreeNode>) => [...set].map((n) => n.id);

describe("normalizeQuery", () => {
  it("trims and tolerates non-strings", () => {
    expect(normalizeQuery("  foo ")).toBe("foo");
    expect(normalizeQuery("   ")).toBe("");
    expect(normalizeQuery(undefined)).toBe("");
    expect(normalizeQuery(null)).toBe("");
  });
});

describe("collectMatches", () => {
  it("returns null for an empty or whitespace-only query", () => {
    expect(collectMatches(tree, "")).toBeNull();
    expect(collectMatches(tree, "   ")).toBeNull();
    expect(collectMatches(tree, undefined)).toBeNull();
  });

  it("finds matches case-insensitively and keeps their ancestors", () => {
    const result = collectMatches(tree, "foo")!;
    expect(ids(result.matches).sort()).toEqual(["foo", "q1"]);
    expect(ids(result.visible).sort()).toEqual(["docs", "foo", "q1", "reports"]);
    expect([...result.expandedIds].sort()).toEqual(["docs", "reports"]);
  });

  it("uses the trimmed query", () => {
    expect(collectMatches(tree, "  FOO  ")!.query).toBe("FOO");
    expect(ids(collectMatches(tree, "  foo  ")!.matches).sort()).toEqual(["foo", "q1"]);
  });

  it("treats regex metacharacters as literal text without throwing", () => {
    const special: TreeNode[] = [
      { id: 1, label: "a.b(" },
      { id: 2, label: "axb(" },
    ];
    expect(() => collectMatches(special, "a.b(")).not.toThrow();
    expect(ids(collectMatches(special, "a.b(")!.matches)).toEqual([1]);
    for (const q of ["(", "[", "*", "\\", "+?", "$^"]) {
      expect(() => collectMatches(special, q)).not.toThrow();
    }
  });

  it("handles an empty tree, a single matching and a single non-matching node", () => {
    expect(ids(collectMatches([], "x")!.visible)).toEqual([]);
    expect(ids(collectMatches([{ id: 1, label: "x" }], "x")!.matches)).toEqual([1]);
    expect(ids(collectMatches([{ id: 1, label: "y" }], "x")!.visible)).toEqual([]);
  });

  it("does not make a non-matching duplicate-id node visible", () => {
    const dup: TreeNode[] = [
      { id: "d", label: "hit" },
      { id: "d", label: "miss" },
    ];
    const result = collectMatches(dup, "hit")!;
    expect(result.visible.size).toBe(1);
    expect(flattenTree(dup, new Set(), result.visible)).toHaveLength(1);
  });

  it("a matching node whose children do not match shows no children", () => {
    const result = collectMatches(tree, "pictures")!;
    expect(ids(result.visible)).toEqual(["pics"]);
    const flat = flattenTree(tree, result.expandedIds, result.visible);
    expect(flat.map((f) => f.id)).toEqual(["pics"]);
    expect(flat[0]!.hasChildren).toBe(false);
  });

  it("is a single O(n) pass: 10,000 nodes under 200 ms (documented threshold)", () => {
    // Threshold: a linear pass over 10,000 nodes takes a few ms; 200 ms leaves a wide
    // margin for slow CI machines while still failing for any quadratic implementation
    // (10,000^2 = 100M label tests would take seconds).
    const big = generateTree({ count: 10_000, maxDepth: 5, seed: 3 });
    const label = (big[0] as TreeNode).label.slice(0, 3);
    const start = performance.now();
    const result = collectMatches(big, label)!;
    const elapsed = performance.now() - start;
    expect(result.matches.size).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });

});

describe("getMatchRanges", () => {
  it("returns every non-overlapping occurrence, case-insensitively", () => {
    expect(getMatchRanges("Foo foo FOO", "foo")).toEqual([
      [0, 3],
      [4, 7],
      [8, 11],
    ]);
    expect(getMatchRanges("aaaa", "aa")).toEqual([
      [0, 2],
      [2, 4],
    ]);
  });

  it("returns [] for no match, empty or blank query", () => {
    expect(getMatchRanges("abc", "x")).toEqual([]);
    expect(getMatchRanges("abc", "")).toEqual([]);
    expect(getMatchRanges("abc", "   ")).toEqual([]);
    expect(getMatchRanges("", "a")).toEqual([]);
  });

  it("is literal for regex characters and trims the query", () => {
    expect(getMatchRanges("x a.b( y", " a.b( ")).toEqual([[2, 6]]);
    expect(getMatchRanges("axb(", "a.b(")).toEqual([]);
  });

  it("keeps offsets valid on the original label when lowercasing changes its length", () => {
    const label = "İstanbul İ";
    const ranges = getMatchRanges(label, "i̇");
    expect(ranges.length).toBeGreaterThan(0);
    for (const [s, e] of ranges) expect(label.slice(s, e)).toBe("İ");
  });

  it("never returns overlapping ranges when lowercasing lengthens the label", () => {
    const ranges = getMatchRanges("İİİ", "̇i");
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]![0]).toBeGreaterThanOrEqual(ranges[i - 1]![1]);
    }
  });

  it("collectMatches and getMatchRanges agree on what matches (final sigma)", () => {
    const label = "İ ΟΔΟΣ";
    const node: TreeNode = { id: 1, label };
    const result = collectMatches([node], "οδος");
    expect(result !== null && result.matches.has(node)).toBe(getMatchRanges(label, "οδος").length > 0);
  });
});
