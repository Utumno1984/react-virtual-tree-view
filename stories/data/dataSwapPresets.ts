import type { TreeNode } from "../../src/types";
import { generateTree } from "./generateTree";

export type DatasetName = "small" | "large" | "deep" | "empty" | "single" | "variant";

export const DATASET_NAMES: DatasetName[] = [
  "small",
  "large",
  "deep",
  "empty",
  "single",
  "variant",
];

/** Depth of the `deep` preset (roots are 0): every chain goes down to this level. */
export const DEEP_LEVELS = 6;

function smallTree(): TreeNode[] {
  return [
    {
      id: "a-docs",
      label: "Documents",
      children: [
        { id: "a-cv", label: "CV.pdf" },
        {
          id: "a-reports",
          label: "Reports",
          children: [
            { id: "a-q1", label: "Q1.xlsx" },
            { id: "a-q2", label: "Q2.xlsx" },
          ],
        },
        { id: "a-notes", label: "notes.txt" },
      ],
    },
    {
      id: "a-pics",
      label: "Pictures",
      children: [
        { id: "a-holiday", label: "Holiday.png" },
        { id: "a-logo", label: "Logo.svg" },
      ],
    },
    {
      id: "a-music",
      label: "Music",
      children: [
        { id: "a-song1", label: "Song one.mp3" },
        { id: "a-song2", label: "Song two.mp3" },
      ],
    },
    { id: "a-readme", label: "README.md" },
    { id: "a-todo", label: "todo.txt" },
    { id: "a-locked", label: "Locked", isDisabled: true },
    { id: "a-tmp", label: "Tmp" },
  ];
}

/**
 * Same ids as `small` (`a-`), different content: renamed labels, some nodes gone (`a-q2`,
 * `a-notes`, `a-music`...) and a new root. Ids kept here keep their selection/expansion;
 * ids missing here lose them.
 */
function variantTree(): TreeNode[] {
  return [
    {
      id: "a-docs",
      label: "Documents (v2)",
      children: [
        { id: "a-cv", label: "CV (updated).pdf" },
        {
          id: "a-reports",
          label: "Reports (v2)",
          children: [{ id: "a-q1", label: "Q1 (revised).xlsx" }],
        },
      ],
    },
    {
      id: "a-pics",
      label: "Pictures (v2)",
      children: [{ id: "a-logo", label: "Logo (new).svg" }],
    },
    { id: "a-readme", label: "README (v2).md" },
    { id: "a-new", label: "Brand new node" },
  ];
}

/** Narrow and deep: 3 roots, each a chain down to level `DEEP_LEVELS`, with a leaf per level. */
function deepTree(): TreeNode[] {
  return [0, 1, 2].map((r) => {
    let child: TreeNode = {
      id: `c-${r}-${DEEP_LEVELS}`,
      label: `Level ${DEEP_LEVELS} of chain ${r}`,
    };
    for (let level = DEEP_LEVELS - 1; level >= 0; level--) {
      child = {
        id: `c-${r}-${level}`,
        label: `Level ${level} of chain ${r}`,
        children: [child, { id: `c-${r}-${level}-leaf`, label: `Leaf ${level} of chain ${r}` }],
      };
    }
    return child;
  });
}

/** Always returns a brand new tree: the stories recreate the preset on every swap. */
export function createDataset(name: DatasetName): TreeNode[] {
  switch (name) {
    case "small":
      return smallTree();
    case "large":
      return generateTree({
        count: 1200,
        maxDepth: 4,
        seed: 5,
        idPrefix: "b-",
        disabledRatio: 0.02,
      });
    case "deep":
      return deepTree();
    case "single":
      return [{ id: "d-solo", label: "Only node" }];
    case "variant":
      return variantTree();
    case "empty":
      return [];
  }
}

export function flattenIds(
  nodes: TreeNode[],
  out: Array<string | number> = [],
): Array<string | number> {
  for (const n of nodes) {
    out.push(n.id);
    if (n.children) flattenIds(n.children, out);
  }
  return out;
}
