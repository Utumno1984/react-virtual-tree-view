// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeView } from "../../src";
import type { TreeNode } from "../../src";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tree: TreeNode[] = [
  {
    id: "a",
    label: "Alpha",
    children: [
      { id: "a1", label: "Alpha 1", children: [{ id: "a1x", label: "Alpha 1x" }] },
      { id: "a2", label: "Alpha 2", isDisabled: true },
    ],
  },
  { id: "b", label: "Beta" },
];

const row = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
const key = (id: string, k: string) => fireEvent.keyDown(row(id), { key: k });
const tabbables = () =>
  screen.getAllByRole("treeitem").filter((el) => el.getAttribute("tabindex") === "0");

describe("selection", () => {
  it("defaultSelectedId sets aria-selected on exactly that node", () => {
    render(<TreeView data={tree} defaultSelectedId="b" />);
    expect(row("b").getAttribute("aria-selected")).toBe("true");
    expect(row("a").getAttribute("aria-selected")).toBe("false");
  });

  it("uncontrolled click selects and calls onSelect once", () => {
    const onSelect = vi.fn();
    render(<TreeView data={tree} onSelect={onSelect} />);
    fireEvent.click(row("b"));
    expect(row("b").getAttribute("aria-selected")).toBe("true");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("b", tree[1]);
  });

  it("controlled: onSelect fires but the selection follows the prop only", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<TreeView data={tree} selectedId="a" onSelect={onSelect} />);
    fireEvent.click(row("b"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(row("a").getAttribute("aria-selected")).toBe("true");
    expect(row("b").getAttribute("aria-selected")).toBe("false");
    rerender(<TreeView data={tree} selectedId="b" onSelect={onSelect} />);
    expect(row("b").getAttribute("aria-selected")).toBe("true");
  });

  it("controlled null means nothing selected", () => {
    render(<TreeView data={tree} selectedId={null} />);
    expect(screen.getAllByRole("treeitem").every((el) => el.getAttribute("aria-selected") === "false")).toBe(true);
  });

  it("clicking the toggle does not select", () => {
    const onSelect = vi.fn();
    render(<TreeView data={tree} onSelect={onSelect} />);
    fireEvent.click(row("a").querySelector("[data-toggle]")!);
    expect(onSelect).not.toHaveBeenCalled();
    expect(row("a").getAttribute("aria-expanded")).toBe("true");
  });

  it("disabled nodes cannot be selected by click, Enter or Space", () => {
    const onSelect = vi.fn();
    render(<TreeView data={tree} defaultExpandedIds={["a"]} onSelect={onSelect} />);
    fireEvent.click(row("a2"));
    key("a2", "Enter");
    key("a2", " ");
    expect(onSelect).not.toHaveBeenCalled();
    expect(row("a2").getAttribute("aria-selected")).toBe("false");
  });

  it("unknown or hidden selectedId does not crash and tabindex goes to the first node", () => {
    render(<TreeView data={tree} selectedId="nope" />);
    expect(tabbables().map((el) => el.dataset.nodeId)).toEqual(["a"]);
    cleanup();
    render(<TreeView data={tree} selectedId="a1x" />);
    expect(tabbables().map((el) => el.dataset.nodeId)).toEqual(["a"]);
  });

  it("duplicate ids: the first occurrence is the selected one", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const dup: TreeNode[] = [
      { id: "x", label: "One" },
      { id: "x", label: "Two" },
    ];
    render(<TreeView data={dup} defaultSelectedId="x" />);
    const items = screen.getAllByRole("treeitem");
    expect(items.map((el) => el.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(tabbables()).toHaveLength(1);
  });
});

describe("keyboard", () => {
  it("roving tabindex: one tabbable item, the selected one", () => {
    render(<TreeView data={tree} defaultSelectedId="b" />);
    expect(tabbables().map((el) => el.dataset.nodeId)).toEqual(["b"]);
  });

  it("empty tree renders nothing tabbable and does not throw", () => {
    render(<TreeView data={[]} />);
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
  });

  it("ArrowDown/ArrowUp move focus and stop at the edges", () => {
    render(<TreeView data={tree} />);
    row("a").focus();
    key("a", "ArrowUp");
    expect(document.activeElement).toBe(row("a"));
    key("a", "ArrowDown");
    expect(document.activeElement).toBe(row("b"));
    key("b", "ArrowDown");
    expect(document.activeElement).toBe(row("b"));
    key("b", "ArrowUp");
    expect(document.activeElement).toBe(row("a"));
    expect(tabbables().map((el) => el.dataset.nodeId)).toEqual(["a"]);
  });

  it("ArrowRight expands, then moves to the first child; on a leaf it does nothing", () => {
    render(<TreeView data={tree} />);
    row("a").focus();
    key("a", "ArrowRight");
    expect(row("a").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(row("a"));
    key("a", "ArrowRight");
    expect(document.activeElement).toBe(row("a1"));
    key("a1", "ArrowRight");
    row("a1x").focus();
    key("a1x", "ArrowRight");
    expect(document.activeElement).toBe(row("a1x"));
  });

  it("ArrowLeft collapses, then moves to the parent; a closed root does nothing", () => {
    render(<TreeView data={tree} defaultExpandedIds={["a", "a1"]} />);
    row("a1x").focus();
    key("a1x", "ArrowLeft");
    expect(document.activeElement).toBe(row("a1"));
    key("a1", "ArrowLeft");
    expect(row("a1").getAttribute("aria-expanded")).toBe("false");
    key("a1", "ArrowLeft");
    expect(document.activeElement).toBe(row("a"));
    key("a", "ArrowLeft");
    expect(row("a").getAttribute("aria-expanded")).toBe("false");
    key("a", "ArrowLeft");
    expect(document.activeElement).toBe(row("a"));
  });

  it("Home and End go to the first and last visible rows", () => {
    render(<TreeView data={tree} defaultExpandedIds={["a"]} />);
    row("a1").focus();
    key("a1", "End");
    expect(document.activeElement).toBe(row("b"));
    key("b", "Home");
    expect(document.activeElement).toBe(row("a"));
  });

  it("Enter and Space select; Space is default-prevented", () => {
    const onSelect = vi.fn();
    render(<TreeView data={tree} onSelect={onSelect} />);
    row("b").focus();
    expect(fireEvent.keyDown(row("b"), { key: "Enter" })).toBe(false);
    expect(onSelect).toHaveBeenCalledTimes(1);
    row("a").focus();
    expect(fireEvent.keyDown(row("a"), { key: " " })).toBe(false);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(row("a").getAttribute("aria-selected")).toBe("true");
  });

  it("a disabled node is reachable with the arrows but not selectable", () => {
    render(<TreeView data={tree} defaultExpandedIds={["a"]} />);
    row("a1").focus();
    key("a1", "ArrowDown");
    expect(document.activeElement).toBe(row("a2"));
    key("a2", "Enter");
    expect(row("a2").getAttribute("aria-selected")).toBe("false");
  });

  it("does not hijack keys with modifiers or unrelated keys", () => {
    render(<TreeView data={tree} />);
    row("a").focus();
    expect(fireEvent.keyDown(row("a"), { key: "ArrowDown", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(row("a"), { key: "x" })).toBe(true);
    expect(document.activeElement).toBe(row("a"));
  });

  it("single node without children: arrows do nothing, Enter selects", () => {
    render(<TreeView data={[{ id: "only", label: "Only" }]} />);
    row("only").focus();
    for (const k of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]) key("only", k);
    expect(document.activeElement).toBe(row("only"));
    key("only", "Enter");
    expect(row("only").getAttribute("aria-selected")).toBe("true");
  });

  it("the focus follows the id when the rows above change", () => {
    render(<TreeView data={tree} />);
    act(() => row("b").focus());
    expect(tabbables().map((el) => el.dataset.nodeId)).toEqual(["b"]);
    fireEvent.click(row("a").querySelector("[data-toggle]")!);
    expect(tabbables().map((el) => el.dataset.nodeId)).toEqual(["b"]);
  });

  it("a selected row far outside the window is rendered and holds the only tabindex", () => {
    const big: TreeNode[] = Array.from({ length: 1000 }, (_, i) => ({ id: i, label: `n${i}` }));
    render(<TreeView data={big} height={200} defaultSelectedId={500} />);
    expect(tabbables().map((el) => el.dataset.rowIndex)).toEqual(["500"]);
    const sel = screen.getAllByRole("treeitem").find((el) => el.dataset.rowIndex === "500")!;
    expect(sel.style.top).toBe("16000px");
    expect(screen.getAllByRole("treeitem").length).toBeLessThan(30);
  });

  it("scrolls the focused row into view with block: nearest", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
    try {
      render(<TreeView data={tree} />);
      row("a").focus();
      key("a", "ArrowDown");
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    } finally {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView;
    }
  });

  it("when the focused row is removed from data, focus moves to the roving row", () => {
    const { rerender } = render(<TreeView data={tree} defaultSelectedId="b" />);
    act(() => row("a").focus());
    expect(row("a").getAttribute("aria-selected")).toBe("false");
    rerender(<TreeView data={[tree[1]!]} defaultSelectedId="b" />);
    expect(document.activeElement).toBe(row("b"));
    key("b", "End");
    expect(document.activeElement).toBe(row("b"));
  });

  it("1500 rows: End focuses the last row quickly", () => {
    const big: TreeNode[] = Array.from({ length: 1500 }, (_, i) => ({ id: i, label: `n${i}` }));
    render(<TreeView data={big} height={300} />);
    const first = screen.getAllByRole("treeitem")[0]!;
    first.focus();
    const t = performance.now();
    fireEvent.keyDown(first, { key: "End" });
    expect(performance.now() - t).toBeLessThan(500);
    expect((document.activeElement as HTMLElement).dataset.rowIndex).toBe("1499");
  });
});
