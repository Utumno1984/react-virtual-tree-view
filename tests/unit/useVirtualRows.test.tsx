// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeView } from "../../src";
import type { TreeNode, TreeViewHandle } from "../../src";
import { computeRange } from "../../src/useVirtualRows";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const flat = (n: number): TreeNode[] =>
  Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `N${i}` }));

const items = () => screen.queryAllByRole("treeitem");
const firstIndex = () => Number(items()[0]!.getAttribute("data-node-id")!.slice(1));
const tree = () => screen.getByRole("tree");

describe("computeRange", () => {
  it("covers the visible rows plus overscan on both sides", () => {
    expect(computeRange(0, 400, 32, 5, 1000)).toEqual({ start: 0, end: 18 });
    expect(computeRange(3200, 400, 32, 5, 1000)).toEqual({ start: 95, end: 118 });
  });
  it("clamps to the list and handles empty lists", () => {
    expect(computeRange(99999, 400, 32, 5, 100)).toEqual({ start: 82, end: 100 });
    expect(computeRange(0, 400, 32, 5, 0)).toEqual({ start: 0, end: 0 });
  });
  it("renders everything while the viewport is unmeasured", () => {
    expect(computeRange(0, 0, 32, 5, 50)).toEqual({ start: 0, end: 50 });
  });
  it("changes the extra rows with overscan", () => {
    expect(computeRange(3200, 400, 32, 0, 1000)).toEqual({ start: 100, end: 113 });
    expect(computeRange(3200, 400, 32, 10, 1000)).toEqual({ start: 90, end: 123 });
  });
});

