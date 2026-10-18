import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { dragToZone } from "./helpers";
import type { DropZoneName } from "./helpers";

const story = (id: string) => `/iframe.html?id=draggabletreeview-draggable--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const order = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => el.getAttribute("data-node-id")));

async function drag(page: Page, id: string, targetId: string, zone: DropZoneName) {
  await node(page, id).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300); // let the virtual list settle after the previous drop
  await dragToZone(page, node(page, id), node(page, targetId), zone);
  await page.mouse.up();
}

test.describe("nesting QA round 2 (LargeTree)", () => {
  test("repeated nest / un-nest on 1500 nodes keeps levels coherent", async ({ page }) => {
    await page.goto(story("large-tree"));
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    const before = await order(page);
    const id = before[1]!;
    const target = before[2]!;
    for (let i = 0; i < 3; i++) {
      // middle of the third root: the second root becomes its (first) child
      await drag(page, id, target, "inside");
      await expect(node(page, id)).toHaveAttribute("aria-level", "2");
      // upper quarter of the root after the target (the target is open now): the id becomes a
      // root again, after the target's visible subtree
      await drag(page, id, before[3]!, "before");
      await expect(node(page, id)).toHaveAttribute("aria-level", "1");
    }
    // the target stays expanded after the first nesting (by design); the moved node is a root again, now the 3rd of the roots
    await expect(node(page, id)).toHaveAttribute("aria-posinset", "3");
    await expect(node(page, id)).toHaveAttribute("aria-setsize", "117");
  });
});
