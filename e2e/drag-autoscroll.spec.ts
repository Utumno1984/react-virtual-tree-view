import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) =>
  `/iframe.html?id=draggabletreeview-draggableautoscroll--${id}&viewMode=story`;
const tree = (page: Page) => page.getByRole("tree");
const log = (page: Page) => page.getByTestId("last-event");
const scrollTop = (page: Page) => tree(page).evaluate((el) => el.scrollTop);

async function treeBox(page: Page) {
  const box = await tree(page).boundingBox();
  if (!box) throw new Error("tree not visible");
  return box;
}

/** Press on the first visible row and start the drag, leaving the pointer over the tree. */
async function startDrag(page: Page, id: string) {
  const row = await page.locator(`[data-node-id="${id}"]`).boundingBox();
  if (!row) throw new Error(`row ${id} not visible`);
  const x = row.x + row.width / 2;
  await page.mouse.move(x, row.y + row.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, row.y + row.height / 2 + 10, { steps: 3 });
  return x;
}

test.describe("DraggableTreeView auto-scroll", () => {
  test("scrolls down while the pointer is held in the bottom band, then drops on a row that came into view", async ({
    page,
  }) => {
    await page.goto(story("default"));
    const box = await treeBox(page);
    const x = await startDrag(page, "n0");
    await page.mouse.move(x, box.y + box.height - 6, { steps: 5 });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(200);
    const first = await scrollTop(page);
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(first + 100);
    // the indicator follows the new rows under the pointer
    await expect(page.locator("[data-drop-indicator]")).toHaveCount(1);
    // move to the middle of the tree and release over whatever row is there
    const middle = box.y + box.height / 2;
    await page.mouse.move(x, middle, { steps: 4 });
    const settled = await scrollTop(page);
    // Release on the upper zone of the row under the pointer, so the drop is a sibling at the
    // root: the middle of a row would nest the node into it (row-zone model, #63).
    const row = await page
      .getByRole("treeitem")
      .evaluateAll((els, y) => {
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.top <= y && y < r.bottom) return { top: r.top, height: r.height };
        }
        return null;
      }, middle);
    if (!row) throw new Error("no row under the pointer");
    await page.mouse.move(x, row.top + row.height * 0.1, { steps: 2 });
    await page.mouse.up();
    const expectedMin = Math.floor((settled + 150) / 32);
    await expect(log(page)).toContainText('"nodeId":"n0","fromParentId":null,"toParentId":null');
    const index = Number(/"index":(\d+)/.exec((await log(page).textContent()) ?? "")?.[1]);
    expect(index).toBeGreaterThanOrEqual(expectedMin);
    await expect(page.locator('[data-node-id="n0"]')).toHaveAttribute("aria-posinset", String(index + 1));
  });

  test("scrolls up to 0 in the top band and stops there", async ({ page }) => {
    await page.goto(story("default"));
    await tree(page).evaluate((el) => {
      el.scrollTop = 600;
    });
    await expect.poll(() => scrollTop(page)).toBe(600);
    const box = await treeBox(page);
    // row 22 sits 104 px below the top of the viewport at scrollTop 600 (22 * 32 - 600)
    const x = await startDrag(page, "n22");
    await page.mouse.move(x, box.y + 5, { steps: 5 });
    await expect.poll(() => scrollTop(page)).toBe(0);
    await page.waitForTimeout(150);
    expect(await scrollTop(page)).toBe(0);
    await page.mouse.up();
  });

  test("does not scroll when the pointer stays outside the bands", async ({ page }) => {
    await page.goto(story("default"));
    const box = await treeBox(page);
    const x = await startDrag(page, "n0");
    await page.mouse.move(x, box.y + box.height / 2, { steps: 5 });
    await page.waitForTimeout(300);
    expect(await scrollTop(page)).toBe(0);
    await page.mouse.up();
  });

  test("scrolling stops after the drop: moving near the edge no longer scrolls", async ({ page }) => {
    await page.goto(story("default"));
    const box = await treeBox(page);
    const x = await startDrag(page, "n0");
    await page.mouse.move(x, box.y + box.height - 6, { steps: 5 });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(100);
    await page.mouse.up();
    await page.waitForTimeout(100);
    const after = await scrollTop(page);
    await page.mouse.move(x, box.y + box.height - 4, { steps: 3 });
    await page.waitForTimeout(300);
    expect(await scrollTop(page)).toBe(after);
  });

  test("Esc cancels the drag and the scrolling", async ({ page }) => {
    await page.goto(story("default"));
    const box = await treeBox(page);
    const x = await startDrag(page, "n0");
    await page.mouse.move(x, box.y + box.height - 6, { steps: 5 });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(100);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    const after = await scrollTop(page);
    await page.waitForTimeout(300);
    expect(await scrollTop(page)).toBe(after);
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
  });

  test("autoScroll={false}: no scroll at the edge", async ({ page }) => {
    await page.goto(story("disabled"));
    const box = await treeBox(page);
    const x = await startDrag(page, "n0");
    await page.mouse.move(x, box.y + box.height - 6, { steps: 5 });
    await page.waitForTimeout(400);
    expect(await scrollTop(page)).toBe(0);
    await page.mouse.up();
  });

  test("a list shorter than the container does not scroll", async ({ page }) => {
    await page.goto(story("short-list"));
    const box = await treeBox(page);
    const x = await startDrag(page, "n0");
    await page.mouse.move(x, box.y + box.height - 6, { steps: 5 });
    await page.waitForTimeout(300);
    expect(await scrollTop(page)).toBe(0);
    await page.mouse.up();
  });

  test("pointer 300 px to the right of the tree, at the height of the band: scrollTop unchanged", async ({
    page,
  }) => {
    await page.goto(story("default"));
    const box = await treeBox(page);
    const x = await startDrag(page, "n0");
    await page.mouse.move(box.x + box.width + 300, box.y + box.height - 6, { steps: 5 });
    await page.waitForTimeout(400);
    expect(await scrollTop(page)).toBe(0);
    // back over the tree: it scrolls again
    await page.mouse.move(x, box.y + box.height - 6, { steps: 5 });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(100);
    await page.mouse.up();
  });

  test("pointer far below the tree (beyond the band tolerance): scrollTop unchanged", async ({ page }) => {
    await page.goto(story("default"));
    const box = await treeBox(page);
    const x = await startDrag(page, "n0");
    await page.mouse.move(x, box.y + box.height + 150, { steps: 5 });
    await page.waitForTimeout(400);
    expect(await scrollTop(page)).toBe(0);
    await page.mouse.up();
  });

  test("the page scrolls mid-drag: the bands follow the tree", async ({ page }) => {
    await page.goto(story("tall-page"));
    const top = await tree(page).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), top - 100);
    const box = await treeBox(page);
    expect(Math.round(box.y)).toBe(100);
    const x = await startDrag(page, "n0");
    await page.mouse.move(x, box.y + box.height - 6, { steps: 5 });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(100);
    // the page scrolls 250 px: the tree moves up and the pointer is now far below it
    await page.evaluate(() => window.scrollBy(0, 250));
    await page.waitForTimeout(150); // let the last frames settle
    const settled = await scrollTop(page);
    await page.waitForTimeout(400);
    expect(await scrollTop(page)).toBe(settled);
    // the bottom band of the moved tree scrolls again
    const moved = await treeBox(page);
    await page.mouse.move(x, moved.y + moved.height - 6, { steps: 5 });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(settled + 100);
    await page.mouse.up();
  });

  test("5000 nodes with maxDepth: scrolls and the indicator never exceeds the limit", async ({ page }) => {
    await page.goto(story("many-nodes-nested"));
    const box = await treeBox(page);
    const firstId = await page.getByRole("treeitem").first().getAttribute("data-node-id");
    const x = await startDrag(page, firstId!);
    await page.mouse.move(x + 100, box.y + box.height - 6, { steps: 5 });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(200);
    const depth = await page.locator("[data-drop-indicator]").getAttribute("data-projected-depth");
    expect(Number(depth)).toBeLessThanOrEqual(2);
    await page.mouse.up();
  });
});
