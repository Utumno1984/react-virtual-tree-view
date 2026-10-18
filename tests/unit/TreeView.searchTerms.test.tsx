// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraggableTreeView, TreeView } from "../../src";
import type { RenderNodeState, SearchResult, TreeNode } from "../../src";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tree: TreeNode[] = [
  {
    id: "src",
    label: "src",
    children: [
      { id: "both", label: "Alpha and BETA" },
      { id: "apple", label: "apple pie" },
      { id: "deep", label: "folder", children: [{ id: "leaf", label: "beta.ts" }] },
    ],
  },
  { id: "none", label: "nothing", children: [{ id: "n2", label: "zzz" }] },
  { id: "locked", label: "alpha locked", isDisabled: true },
];

const row = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null;
const rowIds = () =>
  screen.queryAllByRole("treeitem").map((el) => el.getAttribute("data-node-id"));
const marks = (id: string) =>
  [...row(id)!.querySelectorAll("mark")].map((m) => [m.textContent, m.getAttribute("data-term-index")]);

describe("searchTerms: visibility and highlighting", () => {
  it("shows nodes with any term plus ancestors (expanded) and nothing else", () => {
    render(<TreeView data={tree} searchTerms={["alpha", "beta"]} />);
    expect(rowIds()).toEqual(["src", "both", "deep", "leaf", "locked"]);
    expect(row("src")!.getAttribute("aria-expanded")).toBe("true");
    expect(row("deep")!.getAttribute("aria-expanded")).toBe("true");
    expect(row("none")).toBeNull();
  });

  it("puts data-term-index on each <mark>, on the right portions", () => {
    render(<TreeView data={tree} searchTerms={["alpha", "beta"]} />);
    expect(marks("both")).toEqual([
      ["Alpha", "0"],
      ["BETA", "1"],
    ]);
    expect(marks("leaf")).toEqual([["beta", "1"]]);
    expect(marks("locked")).toEqual([["alpha", "0"]]);
  });

  it("uses the longest overlapping term and the index of the original array", () => {
    render(<TreeView data={tree} searchTerms={["", "app", "apple"]} />);
    expect(marks("apple")).toEqual([["apple", "2"]]);
  });

  it("searchQuery marks carry data-term-index=0 and the visible rows are unchanged", () => {
    render(<TreeView data={tree} searchQuery="beta" />);
    expect(rowIds()).toEqual(["src", "both", "deep", "leaf"]);
    expect(marks("both")).toEqual([["BETA", "0"]]);
  });

  it("exposes termMatches and keeps matchRanges equal to their ranges", () => {
    const seen: Record<string, RenderNodeState> = {};
    render(
      <TreeView
        data={tree}
        searchTerms={["beta", "alpha"]}
        renderNode={(node, state) => {
          seen[String(node.id)] = state;
          return node.label;
        }}
      />,
    );
    expect(seen.both!.termMatches).toEqual([
      { range: [0, 5], termIndex: 1 },
      { range: [10, 14], termIndex: 0 },
    ]);
    expect(seen.both!.matchRanges).toEqual(seen.both!.termMatches.map((m) => m.range));
    expect(seen.src).toMatchObject({ isMatch: false, isSearching: true, termMatches: [] });
    expect(document.querySelector("mark")).toBeNull();
  });

  it("a rerender with a new but equal searchTerms array keeps the temporary toggles", () => {
    const { rerender } = render(<TreeView data={tree} searchTerms={["beta"]} />);
    fireEvent.click(row("deep")!.querySelector("[data-toggle]")!);
    expect(rowIds()).toEqual(["src", "both", "deep"]);
    rerender(<TreeView data={tree} searchTerms={["beta"]} />);
    expect(rowIds()).toEqual(["src", "both", "deep"]);
  });

  it("opening branches during a multi-term search is temporary and clearing restores", () => {
    const onExpandedChange = vi.fn();
    const { rerender } = render(
      <TreeView data={tree} defaultExpandedIds={["src"]} onExpandedChange={onExpandedChange} />,
    );
    expect(rowIds()).toEqual(["src", "both", "apple", "deep", "none", "locked"]);
    rerender(
      <TreeView
        data={tree}
        defaultExpandedIds={["src"]}
        onExpandedChange={onExpandedChange}
        searchTerms={["beta", "zzz"]}
      />,
    );
    expect(rowIds()).toEqual(["src", "both", "deep", "leaf", "none", "n2"]);
    fireEvent.click(row("deep")!.querySelector("[data-toggle]")!);
    expect(rowIds()).toEqual(["src", "both", "deep", "none", "n2"]);
    expect(onExpandedChange).not.toHaveBeenCalled();
    rerender(
      <TreeView
        data={tree}
        defaultExpandedIds={["src"]}
        onExpandedChange={onExpandedChange}
        searchTerms={[]}
      />,
    );
    expect(rowIds()).toEqual(["src", "both", "apple", "deep", "none", "locked"]);
  });

  it("shows noResults when no term matches", () => {
    render(<TreeView data={tree} searchTerms={["qqq", "www"]} noResults={<p>empty!</p>} />);
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
    expect(screen.getByText("empty!")).toBeTruthy();
  });

  it("works on an empty tree without errors", () => {
    render(<TreeView data={[]} searchTerms={["a"]} noResults={<p>empty!</p>} />);
    expect(screen.getByText("empty!")).toBeTruthy();
  });
});

