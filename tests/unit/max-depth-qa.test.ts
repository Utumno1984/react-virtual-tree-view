import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";
import { flattenTree, getDropTarget, getSubtreeHeight, moveNode } from "../../src";
import { findNodeById } from "../../src/tree-utils";

// Deterministic pseudo-random generator.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Random tree of `total` nodes whose depth never exceeds `cap` (root = 0). */
function build(total: number, rand: () => number, cap = Infinity): TreeNode[] {
  const roots: TreeNode[] = [];
  const all: Array<{ node: TreeNode; depth: number }> = [];
  for (let i = 0; i < total; i++) {
    const node: TreeNode = { id: `n${i}`, label: `n${i}` };
    const pick = all.length > 0 && rand() < 0.8 ? all[Math.floor(rand() * all.length)]! : null;
    if (pick && pick.depth < cap) {
      (pick.node.children ??= []).push(node);
      all.push({ node, depth: pick.depth + 1 });
    } else {
      roots.push(node);
      all.push({ node, depth: 0 });
    }
  }
  return roots;
}

function depthOf(tree: TreeNode[], id: string, depth = 0): number {
  for (const n of tree) {
    if (n.id === id) return depth;
    const d = depthOf(n.children ?? [], id, depth + 1);
    if (d >= 0) return d;
  }
  return -1;
}

function expandAll(tree: TreeNode[]): Set<string> {
  const expanded = new Set<string>();
  const mark = (ns: TreeNode[]) =>
    ns.forEach((n) => {
      if (n.children) {
        expanded.add(n.id);
        mark(n.children);
      }
    });
  mark(tree);
  return expanded;
}

function run(tree: TreeNode[], maxDepth: number, rand: () => number, onMove: (d: number, h: number) => void) {
  const expanded = expandAll(tree);
  const full = flattenTree(tree, expanded);
  for (let i = 0; i < 400; i++) {
    const active = full[Math.floor(rand() * full.length)]!;
    // While dragging, the node's descendants are hidden (laid out as if it were collapsed).
    const hidden = new Set(expanded);
    hidden.delete(active.id);
    const flat = flattenTree(tree, hidden);
    const over = Math.floor(rand() * flat.length);
    const dx = Math.round((rand() * 10 - 3) * 24);
    const height = getSubtreeHeight(findNodeById(tree, active.id)!);
    const target = getDropTarget(flat, active.id, over, dx, 24, maxDepth, height);
    if (!target || target.isNoop) continue;
    const res = moveNode(tree, active.id, target.parentId, target.index);
    const d = depthOf(res.tree, active.id);
    expect(d).toBeGreaterThanOrEqual(0); // node never lost
    onMove(d, height);
  }
}

describe("maxDepth QA: randomized, 800 nodes", () => {
  it("conforming data: a moved subtree never ends deeper than maxDepth", () => {
    for (const maxDepth of [0, 1, 2, 3, 5]) {
      const rand = rng(42 + maxDepth);
      const tree = build(800, rand, maxDepth);
      run(tree, maxDepth, rand, (d, h) => {
        if (h <= maxDepth) expect(d + h).toBeLessThanOrEqual(maxDepth);
      });
    }
  });

  it("data already deeper than the limit: no exception and the node is never lost", () => {
    for (const maxDepth of [0, 1, 2]) {
      const rand = rng(7 + maxDepth);
      run(build(800, rand), maxDepth, rand, () => {});
    }
  });
});
