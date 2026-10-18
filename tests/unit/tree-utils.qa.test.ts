import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";
import { flattenTree, getProjection, moveNode } from "../../src";

const n = (id: string | number, children?: TreeNode[]): TreeNode => ({
  id,
  label: String(id),
  ...(children ? { children } : {}),
});
const sample = (): TreeNode[] => [n("a", [n("b", [n("c")]), n("d")]), n("e", [n("f")]), n("g")];
const ALL = ["a", "b", "c", "d", "e", "f", "g"];
const flat = () => flattenTree(sample(), ALL);

describe("QA: tree-utils extra cases", () => {
  it("moveNode: negative index clamps to 0, huge index to end", () => {
    expect(moveNode(sample(), "g", "a", -5).tree[0]!.children!.map((x) => x.id)).toEqual(["g", "b", "d"]);
    expect(moveNode(sample(), "g", "a", 99).tree[0]!.children!.map((x) => x.id)).toEqual(["b", "d", "g"]);
  });
  it("moveNode: result reports fromParentId and does not mutate the input", () => {
    const t = sample();
    const copy = structuredClone(t);
    const r = moveNode(t, "b", "e", 0);
    expect(r.fromParentId).toBe("a");
    expect(r.toParentId).toBe("e");
    expect(r.index).toBe(0);
    expect(t).toEqual(copy);
    expect(r.tree[1]!.children!.map((x) => x.id)).toEqual(["b", "f"]);
    expect(r.tree[0]!.children!.map((x) => x.id)).toEqual(["d"]);
  });
  it("moveNode: moving a nested node to the root", () => {
    const r = moveNode(sample(), "c", null, 0);
    expect(r.tree.map((x) => x.id)).toEqual(["c", "a", "e", "g"]);
  });
  it("moveNode: unknown toParentId with existing node returns same reference", () => {
    const t = sample();
    expect(moveNode(t, "a", "zzz", 0).tree).toBe(t);
  });
  it("moveNode: numeric id 0 as parent", () => {
    const t = [n(0, [n(1)]), n(2)];
    const r = moveNode(t, 2, 0, 0);
    expect(r.tree[0]!.children!.map((x) => x.id)).toEqual([2, 1]);
  });
  it("getProjection: depth is never negative, whatever the zone", () => {
    for (const zone of ["before", "inside", "after"] as const) {
      const p = getProjection(flat(), "c", "a", zone)!;
      expect(p.depth).toBeGreaterThanOrEqual(0);
      expect(p.depth).toBe(p.minDepth);
    }
  });
  it("getProjection: no maxDepth never clamps", () => {
    const p = getProjection(flat(), "g", "c", "inside")!;
    expect(p.clamped).toBe(false);
    expect(p.depth).toBe(p.maxDepth);
  });
  it("getProjection: a huge maxDepth refuses nothing and does not clamp", () => {
    const p = getProjection(flat(), "g", "c", "inside", 99)!;
    expect(p.clamped).toBe(false);
  });
  it("getProjection: first position gives parent null", () => {
    const p = getProjection(flat(), "g", "a", "before")!;
    expect(p.depth).toBe(0);
    expect(p.parentId).toBeNull();
  });
  it("getProjection: maxDepth 0 allows only root-level drops", () => {
    const p = getProjection(flat(), "c", "g", "after", 0)!;
    expect(p.depth).toBe(0);
    expect(p.parentId).toBeNull();
    // the lower band of an expanded row is its first-child zone: depth 1, refused
    expect(getProjection(flat(), "g", "a", "after", 0)).toBeNull();
    expect(getProjection(flat(), "g", "a", "inside", 0)).toBeNull();
  });
  it("moveNode: duplicate ids among siblings never lose a node", () => {
    const tree: TreeNode[] = [
      { id: "x", label: "one" },
      { id: "y", label: "y" },
      { id: "x", label: "two" },
    ];
    const result = moveNode(tree, "x", null, 1);
    expect(result.tree).toHaveLength(3);
    expect(result.tree.map((n) => n.label).sort()).toEqual(["one", "two", "y"]);
  });
  it("getProjection: over a descendant of active does not throw", () => {
    expect(() => getProjection(flat(), "a", "b", "inside")).not.toThrow();
    expect(getProjection(flat(), "a", "b", "inside")).toBeNull();
  });
});