describe("searchTerms vs searchQuery", () => {
  it("searchTerms win and a single development warning is logged", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(
      <TreeView data={tree} searchTerms={["beta"]} searchQuery="alpha" />,
    );
    rerender(<TreeView data={tree} searchTerms={["beta", "x"]} searchQuery="alpha" />);
    expect(rowIds()).toEqual(["src", "both", "deep", "leaf"]);
    const calls = warn.mock.calls.filter((c) => String(c[0]).includes("searchQuery is ignored"));
    expect(calls).toHaveLength(1);
  });

  it("empty or all-blank searchTerms fall back to searchQuery, with no warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(<TreeView data={tree} searchTerms={[]} searchQuery="apple" />);
    expect(rowIds()).toEqual(["src", "apple"]);
    rerender(<TreeView data={tree} searchTerms={["", "  "]} searchQuery="apple" />);
    expect(rowIds()).toEqual(["src", "apple"]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("onSearchResult", () => {
  const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)![0] as SearchResult;

  it("reports per-term and total counts, with active flags for blank terms", () => {
    const onSearchResult = vi.fn();
    render(
      <TreeView data={tree} searchTerms={["alpha", " ", "beta", "Alpha "]} onSearchResult={onSearchResult} />,
    );
    expect(onSearchResult).toHaveBeenCalledTimes(1);
    expect(last(onSearchResult)).toEqual({
      terms: [
        { term: "alpha", termIndex: 0, active: true, matchCount: 2 },
        { term: "", termIndex: 1, active: false, matchCount: 0 },
        { term: "beta", termIndex: 2, active: true, matchCount: 2 },
        { term: "Alpha", termIndex: 3, active: true, matchCount: 2 },
      ],
      matchCount: 3,
    });
  });

  it("counts a term hidden by an overlap but present in the label", () => {
    const onSearchResult = vi.fn();
    render(<TreeView data={tree} searchTerms={["app", "apple"]} onSearchResult={onSearchResult} />);
    expect(last(onSearchResult).terms.map((t) => t.matchCount)).toEqual([1, 1]);
  });

  it("reports a single entry for searchQuery", () => {
    const onSearchResult = vi.fn();
    render(<TreeView data={tree} searchQuery=" beta " onSearchResult={onSearchResult} />);
    expect(last(onSearchResult)).toEqual({
      terms: [{ term: "beta", termIndex: 0, active: true, matchCount: 2 }],
      matchCount: 2,
    });
  });

  it("is called on term changes and data changes, not on identical rerenders, and with terms: [] when cleared", () => {
    const onSearchResult = vi.fn();
    const props = { onSearchResult };
    const { rerender } = render(<TreeView data={tree} {...props} />);
    expect(onSearchResult).not.toHaveBeenCalled();

    rerender(<TreeView data={tree} searchTerms={["beta"]} {...props} />);
    expect(onSearchResult).toHaveBeenCalledTimes(1);
    rerender(<TreeView data={tree} searchTerms={["beta"]} {...props} />);
    rerender(<TreeView data={tree} searchTerms={["BETA "]} {...props} />);
    expect(onSearchResult).toHaveBeenCalledTimes(2); // same matches, different term text

    rerender(<TreeView data={tree} searchTerms={["BETA ", "zzz"]} {...props} />);
    expect(onSearchResult).toHaveBeenCalledTimes(3);
    expect(last(onSearchResult).terms.map((t) => t.matchCount)).toEqual([2, 1]);

    // New data identity with the same content: same result, no new call.
    rerender(<TreeView data={[...tree]} searchTerms={["BETA ", "zzz"]} {...props} />);
    expect(onSearchResult).toHaveBeenCalledTimes(3);
    // New data with different matches: called.
    rerender(
      <TreeView data={[{ id: "x", label: "beta" }]} searchTerms={["BETA ", "zzz"]} {...props} />,
    );
    expect(last(onSearchResult).terms.map((t) => t.matchCount)).toEqual([1, 0]);

    rerender(<TreeView data={tree} searchTerms={[]} {...props} />);
    expect(last(onSearchResult)).toEqual({ terms: [], matchCount: 0 });
    const calls = onSearchResult.mock.calls.length;
    rerender(<TreeView data={tree} searchTerms={[" "]} {...props} />);
    expect(onSearchResult).toHaveBeenCalledTimes(calls);
  });

  it("reports matchCount 0 when nothing matches and for an empty tree", () => {
    const onSearchResult = vi.fn();
    const { rerender } = render(
      <TreeView data={tree} searchTerms={["qqq"]} onSearchResult={onSearchResult} />,
    );
    expect(last(onSearchResult)).toEqual({
      terms: [{ term: "qqq", termIndex: 0, active: true, matchCount: 0 }],
      matchCount: 0,
    });
    rerender(<TreeView data={[]} searchTerms={["a", "b"]} onSearchResult={onSearchResult} />);
    expect(last(onSearchResult).matchCount).toBe(0);
    expect(last(onSearchResult).terms).toHaveLength(2);
  });

  it("is not duplicated by StrictMode", () => {
    const onSearchResult = vi.fn();
    render(
      <StrictMode>
        <TreeView data={tree} searchTerms={["beta"]} onSearchResult={onSearchResult} />
      </StrictMode>,
    );
    expect(onSearchResult).toHaveBeenCalledTimes(1);
  });
});

describe("DraggableTreeView with searchTerms", () => {
  it("disables the drag on every row and reports isSearching", () => {
    const seen: RenderNodeState[] = [];
    render(
      <DraggableTreeView
        data={tree}
        searchTerms={["beta"]}
        renderNode={(node, state) => {
          seen.push(state);
          return node.label;
        }}
      />,
    );
    const rows = screen.getAllByRole("treeitem");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.hasAttribute("data-drag-disabled")).toBe(true);
    expect(seen.every((s) => s.isSearching)).toBe(true);
  });
});

describe("special characters and labels", () => {
  it("treats regex characters as plain text", () => {
    const data: TreeNode[] = [
      { id: "a", label: "a.*b" },
      { id: "b", label: "axxb" },
      { id: "c", label: "x[1]" },
    ];
    render(<TreeView data={data} searchTerms={[".*", "[1"]} />);
    expect(rowIds()).toEqual(["a", "c"]);
    expect(marks("a")).toEqual([[".*", "0"]]);
    expect(marks("c")).toEqual([["[1", "1"]]);
  });

  it("gives valid offsets for a label with 'İ' crossed by a term", () => {
    const data: TreeNode[] = [{ id: "a", label: "xİy" }];
    const seen: RenderNodeState[] = [];
    render(
      <TreeView
        data={data}
        searchTerms={["i̇y", "x"]}
        renderNode={(node, state) => {
          seen.push(state);
          return node.label;
        }}
      />,
    );
    expect(seen.at(-1)!.termMatches).toEqual([
      { range: [0, 1], termIndex: 1 },
      { range: [1, 3], termIndex: 0 },
    ]);
  });
});
