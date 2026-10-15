import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";

// Placeholder: remove when real unit tests arrive.
describe("placeholder", () => {
  it("can import and use the TreeNode type", () => {
    const node: TreeNode = { id: 1, label: "root", children: [{ id: "a", label: "child" }] };
    expect(node.children).toHaveLength(1);
  });
});
