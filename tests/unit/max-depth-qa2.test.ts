import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";
import { flattenTree, getDropTarget } from "../../src";

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function sweep(tree: TreeNode[], maxDepth: number | undefined, strict = true) {
  const expanded = new Set<string | number>();
  const mark = (ns: TreeNode[]) => ns.forEach((n) => { if (n.children) { expanded.add(n.id); mark(n.children); } });
  mark(tree);
  const flat = flattenTree(tree, expanded);
  for (const a of flat) {
    for (let row = 0; row < flat.length; row++) {
      for (const dx of [-200, -48, 0, 48, 200, 1000]) {
        const t = getDropTarget(flat, a.id, row, dx, 24, maxDepth);
        if (t && strict && maxDepth !== undefined) expect(t.projection.depth).toBeLessThanOrEqual(Math.max(maxDepth, 0));
        if (t) expect(t.slot).toBeGreaterThanOrEqual(0);
      }
    }
  }
}

describe("maxDepth independent edge cases", () => {
  it("empty tree and single node", () => {
    expect(() => sweep([], 2)).not.toThrow();
    expect(() => sweep([{ id: "a", label: "a" }], 0)).not.toThrow();
  });
  it("disabled nodes and duplicate ids do not throw and respect the limit", () => {
    const tree: TreeNode[] = [
      { id: "x", label: "x", isDisabled: true, children: [{ id: "x1", label: "x1", isDisabled: true, children: [{ id: "x2", label: "x2" }] }] },
      { id: "x", label: "dup", children: [{ id: "x1", label: "dup child" }] },
      { id: "y", label: "y" },
    ];
    for (const m of [2, 5]) expect(() => sweep(tree, m)).not.toThrow();
    for (const m of [0, 1]) expect(() => sweep(tree, m, false)).not.toThrow(); // data already over the limit
  });
  it("data deeper than maxDepth does not hang and never throws", () => {
    const rand = rng(3);
    const roots: TreeNode[] = [];
    const all: TreeNode[] = [];
    for (let i = 0; i < 60; i++) {
      const n: TreeNode = { id: `n${i}`, label: `n${i}` };
      const p = all.length && rand() < 0.9 ? all[Math.floor(rand() * all.length)]! : null;
      if (p) (p.children ??= []).push(n); else roots.push(n);
      all.push(n);
    }
    for (const m of [0, 1, 2]) expect(() => sweep(roots, m, false)).not.toThrow();
  });
});
