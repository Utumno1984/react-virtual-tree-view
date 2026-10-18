import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";
import { countVisibleDescendants, flattenTree, getDragPaddingRows } from "../../src/tree-utils";

describe("getDragPaddingRows", () => {
  it("adds nothing when the rows already fill scrollTop + viewport", () => {
    expect(getDragPaddingRows(100, 10, 500, 300, 32)).toBe(0);
  });
  it("adds only what the scroll position needs, capped by the hidden rows", () => {
    // 20 rows (640px), scrolled so that scrollTop + viewport = 960px: 10 rows needed
    expect(getDragPaddingRows(20, 10, 660, 300, 32)).toBe(10);
    expect(getDragPaddingRows(20, 100, 660, 300, 32)).toBe(10);
    expect(getDragPaddingRows(20, 3, 660, 300, 32)).toBe(3);
    expect(getDragPaddingRows(20, 100, 340, 300, 32)).toBe(0);
  });
  it("is 0 without hidden rows or a usable row height", () => {
    expect(getDragPaddingRows(20, 0, 640, 300, 32)).toBe(0);
    expect(getDragPaddingRows(20, 5, 640, 300, 0)).toBe(0);
  });
});

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
