import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { dragToZone } from "./helpers";

const maxStory = (id: string, args = "") =>
  `/iframe.html?id=draggabletreeview-draggablemaxdepth--${id}&viewMode=story${args}`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const indicator = (page: Page) => page.locator("[data-drop-indicator]");
const levels = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => Number(el.getAttribute("aria-level"))));

test.describe("maxDepth QA", () => {
  test("a subtree taller than the limit goes to the root level only, no exception, coherent tree", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(maxStory("roots-only"));
    // as a child of misc it would be deeper: refused
    await dragToZone(page, node(page, "C"), node(page, "misc"), "inside");
    await expect(indicator(page)).toHaveCount(0);
    // as a root (the shallowest depth) it is allowed even though its child exceeds the limit
    await dragToZone(page, node(page, "C"), node(page, "misc"), "after");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "0");
    await page.mouse.up();
    await expect(node(page, "C")).toHaveAttribute("aria-level", "1");
    await expect(node(page, "C1")).toHaveAttribute("aria-level", "2");
    expect(errors).toEqual([]);
  });

  test("dropping a node with children next to rows already at the deepest level never exceeds maxDepth", async ({
    page,
  }) => {
    await page.goto(maxStory("default"));
    // docs (height 1) needs depth <= 1; C1 is at depth 2, so every zone of its row is refused
    for (const zone of ["before", "inside", "after"] as const) {
      await dragToZone(page, node(page, "docs"), node(page, "C1"), zone);
      await expect(indicator(page)).toHaveCount(0);
      await page.mouse.up();
    }
    // every treeitem must stay at aria-level <= maxDepth + 1 = 3
    expect(Math.max(...(await levels(page)))).toBeLessThanOrEqual(3);
  });

  test("without maxDepth the indicator is never clamped, even for a deep target", async ({ page }) => {
    await page.goto(maxStory("default", "&args=maxDepth:!undefined"));
    await expect(page.getByTestId("max-depth")).toContainText("maxDepth = none");
    await dragToZone(page, node(page, "A"), node(page, "C1"), "inside");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "3");
    await expect(indicator(page)).toHaveAttribute("data-depth-clamped", "false");
    await page.mouse.up();
  });

  test("invalid maxDepth (negative, non-integer) behaves as no limit and does not crash", async ({ page }) => {
    for (const v of ["-1", "1.5"]) {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(maxStory("default", `&args=maxDepth:${v}`));
      await dragToZone(page, node(page, "A"), node(page, "C1"), "inside");
      await expect(indicator(page)).toHaveAttribute("data-depth-clamped", "false");
      await page.mouse.up();
      expect(Math.max(...(await levels(page)))).toBeGreaterThan(3);
      expect(errors).toEqual([]);
    }
  });
});
