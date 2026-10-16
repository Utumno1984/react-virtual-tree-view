import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const snippets = readFileSync(resolve(root, "tests/types/readme-snippets.tsx"), "utf8");

const blocks = [...readme.matchAll(/```tsx\n([\s\S]*?)```/g)].map((m) => m[1]!);

/** Lines that must exist in the type-checked file: everything but imports, comments and blanks. */
function codeLines(block: string): string[] {
  const lines = block.split("\n");
  const out: string[] = [];
  let inImport = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (inImport) {
      if (/\bfrom\s*["']/.test(line)) inImport = false;
      continue;
    }
    if (line.startsWith("import ")) {
      inImport = !/\bfrom\s*["']/.test(line);
      continue;
    }
    if (line === "" || line.startsWith("//")) continue;
    out.push(line.replace(/^export\s+/, ""));
  }
  return out;
}

const snippetLines = new Set(
  snippets.split("\n").map((l) => l.trim().replace(/^export\s+/, "")),
);

describe("README snippets", () => {
  it("has TypeScript snippets", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(6);
  });

  it("import from the published package name", () => {
    for (const block of blocks) {
      expect(block).not.toMatch(/from ["']\.\.?\//);
    }
  });

  blocks.forEach((block, i) => {
    it(`snippet #${i + 1} is type-checked in tests/types/readme-snippets.tsx`, () => {
      // `files` is shared context declared by the first snippet and reused by later ones.
      const missing = codeLines(block).filter((line) => !snippetLines.has(line));
      expect(missing).toEqual([]);
    });
  });

  it("documents the required sections and props", () => {
    for (const heading of ["## Installation", "## Props", "## Helpers", "## Storybook"]) {
      expect(readme).toContain(heading);
    }
    for (const prop of [
      "searchQuery", "selectedId", "defaultSelectedId", "onSelect",
      "maxDepth", "rowHeight", "onTreeChange", "autoScroll",
    ]) {
      expect(readme).toMatch(new RegExp(`\\| \`${prop}\``));
    }
    for (const name of [
      "TreeView", "DraggableTreeView", "TreeContextMenu", "flattenTree", "getProjection",
      "getDropTarget", "getSiblingDropTarget", "calculateNewParent", "moveNode",
      "getSubtreeHeight", "getAncestorIds", "findDuplicateIds",
    ]) {
      expect(readme).toContain(name);
    }
    expect(readme).toContain("`top`");
    expect(readme).toContain("@dnd-kit/core");
  });
});
