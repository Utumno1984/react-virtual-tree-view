// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeView } from "../../src";
import type { RenderNodeState, TreeNode } from "../../src";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tree: TreeNode[] = [
  {
    id: "docs",
    label: "Documents",
    children: [
      { id: "cv", label: "CV.pdf" },
      { id: "reports", label: "Reports", children: [{ id: "q1", label: "Q1 Foo foo.xlsx" }] },
    ],
  },
  { id: "pics", label: "Pictures", children: [{ id: "h", label: "Holiday.png" }] },
  { id: "foo", label: "FOO notes", isDisabled: true },
];

const row = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;
const rowIds = () =>
  screen.queryAllByRole("treeitem").map((el) => el.getAttribute("data-node-id"));
const toggleOf = (id: string) => row(id)!.querySelector("[data-toggle]") as HTMLElement;

describe("TreeView searchQuery", () => {
  it("shows only matches and their ancestors, expanded, and removes the rest from the DOM", () => {
    render(<TreeView data={tree} searchQuery="foo" />);
    expect(rowIds()).toEqual(["docs", "reports", "q1", "foo"]);
    expect(row("docs")!.getAttribute("aria-expanded")).toBe("true");
    expect(row("reports")!.getAttribute("aria-expanded")).toBe("true");
    expect(row("cv")).toBeNull();
    expect(row("pics")).toBeNull();
  });

  it("wraps every occurrence in <mark> and leaves non-matching ancestors unmarked", () => {
    render(<TreeView data={tree} searchQuery="foo" />);
    const marks = [...row("q1")!.querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks).toEqual(["Foo", "foo"]);
    expect(row("q1")!.textContent).toContain("Q1 Foo foo.xlsx");
    expect(row("docs")!.querySelector("mark")).toBeNull();
    expect(row("foo")!.querySelector("mark")!.textContent).toBe("FOO");
  });

  it("passes isMatch, matchRanges and isSearching to renderNode and does not add <mark>", () => {
    const seen: Record<string, RenderNodeState> = {};
    render(
      <TreeView
        data={tree}
        searchQuery="foo"
        renderNode={(node, state) => {
          seen[String(node.id)] = state;
          return node.label;
        }}
      />,
    );
    expect(seen.q1).toMatchObject({
      isMatch: true,
      isSearching: true,
      matchRanges: [
        [3, 6],
        [7, 10],
      ],
    });
    expect(seen.docs).toMatchObject({ isMatch: false, isSearching: true, matchRanges: [] });
    expect(document.querySelector("mark")).toBeNull();
  });

  it("reports isSearching false and no marks without a query", () => {
    let state: RenderNodeState | undefined;
    render(
      <TreeView
        data={[{ id: 1, label: "a" }]}
        renderNode={(n, s) => {
          state = s;
          return n.label;
        }}
      />,
    );
    expect(state).toMatchObject({ isSearching: false, isMatch: false, matchRanges: [] });
  });

  it("shows noResults and no treeitem when nothing matches", () => {
    render(<TreeView data={tree} searchQuery="zzz" noResults={<p>Nessun risultato</p>} />);
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
    expect(screen.getByText("Nessun risultato")).toBeTruthy();
  });

  it("with no matches and no noResults renders nothing extra; emptyState is not used", () => {
    render(<TreeView data={tree} searchQuery="zzz" emptyState={<p>Empty</p>} />);
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
    expect(screen.queryByText("Empty")).toBeNull();
  });

  it("empty data with a query: no error, noResults shown", () => {
    render(<TreeView data={[]} searchQuery="a" noResults={<p>none</p>} />);
    expect(screen.getByText("none")).toBeTruthy();
  });

  it("does not show noResults when the query is empty", () => {
    render(<TreeView data={tree} searchQuery="  " noResults={<p>none</p>} />);
    expect(screen.queryByText("none")).toBeNull();
    expect(rowIds()).toEqual(["docs", "pics", "foo"]);
  });

  it("restores the exact previous expansion when the query is cleared, even after toggles", () => {
    const { rerender } = render(<TreeView data={tree} defaultExpandedIds={["pics"]} />);
    expect(rowIds()).toEqual(["docs", "pics", "h", "foo"]);

    rerender(<TreeView data={tree} defaultExpandedIds={["pics"]} searchQuery="foo" />);
    expect(rowIds()).toEqual(["docs", "reports", "q1", "foo"]);
    fireEvent.click(toggleOf("reports")); // user collapses during the search
    expect(rowIds()).toEqual(["docs", "reports", "foo"]);

    rerender(<TreeView data={tree} defaultExpandedIds={["pics"]} searchQuery="   " />);
    expect(rowIds()).toEqual(["docs", "pics", "h", "foo"]);
    expect(row("docs")!.getAttribute("aria-expanded")).toBe("false");
    expect(row("pics")!.getAttribute("aria-expanded")).toBe("true");
  });

  it("does not call onExpandedChange for toggles made while searching", () => {
    const onExpandedChange = vi.fn();
    render(<TreeView data={tree} searchQuery="foo" onExpandedChange={onExpandedChange} />);
    fireEvent.click(toggleOf("docs"));
    expect(onExpandedChange).not.toHaveBeenCalled();
    expect(rowIds()).toEqual(["docs", "foo"]);
  });

  it("a new query drops the toggles made during the previous one", () => {
    const { rerender } = render(<TreeView data={tree} searchQuery="foo" />);
    fireEvent.click(toggleOf("docs"));
    rerender(<TreeView data={tree} searchQuery="Foo" />);
    expect(rowIds()).toEqual(["docs", "reports", "q1", "foo"]);
  });

  it("keeps a disabled match visible, highlighted and not selectable", () => {
    const onSelect = vi.fn();
    render(<TreeView data={tree} searchQuery="foo" onSelect={onSelect} />);
    const foo = row("foo")!;
    expect(foo.getAttribute("aria-disabled")).toBe("true");
    expect(foo.querySelector("mark")).not.toBeNull();
    fireEvent.click(foo);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("handles regex characters and surrounding spaces", () => {
    const data: TreeNode[] = [
      { id: 1, label: "a.b(" },
      { id: 2, label: "axb(" },
    ];
    render(<TreeView data={data} searchQuery="  a.b(  " />);
    expect(rowIds()).toEqual(["1"]);
    expect(row("1")!.querySelector("mark")!.textContent).toBe("a.b(");
  });

  it("does not crash with duplicate ids and shows only the matching node", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const data: TreeNode[] = [
      { id: "d", label: "hit" },
      { id: "d", label: "miss" },
    ];
    render(<TreeView data={data} searchQuery="hit" />);
    expect(screen.getAllByRole("treeitem")).toHaveLength(1);
  });

  it("uses the filtered siblings for aria-setsize and aria-posinset", () => {
    render(<TreeView data={tree} searchQuery="foo" />);
    expect(row("docs")!.getAttribute("aria-setsize")).toBe("2");
    expect(row("foo")!.getAttribute("aria-posinset")).toBe("2");
    expect(row("reports")!.getAttribute("aria-setsize")).toBe("1");
  });
});
