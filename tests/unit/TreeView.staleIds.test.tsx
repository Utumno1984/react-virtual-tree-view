// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraggableTreeView, TreeView } from "../../src";
import type { TreeNode } from "../../src";
import { collectIds } from "../../src/tree-utils";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const treeA = (): TreeNode[] => [
  {
    id: "a-docs",
    label: "Documents",
    children: [
      { id: "a-cv", label: "CV" },
      {
        id: "a-deep",
        label: "Deep",
        children: [{ id: "a-leaf", label: "Leaf" }],
      },
    ],
  },
  { id: "a-readme", label: "README" },
];
const treeB = (): TreeNode[] => [
  { id: "b-dir", label: "Folder", children: [{ id: "b-1", label: "One" }] },
  { id: "b-2", label: "Two" },
];
// Same ids as treeA, other labels, some nodes gone.
const treeAv2 = (): TreeNode[] => [
  {
    id: "a-docs",
    label: "Documents v2",
    children: [{ id: "a-cv", label: "CV v2" }],
  },
  { id: "a-readme", label: "README v2" },
];

const rowIds = () => screen.queryAllByRole("treeitem").map((el) => el.getAttribute("data-node-id"));
const selectedIds = () =>
  screen
    .queryAllByRole("treeitem")
    .filter((el) => el.getAttribute("aria-selected") === "true")
    .map((el) => el.getAttribute("data-node-id"));
const row = (id: string) => document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;

describe("collectIds", () => {
  it("collects every id of the whole tree, hidden or not", () => {
    expect([...collectIds(treeA())].sort()).toEqual(
      ["a-cv", "a-deep", "a-docs", "a-leaf", "a-readme"].sort(),
    );
  });
  it("handles an empty tree and duplicate ids", () => {
    expect(collectIds([]).size).toBe(0);
    expect(
      collectIds([
        { id: 1, label: "x" },
        { id: 1, label: "y", children: [{ id: 1, label: "z" }] },
      ]).size,
    ).toBe(1);
  });
});

