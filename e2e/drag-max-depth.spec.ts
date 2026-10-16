import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) =>
  `/iframe.html?id=draggabletreeview-draggablemaxdepth--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const log = (page: Page) => page.getByTestId("last-event");
const indicator = (page: Page) => page.locator("[data-drop-indicator]");
const levels = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => Number(el.getAttribute("aria-level"))));

async function center(page: Page, id: string) {
  const box = await node(page, id).boundingBox();
  if (!box) throw new Error(`row ${id} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press on `id`, then move to the vertical centre of row `over` shifted `dx` px to the right. */
async function dragTo(page: Page, id: string, over: string, dx: number) {
  const start = await center(page, id);
  const target = await center(page, over);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 8, { steps: 3 });
  await page.mouse.move(start.x + dx, target.y, { steps: 12 });
}

test.describe("DraggableTreeView maxDepth", () => {
  test("a leaf dragged to projected depth 3 is cut to 2 and lands at aria-level 3", async ({ page }) => {
    await page.goto(story("default"));
    await expect(page.getByTestId("max-depth")).toContainText("maxDepth = 2");
    await dragTo(page, "A", "C1", 72);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    await expect(indicator(page)).toHaveAttribute("data-depth-clamped", "true");
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"A","fromParentId":"p","toParentId":"C"');
    await expect(node(page, "A")).toHaveAttribute("aria-level", "3");
    expect(Math.max(...(await levels(page)))).toBe(3);
    await expect(indicator(page)).toHaveCount(0);
  });

  test("a projection within the limit is not flagged", async ({ page }) => {
    await page.goto(story("default"));
    await dragTo(page, "A", "C1", 24);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    await expect(indicator(page)).toHaveAttribute("data-depth-clamped", "false");
    await page.mouse.up();
  });

  test("a node with children is cut one level earlier and its children stay within the limit", async ({
    page,
  }) => {
    await page.goto(story("default"));
    // C has a child (height 1): nesting under A would give depth 2, so it is cut to 1
    await dragTo(page, "C", "B", 48);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await expect(indicator(page)).toHaveAttribute("data-depth-clamped", "true");
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"C","fromParentId":"p","toParentId":"p"');
    await expect(node(page, "C")).toHaveAttribute("aria-level", "2");
    await expect(node(page, "C1")).toHaveAttribute("aria-level", "3");
    expect(Math.max(...(await levels(page)))).toBe(3);
  });

  test("maxDepth 0: dragging to the right only reorders among the roots", async ({ page }) => {
    await page.goto(story("roots-only"));
    await dragTo(page, "tail", "misc", 72);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "0");
    await expect(indicator(page)).toHaveAttribute("data-depth-clamped", "true");
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"tail","fromParentId":null,"toParentId":null,"index":2');
    await expect(node(page, "tail")).toHaveAttribute("aria-level", "1");
  });
});
