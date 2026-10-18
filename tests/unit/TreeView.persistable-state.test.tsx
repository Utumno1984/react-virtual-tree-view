// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { DraggableTreeView, TreeView } from "../../src";
import type { TreeId, TreeNode, TreeViewPersistableState } from "../../src";
import { normalizePersistableState } from "../../src/persistable-state";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const tree = (): TreeNode[] => [
  {
    id: "docs",
    label: "Documents",
    children: [
      { id: "cv", label: "CV" },
      { id: 7, label: "Seven", children: [{ id: 8, label: "Eight" }] },
    ],
  },
  { id: "pics", label: "Pictures", children: [{ id: "p1", label: "Photo" }] },
  { id: "readme", label: "README" },
  { id: "off", label: "Disabled", isDisabled: true },
];

const row = (id: string | number) =>
  document.querySelector<HTMLElement>(`[data-node-id="${String(id)}"]`)!;
const toggle = (id: string | number) => fireEvent.click(row(id).querySelector("[data-toggle]")!);
const selectedIds = () =>
  screen
    .queryAllByRole("treeitem")
    .filter((el) => el.getAttribute("aria-selected") === "true")
    .map((el) => el.getAttribute("data-node-id"));
const sorted = (ids: TreeId[]) => [...ids].map(String).sort();

const state = (over: Partial<TreeViewPersistableState> = {}): TreeViewPersistableState => ({
  expandedIds: [],
  selectedId: null,
  searchQuery: "",
  ...over,
});

describe("TreeViewPersistableState type", () => {
  it("is exactly { expandedIds: TreeId[]; selectedId: TreeId | null; searchQuery: string }", () => {
    expectTypeOf<TreeViewPersistableState>().toEqualTypeOf<{
      expandedIds: TreeId[];
      selectedId: TreeId | null;
      searchQuery: string;
    }>();
  });
});

describe("normalizePersistableState", () => {
  it("keeps a valid state and reports no problem", () => {
    const valid = state({
      expandedIds: ["a", 1],
      selectedId: 2,
      searchQuery: "x",
    });
    expect(normalizePersistableState(valid)).toEqual({
      state: valid,
      problems: [],
    });
  });
  it.each([null, [], "str", 3, undefined])("treats %j as an empty state", (value) => {
    const result = normalizePersistableState(value);
    expect(result.state).toEqual(state());
    expect(result.problems).toHaveLength(1);
  });
  it("replaces invalid fields with empty values and drops invalid items", () => {
    const result = normalizePersistableState({
      expandedIds: ["a", {}, NaN, Infinity, null, 2],
      selectedId: {},
      searchQuery: 5,
    });
    expect(result.state).toEqual(state({ expandedIds: ["a", 2] }));
    expect(result.problems).toHaveLength(3);
  });
  it("flags missing fields", () => {
    expect(normalizePersistableState({}).problems).toHaveLength(3);
  });
  it("never throws on hostile input", () => {
    const hostile = {
      get expandedIds(): unknown {
        return [1];
      },
      selectedId: Symbol("x"),
    };
    expect(() => normalizePersistableState(hostile)).not.toThrow();
  });
});

