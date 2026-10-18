// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeView } from "../../src";
import type { MenuItem, TreeNode } from "../../src";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const first: TreeNode[] = [
  { id: "a", label: "Alpha", children: [{ id: "a1", label: "Alpha 1" }] },
  { id: "b", label: "Beta" },
];
const row = (id: string) =>
  document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;

function setup(strict = false) {
  const onSelect = vi.fn();
  const items = (): MenuItem[] => [{ id: "one", label: "One", onSelect }];
  const view = (data: TreeNode[]) => {
    const tree = (
      <TreeView
        data={data}
        contextMenu={{ items }}
        defaultExpandedIds={["a"]}
      />
    );
    return strict ? <StrictMode>{tree}</StrictMode> : tree;
  };
  return { ...render(view(first)), view, onSelect };
}

describe("context menu and a new data: QA extras (#53)", () => {
  it("closes when data becomes empty, no console errors", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender, view } = setup();
    fireEvent.contextMenu(row("b"));
    expect(screen.queryByRole("menu")).not.toBeNull();
    rerender(view([]));
    expect(screen.queryByRole("menu")).toBeNull();
    rerender(view(first));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(err).not.toHaveBeenCalled();
  });

  it("works under StrictMode", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender, view } = setup(true);
    fireEvent.contextMenu(row("b"));
    rerender(view([{ id: "z", label: "Zeta" }]));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.contextMenu(row("z"));
    expect(screen.queryByRole("menu")).not.toBeNull();
    expect(err).not.toHaveBeenCalled();
  });

  it("a fresh menu can be opened right after the old one vanished", () => {
    const { rerender, view, onSelect } = setup();
    fireEvent.contextMenu(row("b"));
    rerender(view([{ id: "z", label: "Zeta" }]));
    fireEvent.contextMenu(row("z"));
    fireEvent.click(screen.getByRole("menuitem"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0].id).toBe("z");
  });

  it("keeps the menu open on a brand new data object with the same ids", () => {
    const { rerender, view } = setup();
    fireEvent.contextMenu(row("b"));
    rerender(view(structuredClone(first)));
    expect(screen.queryByRole("menu")).not.toBeNull();
  });
});
