import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

const story = "/iframe.html?id=draggabletreeview-draggable--draggable&viewMode=story";
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const log = (page: Page) => page.getByTestId("last-event");
const order = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => el.getAttribute("data-node-id")));

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

async function touch(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  p?: { x: number; y: number },
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: p ? [{ x: p.x, y: p.y }] : [],
  });
}

async function center(page: Page, id: string) {
  const box = await node(page, id).boundingBox();
  if (!box) throw new Error(`row ${id} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("DraggableTreeView touch drag", () => {
  test("a real touch drag reorders the tree and is not cancelled", async ({ page }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const start = await center(page, "A");
    const end = await center(page, "C");

    await touch(cdp, "touchStart", start);
    // small moves first (past the activation distance), then travel to the target
    for (let i = 1; i <= 4; i++) await touch(cdp, "touchMove", { x: start.x, y: start.y + i * 3 });
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await touch(cdp, "touchMove", {
        x: start.x + ((end.x - start.x) * i) / steps,
        y: start.y + 12 + ((end.y - start.y - 12) * i) / steps,
      });
    }
    await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    await touch(cdp, "touchEnd");

    await expect(log(page)).toContainText(
      '{"nodeId":"A","fromParentId":"p","toParentId":"p","index":2}',
    );
    await expect
      .poll(() => order(page))
      .toEqual(["p", "B", "C", "C1", "A", "D", "docs", "cv", "notes", "misc"]);
    await expect(page.getByText("Dragging was cancelled", { exact: false })).toHaveCount(0);
    // virtualized rows are still positioned with `top`, and the row keeps touch-action: none
    const style = await node(page, "A").evaluate((el) => ({
      top: (el as HTMLElement).style.top,
      touchAction: (el as HTMLElement).style.touchAction,
    }));
    expect(style.touchAction).toBe("none");
    expect(style.top).not.toBe("");
  });
});
