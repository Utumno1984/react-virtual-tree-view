import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const maxStory = (id: string, args = "") =>
  `/iframe.html?id=draggabletreeview-draggablemaxdepth--${id}&viewMode=story${args}`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const indicator = (page: Page) => page.locator("[data-drop-indicator]");
const levels = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => Number(el.getAttribute("aria-level"))));

async function dragTo(page: Page, id: string, over: string, dx: number) {
  const a = await node(page, id).boundingBox();
  const b = await node(page, over).boundingBox();
  if (!a || !b) throw new Error("row not visible");
  const sx = a.x + a.width / 2;
  const sy = a.y + a.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx, sy + 8, { steps: 3 });
  await page.mouse.move(sx + dx, b.y + b.height / 2, { steps: 12 });
}

test.describe("maxDepth QA", () => {
  test("a subtree taller than the limit stays at the minimum depth, no exception, coherent tree", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(maxStory("roots-only"));
    await dragTo(page, "C", "misc", 96);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "0");
    await expect(indicator(page)).toHaveAttribute("data-depth-clamped", "true");
    await page.mouse.up();
    await expect(node(page, "C")).toHaveAttribute("aria-level", "1");
    await expect(node(page, "C1")).toHaveAttribute("aria-level", "2");
    expect(errors).toEqual([]);
  });

  test("dropping a node with children between rows already at the deepest level never exceeds maxDepth", async ({
    page,
  }) => {
    await page.goto(maxStory("default"));
    // docs (height 1) over C1 (depth 2, the deepest allowed row): the slot before C1 forces depth >= 2
    await dragTo(page, "docs", "C1", 0);
    await page.mouse.up();
    // every treeitem must stay at aria-level <= maxDepth + 1 = 3
    expect(Math.max(...(await levels(page)))).toBeLessThanOrEqual(3);
  });

  test("without maxDepth the indicator is never clamped, even far to the right", async ({ page }) => {
    await page.goto(maxStory("default", "&args=maxDepth:!undefined"));
    await expect(page.getByTestId("max-depth")).toContainText("maxDepth = none");
    await dragTo(page, "A", "C1", 120);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "3");
    await expect(indicator(page)).toHaveAttribute("data-depth-clamped", "false");
    await page.mouse.up();
  });

  test("invalid maxDepth (negative, non-integer) behaves as no limit and does not crash", async ({ page }) => {
    for (const v of ["-1", "1.5"]) {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(maxStory("default", `&args=maxDepth:${v}`));
      await dragTo(page, "A", "C1", 96);
      await expect(indicator(page)).toHaveAttribute("data-depth-clamped", "false");
      await page.mouse.up();
      expect(Math.max(...(await levels(page)))).toBeGreaterThan(3);
      expect(errors).toEqual([]);
    }
  });
});
