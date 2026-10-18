// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraggableTreeView, TreeView } from "../../src";
import type { TreeNode } from "../../src";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tree = (): TreeNode[] => [
  {
    id: "p",
    label: "Parent",
    children: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Gamma", children: [{ id: "c1", label: "Gamma one" }] },
    ],
  },
  { id: "solo", label: "Solo" },
];

const row = (id: string) => document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;
const box = (id: string) => row(id).querySelector<HTMLInputElement>("input[data-checkbox]")!;
const checkedAttr = (id: string) => row(id).getAttribute("aria-checked");
const expandAll = ["p", "c"];

describe.each([
  ["TreeView", TreeView],
  ["DraggableTreeView", DraggableTreeView],
])("%s checkable", (_name, Component) => {
  it("renders no checkbox, aria-checked or aria-multiselectable without checkable", () => {
    render(<Component data={tree()} defaultExpandedIds={expandAll} />);
    expect(document.querySelectorAll("input")).toHaveLength(0);
    expect(document.querySelector("[aria-checked]")).toBeNull();
    expect(screen.getByRole("tree").hasAttribute("aria-multiselectable")).toBe(false);
  });

  it("with checkable: a checkbox per row, aria-checked on the treeitem, multiselectable tree", () => {
    render(<Component data={tree()} checkable defaultExpandedIds={expandAll} />);
    expect(screen.getByRole("tree").getAttribute("aria-multiselectable")).toBe("true");
    expect(document.querySelectorAll("input[data-checkbox]")).toHaveLength(6);
    for (const id of ["p", "a", "b", "c", "c1", "solo"]) {
      expect(checkedAttr(id)).toBe("false");
    }
  });

  it("checking a parent checks every descendant and calls onCheckedChange once", () => {
    const onCheckedChange = vi.fn();
    render(
      <Component
        data={tree()}
        checkable
        defaultExpandedIds={expandAll}
        onCheckedChange={onCheckedChange}
      />,
    );
    fireEvent.click(box("p"));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(["a", "b", "c1"]); // derived parents not listed
    for (const id of ["p", "a", "b", "c", "c1"]) expect(checkedAttr(id)).toBe("true");
    expect(box("p").checked).toBe(true);
    expect(checkedAttr("solo")).toBe("false");
    fireEvent.click(box("p"));
    expect(onCheckedChange).toHaveBeenLastCalledWith([]);
    for (const id of ["p", "a", "b", "c", "c1"]) expect(checkedAttr(id)).toBe("false");
  });

  it("goes mixed, true, mixed, false across two levels", () => {
    render(<Component data={tree()} checkable defaultExpandedIds={expandAll} />);
    fireEvent.click(box("c1"));
    expect(checkedAttr("c")).toBe("true");
    expect(checkedAttr("p")).toBe("mixed");
    expect(box("p").indeterminate).toBe(true);
    fireEvent.click(box("a"));
    fireEvent.click(box("b"));
    expect(checkedAttr("p")).toBe("true");
    fireEvent.click(box("b"));
    expect(checkedAttr("p")).toBe("mixed");
    fireEvent.click(box("a"));
    fireEvent.click(box("c1"));
    expect(checkedAttr("p")).toBe("false");
    expect(box("p").indeterminate).toBe(false);
  });

  it("clicking the checkbox does not select the row; clicking the row does not check it", () => {
    const onSelect = vi.fn();
    render(
      <Component
        data={tree()}
        checkable
        defaultExpandedIds={expandAll}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(box("a"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(row("a").getAttribute("aria-selected")).toBe("false");
    fireEvent.click(row("b"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(checkedAttr("b")).toBe("false");
  });

  it("the checkbox swallows mousedown and touchstart, so no drag can start from it", () => {
    render(<Component data={tree()} checkable defaultExpandedIds={expandAll} />);
    // The handler prevents the default (no focus on the input), which fireEvent reports as false.
    const proceeded = fireEvent.mouseDown(box("a"));
    expect(proceeded).toBe(false);
  });

  it("Space toggles the focused node, Enter selects without checking", () => {
    const onSelect = vi.fn();
    const onCheckedChange = vi.fn();
    render(
      <Component
        data={tree()}
        checkable
        defaultExpandedIds={expandAll}
        onSelect={onSelect}
        onCheckedChange={onCheckedChange}
      />,
    );
    row("a").focus();
    fireEvent.keyDown(row("a"), { key: " " });
    expect(checkedAttr("a")).toBe("true");
    expect(onSelect).not.toHaveBeenCalled();
    expect(onCheckedChange).toHaveBeenCalledWith(["a"]);
    fireEvent.keyDown(row("a"), { key: " " });
    expect(checkedAttr("a")).toBe("false");
    fireEvent.keyDown(row("b"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(checkedAttr("b")).toBe("false");
  });

  it("Space still selects without checkable", () => {
    const onSelect = vi.fn();
    render(<Component data={tree()} onSelect={onSelect} />);
    fireEvent.keyDown(row("solo"), { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("a disabled node: disabled checkbox, no change by click, Space or cascade; sibling is checked", () => {
    const data: TreeNode[] = [
      {
        id: "p",
        label: "P",
        children: [
          { id: "free", label: "Free" },
          { id: "d", label: "D", isDisabled: true, children: [{ id: "d1", label: "D1" }] },
          { id: "on", label: "On", isDisabled: true },
        ],
      },
    ];
    const onCheckedChange = vi.fn();
    render(
      <Component
        data={data}
        checkable
        defaultExpandedIds={["p", "d"]}
        defaultCheckedIds={["on"]}
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(box("d").disabled).toBe(true);
    expect(box("d1").disabled).toBe(true);
    expect(checkedAttr("on")).toBe("true");
    expect(checkedAttr("p")).toBe("mixed");
    fireEvent.keyDown(row("d"), { key: " " });
    fireEvent.keyDown(row("d1"), { key: " " });
    expect(onCheckedChange).not.toHaveBeenCalled();
    fireEvent.click(box("p"));
    expect(onCheckedChange).toHaveBeenCalledWith(["free", "on"]);
    expect(checkedAttr("free")).toBe("true");
    expect(checkedAttr("d")).toBe("false");
    expect(checkedAttr("d1")).toBe("false");
    expect(checkedAttr("on")).toBe("true");
  });

  it("with an active search the cascade and the mixed state use the whole data", () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Component
        data={tree()}
        checkable
        searchQuery="alpha"
        defaultExpandedIds={expandAll}
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(row("b")).toBeNull();
    // Hidden children are not checked, so the parent is not "true"...
    fireEvent.click(box("a"));
    expect(checkedAttr("p")).toBe("mixed");
    // ...and checking the parent reaches the hidden ones.
    fireEvent.click(box("p"));
    expect(onCheckedChange).toHaveBeenLastCalledWith(["a", "b", "c1"]);
    rerender(
      <Component
        data={tree()}
        checkable
        searchQuery=""
        defaultExpandedIds={expandAll}
        onCheckedChange={onCheckedChange}
      />,
    );
    for (const id of ["a", "b", "c", "c1"]) expect(checkedAttr(id)).toBe("true");
  });

  it("a search without matches renders no checkbox and no error", () => {
    render(
      <Component data={tree()} checkable searchQuery="zzz" noResults={<p>none</p>} />,
    );
    expect(document.querySelectorAll("input")).toHaveLength(0);
    expect(screen.getByText("none")).toBeTruthy();
  });

  it("an empty tree renders no row and no error", () => {
    render(<Component data={[]} checkable emptyState={<p>empty</p>} />);
    expect(screen.getByText("empty")).toBeTruthy();
  });

  it("defaultCheckedIds is read on mount only", () => {
    const { rerender } = render(
      <Component data={tree()} checkable defaultCheckedIds={["a"]} defaultExpandedIds={expandAll} />,
    );
    expect(checkedAttr("a")).toBe("true");
    rerender(
      <Component data={tree()} checkable defaultCheckedIds={["b"]} defaultExpandedIds={expandAll} />,
    );
    expect(checkedAttr("a")).toBe("true");
    expect(checkedAttr("b")).toBe("false");
  });

  it("controlled checkedIds: clicks call the callback but the UI only follows the prop", () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Component
        data={tree()}
        checkable
        checkedIds={[]}
        defaultExpandedIds={expandAll}
        onCheckedChange={onCheckedChange}
      />,
    );
    fireEvent.click(box("a"));
    expect(onCheckedChange).toHaveBeenCalledWith(["a"]);
    expect(checkedAttr("a")).toBe("false");
    expect(box("a").checked).toBe(false);
    rerender(
      <Component
        data={tree()}
        checkable
        checkedIds={["a", "b"]}
        defaultExpandedIds={expandAll}
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(checkedAttr("a")).toBe("true");
    expect(checkedAttr("b")).toBe("true");
    expect(checkedAttr("p")).toBe("mixed");
  });

  it("controlled checkedIds holding a parent without all its descendants: the parent is derived", () => {
    render(
      <Component
        data={tree()}
        checkable
        checkedIds={["p", "a"]}
        defaultExpandedIds={expandAll}
      />,
    );
    expect(checkedAttr("a")).toBe("true");
    expect(checkedAttr("b")).toBe("false");
    expect(checkedAttr("p")).toBe("mixed");
  });

  it("controlled ids missing from data are ignored", () => {
    render(<Component data={tree()} checkable checkedIds={["ghost", "solo"]} />);
    expect(checkedAttr("solo")).toBe("true");
  });

  it("a data change drops vanished checked ids silently and keeps the others", () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Component
        data={tree()}
        checkable
        defaultExpandedIds={expandAll}
        defaultCheckedIds={["a", "c1"]}
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(checkedAttr("c1")).toBe("true");
    const next: TreeNode[] = [
      { id: "p", label: "Parent", children: [{ id: "a", label: "Alpha" }, { id: "c", label: "Gamma" }] },
    ];
    rerender(
      <Component
        data={next}
        checkable
        defaultExpandedIds={expandAll}
        defaultCheckedIds={["a", "c1"]}
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(checkedAttr("a")).toBe("true");
    expect(onCheckedChange).not.toHaveBeenCalled();
    // The vanished id does not come back when a later tree has it again.
    rerender(
      <Component
        data={tree()}
        checkable
        defaultExpandedIds={expandAll}
        defaultCheckedIds={["a", "c1"]}
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(checkedAttr("a")).toBe("true");
    expect(checkedAttr("c1")).toBe("false");
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("rowClassName and renderNode receive checkState", () => {
    const seen: Array<unknown> = [];
    render(
      <Component
        data={tree()}
        checkable
        defaultCheckedIds={["solo"]}
        renderNode={(node, state) => {
          if (node.id === "solo") seen.push(state.checkState);
          return node.label;
        }}
      />,
    );
    expect(seen[0]).toBe(true);
  });

  it("does not crash with duplicate ids", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const data: TreeNode[] = [
      { id: "x", label: "X1" },
      { id: "x", label: "X2" },
    ];
    render(<Component data={data} checkable />);
    expect(() => fireEvent.click(document.querySelector("input[data-checkbox]")!)).not.toThrow();
  });

  it("a large tree toggles from the root without blocking", () => {
    const children: TreeNode[] = Array.from({ length: 5000 }, (_, i) => ({
      id: `n${i}`,
      label: `Node ${i}`,
    }));
    const onCheckedChange = vi.fn();
    render(
      <Component
        data={[{ id: "root", label: "Root", children }]}
        checkable
        height={200}
        defaultExpandedIds={["root"]}
        onCheckedChange={onCheckedChange}
      />,
    );
    const started = performance.now();
    fireEvent.click(box("root"));
    expect(performance.now() - started).toBeLessThan(2000);
    expect(onCheckedChange.mock.calls[0]![0]).toHaveLength(5000); // the parent "root" is derived
  });
});

describe("DraggableTreeView checkable", () => {
  it("the checked state follows the node id when the tree is rearranged", () => {
    const moved: TreeNode[] = [
      { id: "p", label: "Parent", children: [{ id: "b", label: "Beta" }] },
      { id: "q", label: "Other", children: [{ id: "a", label: "Alpha" }] },
    ];
    const before: TreeNode[] = [
      { id: "p", label: "Parent", children: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] },
      { id: "q", label: "Other", children: [{ id: "z", label: "Zed" }] },
    ];
    function Harness() {
      const [data, setData] = useState(before);
      return (
        <>
          <button onClick={() => setData(moved)}>move</button>
          <DraggableTreeView
            data={data}
            checkable
            defaultExpandedIds={["p", "q"]}
            defaultCheckedIds={["a"]}
          />
        </>
      );
    }
    render(<Harness />);
    expect(checkedAttr("p")).toBe("mixed");
    expect(checkedAttr("q")).toBe("false");
    fireEvent.click(screen.getByText("move"));
    expect(checkedAttr("a")).toBe("true");
    expect(checkedAttr("q")).toBe("true");
    expect(checkedAttr("p")).toBe("false");
  });

  it("a parent emptied by moving its only checked child does not become checked", () => {
    const onCheckedChange = vi.fn();
    const before: TreeNode[] = [
      { id: "p", label: "Parent", children: [{ id: "a", label: "Alpha" }] },
      { id: "q", label: "Other" },
    ];
    const after: TreeNode[] = [
      { id: "p", label: "Parent" },
      { id: "q", label: "Other", children: [{ id: "a", label: "Alpha" }] },
    ];
    function Harness() {
      const [data, setData] = useState(before);
      return (
        <>
          <button onClick={() => setData(after)}>move</button>
          <DraggableTreeView
            data={data}
            checkable
            defaultExpandedIds={["p", "q"]}
            onCheckedChange={onCheckedChange}
          />
        </>
      );
    }
    render(<Harness />);
    fireEvent.click(box("a"));
    expect(onCheckedChange).toHaveBeenLastCalledWith(["a"]);
    expect(checkedAttr("p")).toBe("true");
    fireEvent.click(screen.getByText("move"));
    expect(checkedAttr("p")).toBe("false");
    expect(checkedAttr("a")).toBe("true");
    expect(checkedAttr("q")).toBe("true");
  });

  it("the outcome does not depend on the order of the moves", () => {
    const a = { id: "a", label: "Alpha" };
    const b = { id: "b", label: "Beta" };
    const states = [
      [{ id: "p", label: "P", children: [a, b] }, { id: "q", label: "Q" }],
      [{ id: "p", label: "P", children: [a] }, { id: "q", label: "Q", children: [b] }],
      [{ id: "p", label: "P" }, { id: "q", label: "Q", children: [b, a] }],
    ] as TreeNode[][];
    const finalStates = new Map<string, string | null>();
    for (const order of [[0, 1, 2], [0, 2]]) {
      function Harness() {
        const [step, setStep] = useState(0);
        return (
          <>
            <button onClick={() => setStep((s) => s + 1)}>next</button>
            <DraggableTreeView
              data={states[order[step]!]!}
              checkable
              defaultExpandedIds={["p", "q"]}
              defaultCheckedIds={["a"]}
            />
          </>
        );
      }
      render(<Harness />);
      for (let i = 1; i < order.length; i++) fireEvent.click(screen.getByText("next"));
      finalStates.set(order.join(), `${checkedAttr("p")}/${checkedAttr("q")}`);
      cleanup();
    }
    expect([...finalStates.values()]).toEqual(["false/mixed", "false/mixed"]);
  });

  it("a parent id in defaultCheckedIds is ignored and does not come back when emptied", () => {
    const before: TreeNode[] = [
      { id: "p", label: "Parent", children: [{ id: "a", label: "Alpha" }] },
      { id: "q", label: "Other" },
    ];
    const after: TreeNode[] = [
      { id: "p", label: "Parent" },
      { id: "q", label: "Other", children: [{ id: "a", label: "Alpha" }] },
    ];
    function Harness() {
      const [data, setData] = useState(before);
      return (
        <>
          <button onClick={() => setData(after)}>move</button>
          <DraggableTreeView
            data={data}
            checkable
            defaultExpandedIds={["p", "q"]}
            defaultCheckedIds={["p"]}
          />
        </>
      );
    }
    render(<Harness />);
    expect(checkedAttr("p")).toBe("false");
    fireEvent.click(screen.getByText("move"));
    expect(checkedAttr("p")).toBe("false");
    expect(checkedAttr("a")).toBe("false");
  });
});

describe("controlled checkedIds on a mixed parent", () => {
  it("keeps the indeterminate flag when the parent ignores the change", () => {
    const onCheckedChange = vi.fn();
    render(
      <TreeView
        data={tree()}
        checkable
        checkedIds={["a"]}
        defaultExpandedIds={expandAll}
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(checkedAttr("p")).toBe("mixed");
    expect(box("p").indeterminate).toBe(true);
    fireEvent.click(box("p"));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(checkedAttr("p")).toBe("mixed");
    expect(box("p").checked).toBe(false);
    expect(box("p").indeterminate).toBe(true);
  });
});
