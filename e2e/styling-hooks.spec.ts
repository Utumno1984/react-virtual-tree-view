import { expect, test } from "@playwright/test";
import { center, dragToPoint, moveToZone, node, startDrag, storyUrl } from "./helpers";

/** The hooks documented in docs/styling-hooks.md exist in the DOM and the example theme reacts to them. */

const bg = (loc: ReturnType<typeof node>) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);

test.beforeEach(async ({ page }) => {
  await page.goto(storyUrl("styling-exampletheme--themed"));
  await expect(page.getByRole("tree")).toBeVisible();
});

test("row ARIA hooks and theme: selection and disabled", async ({ page }) => {
  const docs = node(page, "docs");
  await expect(docs).toHaveAttribute("aria-expanded", "true");
  await expect(docs).toHaveAttribute("aria-level", "1");
  await expect(node(page, "cv")).not.toHaveAttribute("aria-expanded");

  await node(page, "notes").click();
  await expect(node(page, "notes")).toHaveAttribute("aria-selected", "true");
  // move the pointer away so the hover style cannot override the selected background
  await page.mouse.move(0, 0);
  expect(await bg(node(page, "notes"))).toBe("rgb(219, 234, 254)");

  const locked = node(page, "locked");
  await expect(locked).toHaveAttribute("aria-disabled", "true");
  await expect(locked).toHaveAttribute("data-disabled", "");
  await expect(locked).toHaveAttribute("data-drag-disabled", "");
  expect(await locked.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(156, 163, 175)");
});

test("drag hooks: data-dragging, data-drag-overlay, data-drop-indicator", async ({ page }) => {
  const cv = node(page, "cv");
  const target = await center(node(page, "notes"));
  await dragToPoint(page, cv, target);
  await expect(cv).toHaveAttribute("data-dragging", "");
  await expect(page.locator("[data-drag-overlay]")).toBeVisible();
  const overlayStyle = await page.locator("[data-drag-overlay]").evaluate((el) => {
    const s = getComputedStyle(el);
    return { display: s.display, borderTopWidth: s.borderTopWidth, borderTopColor: s.borderTopColor };
  });
  expect(overlayStyle).toEqual({ display: "flex", borderTopWidth: "1px", borderTopColor: "rgb(37, 99, 235)" });
  const indicator = page.locator("[data-drop-indicator]");
  await expect(indicator).toHaveAttribute("data-projected-depth", /^\d+$/);
  await expect(indicator).toHaveAttribute("data-depth-clamped", /^(true|false)$/);
  await page.mouse.up();
  await expect(page.locator("[data-dragging]")).toHaveCount(0);
});

test("context menu hooks", async ({ page }) => {
  await node(page, "cv").click({ button: "right" });
  const menu = page.locator("[data-tree-context-menu]");
  await expect(menu).toHaveAttribute("role", "menu");
  await expect(menu.locator('[data-menu-item-id="delete"]')).toHaveAttribute("aria-disabled", "true");
  await expect(menu.locator('[data-menu-item-id="rename"]')).not.toHaveAttribute("aria-disabled");
});

test("search highlight wraps matches in mark", async ({ page }) => {
  await page.goto(storyUrl("styling-exampletheme--themed-search"));
  await expect(page.getByRole("tree").locator("mark").first()).toBeVisible();
});

// #63: the orange "clamped" indicator is gone (maxDepth now refuses a zone instead of cutting the
// depth, so `data-depth-clamped` is always "false"); the theme distinguishes the sibling line from
// the "becomes a child" row highlight instead.
test("drop indicator: accent line for the sibling zones, highlighted row for 'becomes a child'", async ({
  page,
}) => {
  const marker = page.locator("[data-drop-indicator]");
  const cv = node(page, "cv");

  // upper quarter of "notes": a line
  await startDrag(page, cv);
  await moveToZone(page, node(page, "notes"), "before");
  await expect(marker).toHaveAttribute("data-drop-mode", "line");
  await expect(marker).toHaveAttribute("data-depth-clamped", "false");
  await expect(marker.locator(".rvtv-drop-child")).toHaveCount(0);
  expect(await marker.locator(".rvtv-drop-line").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    "rgb(37, 99, 235)",
  );

  // middle of "notes": the whole row is highlighted
  await moveToZone(page, node(page, "notes"), "inside");
  await expect(marker).toHaveAttribute("data-drop-mode", "child");
  await expect(marker.locator(".rvtv-drop-line")).toHaveCount(0);
  const child = marker.locator(".rvtv-drop-child");
  const style = await child.evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderTopColor, width: s.borderTopWidth, height: el.getBoundingClientRect().height };
  });
  expect(style).toEqual({ border: "rgb(37, 99, 235)", width: "2px", height: 32 });

  // maxDepth 2 refuses "becomes a child" of a depth-2 row: no indicator at all. Cancel the
  // drag first (a drop would nest "cv" under "notes" and make "notes" a subtree of height 1,
  // which no longer fits after "q2").
  await page.keyboard.press("Escape");
  await page.mouse.up();
  // let the cancel animation finish: a drag started during it is not picked up
  await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
  await node(page, "reports").locator("[data-toggle]").click();
  await expect(node(page, "q2")).toBeVisible();
  await startDrag(page, node(page, "notes"));
  await moveToZone(page, node(page, "q2"), "inside");
  await expect(marker).toHaveCount(0);
  await moveToZone(page, node(page, "q2"), "after");
  await expect(marker).toHaveAttribute("data-drop-mode", "line");
  await page.mouse.up();
});

test("context menu item shows a visible outline on keyboard focus", async ({ page }) => {
  await page.keyboard.press("Tab");
  await expect(node(page, "docs")).toBeFocused();
  await page.keyboard.press("Shift+F10");
  const first = page.getByRole("menuitem", { name: "Rename (demo)" });
  await expect(first).toBeFocused();
  const s = await first.evaluate((el) => {
    const c = getComputedStyle(el);
    return { style: c.outlineStyle, width: c.outlineWidth, color: c.outlineColor, bg: c.backgroundColor };
  });
  expect(s.style).not.toBe("none");
  expect(s.width).toBe("2px");
  expect(s.color).toBe("rgb(37, 99, 235)");
  expect(s.bg).not.toBe("rgb(219, 234, 254)"); // distinct from the hover background
});
