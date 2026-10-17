import { describe, expect, it } from "vitest";
import type { TreeNode } from "../../src";
import { generateTree, type FileMeta } from "../../stories/data/generateTree";

function walk(nodes: TreeNode[], depth = 0, out: { node: TreeNode; depth: number }[] = []) {
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children) walk(node.children, depth + 1, out);
  }
  return out;
}

describe("generateTree", () => {
  it("is deterministic and yields exactly `count` nodes", () => {
    const a = generateTree({ count: 1000, maxDepth: 5, seed: 42 });
    const b = generateTree({ count: 1000, maxDepth: 5, seed: 42 });
    expect(a).toEqual(b);
    expect(walk(a)).toHaveLength(1000);
  });

  it("differs with a different seed", () => {
    expect(generateTree({ count: 200, maxDepth: 5, seed: 1 })).not.toEqual(
      generateTree({ count: 200, maxDepth: 5, seed: 2 }),
    );
  });

  it("produces unique ids, non-empty labels and respects maxDepth", () => {
    const flat = walk(generateTree({ count: 1000, maxDepth: 5, seed: 42 }));
    expect(new Set(flat.map((e) => e.node.id)).size).toBe(flat.length);
    expect(flat.every((e) => e.node.label.length > 0)).toBe(true);
    expect(Math.max(...flat.map((e) => e.depth))).toBeLessThanOrEqual(5);
  });

  it("actually uses depth (tree is not flat)", () => {
    const flat = walk(generateTree({ count: 1000, maxDepth: 5, seed: 42 }));
    expect(Math.max(...flat.map((e) => e.depth))).toBeGreaterThan(1);
  });

  it("count 0 returns an empty array", () => {
    expect(generateTree({ count: 0, maxDepth: 5 })).toEqual([]);
  });

  it("count 1 returns a single root without children", () => {
    const tree = generateTree({ count: 1, maxDepth: 5 });
    expect(tree).toHaveLength(1);
    expect(tree[0]).not.toHaveProperty("children");
  });

  it("maxDepth 0 makes every node a root", () => {
    const tree = generateTree({ count: 50, maxDepth: 0, seed: 7 });
    expect(tree).toHaveLength(50);
    expect(tree.every((n) => n.children === undefined)).toBe(true);
  });

  it("does not disable nodes by default", () => {
    const flat = walk(generateTree({ count: 500, maxDepth: 4, seed: 3 }));
    expect(flat.some((e) => e.node.isDisabled)).toBe(false);
  });

  it("disables about `disabledRatio` of the nodes", () => {
    const flat = walk(generateTree({ count: 2000, maxDepth: 4, seed: 11, disabledRatio: 0.25 }));
    const ratio = flat.filter((e) => e.node.isDisabled).length / flat.length;
    expect(Math.abs(ratio - 0.25)).toBeLessThan(0.05);
  });

  it("keeps the same ids and structure regardless of disabledRatio", () => {
    const strip = (nodes: TreeNode[]): unknown[] =>
      nodes.map((n) => ({ id: n.id, children: n.children ? strip(n.children) : undefined }));
    const plain = generateTree({ count: 500, maxDepth: 5, seed: 42, disabledRatio: 0 });
    const withDisabled = generateTree({ count: 500, maxDepth: 5, seed: 42, disabledRatio: 0.3 });
    expect(strip(withDisabled)).toEqual(strip(plain));
    expect(walk(withDisabled).some((e) => e.node.isDisabled)).toBe(true);
  });

  describe("withData", () => {
    it("is deterministic, data included, for the same seed", () => {
      const a = generateTree({ count: 500, maxDepth: 4, seed: 9, withData: true });
      const b = generateTree({ count: 500, maxDepth: 4, seed: 9, withData: true });
      expect(a).toEqual(b);
    });

    it("attaches well-formed data to every node", () => {
      const flat = walk(generateTree({ count: 500, maxDepth: 4, seed: 9, withData: true }));
      for (const { node } of flat) {
        const d = node.data as FileMeta;
        expect(d.owner.length).toBeGreaterThan(0);
        expect(["draft", "review", "published"]).toContain(d.status);
        expect(Number.isInteger(d.sizeBytes) && d.sizeBytes >= 0).toBe(true);
        expect(Number.isNaN(Date.parse(d.updatedAt))).toBe(false);
      }
    });

    it("varies data across seeds", () => {
      expect(generateTree({ count: 50, maxDepth: 3, seed: 1, withData: true })).not.toEqual(
        generateTree({ count: 50, maxDepth: 3, seed: 2, withData: true }),
      );
    });

    it("leaves shape, ids and isDisabled unchanged; without it there is no data", () => {
      const opts = { count: 500, maxDepth: 5, seed: 42, disabledRatio: 0.2 };
      const plain = generateTree(opts);
      const withData = generateTree({ ...opts, withData: true });
      const strip = (nodes: TreeNode[]): unknown[] =>
        nodes.map((n) => ({
          id: n.id,
          isDisabled: n.isDisabled,
          children: n.children ? strip(n.children) : undefined,
        }));
      expect(strip(withData)).toEqual(strip(plain));
      expect(walk(plain).some((e) => "data" in e.node)).toBe(false);
    });
  });

  it("generates 5000 nodes in under 500 ms", () => {
    const start = performance.now();
    const tree = generateTree({ count: 5000, maxDepth: 6, seed: 5 });
    expect(performance.now() - start).toBeLessThan(500);
    expect(walk(tree)).toHaveLength(5000);
  });
});
