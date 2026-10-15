import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=draggabletreeview-draggable--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const order = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => el.getAttribute("data-node-id")));

async function drag(page: Page, id: string, dx: number) {
  await node(page, id).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300); // let the virtual list settle after the previous drop
  const box = await node(page, id).boundingBox();
  if (!box) throw new Error("not visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 8, { steps: 3 });
  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.move(x + dx, y, { steps: 10 });
  await page.mouse.up();
}

test.describe("nesting QA round 2 (LargeTree)", () => {
  test("repeated nest / un-nest on 1500 nodes keeps levels coherent", async ({ page }) => {
    await page.goto(story("large-tree"));
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    const before = await order(page);
    const id = before[1]!;
    for (let i = 0; i < 3; i++) {
      await drag(page, id, 24);
      await expect(node(page, id)).toHaveAttribute("aria-level", "2");
      await drag(page, id, -24);
      await expect(node(page, id)).toHaveAttribute("aria-level", "1");
    }
    // node-0 stays expanded after the first nesting (by design); the moved node is a root again, 2nd of the roots
    await expect(node(page, id)).toHaveAttribute("aria-posinset", "2");
    await expect(node(page, id)).toHaveAttribute("aria-setsize", "117");
  });
});
