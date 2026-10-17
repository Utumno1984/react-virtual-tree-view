// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraggableTreeView } from "../../src";
import type { TreeNode } from "../../src";

const data: TreeNode[] = Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, label: `Item ${i}` }));

let frames: Map<number, FrameRequestCallback>;
let nextId: number;
const runFrame = () => {
  const pending = [...frames.values()];
  frames.clear();
  act(() => {
    for (const cb of pending) cb(0);
  });
};

beforeEach(() => {
  frames = new Map();
  nextId = 1;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(props: Partial<React.ComponentProps<typeof DraggableTreeView>> = {}) {
  const view = render(<DraggableTreeView data={data} height={400} {...props} />);
  const tree = view.getByRole("tree") as HTMLElement;
  let top = 0;
  Object.defineProperty(tree, "scrollTop", {
    get: () => top,
    set: (v: number) => {
      top = Math.max(0, Math.min(200 * 32 - 400, v));
    },
  });
  tree.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 300 }) as DOMRect;
  return { ...view, tree };
}

function startDrag(id = "n0") {
  const row = document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
  fireEvent.mouseDown(row, { clientX: 20, clientY: 10, button: 0 });
  const move = () =>
    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 20, clientY: 395, bubbles: true }),
      );
      document.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 20, clientY: 395, bubbles: true }),
      );
    });
  // The first move activates the drag (the sensor's own listener); the second one reaches
  // the tree's pointermove listener, which only exists once the drag is active.
  move();
  move();
}

/** The tree's own `pointermove` listeners (dnd-kit's sensor manages its own separately). */
const ownMoveListeners = (calls: Array<[string, unknown, ...unknown[]]>) =>
  calls.filter((c) => c[0] === "pointermove" && (c[1] as { name?: string }).name === "onMove");

describe("DraggableTreeView auto-scroll", () => {
  it("scrolls near the bottom edge during a drag and stops after the drop", () => {
    const { tree } = mount();
    startDrag();
    runFrame();
    runFrame();
    expect(tree.scrollTop).toBeGreaterThan(0);
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    const at = tree.scrollTop;
    runFrame();
    runFrame();
    expect(tree.scrollTop).toBe(at);
  });

  it("does not scroll with autoScroll={false}", () => {
    const { tree } = mount({ autoScroll: false });
    startDrag();
    runFrame();
    runFrame();
    expect(tree.scrollTop).toBe(0);
  });

  it("does not scroll when no drag starts (disabled node)", () => {
    const { tree } = mount({
      data: data.map((n, i) => (i === 0 ? { ...n, isDisabled: true } : n)),
    });
    startDrag();
    runFrame();
    expect(tree.scrollTop).toBe(0);
    expect(frames.size).toBe(0);
  });

  it("does not scroll during a search (drag disabled)", () => {
    const { tree } = mount({ searchQuery: "Item 1" });
    startDrag("n1");
    runFrame();
    expect(tree.scrollTop).toBe(0);
    expect(frames.size).toBe(0);
  });

  it("removes the pointermove listener and cancels the frame on drop and on Esc", () => {
    for (const end of ["drop", "escape"] as const) {
      const add = vi.spyOn(document, "addEventListener");
      const remove = vi.spyOn(document, "removeEventListener");
      const cancel = vi.fn((id: number) => frames.delete(id));
      vi.stubGlobal("cancelAnimationFrame", cancel);
      mount();
      startDrag();
      runFrame();
      const added = ownMoveListeners(add.mock.calls as never);
      expect(added.length).toBeGreaterThan(0);
      act(() => {
        if (end === "drop") document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        else document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
      });
      for (const [, listener] of added) {
        expect(remove.mock.calls.some((c) => c[0] === "pointermove" && c[1] === listener)).toBe(true);
      }
      expect(cancel).toHaveBeenCalled();
      expect(frames.size).toBe(0);
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("cleans up listeners and the frame when unmounted mid-drag, without console errors", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const view = mount();
    startDrag();
    runFrame();
    const added = ownMoveListeners(add.mock.calls as never);
    expect(added.length).toBeGreaterThan(0);
    view.unmount();
    for (const [, listener] of added) {
      expect(remove.mock.calls.some((c) => c[0] === "pointermove" && c[1] === listener)).toBe(true);
    }
    expect(frames.size).toBe(0);
    runFrame();
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20, clientY: 399, bubbles: true }));
      document.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: 399, bubbles: true }));
    });
    expect(errors).not.toHaveBeenCalled();
    expect(warns).not.toHaveBeenCalled();
  });

  it("reuses the cached container rect: no container or content rect reads per scrolled frame", () => {
    const { tree } = mount();
    const content = tree.querySelector('[role="none"]') as HTMLElement;
    const containerSpy = vi.fn(() => ({ top: 0, bottom: 400, left: 0, right: 300 }) as DOMRect);
    const contentSpy = vi.fn(() => ({ top: -tree.scrollTop, bottom: 0, left: 0, right: 300 }) as DOMRect);
    tree.getBoundingClientRect = containerSpy;
    content.getBoundingClientRect = contentSpy;
    startDrag();
    runFrame(); // first scrolled frame: the shared rect and the content offset are measured
    const scrolledAt = tree.scrollTop;
    expect(scrolledAt).toBeGreaterThan(0);
    const containerReads = containerSpy.mock.calls.length;
    const contentReads = contentSpy.mock.calls.length;
    for (let i = 0; i < 10; i++) runFrame();
    expect(tree.scrollTop).toBeGreaterThan(scrolledAt); // the frames did scroll and re-resolve
    expect(containerSpy.mock.calls.length - containerReads).toBe(0);
    expect(contentSpy.mock.calls.length - contentReads).toBe(0);
  });

  it("re-reads the rect once after the page scrolled during the drag", () => {
    const { tree } = mount();
    const containerSpy = vi.fn(() => ({ top: 0, bottom: 400, left: 0, right: 300 }) as DOMRect);
    tree.getBoundingClientRect = containerSpy;
    startDrag();
    runFrame();
    const before = containerSpy.mock.calls.length;
    act(() => {
      document.dispatchEvent(new Event("scroll"));
    });
    runFrame();
    runFrame();
    runFrame();
    expect(containerSpy.mock.calls.length - before).toBe(1);
  });

  it("removes the window scroll listener on drop, Esc and unmount mid-drag", () => {
    for (const end of ["drop", "escape", "unmount"] as const) {
      const add = vi.spyOn(window, "addEventListener");
      const remove = vi.spyOn(window, "removeEventListener");
      const view = mount();
      startDrag();
      runFrame();
      const added = add.mock.calls.filter((c) => c[0] === "scroll");
      expect(added.length).toBe(1);
      act(() => {
        if (end === "drop") document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        else if (end === "escape")
          document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
        else view.unmount();
      });
      expect(
        remove.mock.calls.some((c) => c[0] === "scroll" && c[1] === added[0]?.[1] && (c[2] as { capture?: boolean })?.capture === true),
      ).toBe(true);
      expect(frames.size).toBe(0);
      cleanup();
      vi.restoreAllMocks();
    }
  });
});
