import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import type { TreeContextMenuProps } from "./types";

/** Minimum distance kept between the menu and the viewport edge. */
const VIEWPORT_MARGIN = 4;

const ENABLED_ITEMS = '[role="menuitem"]:not([aria-disabled="true"])';

/**
 * Headless context menu for a tree node: a `role="menu"` rendered inline with
 * `position: fixed` (no portal: `react-dom` is not a peer dependency), kept inside the
 * viewport, with arrow/Home/End navigation, Esc / outside click / scroll / resize to close.
 * It carries no style: use `className`, `itemClassName` and `renderItem`.
 *
 * `position: fixed` is relative to the viewport unless an ancestor has a `transform`,
 * `filter` or `contain`: render it outside such an ancestor.
 */
export function TreeContextMenu<T = unknown>({
  node,
  items,
  anchor,
  onClose,
  className,
  itemClassName,
  renderItem,
  "aria-label": ariaLabel,
}: TreeContextMenuProps<T>): ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: anchor.x, top: anchor.y });
  // The listeners below are attached once; they must see the latest `onClose`.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Measure before paint and keep the whole menu inside the viewport. A keyboard anchor
  // (`altY`) that would overflow the bottom flips above the row instead.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - height - VIEWPORT_MARGIN;
    let top = anchor.y;
    if (anchor.altY !== undefined && top > maxTop && anchor.altY - height >= VIEWPORT_MARGIN) {
      top = anchor.altY - height;
    }
    setPosition({
      left: Math.max(VIEWPORT_MARGIN, Math.min(anchor.x, maxLeft)),
      top: Math.max(VIEWPORT_MARGIN, Math.min(top, maxTop)),
    });
  }, [anchor.x, anchor.y, anchor.altY, items]);

  const enabledItems = useCallback(
    () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ENABLED_ITEMS) ?? []),
    [],
  );

  // Focus the first enabled item; with none (empty or all disabled) the menu itself.
  useEffect(() => {
    (enabledItems()[0] ?? menuRef.current)?.focus({ preventScroll: true });
  }, [enabledItems]);

  // Document/window listeners live only while the menu is mounted and are removed with it.
  useEffect(() => {
    const menu = menuRef.current;
    const onDocumentClick = (event: MouseEvent) => {
      if (menu && event.target instanceof Node && menu.contains(event.target)) return;
      // Give focus back to the row unless the click moved it to some other control.
      const active = document.activeElement;
      onCloseRef.current(active === null || active === document.body || !!menu?.contains(active));
    };
    const onDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current(true);
    };
    const onScroll = (event: Event) => {
      // Capture phase: scroll events do not bubble, this catches the tree's own container.
      if (menu && event.target instanceof Node && menu.contains(event.target)) return;
      onCloseRef.current(true);
    };
    const onResize = () => onCloseRef.current(true);
    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("keydown", onDocumentKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("keydown", onDocumentKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const move = (current: HTMLElement | null, target: "next" | "previous" | "first" | "last") => {
    const list = enabledItems();
    if (list.length === 0) return;
    const at = current ? list.indexOf(current) : -1;
    let index = 0;
    if (target === "last") index = list.length - 1;
    else if (target === "next") index = at < 0 ? 0 : (at + 1) % list.length;
    else if (target === "previous") index = at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length;
    list[index]?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const current = event.target instanceof HTMLElement ? event.target : null;
    switch (event.key) {
      case "ArrowDown":
        move(current, "next");
        break;
      case "ArrowUp":
        move(current, "previous");
        break;
      case "Home":
        move(current, "first");
        break;
      case "End":
        move(current, "last");
        break;
      case "Tab":
        // A menu is not a tab stop: leave it and let focus return to the row.
        onClose(true);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel ?? node.label}
      tabIndex={-1}
      data-tree-context-menu=""
      className={className}
      onKeyDown={onKeyDown}
      // The menu replaces the native one: do not let it appear on top of ours.
      onContextMenu={(event) => event.preventDefault()}
      style={{ position: "fixed", left: position.left, top: position.top, zIndex: 1000 }}
    >
      {items.map((item) => {
        const disabled = !!item.disabled;
        const activate = () => {
          if (disabled) return;
          onClose(true);
          item.onSelect(node);
        };
        return (
          <div
            key={item.id}
            role="menuitem"
            tabIndex={-1}
            aria-disabled={disabled ? true : undefined}
            data-menu-item-id={item.id}
            className={itemClassName}
            onClick={activate}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              activate();
            }}
          >
            {renderItem ? renderItem(item) : item.label}
          </div>
        );
      })}
    </div>
  );
}
