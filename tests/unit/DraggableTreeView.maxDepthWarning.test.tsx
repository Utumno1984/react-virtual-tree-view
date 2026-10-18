// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TreeNode } from "../../src";
import { DraggableTreeView } from "../../src";
import * as treeUtils from "../../src/tree-utils";

vi.mock("../../src/tree-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/tree-utils")>();
  return { ...actual, getTreeHeight: vi.fn(actual.getTreeHeight) };
});

const flat: TreeNode[] = [{ id: "q", label: "Other" }];
const deep: TreeNode[] = [
  { id: "a", label: "a", children: [{ id: "b", label: "b", children: [{ id: "c", label: "c" }] }] },
];
const clone = (d: TreeNode[]) => JSON.parse(JSON.stringify(d)) as TreeNode[];

// Omitted maxDepth means 1; an explicit `undefined` really means "no limit".
const view = (data: TreeNode[], ...rest: [maxDepth?: number | undefined]) => (
  <DraggableTreeView data={data} maxDepth={rest.length ? rest[0] : 1} height={400} rowHeight={32} />
);
const exceeds = (w: { mock: { calls: unknown[][] } }) =>
  w.mock.calls.filter((c) => String(c[0]).includes("exceeds maxDepth")).length;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(treeUtils.getTreeHeight).mockClear();
});

describe("DraggableTreeView: maxDepth warning when data changes", () => {
  it("warns once when data is replaced by a deeper tree", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(view(flat));
    expect(warn).not.toHaveBeenCalled();
    rerender(view(deep));
    expect(exceeds(warn)).toBe(1);
    expect(String(warn.mock.calls[0]![0])).toContain("(1)");
  });

  it("warns once on mount when data already exceeds the limit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(view(deep));
    expect(exceeds(warn)).toBe(1);
  });

  it("does not repeat for the same data or new identities with the same excess", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(view(deep));
    rerender(view(deep));
    rerender(view(clone(deep)));
    rerender(view([...deep]));
    expect(exceeds(warn)).toBe(1);
  });

  it("warns once under StrictMode", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(<StrictMode>{view(flat)}</StrictMode>);
    rerender(<StrictMode>{view(deep)}</StrictMode>);
    rerender(<StrictMode>{view(clone(deep))}</StrictMode>);
    expect(exceeds(warn)).toBe(1);
  });

  it("re-arms after data returns within the limit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(view(deep));
    rerender(view(flat));
    rerender(view(deep));
    expect(exceeds(warn)).toBe(2);
  });

  it("handles rapid sequential replacements (empty, single node, deep)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(view([]));
    rerender(view(deep));
    rerender(view([]));
    rerender(view(deep));
    rerender(view(flat));
    rerender(view(deep));
    rerender(view(deep));
    expect(exceeds(warn)).toBe(3);
  });

  it("maxDepth 0: a single level is within the limit, nested is not", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(view(flat, 0));
    expect(warn).not.toHaveBeenCalled();
    rerender(view(deep, 0));
    expect(exceeds(warn)).toBe(1);
  });

  it("does no height check for undefined maxDepth; invalid maxDepth warns once, not duplicated", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(view(deep, undefined));
    rerender(view(clone(deep), undefined));
    expect(warn).not.toHaveBeenCalled();
    rerender(view(deep, -1));
    rerender(view(clone(deep), -1));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("Invalid maxDepth");
  });

  it("computes the height only when data or maxDepth change", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const spy = vi.mocked(treeUtils.getTreeHeight);
    const { rerender } = render(view(deep));
    const calls = spy.mock.calls.length;
    rerender(view(deep));
    rerender(view(deep));
    expect(spy.mock.calls.length).toBe(calls);
    rerender(view(clone(deep)));
    expect(spy.mock.calls.length).toBe(calls + 1);
    rerender(view(deep, 2));
    expect(spy.mock.calls.length).toBe(calls + 2);
  });

  it("is silent in production and skips the height computation", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(view(flat));
    rerender(view(deep));
    rerender(view(deep, -1));
    expect(warn).not.toHaveBeenCalled();
    expect(treeUtils.getTreeHeight).not.toHaveBeenCalled();
  });

  it("renders data beyond the limit as is", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(<DraggableTreeView data={flat} maxDepth={1} defaultExpandedIds={["a", "b"]} height={400} rowHeight={32} />);
    rerender(<DraggableTreeView data={deep} maxDepth={1} defaultExpandedIds={["a", "b"]} height={400} rowHeight={32} />);
    expect(document.querySelector('[data-node-id="a"]')).not.toBeNull();
  });
});
