import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=draggabletreeview-draggable--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const log = (page: Page) => page.getByTestId("last-event");
const order = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => el.getAttribute("data-node-id")));
async function center(page: Page, id: string) {
  const box = await node(page, id).boundingBox();
  if (!box) throw new Error(`row ${id} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function dragTo(page: Page, from: string, to: { x: number; y: number }) {
  const start = await center(page, from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
}

test.describe("DraggableTreeView reorder QA", () => {
  test("LargeTree (1500 nodes): reordering root siblings really reorders", async ({ page }) => {
    await page.goto(story("large-tree"));
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    const ids = await order(page);
    expect(ids.length).toBeGreaterThan(2);
    await dragTo(page, ids[0]!, await center(page, ids[2]!));
    await page.mouse.up();
    await expect(log(page)).toContainText(`"nodeId":"${ids[0]}"`);
    await expect.poll(async () => (await order(page)).indexOf(ids[0]!)).toBeGreaterThan(1);
  });

  test("dropping on a node with a different parent does not corrupt the tree", async ({ page }) => {
    await page.goto(story("draggable"));
    await expect(node(page, "misc")).toBeVisible();
    const before = await order(page);
    await dragTo(page, "A", await center(page, "cv"));
    await page.mouse.up();
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    const after = await order(page);
    expect(after.slice().sort()).toEqual(before.slice().sort());
  });

  test("keyboard navigation still works in the draggable tree", async ({ page }) => {
    await page.goto(story("draggable"));
    await node(page, "p").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-node-id"));
    expect(focused).toBe("A");
    await expect(node(page, "A")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect(node(page, "B")).toHaveAttribute("aria-selected", "true");
    await node(page, "p").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(node(page, "A")).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(node(page, "A")).toBeVisible();
  });

  test("a second drag after the first works", async ({ page }) => {
    await page.goto(story("draggable"));
    await dragTo(page, "A", await center(page, "C"));
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"A"');
    await dragTo(page, "B", await center(page, "A"));
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"B"');
  });
});
