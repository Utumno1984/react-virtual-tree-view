import { describe, expect, it } from "vitest";
import { getCheckStates, getCheckedIds, toggleChecked } from "../../src";
import type { TreeNode } from "../../src";

const tree = (): TreeNode[] => [
  {
    id: "p",
    label: "P",
    children: [
      { id: "a", label: "A" },
      { id: "b", label: "B", children: [{ id: "b1", label: "B1" }, { id: "b2", label: "B2" }] },
    ],
  },
  { id: "solo", label: "Solo" },
];

const states = (data: TreeNode[], ids: Array<string | number>) =>
  Object.fromEntries(getCheckStates(data, new Set(ids)).states);

describe("getCheckStates", () => {
  it("is false everywhere with nothing checked, and handles an empty tree", () => {
    expect(states(tree(), [])).toEqual({
      p: false,
      a: false,
      b: false,
      b1: false,
      b2: false,
      solo: false,
    });
    expect(getCheckStates([], new Set()).states.size).toBe(0);
  });

  it("a childless node shows its own state", () => {
    expect(states(tree(), ["solo"]).solo).toBe(true);
  });

  it("aggregates up through several levels: true, false or mixed", () => {
    expect(states(tree(), ["b1"])).toMatchObject({ b: "mixed", p: "mixed", b1: true });
    expect(states(tree(), ["b1", "b2"])).toMatchObject({ b: true, p: "mixed" });
    expect(states(tree(), ["a", "b1", "b2"])).toMatchObject({ b: true, p: true });
    expect(states(tree(), ["a", "b1"])).toMatchObject({ b: "mixed", p: "mixed" });
  });

  it("derives a parent from its descendants: a stored parent id is ignored", () => {
    // Parent listed, descendants not: not checked. All descendants listed, parent not: checked.
    expect(states(tree(), ["p"])).toMatchObject({ p: false, a: false, b: false });
    expect(states(tree(), ["a", "b1", "b2"]).p).toBe(true);
  });

  it("lists the pre-order of the whole tree, ignoring unknown ids", () => {
    const result = getCheckStates(tree(), new Set(["a", "ghost"]));
    expect([...result.states.keys()]).toEqual(["p", "a", "b", "b1", "b2", "solo"]);
    expect(result.states.has("ghost")).toBe(false);
  });

  it("a disabled node keeps its own state, which counts for the ancestors", () => {
    const data: TreeNode[] = [
      {
        id: "p",
        label: "P",
        children: [
          { id: "on", label: "On", isDisabled: true },
          { id: "free", label: "Free" },
        ],
      },
    ];
    expect(states(data, ["on"])).toMatchObject({ on: true, free: false, p: "mixed" });
    expect(states(data, ["on", "free"]).p).toBe(true);
    expect([...getCheckStates(data, new Set()).locked]).toEqual(["on"]);
  });

  it("everything below a disabled node is locked, and a disabled parent shows its own state", () => {
    const data: TreeNode[] = [
      {
        id: "d",
        label: "D",
        isDisabled: true,
        children: [{ id: "d1", label: "D1" }, { id: "d2", label: "D2" }],
      },
    ];
    const result = getCheckStates(data, new Set(["d1", "d2"]));
    expect([...result.locked].sort()).toEqual(["d", "d1", "d2"]);
    // Not aggregated: D is not checked even though both children are.
    expect(result.states.get("d")).toBe(false);
    expect(getCheckStates(data, new Set(["d"])).states.get("d")).toBe(true);
  });

  it("a parent whose children are all disabled shows its own state, not an aggregate", () => {
    const data: TreeNode[] = [
      { id: "p", label: "P", children: [{ id: "c", label: "C", isDisabled: true }] },
    ];
    expect(states(data, ["c"])).toEqual({ p: false, c: true });
    expect(states(data, ["p"])).toEqual({ p: true, c: false });
  });

  it("does not crash with duplicate ids", () => {
    const data: TreeNode[] = [
      { id: "x", label: "X1" },
      { id: "x", label: "X2", children: [{ id: "x", label: "X3" }] },
    ];
    expect(() => getCheckStates(data, new Set(["x"]))).not.toThrow();
  });
});

describe("getCheckedIds", () => {
  it("returns the ids whose state is true, in order", () => {
    const { states: s } = getCheckStates(tree(), new Set(["b1", "b2", "solo"]));
    expect(getCheckedIds(s)).toEqual(["b", "b1", "b2", "solo"]);
  });
});

