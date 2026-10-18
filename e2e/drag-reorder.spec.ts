import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { zonePoint } from "./helpers";

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

/** Press on `from`, travel to `to` (a point) in steps; the caller releases. */
async function dragTo(page: Page, from: string, to: { x: number; y: number }) {
  const start = await center(page, from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
}

test.describe("DraggableTreeView reorder", () => {
  test("dragging the first sibling under the third reorders and reports the move", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    await expect(node(page, "misc")).toBeVisible();
    expect(await order(page)).toEqual(["p", "A", "B", "C", "C1", "D", "docs", "cv", "notes", "misc"]);
    await dragTo(page, "A", await zonePoint(node(page, "C"), "after"));
    await page.mouse.up();
    // C1 is C's child: the subtree stays under C, and A lands after C's visible subtree.
    await expect
      .poll(() => order(page))
      .toEqual(["p", "B", "C", "C1", "A", "D", "docs", "cv", "notes", "misc"]);
    await expect(log(page)).toContainText(
      '{"nodeId":"A","fromParentId":"p","toParentId":"p","index":2}',
    );
  });

  test("hovering the lower quarter of a child of an expanded sibling drops among that sibling's children", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    await dragTo(page, "A", await zonePoint(node(page, "C1"), "after"));
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"A","fromParentId":"p","toParentId":"C","index":1');
  });

  test("moving a node with children takes the whole subtree; descendants are hidden while dragging", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    await dragTo(page, "C", await zonePoint(node(page, "A"), "before"));
    await expect(node(page, "C1")).toHaveCount(0);
    await page.mouse.up();
    await expect(node(page, "C1")).toBeVisible();
    await expect
      .poll(() => order(page))
      .toEqual(["p", "C", "C1", "A", "B", "D", "docs", "cv", "notes", "misc"]);
    await expect(log(page)).toContainText('"nodeId":"C","fromParentId":"p","toParentId":"p","index":0');
  });

  test("during the drag the overlay follows the pointer and the origin row has data-dragging", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    const origin = await node(page, "B").boundingBox();
    const start = await center(page, "B");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 30, start.y + 60, { steps: 10 });
    const overlay = page.locator("[data-drag-overlay]");
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText("Bravo");
    await expect(overlay).toHaveAttribute("aria-hidden", "true");
    await expect(node(page, "B")).toHaveAttribute("data-dragging", "");
    // no hidden offset: the overlay sits where the row would be if it moved with the pointer
    await expect
      .poll(async () => {
        const box = await overlay.boundingBox();
        return box ? Math.abs(box.x - (origin!.x + 30)) + Math.abs(box.y - (origin!.y + 60)) : 999;
      })
      .toBeLessThanOrEqual(4);
    await page.mouse.up();
    await expect(overlay).toHaveCount(0);
    await expect(node(page, "B")).not.toHaveAttribute("data-dragging", "");
  });

  test("after a drop the moved row is in its new place and the overlay settles on it", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    await dragTo(page, "A", await zonePoint(node(page, "D"), "after"));
    await page.mouse.up();
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    const moved = await node(page, "A").boundingBox();
    const next = await node(page, "D").boundingBox();
    // A is the last child of p, right after D? D is disabled but a valid drop target.
    expect(moved!.y).toBeGreaterThan(next!.y);
    expect(Math.abs(moved!.y - next!.y - 32)).toBeLessThanOrEqual(1);
    await expect(log(page)).toContainText('"nodeId":"A","fromParentId":"p","toParentId":"p","index":3');
  });

  test("dropping in the starting position does not call onTreeChange", async ({ page }) => {
    await page.goto(story("draggable"));
    const start = await center(page, "B");
    await dragTo(page, "B", { x: start.x + 4, y: start.y + 6 });
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
    expect(await order(page)).toEqual(["p", "A", "B", "C", "C1", "D", "docs", "cv", "notes", "misc"]);
  });

  test("dropping outside the tree does not call onTreeChange", async ({ page }) => {
    await page.goto(story("draggable"));
    const logBox = await log(page).boundingBox();
    await dragTo(page, "A", { x: logBox!.x + 20, y: logBox!.y + 10 });
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
  });

  test("Esc cancels the drag", async ({ page }) => {
    await page.goto(story("draggable"));
    await dragTo(page, "A", await center(page, "D"));
    await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
    expect(await order(page)).toEqual(["p", "A", "B", "C", "C1", "D", "docs", "cv", "notes", "misc"]);
  });

  test("a disabled node cannot be dragged but can be a drop destination", async ({ page }) => {
    await page.goto(story("draggable"));
    await expect(node(page, "D")).toHaveAttribute("data-drag-disabled", "");
    await dragTo(page, "D", await center(page, "A"));
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
  });

  test("a plain click still selects (the press is not a drag)", async ({ page }) => {
    await page.goto(story("draggable"));
    await node(page, "A").click();
    await expect(node(page, "A")).toHaveAttribute("aria-selected", "true");
    await expect(log(page)).toContainText("none yet");
  });

  test("with a search query nothing can be dragged", async ({ page }) => {
    await page.goto(story("drag-disabled-while-searching"));
    const rows = page.getByRole("treeitem");
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    for (let i = 0; i < count; i++) await expect(rows.nth(i)).toHaveAttribute("data-drag-disabled", "");
    const first = (await order(page))[0]!;
    const second = (await order(page))[1]!;
    await dragTo(page, first, await center(page, second));
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
  });

  test("starting a search disables the drag, clearing it re-enables it", async ({ page }) => {
    await page.goto(story("draggable"));
    await page.getByTestId("search-input").fill("alpha");
    await expect(node(page, "A")).toHaveAttribute("data-drag-disabled", "");
    await page.getByTestId("search-input").fill("");
    await expect(node(page, "A")).not.toHaveAttribute("data-drag-disabled", "");
  });

  test("when the consumer ignores onTreeChange the tree does not change", async ({ page }) => {
    await page.goto(story("ignored-changes"));
    await dragTo(page, "A", await center(page, "C"));
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"A"');
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    expect(await order(page)).toEqual(["p", "A", "B", "C", "C1", "D", "docs", "cv", "notes", "misc"]);
  });

  test("LargeTree: a drag on 1500 nodes stays responsive", async ({ page }) => {
    await page.goto(story("large-tree"));
    const rows = page.getByRole("treeitem");
    await expect(rows.first()).toBeVisible();
    const ids = await order(page);
    // drag the first row onto the third (if they are siblings the log shows it, else nothing)
    const t0 = Date.now();
    await dragTo(page, ids[0]!, await center(page, ids[2]!));
    await page.mouse.up();
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
