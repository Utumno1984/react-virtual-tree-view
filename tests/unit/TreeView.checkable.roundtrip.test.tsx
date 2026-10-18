// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraggableTreeView, TreeView } from "../../src";
import type { TreeNode } from "../../src";

afterEach(cleanup);

const flat = (): TreeNode[] => [
  { id: "x", label: "X" },
  { id: "y", label: "Y" },
];
const nested = (): TreeNode[] => [
  { id: "x", label: "X", children: [{ id: "y", label: "Y" }] },
];

const row = (id: string) => document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;
const checkedAttr = (id: string) => row(id).getAttribute("aria-checked");

describe.each([
  ["TreeView", TreeView],
  ["DraggableTreeView", DraggableTreeView],
])("%s checkable: leaf -> parent -> leaf round trip", (_name, Component) => {
  it("uncontrolled: the leaf is checked again, matching the last onCheckedChange", () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Component data={flat()} checkable onCheckedChange={onCheckedChange} />,
    );
    fireEvent.click(row("x").querySelector("input[data-checkbox]")!);
    expect(onCheckedChange).toHaveBeenLastCalledWith(["x"]);
    expect(checkedAttr("x")).toBe("true");

    rerender(
      <Component
        data={nested()}
        checkable
        defaultExpandedIds={["x"]}
        onCheckedChange={onCheckedChange}
      />,
    );
    expect(checkedAttr("x")).toBe("false"); // parent of an unchecked child
    expect(onCheckedChange).toHaveBeenCalledTimes(1); // the data change is silent

    rerender(<Component data={flat()} checkable onCheckedChange={onCheckedChange} />);
    expect(checkedAttr("x")).toBe("true");
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
  });

  it("controlled and uncontrolled give the same result after the round trip", () => {
    const ids = ["x"];
    const { rerender } = render(<Component data={flat()} checkable checkedIds={ids} />);
    rerender(<Component data={nested()} checkable checkedIds={ids} />);
    rerender(<Component data={flat()} checkable checkedIds={ids} />);
    expect(checkedAttr("x")).toBe("true");
    expect(checkedAttr("y")).toBe("false");
  });

  it("a derived id left in memory is cleared by the next (notified) user action", () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(
      <Component
        data={flat()}
        checkable
        defaultExpandedIds={["x"]}
        onCheckedChange={onCheckedChange}
      />,
    );
    fireEvent.click(row("x").querySelector("input[data-checkbox]")!);
    rerender(
      <Component
        data={nested()}
        checkable
        defaultExpandedIds={["x"]}
        onCheckedChange={onCheckedChange}
      />,
    );
    fireEvent.click(row("y").querySelector("input[data-checkbox]")!);
    expect(onCheckedChange).toHaveBeenLastCalledWith(["y"]); // "x" is derived, not listed
  });
});
