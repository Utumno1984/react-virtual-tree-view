import type { TreeNode } from "../../src/types";

/** Realistic per-node metadata used by the NodeMetadata stories. */
export interface FileMeta {
  owner: string;
  status: "draft" | "review" | "published";
  sizeBytes: number;
  /** ISO 8601 date (UTC). */
  updatedAt: string;
}

const OWNERS = ["alice", "bob", "carla", "dario", "elena"] as const;
const STATUSES = ["draft", "review", "published"] as const;
const BASE_TIME = Date.UTC(2025, 0, 1);
const DAY_MS = 86_400_000;

export interface GenerateTreeOptions {
  /** Total number of nodes in the whole tree (not only roots). */
  count: number;
  /** Maximum depth of any node; roots have depth 0. */
  maxDepth: number;
  /** Seed of the PRNG: same options, same tree. */
  seed?: number;
  /** Fraction (0..1) of nodes flagged `isDisabled: true`. Default 0. */
  disabledRatio?: number;
  /** Attach a deterministic `FileMeta` to every node's `data`. Default false (no `data`). */
  withData?: boolean;
  /** Prefix of every node id (`<idPrefix><n>`); gives several trees disjoint id spaces. Default `node-`. */
  idPrefix?: string;
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
 * Runs in O(count). Ids are unique (`<idPrefix><n>`, default `node-<n>`), labels are never empty.
 */
export function generateTree(
  options: GenerateTreeOptions & { withData: true },
): TreeNode<FileMeta>[];
export function generateTree(options: GenerateTreeOptions): TreeNode[];
export function generateTree({
  count,
  maxDepth,
  seed = 1,
  disabledRatio = 0,
  withData = false,
  idPrefix = "node-",
}: GenerateTreeOptions): TreeNode<FileMeta>[] {
  const total = Math.max(0, Math.floor(count));
  const rand = mulberry32(seed);
  // Independent stream for `isDisabled`, so the tree shape does not depend on `disabledRatio`.
  const randDisabled = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  // Independent stream for `data`, so neither the shape nor `isDisabled` depend on `withData`.
  const randData = mulberry32((seed ^ 0x85ebca6b) >>> 0);
  const roots: TreeNode<FileMeta>[] = [];
  // Nodes that can still accept children (depth < maxDepth), with their depth.
  const candidates: { node: TreeNode<FileMeta>; depth: number }[] = [];

  for (let i = 0; i < total; i++) {
    const node: TreeNode<FileMeta> = { id: `${idPrefix}${i}`, label: `Node ${i}` };
    if (withData) {
      node.data = {
        owner: OWNERS[Math.floor(randData() * OWNERS.length)]!,
        status: STATUSES[Math.floor(randData() * STATUSES.length)]!,
        sizeBytes: Math.floor(randData() * 5_000_000),
        updatedAt: new Date(BASE_TIME + Math.floor(randData() * 365) * DAY_MS).toISOString(),
      };
    }
    if (disabledRatio > 0 && randDisabled() < disabledRatio) node.isDisabled = true;

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
