// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TreeNode } from "../../src";

const draggableCalls: Array<{ id: string | number; disabled?: boolean }> = [];

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    useDraggable: (args: Parameters<typeof actual.useDraggable>[0]) => {
      draggableCalls.push({ id: args.id, disabled: args.disabled });
      return actual.useDraggable(args);
    },
  };
});

const { DraggableTreeView, TreeView } = await import("../../src");

afterEach(() => {
  cleanup();
  draggableCalls.length = 0;
  vi.restoreAllMocks();
});

const tree: TreeNode[] = [
  {
    id: "p",
    label: "Parent",
    children: [
      { id: "A", label: "Alpha" },
      { id: "B", label: "Bravo", isDisabled: true },
      { id: 3, label: "Charlie" },
    ],
  },
  { id: "q", label: "Other" },
];

const row = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;

describe("DraggableTreeView", () => {
  it("registers every row with useDraggable using node.id, never the row index", () => {
    render(<DraggableTreeView data={tree} defaultExpandedIds={["p"]} />);
    const ids = new Set(draggableCalls.map((c) => c.id));
    // exact set: the row indexes 0, 1, 2, 4 never appear (3 is the real id of a node)
    expect(ids).toEqual(new Set(["p", "A", "B", 3, "q"]));
  });

  // Expectation changed on purpose: touch-action: none on rows turned every touch scroll into a
  // drag. Touch drags are now long-press based (TouchSensor), so rows must not block scrolling.
  it("does not block native touch scrolling on rows and keeps the virtualization top", () => {
    render(<DraggableTreeView data={tree} defaultExpandedIds={["p"]} />);
    for (const id of ["p", "A", "B", "3", "q"]) {
      expect(row(id).style.touchAction).toBe("");
      expect(row(id).style.top).not.toBe("");
      expect(row(id).style.position).toBe("absolute");
    }
  });

  it("passes disabled: true for an isDisabled node and false for the others", () => {
    render(<DraggableTreeView data={tree} defaultExpandedIds={["p"]} />);
    const last = (id: string | number) => [...draggableCalls].reverse().find((c) => c.id === id);
    expect(last("B")?.disabled).toBe(true);
    expect(last("A")?.disabled).toBe(false);
    expect(row("B").hasAttribute("data-drag-disabled")).toBe(true);
    expect(row("A").hasAttribute("data-drag-disabled")).toBe(false);
  });

  it("disables dragging on every row while a search is active", () => {
    render(<DraggableTreeView data={tree} searchQuery="a" />);
    const rows = screen.getAllByRole("treeitem");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.hasAttribute("data-drag-disabled")).toBe(true);
    for (const call of draggableCalls) expect(call.disabled).toBe(true);
  });

  it("a search with no match renders no draggable and does not crash", () => {
    render(<DraggableTreeView data={tree} searchQuery="zzz" noResults={<p>none</p>} />);
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
    expect(screen.getByText("none")).toBeTruthy();
  });

  it("an empty tree renders without draggables", () => {
    render(<DraggableTreeView data={[]} emptyState={<p>empty</p>} />);
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
    expect(draggableCalls).toHaveLength(0);
    expect(screen.getByText("empty")).toBeTruthy();
  });

  it("keeps TreeView behaviour: roles, aria-expanded, custom renderNode", () => {
    render(
      <DraggableTreeView
        data={tree}
        defaultExpandedIds={["p"]}
        renderNode={(node) => <b>{`#${node.label}`}</b>}
      />,
    );
    expect(screen.getByRole("tree")).toBeTruthy();
    expect(row("p").getAttribute("aria-expanded")).toBe("true");
    expect(row("A").getAttribute("aria-level")).toBe("2");
    expect(row("A").textContent).toContain("#Alpha");
  });

  it("does not crash with duplicate ids", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dup: TreeNode[] = [
      { id: "x", label: "one" },
      { id: "x", label: "two" },
    ];
    render(<DraggableTreeView data={dup} />);
    expect(screen.getAllByRole("treeitem")).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
  });

  it("draggable rows disable text selection and the touch callout; others keep it", () => {
    render(<DraggableTreeView data={tree} defaultExpandedIds={["p"]} />);
    for (const id of ["p", "A", "3", "q"]) {
      expect(row(id).style.userSelect).toBe("none");
    }
    // disabled node: nothing to drag, so the text stays selectable
    expect(row("B").style.userSelect).toBe("");
    cleanup();
    render(<DraggableTreeView data={tree} searchQuery="a" />);
    for (const r of screen.getAllByRole("treeitem")) expect(r.style.userSelect).toBe("");
    cleanup();
    render(<TreeView data={tree} defaultExpandedIds={["p"]} />);
    expect(row("A").style.userSelect).toBe("");
  });

  it("blocks selectstart only while a drag is active and removes the listener afterwards", () => {
    render(<DraggableTreeView data={tree} defaultExpandedIds={["p"]} />);
    const selectStart = () => {
      const e = new Event("selectstart", { bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(selectStart()).toBe(false);
    const a = row("A");
    fireEvent.mouseDown(a, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 10, clientY: 30 });
    expect(selectStart()).toBe(true);
    fireEvent.mouseUp(document, { clientX: 10, clientY: 30 });
    expect(selectStart()).toBe(false);
    // a second drag on the same node starts clean
    fireEvent.mouseDown(a, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 10, clientY: 30 });
    expect(selectStart()).toBe(true);
    fireEvent.mouseUp(document, { clientX: 10, clientY: 30 });
    expect(selectStart()).toBe(false);
  });

  it("plain TreeView does not register draggables", () => {
    render(<TreeView data={tree} defaultExpandedIds={["p"]} />);
    expect(draggableCalls).toHaveLength(0);
    expect(row("A").hasAttribute("data-drag-disabled")).toBe(false);
  });
});
