import type { TreeNode } from "../../src/types";

export interface GenerateTreeOptions {
  /** Total number of nodes in the whole tree (not only roots). */
  count: number;
  /** Maximum depth of any node; roots have depth 0. */
  maxDepth: number;
  /** Seed of the PRNG: same options, same tree. */
  seed?: number;
  /** Fraction (0..1) of nodes flagged `isDisabled: true`. Default 0. */
  disabledRatio?: number;
}

/** Small seeded PRNG (mulberry32): returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROOT_PROBABILITY = 0.08;

/**
 * Deterministic tree generator shared by stories, unit tests and e2e tests.
 * Runs in O(count). Ids are unique (`node-<n>`), labels are never empty.
 */
export function generateTree({
  count,
  maxDepth,
  seed = 1,
  disabledRatio = 0,
}: GenerateTreeOptions): TreeNode[] {
  const total = Math.max(0, Math.floor(count));
  const rand = mulberry32(seed);
  const roots: TreeNode[] = [];
  // Nodes that can still accept children (depth < maxDepth), with their depth.
  const candidates: { node: TreeNode; depth: number }[] = [];

  for (let i = 0; i < total; i++) {
    const node: TreeNode = { id: `node-${i}`, label: `Node ${i}` };
    if (disabledRatio > 0 && rand() < disabledRatio) node.isDisabled = true;

    let depth = 0;
    if (candidates.length === 0 || rand() < ROOT_PROBABILITY) {
      roots.push(node);
    } else {
      const parent = candidates[Math.floor(rand() * candidates.length)]!;
      (parent.node.children ??= []).push(node);
      depth = parent.depth + 1;
    }
    if (depth < maxDepth) candidates.push({ node, depth });
  }
  return roots;
}