describe.each([
  ["TreeView", TreeView],
  ["DraggableTreeView", DraggableTreeView],
] as const)("%s: persistable state", (_name, Component) => {
  let warn: MockInstance<typeof console.warn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  const libWarnings = () =>
    warn.mock.calls.filter((c) => String(c[0]).includes("[react-virtual-tree-view]"));

  it("does not call onStateChange at mount, also in StrictMode", () => {
    const onStateChange = vi.fn();
    render(
      <StrictMode>
        <Component
          data={tree()}
          initialState={state({ expandedIds: ["docs", 7], selectedId: "cv" })}
          onStateChange={onStateChange}
        />
      </StrictMode>,
    );
    expect(onStateChange).not.toHaveBeenCalled();
    expect(libWarnings()).toHaveLength(0);
    const plain = vi.fn();
    render(<Component data={tree()} defaultExpandedIds={["docs"]} onStateChange={plain} />);
    expect(plain).not.toHaveBeenCalled();
  });

  it("reports an expand/collapse once, equal as a set to onExpandedChange", () => {
    const onStateChange = vi.fn();
    const onExpandedChange = vi.fn();
    render(
      <Component
        data={tree()}
        defaultExpandedIds={["docs"]}
        onStateChange={onStateChange}
        onExpandedChange={onExpandedChange}
      />,
    );
    toggle("pics");
    expect(onStateChange).toHaveBeenCalledTimes(1);
    const reported = onStateChange.mock.calls[0]![0] as TreeViewPersistableState;
    expect(sorted(reported.expandedIds)).toEqual(sorted(onExpandedChange.mock.calls[0]![0]));
    expect(sorted(reported.expandedIds)).toEqual(["docs", "pics"]);
    toggle("docs");
    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(onStateChange.mock.calls[1]![0].expandedIds).toEqual(["pics"]);
  });

  it("reports a new uncontrolled selection, not a repeated or disabled one", () => {
    const onStateChange = vi.fn();
    render(<Component data={tree()} onStateChange={onStateChange} />);
    fireEvent.click(row("readme"));
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenLastCalledWith(state({ selectedId: "readme" }));
    fireEvent.click(row("readme"));
    fireEvent.click(row("off"));
    expect(onStateChange).toHaveBeenCalledTimes(1);
    fireEvent.click(row("pics"));
    expect(onStateChange).toHaveBeenCalledTimes(2);
  });

  it("with a controlled selectedId, reports the prop change and not the click", () => {
    const onStateChange = vi.fn();
    const onSelect = vi.fn();
    const { rerender } = render(
      <Component
        data={tree()}
        selectedId={null}
        onSelect={onSelect}
        onStateChange={onStateChange}
      />,
    );
    fireEvent.click(row("readme"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onStateChange).not.toHaveBeenCalled();
    rerender(
      <Component
        data={tree()}
        selectedId="readme"
        onSelect={onSelect}
        onStateChange={onStateChange}
      />,
    );
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenLastCalledWith(state({ selectedId: "readme" }));
  });

  it("reports searchQuery as passed, without opening temporary branches into expandedIds", () => {
    const onStateChange = vi.fn();
    const props = { data: tree(), defaultExpandedIds: ["pics"], onStateChange };
    const { rerender } = render(<Component {...props} searchQuery="" />);
    rerender(<Component {...props} searchQuery="foo" />);
    rerender(<Component {...props} searchQuery="foo " />);
    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(onStateChange.mock.calls[0]![0].searchQuery).toBe("foo");
    expect(onStateChange.mock.calls[1]![0].searchQuery).toBe("foo ");
    // searching "cv" auto-opens docs; toggling while searching is temporary
    rerender(<Component {...props} searchQuery="cv" />);
    expect(onStateChange).toHaveBeenCalledTimes(3);
    expect(onStateChange.mock.calls[2]![0].expandedIds).toEqual(["pics"]);
    toggle("docs");
    expect(onStateChange).toHaveBeenCalledTimes(3);
  });

  it("an undefined searchQuery is reported as an empty string", () => {
    const onStateChange = vi.fn();
    render(<Component data={tree()} onStateChange={onStateChange} />);
    fireEvent.click(row("readme"));
    expect(onStateChange.mock.calls[0]![0].searchQuery).toBe("");
  });

  it("each call gets fresh objects: mutating them does not change the tree", () => {
    const onStateChange = vi.fn();
    render(<Component data={tree()} defaultExpandedIds={["docs"]} onStateChange={onStateChange} />);
    toggle("pics");
    const received = onStateChange.mock.calls[0]![0] as TreeViewPersistableState;
    received.expandedIds.length = 0;
    received.expandedIds.push("zzz");
    expect(row("p1")).toBeTruthy();
    expect(row("cv")).toBeTruthy();
    toggle("pics");
    const next = onStateChange.mock.calls[1]![0] as TreeViewPersistableState;
    expect(next).not.toBe(received);
    expect(next.expandedIds).toEqual(["docs"]);
  });

  it("round-trips through JSON: mixed ids stay identical (numbers stay numbers)", () => {
    const onStateChange = vi.fn();
    const first = render(<Component data={tree()} onStateChange={onStateChange} />);
    toggle("docs");
    toggle(7);
    fireEvent.click(row(8));
    const emitted = onStateChange.mock.calls.at(-1)![0] as TreeViewPersistableState;
    expect(emitted.selectedId).toBe(8);
    const restored = JSON.parse(JSON.stringify(emitted)) as TreeViewPersistableState;
    first.unmount();
    const second = vi.fn();
    render(<Component data={tree()} initialState={restored} onStateChange={second} />);
    expect(selectedIds()).toEqual(["8"]);
    expect(row("docs").getAttribute("aria-expanded")).toBe("true");
    expect(row(7).getAttribute("aria-expanded")).toBe("true");
    expect(second).not.toHaveBeenCalled();
    fireEvent.click(row("readme"));
    const again = second.mock.calls[0]![0] as TreeViewPersistableState;
    expect(again.expandedIds.slice().sort()).toEqual(["docs", 7].sort());
    expect(again.expandedIds).toContain(7);
  });

  describe("initialState", () => {
    it("opens the branches and selects the node; later changes have no effect", () => {
      const { rerender } = render(
        <Component
          data={tree()}
          initialState={state({ expandedIds: ["docs"], selectedId: "cv" })}
        />,
      );
      expect(row("docs").getAttribute("aria-expanded")).toBe("true");
      expect(row("cv").getAttribute("aria-selected")).toBe("true");
      rerender(
        <Component
          data={tree()}
          initialState={state({ expandedIds: ["pics"], selectedId: "readme" })}
        />,
      );
      expect(row("docs").getAttribute("aria-expanded")).toBe("true");
      expect(row("pics").getAttribute("aria-expanded")).toBe("false");
      expect(selectedIds()).toEqual(["cv"]);
    });

    it("replaces defaultExpandedIds/defaultSelectedId entirely, even with empty values", () => {
      render(
        <Component
          data={tree()}
          defaultExpandedIds={["docs"]}
          defaultSelectedId="readme"
          initialState={state()}
        />,
      );
      expect(row("docs").getAttribute("aria-expanded")).toBe("false");
      expect(selectedIds()).toEqual([]);
      expect(libWarnings()).toHaveLength(1);
      const message = String(libWarnings()[0]![0]);
      expect(message).toContain("defaultExpandedIds");
      expect(message).toContain("defaultSelectedId");
    });

    it("names only the default prop that is present", () => {
      render(<Component data={tree()} defaultSelectedId="readme" initialState={state()} />);
      const message = String(libWarnings()[0]![0]);
      expect(message).toContain("defaultSelectedId");
      expect(message).not.toContain("defaultExpandedIds");
    });

    it("warns about ignored defaults in development only, not in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      render(
        <Component
          data={tree()}
          defaultSelectedId="readme"
          initialState={state({ selectedId: "cv" })}
        />,
      );
      expect(warn).not.toHaveBeenCalled();
    });

    it("a controlled selectedId wins over initialState.selectedId", () => {
      render(
        <Component
          data={tree()}
          selectedId="readme"
          initialState={state({ expandedIds: ["docs"], selectedId: "cv" })}
        />,
      );
      expect(selectedIds()).toEqual(["readme"]);
    });

    it("does not apply initialState.searchQuery, and warns when it differs from the prop", () => {
      render(
        <Component data={tree()} searchQuery="a" initialState={state({ searchQuery: "b" })} />,
      );
      expect(libWarnings()).toHaveLength(1);
      // the active search is "a": "README"/"Pictures"... contain it, "Documents" does not
      expect(screen.queryByText("Documents")).toBeNull();
      expect(row("readme")).toBeTruthy();
    });

    it("does not warn when the queries match after normalization", () => {
      render(
        <Component data={tree()} searchQuery="a" initialState={state({ searchQuery: " a " })} />,
      );
      expect(libWarnings()).toHaveLength(0);
    });

    it.each([
      ["missing field", { expandedIds: ["docs"], selectedId: null }],
      ["expandedIds not an array", { expandedIds: "docs", selectedId: null, searchQuery: "" }],
      ["invalid items", { expandedIds: ["docs", {}, NaN], selectedId: null, searchQuery: "" }],
      ["selectedId an object", { expandedIds: [], selectedId: {}, searchQuery: "" }],
      ["searchQuery a number", { expandedIds: [], selectedId: null, searchQuery: 4 }],
      ["null", null],
      ["array", []],
      ["string", "oops"],
    ])("mounts with malformed initialState (%s): one warning, no exception", (_label, value) => {
      const onStateChange = vi.fn();
      expect(() =>
        render(
          <StrictMode>
            <Component
              data={tree()}
              initialState={value as unknown as TreeViewPersistableState}
              onStateChange={onStateChange}
            />
          </StrictMode>,
        ),
      ).not.toThrow();
      expect(libWarnings()).toHaveLength(1);
      expect(selectedIds()).toEqual([]);
    });

    it("keeps the valid parts of a malformed initialState", () => {
      render(
        <Component
          data={tree()}
          initialState={
            {
              expandedIds: ["docs", {}],
              selectedId: {},
              searchQuery: "",
            } as never
          }
        />,
      );
      expect(row("docs").getAttribute("aria-expanded")).toBe("true");
      expect(selectedIds()).toEqual([]);
    });

    it("emits no warning for a malformed initialState in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      render(<Component data={tree()} initialState={null as never} />);
      expect(warn).not.toHaveBeenCalled();
    });

    it("drops ids missing from data and reports the cleaned state exactly once", () => {
      const onStateChange = vi.fn();
      render(
        <StrictMode>
          <Component
            data={tree()}
            initialState={state({
              expandedIds: ["docs", "gone", 99],
              selectedId: "gone",
            })}
            onStateChange={onStateChange}
          />
        </StrictMode>,
      );
      expect(onStateChange).toHaveBeenCalledTimes(1);
      expect(onStateChange).toHaveBeenCalledWith(state({ expandedIds: ["docs"] }));
      expect(selectedIds()).toEqual([]);
    });

    it("an empty tree: any id is cleaned, one call, no error", () => {
      const onStateChange = vi.fn();
      render(
        <Component
          data={[]}
          initialState={state({ expandedIds: ["x"], selectedId: 3 })}
          onStateChange={onStateChange}
        />,
      );
      expect(onStateChange).toHaveBeenCalledTimes(1);
      expect(onStateChange).toHaveBeenCalledWith(state());
    });

    it("a single childless node: selection restored, its expanded id is kept", () => {
      const onStateChange = vi.fn();
      render(
        <Component
          data={[{ id: "solo", label: "Solo" }]}
          initialState={state({ expandedIds: ["solo"], selectedId: "solo" })}
          onStateChange={onStateChange}
        />,
      );
      expect(selectedIds()).toEqual(["solo"]);
      expect(onStateChange).not.toHaveBeenCalled();
    });

    it("a disabled selectedId behaves like defaultSelectedId", () => {
      const a = render(<Component data={tree()} initialState={state({ selectedId: "off" })} />);
      const viaInitial = selectedIds();
      a.unmount();
      render(<Component data={tree()} defaultSelectedId="off" />);
      expect(selectedIds()).toEqual(viaInitial);
    });

    it("no search results: searchQuery is reported and noResults shown", () => {
      const onStateChange = vi.fn();
      const { rerender } = render(
        <Component data={tree()} onStateChange={onStateChange} noResults={<p>nothing</p>} />,
      );
      rerender(
        <Component
          data={tree()}
          onStateChange={onStateChange}
          noResults={<p>nothing</p>}
          searchQuery="zzzz"
        />,
      );
      expect(screen.getByText("nothing")).toBeTruthy();
      expect(onStateChange).toHaveBeenCalledWith(state({ searchQuery: "zzzz" }));
    });

    it("duplicate ids: no crash", () => {
      render(
        <Component
          data={[
            { id: "x", label: "one" },
            { id: "x", label: "two" },
          ]}
          initialState={state({ selectedId: "x" })}
        />,
      );
      expect(screen.getAllByRole("treeitem")).toHaveLength(2);
    });

    it("mounts a large tree with 1000 expanded ids", () => {
      const big: TreeNode[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `g${i}`,
        label: `Group ${i}`,
        children: Array.from({ length: 4 }, (_, j) => ({
          id: `g${i}-${j}`,
          label: `Item ${j}`,
        })),
      }));
      const onStateChange = vi.fn();
      const t0 = performance.now();
      render(
        <Component
          data={big}
          height={400}
          initialState={state({
            expandedIds: big.map((n) => n.id),
            selectedId: "g3-1",
          })}
          onStateChange={onStateChange}
        />,
      );
      expect(performance.now() - t0).toBeLessThan(2000);
      expect(onStateChange).not.toHaveBeenCalled();
    });
  });

  describe("data replaced", () => {
    it("reports the cleaned state once, without onExpandedChange", () => {
      const onStateChange = vi.fn();
      const onExpandedChange = vi.fn();
      const props = {
        onStateChange,
        onExpandedChange,
        defaultExpandedIds: ["docs", "pics", 7],
      };
      const { rerender } = render(<Component {...props} data={tree()} defaultSelectedId="cv" />);
      expect(selectedIds()).toEqual(["cv"]);
      const next: TreeNode[] = [
        {
          id: "docs",
          label: "Documents",
          children: [{ id: "other", label: "Other" }],
        },
        { id: "readme", label: "README" },
      ];
      rerender(<Component {...props} data={next} defaultSelectedId="cv" />);
      expect(onStateChange).toHaveBeenCalledTimes(1);
      expect(onStateChange).toHaveBeenCalledWith(state({ expandedIds: ["docs"] }));
      expect(onExpandedChange).not.toHaveBeenCalled();
    });

    it("in StrictMode the cleanup emits a single time", () => {
      const onStateChange = vi.fn();
      const onExpandedChange = vi.fn();
      const element = (data: TreeNode[]) => (
        <StrictMode>
          <Component
            data={data}
            defaultExpandedIds={["docs", "pics"]}
            defaultSelectedId="cv"
            onStateChange={onStateChange}
            onExpandedChange={onExpandedChange}
          />
        </StrictMode>
      );
      const { rerender } = render(element(tree()));
      expect(onStateChange).not.toHaveBeenCalled();
      rerender(element([{ id: "docs", label: "Documents", children: [] }]));
      expect(onStateChange).toHaveBeenCalledTimes(1);
      expect(onStateChange).toHaveBeenCalledWith(state({ expandedIds: ["docs"] }));
      expect(onExpandedChange).not.toHaveBeenCalled();
    });

    it("does not call when the new data keeps every id", () => {
      const onStateChange = vi.fn();
      const { rerender } = render(
        <Component data={tree()} defaultExpandedIds={["docs"]} onStateChange={onStateChange} />,
      );
      rerender(
        <Component data={tree()} defaultExpandedIds={["docs"]} onStateChange={onStateChange} />,
      );
      expect(onStateChange).not.toHaveBeenCalled();
    });
  });
});

describe("DraggableTreeView forwards the new props to the tree", () => {
  it("uses initialState and onStateChange through the dnd wrapper", () => {
    const onStateChange = vi.fn();
    render(
      <DraggableTreeView
        data={tree()}
        initialState={state({ expandedIds: ["pics"], selectedId: "p1" })}
        onStateChange={onStateChange}
      />,
    );
    expect(selectedIds()).toEqual(["p1"]);
    toggle("docs");
    expect(onStateChange).toHaveBeenCalledWith(
      state({ expandedIds: ["pics", "docs"], selectedId: "p1" }),
    );
  });
});
