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

/** A point on row `id` inside the given drop zone (upper 25% / middle 50% / lower 25%). */
async function zone(page: Page, id: string, name: "before" | "inside" | "after"): Promise<Point> {
  const box = await node(page, id).boundingBox();
  if (!box) throw new Error(`row ${id} not visible`);
  const fraction = { before: 0.1, inside: 0.5, after: 0.9 }[name];
  return { x: box.x + box.width / 2, y: box.y + box.height * fraction };
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
    // upper zone of "D": next sibling of C, after its subtree
    const end = await zone(page, "D", "before");

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

  test("a long-press drag held on the middle of a row nests the node (touch coordinates drive the zone)", async ({
    page,
  }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const start = await center(page, "B");
    const end = await zone(page, "A", "inside");

    await longPressAndMove(page, cdp, start, [
      { x: start.x, y: start.y - 6 },
      ...lerp({ x: start.x, y: start.y - 6 }, end, 8),
    ]);
    await expect(page.locator("[data-drop-indicator]")).toHaveAttribute("data-projected-depth", "2");
    await touch(cdp, "touchEnd");

    await expect(log(page)).toContainText(
      '{"nodeId":"B","fromParentId":"p","toParentId":"A","index":0}',
    );
    await expect(node(page, "B")).toHaveAttribute("aria-level", "3");
  });

  test("a long-press drag on the upper zone of a row drops as a sibling, not nested (zone comes from the touch)", async ({
    page,
  }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const start = await center(page, "B");
    const end = await zone(page, "A", "before");

    await longPressAndMove(page, cdp, start, [
      { x: start.x, y: start.y - 6 },
      ...lerp({ x: start.x, y: start.y - 6 }, end, 8),
    ]);
    await expect(page.locator("[data-drop-indicator]")).toHaveAttribute("data-drop-mode", "line");
    await expect(page.locator("[data-drop-indicator]")).toHaveAttribute("data-projected-depth", "1");
    await touch(cdp, "touchEnd");
    await expect(log(page)).toContainText(
      '{"nodeId":"B","fromParentId":"p","toParentId":"p","index":0}',
    );
    await expect(node(page, "B")).toHaveAttribute("aria-level", "2");
  });

  const selectedText = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? "");

  test("rows are text-selectable at rest, not selectable only during a touch gesture", async ({
    page,
  }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const sel = (id: string) => node(page, id).evaluate((el) => getComputedStyle(el).userSelect);
    expect(await sel("A")).not.toBe("none");
    const cdp = await page.context().newCDPSession(page);
    const start = await center(page, "A");

    await touch(cdp, "touchStart", start);
    expect(await sel("A")).toBe("none");
    expect(await sel("B")).toBe("none"); // neighbouring draggable rows too
    expect(await sel("D")).not.toBe("none"); // disabled node: nothing to drag
    await page.waitForTimeout(400);
    await touch(cdp, "touchMove", { x: start.x, y: start.y + 6 });
    expect(await sel("A")).toBe("none");
    await touch(cdp, "touchEnd");
    await expect.poll(() => sel("A")).not.toBe("none");
  });

  test("a swipe or a quick tap does not leave the rows unselectable", async ({ page }) => {
    await page.goto(longStory());
    await expect(node(page, "n0")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const box = await page.getByRole("tree").boundingBox();
    if (!box) throw new Error("tree not visible");
    const row = page.getByRole("treeitem").first();
    const sel = () => row.evaluate((el) => getComputedStyle(el).userSelect);

    await swipeUp(cdp, { x: box.x + box.width / 2, y: box.y + box.height - 40 }, 300);
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(50);
    await expect.poll(sel).not.toBe("none");
    const rb = await row.boundingBox();
    if (!rb) throw new Error("row not visible");
    await touch(cdp, "touchStart", { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 });
    await touch(cdp, "touchEnd");
    await expect.poll(sel).not.toBe("none");
  });

  test("the mouse keeps text selection on draggable rows", async ({ page }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const start = await center(page, "A");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    expect(await node(page, "A").evaluate((el) => getComputedStyle(el).userSelect)).not.toBe("none");
    await page.mouse.up();
  });

  test("a contextmenu fired by the long-press during a touch drag opens no menu", async ({
    page,
  }) => {
    await page.goto(
      "/iframe.html?id=treeview-contextmenu--draggable&viewMode=story",
    );
    const target = page.locator('[data-node-id="cv"]');
    await expect(target).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const start = await center(page, "cv");

    const fireContextMenu = () =>
      target.evaluate((el) =>
        el.dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
        ),
      );
    // while the long-press is still pending (before the drag activates)
    await touch(cdp, "touchStart", start);
    await page.waitForTimeout(60);
    await fireContextMenu();
    await page.waitForTimeout(40);
    // no retrying expect here: the drag start would close a wrongly opened menu a bit later
    expect(await page.getByRole("menu").count()).toBe(0);
    await page.waitForTimeout(400);
    await touch(cdp, "touchMove", { x: start.x, y: start.y + 6 });
    await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    // while the drag is active: what Chrome Android sends after ~500 ms of press
    await fireContextMenu();
    await page.waitForTimeout(40);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await touch(cdp, "touchEnd");
    await expect(page.getByRole("menu")).toHaveCount(0);

    // outside of a drag the normal contextmenu still opens the menu
    await target.evaluate((el) =>
      el.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      ),
    );
    await expect(page.getByRole("menu")).toBeVisible();
  });

  test("the overlay stays visible during the whole long-press gesture and no text gets selected", async ({
    page,
  }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const start = await center(page, "A");
    const end = await center(page, "C");
    await longPressAndMove(page, cdp, start, [{ x: start.x, y: start.y + 6 }]);
    await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    for (const p of lerp({ x: start.x, y: start.y + 6 }, end, 10)) {
      await touch(cdp, "touchMove", p);
      await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    }
    // a native selection attempt, as a mobile browser would do, is cancelled during the drag
    const prevented = await page.evaluate(() => {
      const e = new Event("selectstart", { bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(true);
    expect(await selectedText(page)).toBe("");
    await touch(cdp, "touchEnd");
    await expect(log(page)).toContainText('"nodeId":"A"');
    expect(await selectedText(page)).toBe("");
  });

  test("a long-press released without moving to a new place leaves the tree and no selection", async ({
    page,
  }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const start = await center(page, "B");
    const before = await order(page);

    await longPressAndMove(page, cdp, start, [{ x: start.x, y: start.y + 3 }]);
    await touch(cdp, "touchEnd");

    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    expect(await order(page)).toEqual(before);
    expect(await selectedText(page)).toBe("");
  });

  test("consecutive long-press drags on the same node work without leftover state", async ({
    page,
  }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);

    for (const targetId of ["C", "B"]) {
      const start = await center(page, "A");
      const end = await center(page, targetId);
      await longPressAndMove(page, cdp, start, [
        { x: start.x, y: start.y + 6 },
        ...lerp({ x: start.x, y: start.y + 6 }, end, 10),
      ]);
      await expect(page.locator("[data-drag-overlay]")).toBeVisible();
      await touch(cdp, "touchEnd");
      await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
      expect(await selectedText(page)).toBe("");
    }
    await expect(log(page)).toContainText('"nodeId":"A"');
  });

  test("a long-press on a disabled node does not start a drag", async ({ page }) => {
    await page.goto(story);
    await expect(node(page, "misc")).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const start = await center(page, "D");

    await longPressAndMove(page, cdp, start, [
      { x: start.x, y: start.y + 6 },
      { x: start.x, y: start.y - 40 },
    ]);
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    await touch(cdp, "touchEnd");
    await expect(log(page)).toContainText("onTreeChange: none yet");
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
