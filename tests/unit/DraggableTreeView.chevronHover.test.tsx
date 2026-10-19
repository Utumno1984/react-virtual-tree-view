// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraggableTreeView } from "../../src";
import type { TreeNode } from "../../src";

const data: TreeNode[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo", children: [{ id: "b1", label: "Bravo child" }] },
  { id: "c", label: "Charlie", isDisabled: true, children: [{ id: "c1", label: "Charlie child" }] },
  { id: "d", label: "Delta" },
  { id: "e", label: "Echo", children: [{ id: "e1", label: "Echo child" }] },
];

/** Element the stubbed `elementFromPoint` returns (the chevron of a node, or null). */
let under: Element | null;

beforeEach(() => {
  vi.useFakeTimers();
  under = null;
  document.elementFromPoint = () => under;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // @ts-expect-error jsdom has no elementFromPoint: remove the stub
  delete document.elementFromPoint;
});

const row = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
const chevron = (id: string) => row(id).querySelector("[data-toggle]") as HTMLElement;
const expanded = (id: string) => row(id).getAttribute("aria-expanded");

function mount(props: Partial<React.ComponentProps<typeof DraggableTreeView>> = {}) {
  const onExpandedChange = vi.fn();
  const view = render(
    <DraggableTreeView
      data={data}
      height={400}
      autoScroll={false}
      onExpandedChange={onExpandedChange}
      {...props}
    />,
  );
  const tree = view.getByRole("tree") as HTMLElement;
  tree.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 300 }) as DOMRect;
  return { ...view, onExpandedChange };
}

const move = (y = 10) =>
  act(() => {
    document.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: y, bubbles: true }));
  });

/** Presses on `id` and starts the drag (pointer ends up on the row of `id`). */
function startDrag(id = "a") {
  fireEvent.mouseDown(row(id), { clientX: 20, clientY: 10, button: 0 });
  act(() => {
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20, clientY: 40, bubbles: true }));
  });
  move(40);
}

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("DraggableTreeView: expand on chevron hover while dragging", () => {
  it("expands a collapsed node after resting 400ms on its chevron, via onExpandedChange", () => {
    const { onExpandedChange } = mount();
    startDrag("a");
    under = chevron("b");
    move();
    wait(399);
    expect(expanded("b")).toBe("false");
    wait(1);
    expect(expanded("b")).toBe("true");
    expect(onExpandedChange).toHaveBeenCalledTimes(1);
    expect(onExpandedChange.mock.calls[0]![0]).toEqual(["b"]);
    expect(row("b1")).not.toBeNull();
  });

  it("shows no drop indicator while waiting on the chevron", () => {
    mount();
    startDrag("a");
    // 40px = middle of the second row (32px rows): normally a drop zone with an indicator
    expect(document.querySelector("[data-drop-indicator]")).not.toBeNull();
    under = chevron("b");
    move(48);
    expect(document.querySelector("[data-drop-indicator]")).toBeNull();
    wait(200);
    expect(document.querySelector("[data-drop-indicator]")).toBeNull();
  });

  it("does not expand if the pointer leaves the chevron first, nor later", () => {
    const { onExpandedChange } = mount();
    startDrag("a");
    under = chevron("b");
    move();
    wait(300);
    under = row("b");
    move();
    wait(2000);
    expect(expanded("b")).toBe("false");
    expect(onExpandedChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("each hovered node has its own timer: switching target restarts the wait", () => {
    mount({ data: [...data] });
    startDrag("a");
    under = chevron("b");
    move();
    wait(300);
    under = chevron("e");
    move();
    wait(300);
    expect(expanded("b")).toBe("false");
    expect(expanded("e")).toBe("false");
    wait(100);
    expect(expanded("e")).toBe("true");
    expect(expanded("b")).toBe("false");
  });

  it("starts no timer on a leaf or on an already expanded node", () => {
    const { onExpandedChange } = mount({ defaultExpandedIds: ["b"] });
    startDrag("a");
    under = chevron("d"); // leaf
    move();
    expect(vi.getTimerCount()).toBe(0);
    under = chevron("b"); // expanded
    move();
    expect(vi.getTimerCount()).toBe(0);
    wait(1000);
    expect(onExpandedChange).not.toHaveBeenCalled();
  });

  it("does not expand the dragged node itself", () => {
    const { onExpandedChange } = mount();
    startDrag("b");
    under = chevron("b");
    move();
    wait(1000);
    expect(onExpandedChange).not.toHaveBeenCalled();
  });

  it("expands a disabled node too (a view change, not a drop)", () => {
    mount();
    startDrag("a");
    under = chevron("c");
    move();
    wait(400);
    expect(expanded("c")).toBe("true");
  });

  it("cancels the timer when the drag ends on the chevron (no expansion, no move)", () => {
    const onTreeChange = vi.fn();
    const { onExpandedChange } = mount({ onTreeChange });
    startDrag("a");
    under = chevron("b");
    move();
    wait(200);
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    wait(2000);
    expect(expanded("b")).toBe("false");
    expect(onExpandedChange).not.toHaveBeenCalled();
    expect(onTreeChange).not.toHaveBeenCalled();
  });

  it("cancels the timer when the drag is cancelled with Escape", () => {
    const { onExpandedChange } = mount();
    startDrag("a");
    under = chevron("b");
    move();
    wait(200);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    });
    wait(2000);
    expect(onExpandedChange).not.toHaveBeenCalled();
  });

  it("cancels the timer on unmount", () => {
    const { unmount, onExpandedChange } = mount();
    startDrag("a");
    under = chevron("b");
    move();
    wait(200);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    wait(2000);
    expect(onExpandedChange).not.toHaveBeenCalled();
  });

  it("after the expansion the child row resolves a normal drop zone", () => {
    mount();
    startDrag("a");
    under = chevron("b");
    move(48);
    wait(400);
    under = null;
    move(48 + 32); // middle of the freshly shown child b1 (row index 2)
    const indicator = document.querySelector("[data-drop-indicator]");
    expect(indicator).not.toBeNull();
    expect(indicator!.getAttribute("data-drop-zone")).toBe("inside");
  });
});
