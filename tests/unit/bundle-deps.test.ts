import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const ALLOWED = ["react", "@dnd-kit/core"];

/** Specifiers of every static import, re-export, dynamic import and require() in a bundle. */
function externalModules(source: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g, // import x from "m" / export * from "m"
    /\bimport\s*["']([^"']+)["']/g, // import "m"
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, // import("m")
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, // require("m")
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const spec = match[1]!;
      if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("node:")) found.add(spec);
    }
  }
  return [...found].sort();
}

/** `react/jsx-runtime` belongs to `react`; `@dnd-kit/core/x` to `@dnd-kit/core`. */
function packageName(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function unexpected(source: string): string[] {
  return externalModules(source).filter((spec) => !ALLOWED.includes(packageName(spec)));
}

/**
 * tsup copies (inlines) any dependency that is not `external`, so a devDependency used by
 * mistake never shows up as an import. Its files do show up in the source map `sources`
 * and as `// node_modules/...` comments: every source must live inside the project's `src/`.
 */
function inlinedSources(sourceMapJson: string, bundle: string): string[] {
  const map = JSON.parse(sourceMapJson) as { sources?: string[] };
  const bad = (map.sources ?? []).filter((s) => s.includes("node_modules") || !/(^|\/)src\//.test(s));
  const comments = [...bundle.matchAll(/^\s*\/\/ (\S*node_modules\/\S*)/gm)].map((m) => m[1]!);
  return [...new Set([...bad, ...comments])].sort();
}

describe("bundle contents (nothing inlined from node_modules)", () => {
  for (const file of ["dist/index.js", "dist/index.cjs"]) {
    it(`${file} inlines no third-party code`, () => {
      const path = resolve(root, file);
      expect(existsSync(path), `${file} is missing: run "npm run build" first`).toBe(true);
      expect(existsSync(`${path}.map`), `${file}.map is missing: enable sourcemap in tsup`).toBe(true);
      const map = readFileSync(`${path}.map`, "utf8");
      expect((JSON.parse(map) as { sources: string[] }).sources.length).toBeGreaterThan(0);
      expect(inlinedSources(map, readFileSync(path, "utf8"))).toEqual([]);
    });
  }

  it("the detector flags a node_modules source in a source map", () => {
    const dirty = JSON.stringify({ sources: ["../src/TreeView.tsx", "../node_modules/lucide-react/dist/esm/icons/x.js"] });
    expect(inlinedSources(dirty, "")).toEqual(["../node_modules/lucide-react/dist/esm/icons/x.js"]);
  });

  it("the detector flags a node_modules comment in the bundle", () => {
    const clean = JSON.stringify({ sources: ["../src/a.ts"] });
    expect(inlinedSources(clean, "// node_modules/@radix-ui/react-tooltip/dist/index.mjs\nvar a;")).toEqual([
      "node_modules/@radix-ui/react-tooltip/dist/index.mjs",
    ]);
  });

  it("the detector flags sources outside src/", () => {
    expect(inlinedSources(JSON.stringify({ sources: ["../other/x.ts"] }), "")).toEqual(["../other/x.ts"]);
  });

  it("the detector accepts a clean source map", () => {
    const clean = JSON.stringify({ sources: ["../src/TreeView.tsx", "../src/tree-utils.ts"] });
    expect(inlinedSources(clean, "// src/TreeView.tsx\nvar a;")).toEqual([]);
  });
});

describe("bundle dependencies", () => {
  for (const file of ["dist/index.js", "dist/index.cjs"]) {
    it(`${file} only imports the peer dependencies`, () => {
      const path = resolve(root, file);
      expect(existsSync(path), `${file} is missing: run "npm run build" first`).toBe(true);
      const modules = externalModules(readFileSync(path, "utf8"));
      expect(modules).toContain("react");
      expect(modules).toContain("@dnd-kit/core");
      expect(unexpected(readFileSync(path, "utf8"))).toEqual([]);
    });
  }

  it("the detector flags extra modules in ESM, CJS and dynamic forms", () => {
    expect(unexpected('import { X } from "lucide-react";')).toEqual(["lucide-react"]);
    expect(unexpected('import "tailwindcss";')).toEqual(["tailwindcss"]);
    expect(unexpected('const a = require("@radix-ui/react-tooltip");')).toEqual(["@radix-ui/react-tooltip"]);
    expect(unexpected('const a = await import("lodash");')).toEqual(["lodash"]);
    expect(unexpected('export * from "clsx";')).toEqual(["clsx"]);
  });

  it("the detector accepts react sub-paths and ignores relative imports", () => {
    const ok = 'import { jsx } from "react/jsx-runtime"; import a from "react"; import { b } from "@dnd-kit/core"; import c from "./c.js";';
    expect(unexpected(ok)).toEqual([]);
    expect(unexpected('import x from "react-dom";')).toEqual(["react-dom"]);
    expect(unexpected('import x from "@dnd-kit/utilities";')).toEqual(["@dnd-kit/utilities"]);
  });
});

describe("package.json", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  it("has no runtime dependencies", () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });

  it("has only react and @dnd-kit/core as peer dependencies", () => {
    expect(Object.keys(pkg.peerDependencies ?? {}).sort()).toEqual(["@dnd-kit/core", "react"]);
  });
});
