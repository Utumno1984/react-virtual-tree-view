import { expect, test } from "@playwright/test";
import { center, dragToPoint, node, storyUrl } from "./helpers";

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
