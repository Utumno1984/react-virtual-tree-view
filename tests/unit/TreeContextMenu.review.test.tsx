// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeContextMenu, TreeView } from "../../src";
import type { MenuItem, TreeNode } from "../../src";

// The outside pointerdown decides in a timer (once the press has moved the focus).
const flush = () =>
  act(() => {
    vi.runAllTimers();
  });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const tree: TreeNode[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
];

const row = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
const menu = () => screen.queryByRole("menu");
const menuItems = () => screen.queryAllByRole("menuitem");

function setup(onSelect = vi.fn()) {
  const items = (): MenuItem[] => [
    { id: "x", label: "X", onSelect: vi.fn() },
    { id: "one", label: "One", onSelect },
  ];
  render(
    <>
      <button>outside</button>
      <TreeView data={tree} contextMenu={{ items }} />
    </>,
  );
  return { onSelect };
}

describe("outside pointer and right click", () => {
  it("a contextmenu or pointerdown (any button) outside the menu closes it", () => {
    vi.useFakeTimers();
    setup();
    fireEvent.contextMenu(row("b"));
    fireEvent.contextMenu(document.body);
    expect(menu()).toBeNull();

    fireEvent.contextMenu(row("b"));
    fireEvent.pointerDown(document.body, { button: 2 });
    flush();
    expect(menu()).toBeNull();

    fireEvent.contextMenu(row("b"));
    fireEvent.pointerDown(document.body, { button: 1 });
    flush();
    expect(menu()).toBeNull();
  });

  it("pointerdown and contextmenu inside the menu do not close it", () => {
    setup();
    fireEvent.contextMenu(row("b"));
    fireEvent.pointerDown(menuItems()[1]!);
    fireEvent.contextMenu(menu()!);
    expect(menu()).not.toBeNull();
  });

  it("two trees never show two menus", () => {
    vi.useFakeTimers();
    const items = () => [{ id: "i", label: "I", onSelect: vi.fn() }];
    render(
      <>
        <TreeView data={[{ id: "x", label: "X" }]} contextMenu={{ items }} />
        <TreeView data={[{ id: "y", label: "Y" }]} contextMenu={{ items }} />
      </>,
    );
    fireEvent.pointerDown(row("x"), { button: 2 });
    fireEvent.contextMenu(row("x"));
    fireEvent.pointerDown(row("y"), { button: 2 });
    fireEvent.contextMenu(row("y"));
    flush();
    expect(screen.getAllByRole("menu")).toHaveLength(1);
  });

  it("right click on another node of the same tree opens the menu for that node", () => {
    const { onSelect } = setup();
    fireEvent.pointerDown(row("a"), { button: 2 });
    fireEvent.contextMenu(row("a"));
    fireEvent.pointerDown(row("b"), { button: 2 });
    fireEvent.contextMenu(row("b"));
    fireEvent.click(menuItems()[1]!);
    expect(onSelect).toHaveBeenCalledWith(tree[1]);
  });

  it("gives the focus back to the row only if the press left it on the body", () => {
    vi.useFakeTimers();
    setup();
    fireEvent.contextMenu(row("b"));
    fireEvent.pointerDown(document.body, { button: 2 });
    (document.activeElement as HTMLElement).blur();
    act(() => {
      vi.runAllTimers();
    });
    expect(document.activeElement).toBe(row("b"));

    fireEvent.contextMenu(row("b"));
    const button = screen.getByText("outside");
    fireEvent.pointerDown(button);
    button.focus();
    act(() => {
      vi.runAllTimers();
    });
    expect(document.activeElement).toBe(button);
  });

  it("removes the new listeners too (add/remove balanced)", () => {
    vi.useFakeTimers();
    setup();
    const types = ["click", "pointerdown", "contextmenu", "keydown", "scroll", "resize"];
    const adds: unknown[][] = [];
    const removes: unknown[][] = [];
    const track = (target: EventTarget) => {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      type Args = [string, EventListenerOrEventListenerObject | null, (boolean | object)?];
      vi.spyOn(target, "addEventListener").mockImplementation((...args: Args) => {
        if (types.includes(args[0])) adds.push(args);
        return add(...(args as Parameters<typeof add>));
      });
      vi.spyOn(target, "removeEventListener").mockImplementation((...args: Args) => {
        if (types.includes(args[0])) removes.push(args);
        return remove(...(args as Parameters<typeof remove>));
      });
    };
    track(document);
    track(window);
    fireEvent.contextMenu(row("b"));
    fireEvent.pointerDown(document.body);
    flush();
    const outside = adds.filter((a) => a[0] === "pointerdown" || a[0] === "contextmenu");
    expect(outside.length).toBe(2);
    for (const call of adds) {
      expect(removes.some((r) => r[0] === call[0] && r[1] === call[1] && r[2] === call[2])).toBe(true);
    }
  });
});

