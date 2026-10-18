// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TreeNode } from "../../src";

// jsdom has no pointer drag: capture the handlers DraggableTreeView gives to DndContext and
// call them directly, with the pointer position fed through a `pointermove` on the document.
type DndProps = {
  onDragStart: (event: unknown) => void;
  onDragEnd: (event: unknown) => void;
  children: ReactNode;
};
const dnd: { current: DndProps | null } = { current: null };

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: DndProps) => {
      dnd.current = props;
      return <>{props.children}</>;
    },
  };
});

const { DraggableTreeView } = await import("../../src");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  dnd.current = null;
});

const tree = (): TreeNode[] => [
  { id: "A", label: "Alpha" },
  { id: "B", label: "Bravo" },
];

describe("DraggableTreeView: drop that nests under a collapsed node", () => {
  it("reports the auto-expanded parent through onStateChange", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 500,
      width: 300,
      height: 500,
      toJSON: () => ({}),
    });
    const onStateChange = vi.fn();
    const onTreeChange = vi.fn();
    render(
      <DraggableTreeView
        data={tree()}
        height={300}
        onTreeChange={onTreeChange}
        onStateChange={onStateChange}
      />,
    );
    expect(onStateChange).not.toHaveBeenCalled();

    // Press on row B (second row), then move one indentation (24px) to the right.
    act(() =>
      dnd.current!.onDragStart({
        active: { id: "B" },
        activatorEvent: { clientX: 0, clientY: 40 },
      }),
    );
    act(() => {
      document.dispatchEvent(new MouseEvent("pointermove", { clientX: 24, clientY: 40 }));
    });
    act(() => dnd.current!.onDragEnd({ active: { id: "B" } }));

    expect(onTreeChange).toHaveBeenCalledTimes(1);
    expect(onTreeChange.mock.calls[0]![1]).toMatchObject({ nodeId: "B", toParentId: "A" });
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange).toHaveBeenCalledWith({
      expandedIds: ["A"],
      selectedId: null,
      searchQuery: "",
    });
  });
});
