import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { dragToZone, node, storyUrl } from "./helpers";

const url = storyUrl("draggabletreeview-draggable--long-subtree");
const indicator = (page: Page) => page.locator("[data-drop-indicator]");
const log = (page: Page) => page.getByTestId("last-event");

// #63 (review): the lower band of an expanded row with a long visible subtree must keep the
// indicator next to the pointer (first-child zone), not past the 200th child, off the window.
test.describe("drop zones on a long expanded subtree", () => {
  test("the lower band of the expanded parent shows the line right under its row", async ({ page }) => {
    await page.goto(url);
    await expect(node(page, "P")).toBeVisible();
    await dragToZone(page, node(page, "X"), node(page, "P"), "after");
    // the drag is really active (positive anchor) before asserting anything about the line
    await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    await expect(node(page, "X")).toHaveAttribute("data-dragging", "");
    await expect(indicator(page)).toBeVisible();
    await expect(indicator(page)).toHaveAttribute("data-drop-zone", "after");
    await expect(indicator(page)).toHaveAttribute("data-drop-mode", "line");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");

    const line = await indicator(page).boundingBox();
    const parent = await node(page, "P").boundingBox();
    const first = await node(page, "P-0").boundingBox();
    if (!line || !parent || !first) throw new Error("expected boxes");
    // adjacent to the P row: between P's bottom edge and the first child's top edge
    expect(Math.abs(line.y - (parent.y + parent.height))).toBeLessThanOrEqual(2);
    expect(Math.abs(line.y - first.y)).toBeLessThanOrEqual(2);

    await page.mouse.up();
    await expect(log(page)).toContainText('{"nodeId":"X","fromParentId":null,"toParentId":"P","index":0}');
    await expect(node(page, "X")).toHaveAttribute("aria-level", "2");
  });
});
