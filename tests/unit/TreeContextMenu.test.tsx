// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeContextMenu, TreeView } from "../../src";
import type { MenuItem, TreeNode } from "../../src";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tree: TreeNode[] = [
  { id: "a", label: "Alpha", children: [{ id: "a1", label: "Alpha 1" }] },
  { id: "b", label: "Beta" },
  { id: "locked", label: "Locked", isDisabled: true },
  { id: "empty", label: "Empty" },
];

const row = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
const menu = () => screen.queryByRole("menu");
const menuItems = () => screen.queryAllByRole("menuitem");

function setup(
  options: {
    data?: TreeNode[];
    items?: (node: TreeNode) => MenuItem[];
    onSelects?: Record<string, ReturnType<typeof vi.fn>>;
  } = {},
) {
  const onSelects = {
    one: vi.fn(),
    two: vi.fn(),
    off: vi.fn(),
    ...options.onSelects,
  };
  const items =
    options.items ??
    ((node: TreeNode): MenuItem[] =>
      node.id === "empty"
        ? []
        : [
            { id: "off", label: "Disabled", onSelect: onSelects.off!, disabled: true },
            { id: "one", label: "One", onSelect: onSelects.one! },
            { id: "two", label: "Two", onSelect: onSelects.two! },
          ]);
  const utils = render(
    <>
      <button>outside</button>
      <TreeView data={options.data ?? tree} contextMenu={{ items }} />
    </>,
  );
  return { ...utils, onSelects };
}