describe("TreeView virtualization", () => {
  it("renders at most ceil(h/rowHeight) + 2*overscan rows (aligned scroll)", () => {
    render(<TreeView data={flat(1000)} height={400} rowHeight={32} />);
    expect(items().length).toBeLessThanOrEqual(Math.ceil(400 / 32) + 2 * 5);
    fireEvent.scroll(tree(), { target: { scrollTop: 3200 } });
    expect(items().length).toBeLessThanOrEqual(Math.ceil(400 / 32) + 2 * 5);
    expect(items().length).toBeGreaterThan(13);
  });

  it("sizes the inner container to rows * rowHeight", () => {
    render(<TreeView data={flat(1000)} height={400} rowHeight={32} />);
    expect((tree().firstElementChild as HTMLElement).style.height).toBe("32000px");
  });

  it("has an inner height of 0 and no rows for an empty tree", () => {
    render(<TreeView data={[]} height={400} />);
    expect((tree().firstElementChild as HTMLElement).style.height).toBe("0px");
    expect(items()).toHaveLength(0);
  });

  it("positions rows with top and no transform", () => {
    render(<TreeView data={flat(100)} height={400} rowHeight={20} />);
    fireEvent.scroll(tree(), { target: { scrollTop: 1000 } });
    for (const el of items()) {
      const index = Number(el.getAttribute("data-node-id")!.slice(1));
      expect(el.style.position).toBe("absolute");
      expect(el.style.top).toBe(`${index * 20}px`);
      expect(el.style.transform).toBe("");
      expect(el.getAttribute("style")).not.toContain("transform");
    }
  });

  it("follows the scroll position", () => {
    render(<TreeView data={flat(1000)} height={400} rowHeight={32} overscan={5} />);
    fireEvent.scroll(tree(), { target: { scrollTop: 16000 } });
    expect(firstIndex()).toBe(500 - 5);
  });

  it("changes the rendered extra rows with overscan", () => {
    const { rerender } = render(
      <TreeView data={flat(1000)} height={400} rowHeight={32} overscan={0} />,
    );
    fireEvent.scroll(tree(), { target: { scrollTop: 3200 } });
    expect(firstIndex()).toBe(100);
    rerender(<TreeView data={flat(1000)} height={400} rowHeight={32} overscan={10} />);
    expect(firstIndex()).toBe(90);
  });

  it("keeps aria-setsize / aria-posinset relative to the real siblings", () => {
    render(<TreeView data={flat(1000)} height={400} rowHeight={32} />);
    fireEvent.scroll(tree(), { target: { scrollTop: 16000 } });
    const el = document.querySelector('[data-node-id="n500"]')!;
    expect(el.getAttribute("aria-posinset")).toBe("501");
    expect(el.getAttribute("aria-setsize")).toBe("1000");
  });

  it("does not call getBoundingClientRect on scroll", () => {
    render(<TreeView data={flat(1000)} height={400} rowHeight={32} />);
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect");
    fireEvent.scroll(tree(), { target: { scrollTop: 5000 } });
    fireEvent.scroll(tree(), { target: { scrollTop: 9000 } });
    expect(spy).not.toHaveBeenCalled();
  });

  it("updates the range when the container resizes, and disconnects on unmount", () => {
    let callback: () => void = () => {};
    const disconnect = vi.fn();
    class FakeRO {
      constructor(cb: () => void) {
        callback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    }
    vi.stubGlobal("ResizeObserver", FakeRO);
    let h = 160;
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(() => h);
    const { unmount } = render(<TreeView data={flat(1000)} rowHeight={32} overscan={0} />);
    expect(items()).toHaveLength(5);
    h = 320;
    act(() => callback());
    expect(items()).toHaveLength(10);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("renders every row when there is no height and no layout", () => {
    render(<TreeView data={flat(50)} />);
    expect(items()).toHaveLength(50);
  });

  it("renders a disabled single node normally", () => {
    render(<TreeView data={[{ id: "a", label: "A", isDisabled: true }]} height={100} />);
    expect(items()).toHaveLength(1);
    expect(items()[0]!.getAttribute("aria-disabled")).toBe("true");
  });

  it("uses stable keys with duplicate ids (no React key warning)", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <TreeView
        data={[
          { id: "x", label: "1" },
          { id: "x", label: "2" },
        ]}
        height={100}
      />,
    );
    expect(items()).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
  });

  it("mounts 10000 nodes in under 2 seconds", () => {
    const start = performance.now();
    render(<TreeView data={flat(10000)} height={400} />);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(items().length).toBeLessThan(30);
  });

  describe("scrollToId", () => {
    const nested: TreeNode[] = [
      { id: "p", label: "P", children: [{ id: "hidden", label: "H" }] },
      ...flat(200),
    ];

    it("brings a row into view", () => {
      const ref = createRef<TreeViewHandle>();
      render(<TreeView ref={ref} data={flat(1000)} height={400} rowHeight={32} />);
      act(() => ref.current!.scrollToId("n500"));
      expect(tree().scrollTop).toBe(500 * 32 + 32 - 400);
      expect(document.querySelector('[data-node-id="n500"]')).not.toBeNull();
      act(() => ref.current!.scrollToId("n0"));
      expect(tree().scrollTop).toBe(0);
    });

    it("ignores unknown ids and ids hidden in a collapsed branch", () => {
      const ref = createRef<TreeViewHandle>();
      render(<TreeView ref={ref} data={nested} height={400} rowHeight={32} />);
      expect(() => {
        act(() => ref.current!.scrollToId("nope"));
        act(() => ref.current!.scrollToId("hidden"));
      }).not.toThrow();
      expect(tree().scrollTop).toBe(0);
    });
  });

  it("keeps scrollTop when expanding a node mid list", () => {
    const data: TreeNode[] = [
      ...flat(100),
      { id: "p", label: "P", children: flat(50).map((n) => ({ ...n, id: `c${n.id}` })) },
      ...flat(100).map((n) => ({ ...n, id: `z${n.id}` })),
    ];
    render(<TreeView data={data} height={400} rowHeight={32} />);
    fireEvent.scroll(tree(), { target: { scrollTop: 3200 } });
    const inner = tree().firstElementChild as HTMLElement;
    expect(inner.style.height).toBe(`${201 * 32}px`);
    fireEvent.click(document.querySelector('[data-node-id="p"] [data-toggle]')!);
    expect(inner.style.height).toBe(`${251 * 32}px`);
    expect(tree().scrollTop).toBe(3200);
    expect(firstIndex()).toBe(95);
  });
});

describe("computeRange cap with unaligned scroll", () => {
  it("never exceeds ceil(h/rowHeight) + 2*overscan rows and still covers the viewport", () => {
    const cap = Math.ceil(400 / 32) + 2 * 5;
    for (let top = 0; top <= 31600; top += 7) {
      const { start, end } = computeRange(top, 400, 32, 5, 1000);
      expect(end - start).toBeLessThanOrEqual(cap);
      expect(start * 32).toBeLessThanOrEqual(top);
      expect(end * 32).toBeGreaterThanOrEqual(Math.min(top + 400, 32000));
    }
  });
  it("covers the viewport with overscan 0 and an unaligned scroll", () => {
    const { start, end } = computeRange(3210, 400, 32, 0, 1000);
    expect(start * 32).toBeLessThanOrEqual(3210);
    expect(end * 32).toBeGreaterThanOrEqual(3610);
  });
});

class FakeRO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("TreeView virtualization fixes", () => {
  it("renders at most ceil(h/rowHeight) + 2*overscan rows with an unaligned scroll", () => {
    render(<TreeView data={flat(1000)} height={400} rowHeight={32} />);
    fireEvent.scroll(tree(), { target: { scrollTop: 3210 } });
    expect(items().length).toBeLessThanOrEqual(Math.ceil(400 / 32) + 2 * 5);
    expect(items().length).toBeGreaterThan(13);
  });

  it("never mounts all the rows before the first measurement (ResizeObserver present)", () => {
    vi.stubGlobal("ResizeObserver", FakeRO);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    const create = vi.spyOn(document, "createElement");
    render(<TreeView data={flat(10000)} rowHeight={32} />);
    const divs = create.mock.calls.filter(([tag]) => tag === "div").length;
    expect(divs).toBeLessThan(100);
    expect(items().length).toBeLessThanOrEqual(Math.ceil(400 / 32) + 10);
    expect(items().length).toBeGreaterThan(0);
  });

  it("renders only a minimal window while the container has no height (display: none)", () => {
    vi.stubGlobal("ResizeObserver", FakeRO);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(0);
    render(<TreeView data={flat(10000)} rowHeight={32} />);
    expect(items().length).toBeGreaterThan(0);
    expect(items().length).toBeLessThanOrEqual(10);
  });

  it("does not set an inline height when the prop is missing", () => {
    render(<TreeView data={flat(10)} className="h-96" />);
    expect(tree().style.height).toBe("");
    expect(tree().getAttribute("style") ?? "").not.toContain("height");
    expect(tree().className).toBe("h-96");
  });

  it("applies no height/overflow to an empty tree and keeps emptyState adjacent", () => {
    render(<TreeView data={[]} height={400} emptyState={<p>Nothing</p>} />);
    expect(tree().style.height).toBe("");
    expect(tree().style.overflow).toBe("");
    expect(screen.getByText("Nothing")).toBeTruthy();
  });

  it("falls back to a safe rowHeight and warns when rowHeight <= 0", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<TreeView data={flat(5)} height={400} rowHeight={0} />);
    const tops = items().map((el) => el.style.top);
    expect(new Set(tops).size).toBe(5);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("rowHeight"));
  });

  it("has displayName TreeView", () => {
    expect((TreeView as unknown as { displayName?: string }).displayName).toBe("TreeView");
  });

  it("does not re-render rows on scroll events that keep the same window", () => {
    const renderNode = vi.fn((n: TreeNode) => n.label);
    render(<TreeView data={flat(1000)} height={400} rowHeight={32} renderNode={renderNode} />);
    fireEvent.scroll(tree(), { target: { scrollTop: 3200 } });
    renderNode.mockClear();
    fireEvent.scroll(tree(), { target: { scrollTop: 3205 } });
    fireEvent.scroll(tree(), { target: { scrollTop: 3210 } });
    expect(renderNode).not.toHaveBeenCalled();
    fireEvent.scroll(tree(), { target: { scrollTop: 3300 } });
    expect(renderNode).toHaveBeenCalled();
  });

  it("warns in dev when an unsized tree is as tall as all its rows", () => {
    vi.stubGlobal("ResizeObserver", FakeRO);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300 * 32);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<TreeView data={flat(300)} rowHeight={32} />);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not virtualized"));
  });
});
