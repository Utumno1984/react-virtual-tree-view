import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { dragToZone, moveToZone, startDrag } from "./helpers";

const story = (id: string) => `/iframe.html?id=draggabletreeview-draggable--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const indicator = (page: Page) => page.locator("[data-drop-indicator]");

test.describe("DraggableTreeView nesting QA", () => {
  test("the horizontal position is ignored: far left and far right of the same zone give the same depth", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    const tree = await page.getByRole("tree").boundingBox();
    if (!tree) throw new Error("tree not visible");
    const row = await node(page, "docs").boundingBox();
    if (!row) throw new Error("row not visible");
    const middle = row.x + row.width / 2;
    await startDrag(page, node(page, "misc"));
    // lower quarter of the open "docs": next root, depth 0, at both horizontal extremes
    await moveToZone(page, node(page, "docs"), "after", tree.x + 2 - middle);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "0");
    await moveToZone(page, node(page, "docs"), "after", tree.x + tree.width - 2 - middle);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "0");
    // middle of "docs": child, depth 1, at both extremes
    await moveToZone(page, node(page, "docs"), "inside", tree.x + 2 - middle);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await moveToZone(page, node(page, "docs"), "inside", tree.x + tree.width - 2 - middle);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    await expect(indicator(page)).toHaveCount(0);
  });

  test("keyboard navigation and selection still work after a nesting drop", async ({ page }) => {
    await page.goto(story("draggable"));
    await dragToZone(page, node(page, "B"), node(page, "A"), "inside");
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
