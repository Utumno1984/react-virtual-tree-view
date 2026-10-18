import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";
import { countVisibleDescendants, flattenTree } from "../../src/tree-utils";

const tree: TreeNode[] = [
  {
    id: "a",
    label: "a",
    children: [
      { id: "a1", label: "a1", children: [{ id: "a1x", label: "a1x" }] },
      { id: "a2", label: "a2" },
      { id: "a3", label: "a3", children: [{ id: "a3x", label: "a3x" }] },
    ],
  },
  { id: "b", label: "b" },
];

describe("countVisibleDescendants", () => {
  it("is 0 for a leaf and for a collapsed node", () => {
    expect(countVisibleDescendants(tree[1]!, new Set(["b"]))).toBe(0);
    expect(countVisibleDescendants(tree[0]!, new Set())).toBe(0);
  });

  it("counts only the children of expanded nodes", () => {
    expect(countVisibleDescendants(tree[0]!, new Set(["a"]))).toBe(3);
    expect(countVisibleDescendants(tree[0]!, new Set(["a", "a1"]))).toBe(4);
    expect(countVisibleDescendants(tree[0]!, new Set(["a", "a1", "a3"]))).toBe(5);
  });

  it("ignores expanded descendants of a collapsed node", () => {
    expect(countVisibleDescendants(tree[0]!, new Set(["a1", "a3"]))).toBe(0);
  });

  it("matches the row count that flattenTree drops when the node is collapsed", () => {
    const expanded = new Set(["a", "a1"]);
    const collapsed = new Set(["a1"]);
    expect(flattenTree(tree, expanded).length - flattenTree(tree, collapsed).length).toBe(
      countVisibleDescendants(tree[0]!, expanded),
    );
  });

  it("handles a single child", () => {
    expect(countVisibleDescendants(tree[0]!.children![0]!, new Set(["a1"]))).toBe(1);
  });
});
