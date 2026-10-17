// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeNode } from "../../src";
import { DraggableTreeView } from "../../src";
import * as treeUtils from "../../src/tree-utils";

// Wrap getSubtreeHeight in a spy (an ES module namespace cannot be spied on directly).
vi.mock("../../src/tree-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/tree-utils")>();
  return {
    ...actual,
    getSubtreeHeight: vi.fn(actual.getSubtreeHeight),
    getDropTarget: vi.fn(actual.getDropTarget),
  };
});

const tree: TreeNode[] = [
  {
    id: "p",
    label: "Parent",
    children: [
      { id: "A", label: "Alpha" },
      { id: "B", label: "Bravo", children: [{ id: "B1", label: "Bravo child" }] },
      { id: "C", label: "Charlie" },
    ],
  },
  { id: "q", label: "Other" },
];

const ROW = 32;
const IND = 24;
const rect = (r: Partial<DOMRect>) =>
  ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400, ...r, toJSON() {} }) as DOMRect;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => rect({}));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(treeUtils.getSubtreeHeight).mockClear();
  vi.mocked(treeUtils.getDropTarget).mockClear();
});

const rowEl = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
const indicator = () => document.querySelector("[data-drop-indicator]") as HTMLElement | null;

function move(x: number, y: number) {
  act(() => {
    fireEvent.mouseMove(document, { clientX: x, clientY: y, buttons: 1 });
    fireEvent.pointerMove(document, { clientX: x, clientY: y, pointerId: 1, buttons: 1 });
  });
}

function startDrag(id: string, row: number) {
  const y = row * ROW + ROW / 2;
  act(() => {
    fireEvent.mouseDown(rowEl(id), { clientX: 100, clientY: y, button: 0, buttons: 1 });
  });
  move(100, y + 10);
  move(100, y);
  return y;
}

describe("DraggableTreeView maxDepth", () => {
  it("computes the dragged subtree height once per drag, not on every pointermove", () => {
    render(
      <DraggableTreeView data={tree} defaultExpandedIds={["p", "B"]} maxDepth={3} height={400} rowHeight={ROW} indentation={IND} />,
    );
    const spy = vi.mocked(treeUtils.getSubtreeHeight);
    spy.mockClear(); // the development check of the initial data also uses it
    // rows: p, A, B, B1, C, q -> drag C (row 4)
    const y = startDrag("C", 4);
    expect(spy).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 20; i++) move(100 + (i % 4) * IND, y - (i % 3) * ROW);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("passes the cached subtree height to every drop-target resolution", () => {
    render(
      <DraggableTreeView data={tree} defaultExpandedIds={["p", "B"]} maxDepth={3} height={400} rowHeight={ROW} indentation={IND} />,
    );
    const resolve = vi.mocked(treeUtils.getDropTarget);
    resolve.mockClear();
    // rows: p, A, B, B1, C, q -> drag B (height 1: it has one level of children)
    const y = startDrag("B", 2);
    for (let i = 0; i < 10; i++) move(100 + (i % 4) * IND, y + (i % 3) * ROW);
    expect(resolve.mock.calls.length).toBeGreaterThan(5);
    for (const call of resolve.mock.calls) expect(call[6]).toBe(1);
  });

  it("does not compute any height when there is no maxDepth", () => {
    render(<DraggableTreeView data={tree} defaultExpandedIds={["p"]} height={400} rowHeight={ROW} indentation={IND} />);
    const spy = vi.mocked(treeUtils.getSubtreeHeight);
    spy.mockClear();
    startDrag("C", 3);
    move(100 + IND, 3 * ROW);
    expect(spy).not.toHaveBeenCalled();
    expect(indicator()!.getAttribute("data-depth-clamped")).toBe("false");
  });

  it("flags the clamp on the indicator and passes it to renderDropIndicator", () => {
    const seen: boolean[] = [];
    render(
      <DraggableTreeView
        data={tree}
        defaultExpandedIds={["p"]}
        maxDepth={1}
        height={400}
        rowHeight={ROW}
        indentation={IND}
        renderDropIndicator={(projection) => {
          seen.push(projection.clamped);
          return null;
        }}
      />,
    );
    // rows: p, A, B, C, q -> drag C onto B, two levels right: wants depth 3, limit 1
    const y = startDrag("C", 3);
    move(100, y);
    expect(indicator()!.getAttribute("data-depth-clamped")).toBe("false");
    move(100 + 3 * IND, y - ROW);
    expect(indicator()!.getAttribute("data-projected-depth")).toBe("1");
    expect(indicator()!.getAttribute("data-depth-clamped")).toBe("true");
    expect(seen).toContain(true);
  });

  describe("development warnings", () => {
    it.each([-1, 1.5, Number.NaN])("warns and applies no limit for maxDepth %s", (value) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      render(<DraggableTreeView data={tree} defaultExpandedIds={["p"]} maxDepth={value} height={400} rowHeight={ROW} indentation={IND} />);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("maxDepth");
      const y = startDrag("C", 3);
      move(100 + 3 * IND, y);
      expect(indicator()!.getAttribute("data-depth-clamped")).toBe("false");
    });

    it("warns once when the initial data already exceeds maxDepth, and renders it as is", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { rerender } = render(
        <DraggableTreeView data={tree} defaultExpandedIds={["p", "B"]} maxDepth={1} height={400} rowHeight={ROW} indentation={IND} />,
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("exceeds maxDepth");
      expect(rowEl("B1").getAttribute("aria-level")).toBe("3");
      // a re-render with new data does not warn again
      rerender(
        <DraggableTreeView data={[...tree]} defaultExpandedIds={["p", "B"]} maxDepth={1} height={400} rowHeight={ROW} indentation={IND} />,
      );
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it("does not warn for valid maxDepth, undefined, an empty tree or a data within the limit", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      render(<DraggableTreeView data={tree} maxDepth={2} height={400} rowHeight={ROW} />);
      render(<DraggableTreeView data={tree} height={400} rowHeight={ROW} />);
      render(<DraggableTreeView data={[]} maxDepth={0} height={400} rowHeight={ROW} />);
      expect(warn).not.toHaveBeenCalled();
    });

    it("does not warn in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      render(<DraggableTreeView data={tree} maxDepth={-3} height={400} rowHeight={ROW} />);
      expect(warn).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });
  });

  it("duplicate ids with maxDepth do not crash and show no indicator", () => {
    const dup: TreeNode[] = [
      { id: "x", label: "one" },
      { id: "x", label: "two" },
    ];
    render(<DraggableTreeView data={dup} maxDepth={1} height={400} rowHeight={ROW} indentation={IND} />);
    const row = document.querySelector('[data-node-id="x"]') as HTMLElement;
    act(() => {
      fireEvent.mouseDown(row, { clientX: 100, clientY: 16, button: 0, buttons: 1 });
    });
    move(100, 26);
    move(100 + IND, 40);
    expect(indicator()).toBeNull();
  });
});