describe("opening", () => {
  it("right click opens a role=menu at the click point and blocks the native menu", () => {
    setup();
    const notPrevented = fireEvent.contextMenu(row("b"), { clientX: 120, clientY: 90 });
    expect(notPrevented).toBe(false);
    expect(menu()).not.toBeNull();
    expect(menuItems().map((el) => el.textContent)).toEqual(["Disabled", "One", "Two"]);
    expect(menu()!.style.position).toBe("fixed");
    expect(menu()!.style.left).toBe("120px");
    expect(menu()!.style.top).toBe("90px");
  });

  it("Shift+F10 and the ContextMenu key open it and focus the first enabled item", () => {
    setup();
    row("b").focus();
    const prevented = !fireEvent.keyDown(row("b"), { key: "F10", shiftKey: true });
    expect(prevented).toBe(true);
    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(menuItems()[1]);

    fireEvent.keyDown(menu()!, { key: "Escape" });
    expect(menu()).toBeNull();
    fireEvent.keyDown(row("b"), { key: "ContextMenu" });
    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(menuItems()[1]);
  });

  it("plain F10 does nothing", () => {
    setup();
    fireEvent.keyDown(row("b"), { key: "F10" });
    expect(menu()).toBeNull();
  });

  it("items() returning [] opens nothing and does not block the native menu", () => {
    setup();
    const notPrevented = fireEvent.contextMenu(row("empty"));
    expect(notPrevented).toBe(true);
    expect(menu()).toBeNull();
    const keyNotPrevented = fireEvent.keyDown(row("empty"), { key: "ContextMenu" });
    expect(keyNotPrevented).toBe(true);
    expect(menu()).toBeNull();
  });

  it("an empty result closes a menu that was already open", () => {
    setup();
    fireEvent.contextMenu(row("b"));
    expect(menu()).not.toBeNull();
    fireEvent.contextMenu(row("empty"));
    expect(menu()).toBeNull();
  });

  it("a disabled node still calls items() with that node", () => {
    const items = vi.fn((): MenuItem[] => [{ id: "x", label: "X", onSelect: vi.fn() }]);
    setup({ items });
    fireEvent.contextMenu(row("locked"));
    expect(items).toHaveBeenCalledWith(tree[2]);
    expect(menu()).not.toBeNull();
  });

  it("an empty tree renders no menu", () => {
    const items = vi.fn((): MenuItem[] => []);
    setup({ data: [], items });
    expect(menu()).toBeNull();
    expect(items).not.toHaveBeenCalled();
  });

  it("a single childless node works", () => {
    setup({ data: [{ id: "only", label: "Only" }] });
    fireEvent.contextMenu(row("only"));
    expect(menuItems()).toHaveLength(3);
  });

  it("without the contextMenu prop the native menu is untouched", () => {
    render(<TreeView data={tree} />);
    expect(fireEvent.contextMenu(row("b"))).toBe(true);
    expect(fireEvent.keyDown(row("b"), { key: "ContextMenu" })).toBe(true);
    expect(menu()).toBeNull();
  });

  it("with duplicate ids it acts on the clicked node, not the first with that id", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const first: TreeNode = { id: "dup", label: "First" };
    const second: TreeNode = { id: "dup", label: "Second" };
    const onSelect = vi.fn();
    setup({
      data: [first, second],
      items: () => [{ id: "go", label: "Go", onSelect }],
    });
    const rows = screen.getAllByRole("treeitem");
    fireEvent.contextMenu(rows[1]!);
    fireEvent.click(screen.getByRole("menuitem"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(second);
  });
});

describe("keyboard navigation", () => {
  const open = () => {
    fireEvent.contextMenu(row("b"));
    return menu()!;
  };

  it("arrows move between enabled items with wrap-around, Home/End jump", () => {
    setup();
    const m = open();
    const [, one, two] = menuItems();
    expect(document.activeElement).toBe(one);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(two);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(one); // wraps, skipping the disabled one
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(two);
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(one);
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(two);
    expect(m.isConnected).toBe(true);
  });

  it("Enter on an item calls onSelect once with the node and closes the menu", () => {
    const { onSelects } = setup();
    open();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onSelects.two).toHaveBeenCalledTimes(1);
    expect(onSelects.two).toHaveBeenCalledWith(tree[1]);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(row("b"));
  });

  it("Tab closes the menu and returns focus to the row", () => {
    setup();
    open();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(row("b"));
  });

  it("with only disabled items the focus stays on the menu and nothing runs", () => {
    const onSelect = vi.fn();
    setup({
      items: () => [{ id: "x", label: "X", onSelect, disabled: true }],
    });
    const m = open();
    expect(document.activeElement).toBe(m);
    fireEvent.keyDown(m, { key: "ArrowDown" });
    expect(document.activeElement).toBe(m);
    fireEvent.keyDown(menuItems()[0]!, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
  });
});

describe("items", () => {
  it("click calls onSelect once with the right node and closes", () => {
    const { onSelects } = setup();
    fireEvent.contextMenu(row("a"));
    fireEvent.click(menuItems()[1]!);
    expect(onSelects.one).toHaveBeenCalledTimes(1);
    expect(onSelects.one).toHaveBeenCalledWith(tree[0]);
    expect(menu()).toBeNull();
  });

  it("a disabled item has aria-disabled and ignores click and Enter", () => {
    const { onSelects } = setup();
    fireEvent.contextMenu(row("a"));
    const disabled = menuItems()[0]!;
    expect(disabled.getAttribute("aria-disabled")).toBe("true");
    expect(menuItems()[1]!.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(disabled);
    fireEvent.keyDown(disabled, { key: "Enter" });
    expect(onSelects.off).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
  });

  it("renderItem and the class names customise the markup", () => {
    render(
      <TreeView
        data={tree}
        contextMenu={{
          items: () => [{ id: "x", label: "X", onSelect: vi.fn() }],
          className: "m",
          itemClassName: "i",
          renderItem: (item) => <b>{item.label}!</b>,
          "aria-label": "Actions",
        }}
      />,
    );
    fireEvent.contextMenu(row("b"));
    expect(menu()!.className).toBe("m");
    expect(menu()!.getAttribute("aria-label")).toBe("Actions");
    expect(menuItems()[0]!.className).toBe("i");
    expect(menuItems()[0]!.innerHTML).toBe("<b>X!</b>");
  });
});

describe("closing", () => {
  it("Esc closes and the focus returns to the originating treeitem", () => {
    setup();
    fireEvent.contextMenu(row("b"));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(row("b"));
  });

  it("a click outside closes it and the focus returns to the treeitem", () => {
    setup();
    fireEvent.contextMenu(row("b"));
    fireEvent.click(document.body);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(row("b"));
  });

  it("a click on another control closes it without stealing focus from that control", () => {
    setup();
    fireEvent.contextMenu(row("b"));
    const button = screen.getByText("outside");
    button.focus();
    fireEvent.click(button);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("a click inside the menu on its container does not close it", () => {
    setup();
    fireEvent.contextMenu(row("b"));
    fireEvent.click(menu()!);
    expect(menu()).not.toBeNull();
  });

  it("scrolling the tree container closes it", () => {
    setup();
    fireEvent.contextMenu(row("b"));
    fireEvent.scroll(screen.getByRole("tree"));
    expect(menu()).toBeNull();
  });

  it("a window resize closes it", () => {
    setup();
    fireEvent.contextMenu(row("b"));
    fireEvent.resize(window);
    expect(menu()).toBeNull();
  });

  it("right click on another node moves the menu to that node", () => {
    const { onSelects } = setup();
    fireEvent.contextMenu(row("a"));
    fireEvent.contextMenu(row("b"));
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    fireEvent.click(menuItems()[1]!);
    expect(onSelects.one).toHaveBeenCalledWith(tree[1]);
  });
});

describe("viewport", () => {
  it("keeps the menu inside the viewport near the right/bottom edge", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 50,
      top: 0,
      left: 0,
      right: 100,
      bottom: 50,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    setup();
    fireEvent.contextMenu(row("b"), {
      clientX: window.innerWidth - 2,
      clientY: window.innerHeight - 2,
    });
    expect(menu()!.style.left).toBe(`${window.innerWidth - 100 - 4}px`);
    expect(menu()!.style.top).toBe(`${window.innerHeight - 50 - 4}px`);
  });

  it("never goes past the top/left edge", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 5000,
      height: 5000,
      top: 0,
      left: 0,
      right: 5000,
      bottom: 5000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    setup();
    fireEvent.contextMenu(row("b"), { clientX: 300, clientY: 300 });
    expect(menu()!.style.left).toBe("4px");
    expect(menu()!.style.top).toBe("4px");
  });
});

describe("listener cleanup", () => {
  const trackedEvents = ["click", "keydown", "scroll", "resize"];

  function spies() {
    const docAdd = vi.spyOn(document, "addEventListener");
    const docRemove = vi.spyOn(document, "removeEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");
    const winRemove = vi.spyOn(window, "removeEventListener");
    const calls = (spy: { mock: { calls: unknown[][] } }) =>
      spy.mock.calls.filter((c) => trackedEvents.includes(c[0] as string));
    return { docAdd, docRemove, winAdd, winRemove, calls };
  }

  // Every listener added to document/window while the menu was open must have a matching
  // removeEventListener with the same type, handler and capture flag.
  function expectBalanced(s: ReturnType<typeof spies>) {
    const added = [...s.calls(s.docAdd), ...s.calls(s.winAdd)];
    const removed = [...s.calls(s.docRemove), ...s.calls(s.winRemove)];
    expect(added.length).toBeGreaterThanOrEqual(4);
    for (const call of added) {
      const match = removed.find(
        (r) => r[0] === call[0] && r[1] === call[1] && r[2] === call[2],
      );
      expect(match, `listener "${String(call[0])}" was not removed`).toBeDefined();
    }
  }

  it("removes the document/window listeners when the menu closes", () => {
    setup();
    const s = spies();
    fireEvent.contextMenu(row("b"));
    expect(menu()).not.toBeNull();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(menu()).toBeNull();
    expectBalanced(s);
  });

  it("removes them when a menu item closes it", () => {
    setup();
    const s = spies();
    fireEvent.contextMenu(row("b"));
    fireEvent.click(menuItems()[1]!);
    expectBalanced(s);
  });

  it("removes them when the component unmounts with the menu open", () => {
    const { unmount } = setup();
    const s = spies();
    fireEvent.contextMenu(row("b"));
    unmount();
    expectBalanced(s);
  });

  it("the standalone TreeContextMenu removes them on unmount too", () => {
    const s = spies();
    const { unmount } = render(
      <TreeContextMenu
        node={tree[1]!}
        items={[{ id: "x", label: "X", onSelect: vi.fn() }]}
        anchor={{ x: 10, y: 10 }}
        onClose={vi.fn()}
      />,
    );
    unmount();
    expectBalanced(s);
  });

  it("does not react to events after it closed (no stale handler)", () => {
    const { onSelects } = setup();
    fireEvent.contextMenu(row("b"));
    act(() => {
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    });
    // No menu: these must not throw or reopen anything.
    fireEvent.scroll(window);
    fireEvent.click(document.body);
    expect(menu()).toBeNull();
    expect(onSelects.one).not.toHaveBeenCalled();
  });
});
