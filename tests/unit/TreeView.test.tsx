// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeView } from "../../src";
import type { TreeNode } from "../../src";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const tree: TreeNode[] = [
  {
    id: "a",
    label: "Alpha",
    children: [
      { id: "a1", label: "Alpha 1", children: [{ id: "a1x", label: "Alpha 1x" }] },
      { id: "a2", label: "Alpha 2" },
    ],
  },
  { id: "b", label: "Beta", children: [] },
  { id: "c", label: "Gamma", isDisabled: true, children: [{ id: "c1", label: "Gamma 1" }] },
];

const row = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;
const toggleOf = (id: string) => row(id)!.querySelector("[data-toggle]") as HTMLElement;

describe("TreeView structure and ARIA", () => {
  it("renders a tree with treeitems carrying level, setsize, posinset and data-node-id", () => {
    render(<TreeView data={tree} />);
    expect(screen.getByRole("tree")).toBeTruthy();
    expect(screen.getAllByRole("treeitem")).toHaveLength(3);
    const b = row("b")!;
    expect(b.getAttribute("aria-level")).toBe("1");
    expect(b.getAttribute("aria-setsize")).toBe("3");
    expect(b.getAttribute("aria-posinset")).toBe("2");
  });

  it("computes setsize/posinset for nested nodes", () => {
    render(<TreeView data={tree} defaultExpandedIds={["a", "a1", "c"]} />);
    expect(row("a1x")!.getAttribute("aria-level")).toBe("3");
    expect(row("a1x")!.getAttribute("aria-setsize")).toBe("1");
    expect(row("a2")!.getAttribute("aria-posinset")).toBe("2");
    expect(row("a2")!.getAttribute("aria-setsize")).toBe("2");
    expect(row("c1")!.getAttribute("aria-posinset")).toBe("1");
    expect(row("c")!.getAttribute("aria-posinset")).toBe("3");
  });

  it("collapsed node has aria-expanded=false and no children in the DOM; toggling expands", () => {
    render(<TreeView data={tree} />);
    expect(row("a")!.getAttribute("aria-expanded")).toBe("false");
    expect(row("a1")).toBeNull();
    fireEvent.click(toggleOf("a"));
    expect(row("a")!.getAttribute("aria-expanded")).toBe("true");
    expect(row("a1")).not.toBeNull();
    expect(row("a1")!.previousElementSibling).toBe(row("a"));
    expect(row("a1")!.style.paddingLeft).toBe("24px");
    fireEvent.click(toggleOf("a"));
    expect(row("a1")).toBeNull();
  });

  it("applies depth * indentation", () => {
    render(<TreeView data={tree} defaultExpandedIds={["a", "a1"]} indentation={10} />);
    expect(row("a")!.style.paddingLeft).toBe("0px");
    expect(row("a1x")!.style.paddingLeft).toBe("20px");
  });

  it("leaves (no children or children: []) have no aria-expanded", () => {
    render(<TreeView data={tree} defaultExpandedIds={["a"]} />);
    expect(row("b")!.hasAttribute("aria-expanded")).toBe(false);
    expect(row("a2")!.hasAttribute("aria-expanded")).toBe(false);
  });

  it("a leaf toggle click does nothing", () => {
    const onChange = vi.fn();
    render(<TreeView data={tree} onExpandedChange={onChange} />);
    fireEvent.click(toggleOf("b"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("expansion state", () => {
  it("starts with defaultExpandedIds expanded", () => {
    render(<TreeView data={tree} defaultExpandedIds={["a"]} />);
    expect(row("a")!.getAttribute("aria-expanded")).toBe("true");
    expect(row("a1")).not.toBeNull();
  });

  it("calls onExpandedChange with the updated set on every toggle", () => {
    const onChange = vi.fn();
    render(<TreeView data={tree} defaultExpandedIds={["c"]} onExpandedChange={onChange} />);
    fireEvent.click(toggleOf("a"));
    expect(onChange).toHaveBeenLastCalledWith(["c", "a"]);
    fireEvent.click(toggleOf("c"));
    expect(onChange).toHaveBeenLastCalledWith(["a"]);
    fireEvent.click(toggleOf("a"));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});

describe("rendering customisation", () => {
  it("shows the label by default", () => {
    render(<TreeView data={tree} />);
    expect(row("b")!.textContent).toContain("Beta");
  });

  it("renderNode replaces the content and receives the state", () => {
    const renderNode = vi.fn((node: TreeNode) => <b data-testid={`n-${node.id}`}>custom {node.label}</b>);
    render(<TreeView data={tree} defaultExpandedIds={["a"]} renderNode={renderNode} />);
    expect(screen.getByTestId("n-a").textContent).toBe("custom Alpha");
    expect(row("a")!.textContent).not.toContain("Alpha Alpha");
    expect(renderNode).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), {
      depth: 0,
      isExpanded: true,
      isDisabled: false,
      hasChildren: true,
    });
    expect(renderNode).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }), {
      depth: 0,
      isExpanded: false,
      isDisabled: true,
      hasChildren: true,
    });
    expect(renderNode).toHaveBeenCalledWith(expect.objectContaining({ id: "a2" }), {
      depth: 1,
      isExpanded: false,
      isDisabled: false,
      hasChildren: false,
    });
  });

  it("renderIcon replaces the toggle indicator", () => {
    render(
      <TreeView
        data={tree}
        renderIcon={(s) => <i data-testid="icon">{s.isExpanded ? "open" : "closed"}</i>}
      />,
    );
    expect(toggleOf("a").textContent).toBe("closed");
    fireEvent.click(toggleOf("a"));
    expect(toggleOf("a").textContent).toBe("open");
  });

  it("uses a minimal text indicator by default", () => {
    render(<TreeView data={tree} />);
    expect(toggleOf("a").textContent).toBe("▸");
    fireEvent.click(toggleOf("a"));
    expect(toggleOf("a").textContent).toBe("▾");
  });

  it("applies className and rowClassName (string and function)", () => {
    const { rerender } = render(<TreeView data={tree} className="tree-x" rowClassName="row-x" />);
    expect(screen.getByRole("tree").className).toBe("tree-x");
    expect(row("a")!.className).toBe("row-x");
    rerender(
      <TreeView
        data={tree}
        rowClassName={(s) => (s.isDisabled ? "dis" : s.hasChildren ? "parent" : "leaf")}
      />,
    );
    expect(row("a")!.className).toBe("parent");
    expect(row("b")!.className).toBe("leaf");
    expect(row("c")!.className).toBe("dis");
  });

  it("disabled nodes have aria-disabled and data-disabled but can still expand", () => {
    render(<TreeView data={tree} />);
    expect(row("c")!.getAttribute("aria-disabled")).toBe("true");
    expect(row("c")!.hasAttribute("data-disabled")).toBe(true);
    expect(row("a")!.hasAttribute("aria-disabled")).toBe(false);
    expect(row("a")!.hasAttribute("data-disabled")).toBe(false);
    fireEvent.click(toggleOf("c"));
    expect(row("c1")).not.toBeNull();
  });
});

describe("empty tree", () => {
  it("renders the tree role without rows", () => {
    render(<TreeView data={[]} />);
    expect(screen.getByRole("tree")).toBeTruthy();
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
  });

  it("renders emptyState when provided", () => {
    render(<TreeView data={[]} emptyState={<p>Nothing here</p>} />);
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("does not render emptyState when there are nodes", () => {
    render(<TreeView data={tree} emptyState={<p>Nothing here</p>} />);
    expect(screen.queryByText("Nothing here")).toBeNull();
  });
});

describe("duplicate ids", () => {
  const dup: TreeNode[] = [
    { id: "x", label: "One", children: [{ id: "y", label: "Y" }] },
    { id: "x", label: "Two", children: [{ id: "y", label: "Y2" }] },
  ];

  it("warns once in development, does not throw and renders every row", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<TreeView data={dup} defaultExpandedIds={["x"]} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("x");
    expect(warn.mock.calls[0]![0]).toContain("y");
    expect(screen.getAllByRole("treeitem")).toHaveLength(4);
    expect(error).not.toHaveBeenCalled();
  });

  it("does not warn in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<TreeView data={dup} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn for unique ids", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<TreeView data={tree} />);
    expect(warn).not.toHaveBeenCalled();
  });
});
