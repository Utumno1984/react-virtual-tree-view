import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

const story = "/iframe.html?id=draggabletreeview-draggable--draggable&viewMode=story";
const longStory = (id = "default") =>
  `/iframe.html?id=draggabletreeview-draggableautoscroll--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const log = (page: Page) => page.getByTestId("last-event");
const order = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => el.getAttribute("data-node-id")));
const scrollTop = (page: Page) => page.getByRole("tree").evaluate((el) => el.scrollTop);

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

type Point = { x: number; y: number };

async function touch(cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", p?: Point) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: p ? [{ x: p.x, y: p.y }] : [],
  });
}

async function center(page: Page, id: string): Promise<Point> {
  const box = await node(page, id).boundingBox();
  if (!box) throw new Error(`row ${id} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press, hold past the touch activation delay, then move along `path` (the caller releases). */
async function longPressAndMove(page: Page, cdp: CDPSession, start: Point, path: Point[]) {
  await touch(cdp, "touchStart", start);
  await page.waitForTimeout(400);
  for (const p of path) await touch(cdp, "touchMove", p);
}

function lerp(from: Point, to: Point, steps: number): Point[] {
  return Array.from({ length: steps }, (_, i) => ({
    x: from.x + ((to.x - from.x) * (i + 1)) / steps,
    y: from.y + ((to.y - from.y) * (i + 1)) / steps,
  }));
}

/** A quick swipe (no long-press) moving the finger up by `distance` px: scrolls the content down. */
async function swipeUp(cdp: CDPSession, from: Point, distance: number) {
  await touch(cdp, "touchStart", from);
  for (const p of lerp(from, { x: from.x, y: from.y - distance }, 15)) await touch(cdp, "touchMove", p);
  await touch(cdp, "touchEnd");
}

test.describe("DraggableTreeView touch", () => {
  test("a long-press drag reorders the tree and is not cancelled", async ({ page }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const start = await center(page, "A");
    const end = await center(page, "C");

    await longPressAndMove(page, cdp, start, [
      { x: start.x, y: start.y + 6 },
      ...lerp({ x: start.x, y: start.y + 6 }, end, 12),
    ]);
    await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    await touch(cdp, "touchEnd");

    await expect(log(page)).toContainText(
      '{"nodeId":"A","fromParentId":"p","toParentId":"p","index":2}',
    );
    await expect
      .poll(() => order(page))
      .toEqual(["p", "B", "C", "C1", "A", "D", "docs", "cv", "notes", "misc"]);
    await expect(page.getByText("Dragging was cancelled", { exact: false })).toHaveCount(0);
    // virtualized rows are still positioned with `top`, and rows do not block native scrolling
    const style = await node(page, "A").evaluate((el) => ({
      top: (el as HTMLElement).style.top,
      touchAction: (el as HTMLElement).style.touchAction,
    }));
    expect(style.touchAction).not.toBe("none");
    expect(style.top).not.toBe("");
  });

  test("a long-press drag moved right nests the node (touch coordinates drive the depth)", async ({
    page,
  }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const start = await center(page, "B");

    await longPressAndMove(page, cdp, start, [
      { x: start.x, y: start.y + 6 },
      ...lerp({ x: start.x, y: start.y + 6 }, { x: start.x + 24, y: start.y + 6 }, 8),
    ]);
    await expect(page.locator("[data-drop-indicator]")).toHaveAttribute("data-projected-depth", "2");
    await touch(cdp, "touchEnd");

    await expect(log(page)).toContainText(
      '{"nodeId":"B","fromParentId":"p","toParentId":"A","index":0}',
    );
    await expect(node(page, "B")).toHaveAttribute("aria-level", "3");
  });

  test("a long-press drag with a tiny horizontal move does not nest (origin comes from the touch)", async ({
    page,
  }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const start = await center(page, "B");

    await longPressAndMove(page, cdp, start, [
      { x: start.x, y: start.y + 6 },
      { x: start.x + 4, y: start.y + 6 },
      { x: start.x + 4, y: start.y + 7 },
    ]);
    await expect(page.locator("[data-drop-indicator]")).toHaveAttribute("data-projected-depth", "1");
    await touch(cdp, "touchEnd");
    await expect(node(page, "B")).toHaveAttribute("aria-level", "2");
  });

  test("a plain swipe scrolls a long tree and does not move any node", async ({ page }) => {
    await page.goto(longStory());
    await expect(node(page, "n0")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const box = await page.getByRole("tree").boundingBox();
    if (!box) throw new Error("tree not visible");

    await swipeUp(cdp, { x: box.x + box.width / 2, y: box.y + box.height - 40 }, 300);

    await expect.poll(() => scrollTop(page)).toBeGreaterThan(50);
    await expect(log(page)).toContainText("onTreeChange: none yet");
  });

  test("a plain swipe scrolls while a search is active (rows not draggable)", async ({ page }) => {
    await page.goto(longStory("search-active"));
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    await expect(page.locator("[data-drag-disabled]").first()).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const box = await page.getByRole("tree").boundingBox();
    if (!box) throw new Error("tree not visible");

    await swipeUp(cdp, { x: box.x + box.width / 2, y: box.y + box.height - 40 }, 300);

    await expect.poll(() => scrollTop(page)).toBeGreaterThan(50);
    await expect(log(page)).toContainText("onTreeChange: none yet");
  });
});
