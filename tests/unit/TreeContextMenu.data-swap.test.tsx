// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeView } from "../../src";
import type { MenuItem, TreeNode } from "../../src";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const first: TreeNode[] = [
  { id: "a", label: "Alpha", children: [{ id: "a1", label: "Alpha 1" }] },
  { id: "b", label: "Beta" },
];

const row = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
const menu = () => screen.queryByRole("menu");

function setup(searchQuery?: string) {
  const onSelect = vi.fn();
  const items = (): MenuItem[] => [{ id: "one", label: "One", onSelect }];
  const view = (data: TreeNode[], query = searchQuery) => (
    <TreeView data={data} contextMenu={{ items }} defaultExpandedIds={["a"]} searchQuery={query} />
  );
  const utils = render(view(first));
  return { ...utils, view, onSelect };
}

describe("context menu and a new data (#53)", () => {
  it("closes silently when the anchored node id is not in the new data", () => {
    const { rerender, view, onSelect } = setup();
    fireEvent.contextMenu(row("b"));
    expect(menu()).not.toBeNull();
    rerender(view([{ id: "z", label: "Zeta" }]));
    expect(menu()).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    // it stays closed, also when the id comes back
    rerender(view(first));
    expect(menu()).toBeNull();
  });

  it("closes when a nested anchored node vanishes along with its parent", () => {
    const { rerender, view } = setup();
    fireEvent.contextMenu(row("a1"));
    expect(menu()).not.toBeNull();
    rerender(view([{ id: "b", label: "Beta" }]));
    expect(menu()).toBeNull();
  });

  it("is never painted for a stale node (closed in the same render)", () => {
    const { rerender, view } = setup();
    fireEvent.contextMenu(row("b"));
    const seen: boolean[] = [];
    const observer = new MutationObserver(() => seen.push(menu() !== null));
    observer.observe(document.body, { childList: true, subtree: true });
    rerender(view([{ id: "z", label: "Zeta" }]));
    observer.disconnect();
    expect(seen).not.toContain(true);
    expect(menu()).toBeNull();
  });

  it("stays open when the same id is still present with a different label", () => {
    const { rerender, view, onSelect } = setup();
    fireEvent.contextMenu(row("b"));
    rerender(view([{ id: "b", label: "Beta (renamed)" }]));
    expect(menu()).not.toBeNull();
    expect(row("b").textContent).toContain("Beta (renamed)");
    fireEvent.click(screen.getByRole("menuitem"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0].id).toBe("b");
  });

  it("stays open when a data change does not touch the anchored node", () => {
    const { rerender, view } = setup();
    fireEvent.contextMenu(row("b"));
    rerender(view([...first, { id: "c", label: "Gamma" }]));
    expect(menu()).not.toBeNull();
  });

  it("stays open when the node is only hidden by a closed branch", () => {
    const { rerender, view } = setup();
    fireEvent.contextMenu(row("a1"));
    rerender(
      view([{ id: "a", label: "Alpha", children: [{ id: "a1", label: "Alpha 1" }] }]),
    );
    expect(menu()).not.toBeNull();
    // collapse the parent with the keyboard (a click outside would close the menu itself):
    // a1 is hidden but still in data
    fireEvent.keyDown(row("a"), { key: "ArrowLeft" });
    expect(row("a1")).toBeNull();
    expect(menu()).not.toBeNull();
  });

  it("stays open when the node is hidden by the search filter but present in data", () => {
    const { rerender, view } = setup();
    fireEvent.contextMenu(row("b"));
    rerender(view(first, "alpha"));
    expect(row("b")).toBeNull();
    expect(menu()).not.toBeNull();
    rerender(view([...first, { id: "c", label: "Gamma" }], "alpha"));
    expect(menu()).not.toBeNull();
  });

  it("user closing (Escape) is unaffected", () => {
    setup();
    fireEvent.contextMenu(row("b"));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(menu()).toBeNull();
  });

  it("does not move the focus to another node when the menu closes by a data change", () => {
    const { rerender, view } = setup();
    fireEvent.contextMenu(row("b"));
    rerender(view([{ id: "z", label: "Zeta" }, { id: "y", label: "Ypsilon" }]));
    expect(menu()).toBeNull();
    expect(document.activeElement === row("z") || document.activeElement === row("y")).toBe(false);
  });
});