describe.each([
  ["TreeView", TreeView],
  ["DraggableTreeView", DraggableTreeView],
] as const)("%s: stale ids after data is replaced", (_name, Component) => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("1. resets an uncontrolled selection whose id is not in the new tree, without onSelect", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <Component data={treeA()} defaultSelectedId="a-readme" onSelect={onSelect} />,
    );
    expect(selectedIds()).toEqual(["a-readme"]);
    rerender(<Component data={treeB()} defaultSelectedId="a-readme" onSelect={onSelect} />);
    expect(selectedIds()).toEqual([]);
    expect(onSelect).not.toHaveBeenCalled();
    // ...and it does not come back when the old id reappears later.
    rerender(<Component data={treeA()} defaultSelectedId="a-readme" onSelect={onSelect} />);
    expect(selectedIds()).toEqual([]);
  });

  it("1. keeps a selection hidden by a closed branch", () => {
    const { rerender } = render(<Component data={treeA()} defaultExpandedIds={["a-docs"]} />);
    fireEvent.click(row("a-cv"));
    expect(selectedIds()).toEqual(["a-cv"]);
    // New tree: same ids, branch closed (the expansion of a-docs is kept; collapse it).
    fireEvent.click(row("a-docs").querySelector("[data-toggle]")!);
    expect(rowIds()).not.toContain("a-cv");
    rerender(<Component data={treeAv2()} defaultExpandedIds={["a-docs"]} />);
    expect(rowIds()).not.toContain("a-cv");
    fireEvent.click(row("a-docs").querySelector("[data-toggle]")!);
    expect(selectedIds()).toEqual(["a-cv"]);
  });

  it("1. keeps a selection hidden by the search filter", () => {
    const { rerender } = render(
      <Component data={treeA()} defaultSelectedId="a-readme" searchQuery="" />,
    );
    rerender(<Component data={treeAv2()} defaultSelectedId="a-readme" searchQuery="Documents" />);
    expect(rowIds()).not.toContain("a-readme");
    rerender(<Component data={treeAv2()} defaultSelectedId="a-readme" searchQuery="" />);
    expect(selectedIds()).toEqual(["a-readme"]);
  });

  it("1. resets when the search hides the id AND the new tree lacks it", () => {
    const { rerender } = render(
      <Component data={treeA()} defaultSelectedId="a-readme" searchQuery="Doc" />,
    );
    rerender(<Component data={treeB()} defaultSelectedId="a-readme" searchQuery="" />);
    expect(selectedIds()).toEqual([]);
  });

  it("4. keeps the selection when the id exists in the new tree with another label", () => {
    const { rerender } = render(<Component data={treeA()} defaultSelectedId="a-readme" />);
    rerender(<Component data={treeAv2()} defaultSelectedId="a-readme" />);
    expect(selectedIds()).toEqual(["a-readme"]);
    expect(row("a-readme").textContent).toContain("README v2");
  });

  it("3. warns (development) for a controlled selectedId missing from data, once per id", () => {
    const warn = vi.mocked(console.warn);
    const { rerender } = render(<Component data={treeA()} selectedId="a-readme" />);
    expect(warn).not.toHaveBeenCalled();
    rerender(<Component data={treeB()} selectedId="a-readme" />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("[react-virtual-tree-view]");
    expect(warn.mock.calls[0]![0]).toContain("a-readme");
    // The library does not touch the controlled state: nothing selected, and no repeat.
    expect(selectedIds()).toEqual([]);
    rerender(<Component data={treeB()} selectedId="a-readme" searchQuery="" />);
    rerender(<Component data={treeB()} selectedId="a-readme" rowHeight={30} />);
    rerender(<Component data={[...treeB()]} selectedId="a-readme" />);
    expect(warn).toHaveBeenCalledTimes(1);
    // A different missing id warns again.
    rerender(<Component data={treeB()} selectedId="zzz" />);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]![0]).toContain("zzz");
  });

  it("3. re-arms the warning once the controlled id is valid again", () => {
    const warn = vi.mocked(console.warn);
    const { rerender } = render(<Component data={treeB()} selectedId="a-readme" />);
    expect(warn).toHaveBeenCalledTimes(1);
    rerender(<Component data={treeA()} selectedId="a-readme" />);
    expect(selectedIds()).toEqual(["a-readme"]);
    rerender(<Component data={treeB()} selectedId="a-readme" />);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("3. does not warn for null, undefined, or a present id (also hidden)", () => {
    const warn = vi.mocked(console.warn);
    const { rerender } = render(<Component data={treeA()} selectedId={null} />);
    rerender(<Component data={treeA()} selectedId="a-leaf" />);
    rerender(<Component data={treeA()} selectedId="a-readme" searchQuery="Doc" />);
    rerender(<Component data={treeB()} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("3. emits no warning in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.mocked(console.warn);
    const { rerender } = render(<Component data={treeA()} selectedId="a-readme" />);
    rerender(<Component data={treeB()} selectedId="a-readme" />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("5. drops vanished expanded ids silently and keeps the surviving ones", () => {
    const onExpandedChange = vi.fn();
    const { rerender } = render(
      <Component
        data={treeA()}
        defaultExpandedIds={["a-docs", "a-deep"]}
        onExpandedChange={onExpandedChange}
      />,
    );
    expect(rowIds()).toContain("a-leaf");
    rerender(
      <Component
        data={treeAv2()}
        defaultExpandedIds={["a-docs", "a-deep"]}
        onExpandedChange={onExpandedChange}
      />,
    );
    expect(onExpandedChange).not.toHaveBeenCalled();
    expect(row("a-docs").getAttribute("aria-expanded")).toBe("true");
    expect(rowIds()).toContain("a-cv");
    // a-deep comes back in a later tree: it is not expanded by memory.
    rerender(
      <Component
        data={treeA()}
        defaultExpandedIds={["a-docs", "a-deep"]}
        onExpandedChange={onExpandedChange}
      />,
    );
    expect(row("a-deep").getAttribute("aria-expanded")).toBe("false");
    expect(rowIds()).not.toContain("a-leaf");
    expect(row("a-docs").getAttribute("aria-expanded")).toBe("true");
    expect(onExpandedChange).not.toHaveBeenCalled();
  });

  it("5. the next user toggle reports only ids that exist", () => {
    const onExpandedChange = vi.fn();
    const { rerender } = render(
      <Component
        data={treeA()}
        defaultExpandedIds={["a-docs", "a-deep"]}
        onExpandedChange={onExpandedChange}
      />,
    );
    rerender(
      <Component
        data={treeB()}
        defaultExpandedIds={["a-docs", "a-deep"]}
        onExpandedChange={onExpandedChange}
      />,
    );
    fireEvent.click(row("b-dir").querySelector("[data-toggle]")!);
    expect(onExpandedChange).toHaveBeenLastCalledWith(["b-dir"]);
  });

  it("5. focus: a vanished focused id leaves exactly one tabbable row of the new tree", () => {
    const { rerender } = render(<Component data={treeA()} defaultExpandedIds={["a-docs"]} />);
    row("a-docs").focus();
    fireEvent.keyDown(row("a-docs"), { key: "ArrowDown" });
    fireEvent.keyDown(row("a-cv"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(row("a-deep"));
    rerender(<Component data={treeB()} defaultExpandedIds={["a-docs"]} />);
    const tabbable = screen.getAllByRole("treeitem").filter((el) => el.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(["b-dir", "b-2"]).toContain(tabbable[0]!.getAttribute("data-node-id"));
    // Arrows and Enter work on the new tree.
    act(() => tabbable[0]!.focus());
    fireEvent.keyDown(tabbable[0]!, { key: "Enter" });
    expect(selectedIds()).toEqual([tabbable[0]!.getAttribute("data-node-id")]);
    fireEvent.keyDown(tabbable[0]!, { key: "ArrowDown" });
    expect(rowIds()).toContain(document.activeElement!.getAttribute("data-node-id"));
  });

  it("5. an empty new tree does not throw, and a later tree works", () => {
    const { rerender } = render(
      <Component data={treeA()} defaultSelectedId="a-readme" defaultExpandedIds={["a-docs"]} />,
    );
    row("a-docs").focus();
    expect(() => rerender(<Component data={[]} defaultSelectedId="a-readme" />)).not.toThrow();
    expect(rowIds()).toEqual([]);
    rerender(<Component data={treeA()} defaultSelectedId="a-readme" />);
    expect(selectedIds()).toEqual([]);
    expect(screen.getAllByRole("treeitem").filter((el) => el.tabIndex === 0)).toHaveLength(1);
  });

  it("copes with duplicate ids in the new tree and with many quick swaps", () => {
    const dup: TreeNode[] = [
      { id: "x", label: "one" },
      { id: "x", label: "two" },
    ];
    const { rerender } = render(<Component data={treeA()} defaultSelectedId="a-readme" />);
    rerender(<Component data={dup} defaultSelectedId="a-readme" />);
    expect(selectedIds()).toEqual([]);
    for (let i = 0; i < 20; i++) {
      rerender(<Component data={i % 2 ? treeA() : treeB()} defaultSelectedId="a-readme" />);
    }
    expect(selectedIds()).toEqual([]);
    expect(screen.getAllByRole("treeitem").filter((el) => el.tabIndex === 0)).toHaveLength(1);
  });

  it("does not reset anything when data changes identity but keeps every id", () => {
    const onExpandedChange = vi.fn();
    const { rerender } = render(
      <Component
        data={treeA()}
        defaultSelectedId="a-readme"
        defaultExpandedIds={["a-docs"]}
        onExpandedChange={onExpandedChange}
      />,
    );
    rerender(
      <Component
        data={treeA()}
        defaultSelectedId="a-readme"
        defaultExpandedIds={["a-docs"]}
        onExpandedChange={onExpandedChange}
      />,
    );
    expect(selectedIds()).toEqual(["a-readme"]);
    expect(row("a-docs").getAttribute("aria-expanded")).toBe("true");
    expect(onExpandedChange).not.toHaveBeenCalled();
  });
});
