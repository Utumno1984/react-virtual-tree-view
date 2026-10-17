// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeView } from "../../src";
import type { TreeNode } from "../../src";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TreeView QA edge cases", () => {
  it("renders a 1000-node tree and expands/collapses it correctly", () => {
    const data: TreeNode[] = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      label: `P${i}`,
      children: Array.from({ length: 49 }, (_, j) => ({ id: `p${i}-${j}`, label: `C${j}` })),
    }));
    const onChange = vi.fn();
    const start = performance.now();
    render(<TreeView data={data} onExpandedChange={onChange} defaultExpandedIds={data.map((d) => d.id)} />);
    expect(screen.getAllByRole("treeitem")).toHaveLength(1000);
    // Only a guard against gross regressions (quadratic behaviour, hangs), not a
    // benchmark: a tight threshold measures machine load, not correctness.
    expect(performance.now() - start).toBeLessThan(15000);
    const last = document.querySelector('[data-node-id="p19-48"]')!;
    expect(last.getAttribute("aria-posinset")).toBe("49");
    expect(last.getAttribute("aria-setsize")).toBe("49");
    fireEvent.click(document.querySelector('[data-node-id="p0"] [data-toggle]')!);
    expect(screen.getAllByRole("treeitem")).toHaveLength(951);
    expect(onChange.mock.calls[0]![0]).toHaveLength(19);
  });

  it("keeps expansion state when re-rendered with new data containing the same ids", () => {
    const mk = (): TreeNode[] => [{ id: "a", label: "A", children: [{ id: "a1", label: "A1" }] }];
    const { rerender } = render(<TreeView data={mk()} />);
    fireEvent.click(document.querySelector('[data-node-id="a"] [data-toggle]')!);
    rerender(<TreeView data={mk()} />);
    expect(screen.getAllByRole("treeitem")).toHaveLength(2);
  });

  it("is safe when defaultExpandedIds references unknown ids or leaves", () => {
    const data: TreeNode[] = [{ id: "a", label: "A" }];
    render(<TreeView data={data} defaultExpandedIds={["zzz", "a"]} />);
    const item = screen.getByRole("treeitem");
    expect(item.hasAttribute("aria-expanded")).toBe(false);
  });
});
