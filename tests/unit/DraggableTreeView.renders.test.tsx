// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeNode } from "../../src";
import { DraggableTreeView } from "../../src";

const tree: TreeNode[] = [
  {
    id: "p",
    label: "Parent",
    children: [
      { id: "A", label: "Alpha" },
      { id: "B", label: "Bravo" },
      { id: "C", label: "Charlie" },
    ],
  },
  { id: "q", label: "Other" },
];

const ROW = 32;
const IND = 24;
// jsdom has no layout: give the tree a viewport at (0,0) and put the content at its top
const rect = (r: Partial<DOMRect>) => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400, ...r, toJSON() {} }) as DOMRect;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rect({}));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rowEl = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
const indicator = () => document.querySelector("[data-drop-indicator]") as HTMLElement | null;

function move(x: number, y: number) {
  act(() => {
    fireEvent.mouseMove(document, { clientX: x, clientY: y, buttons: 1 });
    fireEvent.pointerMove(document, { clientX: x, clientY: y, pointerId: 1, buttons: 1 });
  });
}

describe("DraggableTreeView renders while dragging", () => {
  it("moving the pointer or changing the projection re-renders only the indicator, not the rows", () => {
    const renders = vi.fn();
    render(
      <DraggableTreeView
        data={tree}
        defaultExpandedIds={["p"]}
        height={400}
        rowHeight={ROW}
        indentation={IND}
        renderNode={(node) => {
          renders(node.id);
          return <span>{node.label}</span>;
        }}
      />,
    );
    // press on B (row index 2 -> y 64..96) and cross the activation distance
    const y = 2 * ROW + ROW / 2;
    act(() => {
      fireEvent.mouseDown(rowEl("B"), { clientX: 100, clientY: y, button: 0, buttons: 1 });
    });
    move(100, y + 10);
    move(100, y);
    expect(indicator()).not.toBeNull();
    expect(indicator()!.getAttribute("data-projected-depth")).toBe("1");

    // dragging starts: let the (few) renders caused by the start settle, then count
    renders.mockClear();

    // a few pixels, same row and same indentation step: nothing changes at all
    move(103, y + 2);
    move(98, y - 3);
    expect(renders).not.toHaveBeenCalled();

    // the projection changes (one level deeper, then another row): only the indicator updates
    move(100 + IND, y);
    expect(indicator()!.getAttribute("data-projected-depth")).toBe("2");
    move(100 + IND, y - ROW);
    move(100, y + ROW);
    expect(indicator()).not.toBeNull();
    expect(renders).not.toHaveBeenCalled();
  });
});