describe("toggleChecked", () => {
  const none = new Set<string | number>();

  it("checks a parent and all its descendants, then unchecks them", () => {
    const checked = toggleChecked(tree(), none, "b")!;
    expect(checked).toEqual(["b1", "b2"]); // the parent "b" is derived, not listed
    expect(toggleChecked(tree(), new Set(checked), "b")).toEqual([]);
  });

  it("does not list the ancestors that become fully checked (they are derived)", () => {
    expect(toggleChecked(tree(), new Set(["a", "b1"]), "b2")).toEqual(["a", "b1", "b2"]);
    expect(toggleChecked(tree(), new Set(["p", "a", "b", "b1", "b2"]), "b1")).toEqual(["a", "b2"]);
  });

  it("a mixed node gets checked", () => {
    expect(toggleChecked(tree(), new Set(["b1"]), "p")).toEqual(["a", "b1", "b2"]);
  });

  it("a single node without children toggles itself", () => {
    expect(toggleChecked(tree(), none, "solo")).toEqual(["solo"]);
    expect(toggleChecked(tree(), new Set(["solo"]), "solo")).toEqual([]);
  });

  it("returns null for an unknown id and for an empty tree", () => {
    expect(toggleChecked(tree(), none, "nope")).toBeNull();
    expect(toggleChecked([], none, "x")).toBeNull();
  });

  it("is a no-op (null) on a disabled node and on anything below it", () => {
    const data: TreeNode[] = [
      {
        id: "p",
        label: "P",
        children: [
          { id: "d", label: "D", isDisabled: true, children: [{ id: "d1", label: "D1" }] },
        ],
      },
    ];
    expect(toggleChecked(data, none, "d")).toBeNull();
    expect(toggleChecked(data, none, "d1")).toBeNull();
  });

  it("cascade skips a disabled node and its whole subtree, and keeps their state", () => {
    const data: TreeNode[] = [
      {
        id: "p",
        label: "P",
        children: [
          { id: "free", label: "Free" },
          {
            id: "d",
            label: "D",
            isDisabled: true,
            children: [{ id: "d1", label: "D1" }],
          },
          { id: "on", label: "On", isDisabled: true },
        ],
      },
    ];
    // "on" starts checked and stays so; "d1" stays unchecked.
    const checked = toggleChecked(data, new Set(["on"]), "p")!;
    expect(checked).toEqual(["free", "on"]);
    // Uncheck from the parent: "on" is untouched.
    expect(toggleChecked(data, new Set(["free", "on", "d1"]), "p")).toEqual(["d1", "on"]);
  });

  it("a parent shown as mixed only because of a disabled child does not get stuck", () => {
    const data: TreeNode[] = [
      {
        id: "p",
        label: "P",
        children: [{ id: "c", label: "C" }, { id: "d", label: "D", isDisabled: true }],
      },
    ];
    const first = toggleChecked(data, none, "p")!;
    expect(first).toEqual(["c"]);
    expect(getCheckStates(data, new Set(first)).states.get("p")).toBe("mixed");
    expect(toggleChecked(data, new Set(first), "p")).toEqual([]);
  });

  it("a parent with only disabled children toggles its own state", () => {
    const data: TreeNode[] = [
      { id: "p", label: "P", children: [{ id: "c", label: "C", isDisabled: true }] },
    ];
    expect(toggleChecked(data, none, "p")).toEqual(["p"]);
    expect(toggleChecked(data, new Set(["p"]), "p")).toEqual([]);
  });

  it("works on the whole data regardless of what is visible: hidden descendants are included", () => {
    // The helper has no notion of rows: toggling "p" reaches every descendant, however deep.
    expect(toggleChecked(tree(), none, "p")).toEqual(["a", "b1", "b2"]);
  });

  it("drops ids missing from the tree from the result", () => {
    expect(toggleChecked(tree(), new Set(["ghost"]), "solo")).toEqual(["solo"]);
  });

  it("handles a very large subtree in a single pass", () => {
    const children: TreeNode[] = Array.from({ length: 6000 }, (_, i) => ({
      id: `n${i}`,
      label: String(i),
      children: i % 10 === 0 ? [{ id: `m${i}`, label: "m" }] : undefined,
    }));
    const data: TreeNode[] = [{ id: "root", label: "root", children }];
    const started = performance.now();
    const checked = toggleChecked(data, none, "root")!;
    expect(performance.now() - started).toBeLessThan(1000);
    // leaves only: 5400 childless nodes + 600 "m" leaves (the 600 parents and root are derived)
    expect(checked.length).toBe(5400 + 600);
  });

  it("never lists parents with an enabled child, even if they were passed in", () => {
    const out = toggleChecked(tree(), new Set(["p", "b"]), "solo")!;
    expect(out).toEqual(["solo"]);
  });

  it("lists a locked parent only through its own id, children stay listed", () => {
    const data: TreeNode[] = [
      { id: "d", label: "D", isDisabled: true, children: [{ id: "d1", label: "D1" }] },
      { id: "x", label: "X" },
    ];
    expect(toggleChecked(data, new Set(["d", "d1"]), "x")).toEqual(["d", "d1", "x"]);
  });

  it("toggles the first occurrence in pre-order when ids repeat", () => {
    const data: TreeNode[] = [
      { id: "g", label: "G", children: [{ id: "dup", label: "deep", isDisabled: true }] },
      { id: "dup", label: "top" },
    ];
    // the first (disabled) occurrence wins: nothing changes
    expect(toggleChecked(data, new Set(), "dup")).toBeNull();
  });

  it("does not overflow the stack on a very deep chain", () => {
    let node: TreeNode = { id: 0, label: "0" };
    for (let i = 1; i < 3000; i++) node = { id: i, label: String(i), children: [node] };
    // only the single leaf at the bottom is listed
    expect(toggleChecked([node], none, 2999)).toEqual([0]);
  });
});
