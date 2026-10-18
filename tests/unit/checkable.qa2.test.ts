import { describe, expect, it } from "vitest";
import { getCheckStates, toggleChecked } from "../../src";
import type { TreeNode } from "../../src";

describe("checkable QA round 2 (parent ids in input, disabled mixes)", () => {
  const tree = (): TreeNode[] => [
    {
      id: "p",
      label: "P",
      children: [
        { id: "a", label: "A" },
        { id: "dis", label: "D", isDisabled: true },
        {
          id: "b",
          label: "B",
          children: [
            { id: "b1", label: "B1" },
            { id: "b2", label: "B2" },
          ],
        },
      ],
    },
    { id: "allDis", label: "AD", children: [{ id: "x", label: "X", isDisabled: true }] },
    { id: "disParent", label: "DP", isDisabled: true, children: [{ id: "dp1", label: "DP1" }] },
  ];

  it("a parent id passed with only some descendants is derived (mixed), never true", () => {
    const { states } = getCheckStates(tree(), new Set(["p", "a", "b"]));
    expect(states.get("p")).toBe("mixed");
    expect(states.get("b")).toBe(false);
  });

  it("a parent id alone does not check descendants", () => {
    const { states } = getCheckStates(tree(), new Set(["p"]));
    expect(states.get("p")).toBe(false);
    expect(states.get("a")).toBe(false);
  });

  it("checked disabled child counts: parent becomes true, payload lists the disabled one", () => {
    const out = toggleChecked(tree(), new Set(["dis"]), "p")!;
    expect(new Set(out)).toEqual(new Set(["dis", "a", "b1", "b2"]));
    expect(getCheckStates(tree(), new Set(out)).states.get("p")).toBe(true);
  });

  it("unchecked disabled child keeps the parent mixed after checking everything else", () => {
    const out = toggleChecked(tree(), new Set(), "p")!;
    expect(new Set(out)).toEqual(new Set(["a", "b1", "b2"]));
    expect(getCheckStates(tree(), new Set(out)).states.get("p")).toBe("mixed");
  });

  it("parent with all children disabled shows its own state", () => {
    expect(getCheckStates(tree(), new Set(["allDis"])).states.get("allDis")).toBe(true);
    expect(getCheckStates(tree(), new Set()).states.get("allDis")).toBe(false);
  });

  it("disabled parent: cascade and clicks blocked", () => {
    expect(toggleChecked(tree(), new Set(), "disParent")).toBeNull();
    expect(toggleChecked(tree(), new Set(), "dp1")).toBeNull();
  });

  it("round trip returns to empty", () => {
    const first = toggleChecked(tree(), new Set(), "b")!;
    expect(toggleChecked(tree(), new Set(first), "b")).toEqual([]);
  });
});
