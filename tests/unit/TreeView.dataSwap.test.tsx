// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TreeView } from "../../src";
import type { TreeNode } from "../../src";

afterEach(cleanup);

const first: TreeNode[] = [
  {
    id: "a-docs",
    label: "Documents",
    children: [{ id: "a-q1", label: "Q1.xlsx" }],
  },
];
const second: TreeNode[] = [
  {
    id: "b-dir",
    label: "Folder",
    children: [{ id: "b-1", label: "Node 1" }],
  },
];

const ids = () => screen.getAllByRole("treeitem").map((el) => el.getAttribute("data-node-id"));

describe("TreeView data swap with an active searchQuery", () => {
  it("recomputes matches on the new data when the query is unchanged", () => {
    const { rerender } = render(<TreeView data={first} searchQuery="1" noResults={<p>none</p>} />);
    expect(ids()).toEqual(["a-docs", "a-q1"]);

    rerender(<TreeView data={second} searchQuery="1" noResults={<p>none</p>} />);
    expect(screen.queryByText("none")).toBeNull();
    expect(ids()).toEqual(["b-dir", "b-1"]);
    expect(document.querySelector('[data-node-id="b-dir"]')?.getAttribute("aria-expanded")).toBe(
      "true",
    );

    rerender(<TreeView data={first} searchQuery="1" noResults={<p>none</p>} />);
    expect(ids()).toEqual(["a-docs", "a-q1"]);
  });
});
