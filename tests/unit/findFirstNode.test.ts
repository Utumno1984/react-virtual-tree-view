import { describe, expect, it } from "vitest";
import { findFirstNode } from "../../src/tree-utils";
import type { TreeNode } from "../../src";

describe("findFirstNode", () => {
  const tree: TreeNode[] = [
    { id: "a", label: "A", children: [{ id: "x", label: "first x" }] },
    { id: "x", label: "second x" },
  ];

  it("returns the first occurrence in document order", () => {
    expect(findFirstNode(tree, "x")?.label).toBe("first x");
  });

  it("finds roots and returns undefined for unknown ids", () => {
    expect(findFirstNode(tree, "a")).toBe(tree[0]);
    expect(findFirstNode(tree, "nope")).toBeUndefined();
    expect(findFirstNode([], "a")).toBeUndefined();
  });
});
