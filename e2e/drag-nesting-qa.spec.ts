import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=draggabletreeview-draggable--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const indicator = (page: Page) => page.locator("[data-drop-indicator]");

async function center(page: Page, id: string) {
  const box = await node(page, id).boundingBox();
  if (!box) throw new Error(`row ${id} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("DraggableTreeView nesting QA", () => {
  test("dragging the last row far left stays at depth 0 and far right is clamped", async ({ page }) => {
    await page.goto(story("draggable"));
    const s = await center(page, "misc");
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(s.x, s.y + 8, { steps: 3 });
    const tree = await page.getByRole("tree").boundingBox();
    if (!tree) throw new Error("tree not visible");
    await page.mouse.move(tree.x + 2, s.y, { steps: 8 });
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "0");
    await page.mouse.move(tree.x + tree.width - 2, s.y, { steps: 8 });
    const d = Number(await indicator(page).getAttribute("data-projected-depth"));
    expect(d).toBeLessThanOrEqual(3);
    await page.mouse.up();
    await expect(indicator(page)).toHaveCount(0);
  });

  test("keyboard navigation and selection still work after a nesting drop", async ({ page }) => {
    await page.goto(story("draggable"));
    const s = await center(page, "B");
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(s.x, s.y + 8, { steps: 3 });
    await page.mouse.move(s.x + 24, s.y, { steps: 8 });
    await page.mouse.up();
    await expect(node(page, "B")).toHaveAttribute("aria-level", "3");
    await node(page, "A").focus();
    await page.keyboard.press("ArrowDown");
    await expect(node(page, "B")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(node(page, "B")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(node(page, "A")).toBeFocused();
  });
});