describe("outside pointerdown closes exactly once", () => {
  const mount = (onClose: (restoreFocus: boolean) => void) =>
    render(
      <TreeContextMenu
        node={tree[0]!}
        items={[{ id: "x", label: "X", onSelect: vi.fn() }]}
        anchor={{ x: 10, y: 10 }}
        onClose={onClose}
      />,
    );

  it("pointerdown outside then unmount: the pending timer is cancelled, onClose never fires", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { unmount } = mount(onClose);
    fireEvent.pointerDown(document.body);
    unmount();
    vi.runAllTimers();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("pointerdown outside without unmount: one call, restoring the focus when it is on the body", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    mount(onClose);
    fireEvent.pointerDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement).blur();
    vi.runAllTimers();
    expect(onClose.mock.calls).toEqual([[true]]);
  });

  it("does not restore the focus when the press moved it elsewhere; repeated presses close once", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<button>other</button>);
    mount(onClose);
    fireEvent.pointerDown(document.body);
    fireEvent.pointerDown(document.body);
    screen.getByText("other").focus();
    vi.runAllTimers();
    expect(onClose.mock.calls).toEqual([[false]]);
  });
});

describe("review fixes", () => {
  it("Esc is stopped at the menu, so the consumer's own Esc handlers do not also fire", () => {
    setup();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    fireEvent.contextMenu(row("b"));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    document.removeEventListener("keydown", outer);
    expect(menu()).toBeNull();
    expect(outer).not.toHaveBeenCalled();
  });

  it("measures the menu at the origin, not squeezed by the space on its right", () => {
    let leftWhenMeasured: string | null = null;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute("role") === "menu") leftWhenMeasured = this.style.left;
      return { width: 100, height: 50, top: 0, left: 0, right: 100, bottom: 50, x: 0, y: 0, toJSON: () => ({}) };
    });
    setup();
    fireEvent.contextMenu(row("b"), { clientX: 900, clientY: 100 });
    expect(leftWhenMeasured).toBe("0px");
    expect(menu()!.style.left).toBe("900px");
  });

  it("treeitems have aria-haspopup=menu only with a contextMenu", () => {
    setup();
    expect(row("b").getAttribute("aria-haspopup")).toBe("menu");
    cleanup();
    render(<TreeView data={tree} />);
    expect(row("b").getAttribute("aria-haspopup")).toBeNull();
  });

  it("does not move the focus to another node when the row index now holds a different one", () => {
    const items = () => [{ id: "i", label: "I", onSelect: vi.fn() }];
    const { rerender } = render(<TreeView data={tree} contextMenu={{ items }} />);
    fireEvent.contextMenu(row("b"));
    const menuEl = menu()!;
    rerender(
      <TreeView
        data={[{ id: "z", label: "Z" }, ...tree.filter((n) => n.id === "b" ? false : true)]}
        contextMenu={{ items }}
      />,
    );
    // "b" is gone: whichever row now sits at its old index must not receive the focus.
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(menuEl, { key: "Escape" });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
