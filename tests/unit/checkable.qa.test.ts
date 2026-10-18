import { describe, expect, it } from "vitest";
import { getCheckStates, toggleChecked } from "../../src";
import type { TreeNode } from "../../src";

function big(): TreeNode[] {
  const roots: TreeNode[] = [];
  for (let r = 0; r < 10; r++) {
    const kids: TreeNode[] = [];
    for (let c = 0; c < 50; c++) {
      const leaves: TreeNode[] = [];
      for (let l = 0; l < 10; l++) leaves.push({ id: `r${r}c${c}l${l}`, label: "x" });
      kids.push({ id: `r${r}c${c}`, label: "x", children: leaves });
    }
    roots.push({ id: `r${r}`, label: "x", children: kids });
  }
  return roots;
}

describe("checkable QA (large and degenerate trees)", () => {
  it("5500-node tree: toggling the root is one fast, consistent pass", () => {
    const data = big();
    const t = performance.now();
    const next = toggleChecked(data, new Set(), "r0")!;
    const ms = performance.now() - t;
    expect(next.length).toBe(1 + 50 + 500);
    expect(toggleChecked(data, new Set(next), "r0")).toEqual([]);
    expect(getCheckStates(data, new Set(next)).states.get("r1")).toBe(false);
    expect(ms).toBeLessThan(500);
  });

  it("empty tree and unknown id", () => {
    expect(toggleChecked([], new Set(), "a")).toBeNull();
    expect(getCheckStates([], new Set()).states.size).toBe(0);
  });
});
