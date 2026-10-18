import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { center, collectConsole, dragToPoint, dragToZone, node, order, storyUrl } from "./helpers";

const url = storyUrl("draggabletreeview-draggable--drag-expanded-node");
const log = (page: Page) => page.getByTestId("last-event");
const indicator = (page: Page) => page.locator("[data-drop-indicator]");
const overlay = (page: Page) => page.locator("[data-drag-overlay]");
const tree = (page: Page) => page.getByRole("tree");

/** Scrolls the tree so that row `rowIndex` sits near the top of the viewport. */
async function reveal(page: Page, rowIndex: number, id: string) {
  await expect(node(page, "r0")).toBeVisible();
  const rowHeight = await tree(page).evaluate((el) => {
    const first = el.querySelector<HTMLElement>("[data-row-index]");
    return first ? first.getBoundingClientRect().height : 32;
  });
  await tree(page).evaluate((el, top) => (el.scrollTop = top), Math.max(0, rowIndex * rowHeight - 140));
  await expect(node(page, id)).toBeVisible();
}

test.describe("dragging an expanded node", () => {
  test("children hide, ghost and indicator stay, drop moves the whole subtree", async ({ page }) => {
    const logs = collectConsole(page);
    await page.goto(url);
    await reveal(page, 30, "r30");
    await expect(node(page, "r30-c1")).toBeVisible();
    const start = await center(node(page, "r30"));
    await dragToPoint(page, node(page, "r30"), { x: start.x, y: start.y - 64 });
    // descendants hidden, drag still active, overlay visible
    await expect(node(page, "r30-c1")).toHaveCount(0);
    await expect(overlay(page)).toBeVisible();
    await expect(node(page, "r30")).toHaveAttribute("data-dragging", "");
    await expect(indicator(page)).toBeVisible();
    // moving over other rows updates the indicator
    const top1 = await indicator(page).evaluate((el) => (el as HTMLElement).style.top);
    await page.mouse.move(start.x, start.y - 96, { steps: 8 });
    await expect(overlay(page)).toBeVisible();
    await expect(node(page, "r30")).toHaveAttribute("data-dragging", "");
    await expect
      .poll(() => indicator(page).evaluate((el) => (el as HTMLElement).style.top))
      .not.toBe(top1);
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"r30"');
    // back, still expanded, with all descendants
    await expect(node(page, "r30")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "r30-c1")).toBeVisible();
    await expect(node(page, "r30-c0-g0-x")).toBeAttached();
    const ids = await order(page);
    expect(ids.indexOf("r30-c1")).toBe(ids.indexOf("r30") + 4);
    expect(logs.errors).toEqual([]);
  });

  test("the dragged row keeps the same DOM element during the drag (no remount)", async ({ page }) => {
    await page.goto(url);
    await reveal(page, 30, "r30");
    await node(page, "r30").evaluate((el) => el.setAttribute("data-mark", "1"));
    const start = await center(node(page, "r30"));
    await dragToPoint(page, node(page, "r30"), { x: start.x, y: start.y + 100 });
    await expect(node(page, "r30-c1")).toHaveCount(0);
    await expect(node(page, "r30")).toHaveAttribute("data-mark", "1");
    await expect(node(page, "r30")).toHaveAttribute("data-dragging", "");
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"r30"');
  });

  test("Escape cancels: the node is back with its children, nothing changes", async ({ page }) => {
    await page.goto(url);
    await reveal(page, 30, "r30");
    const before = await order(page);
    const start = await center(node(page, "r30"));
    await dragToPoint(page, node(page, "r30"), { x: start.x, y: start.y - 100 });
    await expect(node(page, "r30-c1")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(node(page, "r30-c1")).toBeVisible();
    await expect(node(page, "r30")).toHaveAttribute("aria-expanded", "true");
    await expect(log(page)).toContainText("none yet");
    expect(await order(page)).toEqual(before);
  });

  test("nesting an expanded node keeps it expanded with its whole subtree", async ({ page }) => {
    await page.goto(url);
    await reveal(page, 30, "r30");
    // released on the middle of the previous row (r29): becomes its child
    await dragToZone(page, node(page, "r30"), node(page, "r29"), "inside");
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"r30","fromParentId":null,"toParentId":"r29"');
    await expect(node(page, "r30")).toHaveAttribute("aria-level", "2");
    await expect(node(page, "r30")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "r30-c0-g0")).toHaveAttribute("aria-level", "4");
  });

  test("the last, expanded node at the bottom of the scroll range drags and drops", async ({ page }) => {
    await page.goto(url);
    await expect(node(page, "r0")).toBeVisible();
    await tree(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(node(page, "r59")).toBeVisible();
    await expect(node(page, "r59-c5")).toBeVisible();
    const scrollBefore = await tree(page).evaluate((el) => el.scrollTop);
    const start = await center(node(page, "r59"));
    // one row up, away from the auto-scroll edge zone
    await dragToPoint(page, node(page, "r59"), { x: start.x, y: start.y - 32 });
    // the list shrank: the drag is still alive, the dragged row still mounted
    await expect(node(page, "r59-c5")).toHaveCount(0);
    await expect(overlay(page)).toBeVisible();
    await expect(node(page, "r59")).toHaveAttribute("data-dragging", "");
    await expect(indicator(page)).toBeVisible();
    // hiding the children must not scroll the tree (dnd-kit would detach the overlay from the pointer)
    expect(await tree(page).evaluate((el) => el.scrollTop)).toBe(scrollBefore);
    const overlayBox = (await overlay(page).boundingBox())!;
    const pointerY = start.y - 32;
    expect(pointerY).toBeGreaterThanOrEqual(overlayBox.y - 1);
    expect(pointerY).toBeLessThanOrEqual(overlayBox.y + overlayBox.height + 1);
    // the dragged row stays on screen for the whole drag
    const treeBox = (await tree(page).boundingBox())!;
    const rowBox = (await node(page, "r59").boundingBox())!;
    expect(rowBox.y).toBeGreaterThanOrEqual(treeBox.y);
    expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(treeBox.y + treeBox.height + 1);
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"r59"');
    await expect(node(page, "r59")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "r59-c5")).toBeAttached();
  });

  test("auto-scrolling to the bottom ends on the last row, not on a blank window", async ({ page }) => {
    await page.goto(url);
    await reveal(page, 30, "r30");
    const treeBox = (await tree(page).boundingBox())!;
    const start = await center(node(page, "r30"));
    await dragToPoint(page, node(page, "r30"), { x: start.x, y: treeBox.y + treeBox.height - 4 });
    await expect(node(page, "r30-c1")).toHaveCount(0);
    // wait for the auto-scroll to settle at the end of the scroll range
    let last = -1;
    await expect
      .poll(async () => {
        const top = await tree(page).evaluate((el) => el.scrollTop);
        const settled = top === last;
        last = top;
        return settled;
      }, { intervals: [300] })
      .toBe(true);
    // the dragged row is kept mounted wherever it is: look at the other rows
    const lastId = await tree(page).evaluate((el) => {
      const rows = [...el.querySelectorAll<HTMLElement>("[data-row-index]:not([data-dragging])")];
      rows.sort((a, b) => Number(a.dataset.rowIndex) - Number(b.dataset.rowIndex));
      return rows[rows.length - 1]!.dataset.nodeId!;
    });
    const lastBox = (await node(page, lastId).boundingBox())!;
    // the last row is inside the window: no blank space after it
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(treeBox.y + treeBox.height + 1);
    // (only the one row reserved at the end for the "end of the tree" drop zone)
    expect(lastBox.y + lastBox.height).toBeGreaterThan(treeBox.y + treeBox.height - 40 - lastBox.height);
    await expect(indicator(page)).toBeVisible();
    const indBox = (await indicator(page).boundingBox())!;
    expect(indBox.y).toBeGreaterThanOrEqual(treeBox.y - 1);
    expect(indBox.y).toBeLessThanOrEqual(treeBox.y + treeBox.height + 1);
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"r30"');
  });

  test("an expanded node with a single child drags and drops",async ({ page }) => {
    await page.goto(url);
    await reveal(page, 30, "r30");
    // r30-c0-g0 holds a single child (r30-c0-g0-x)
    const start = await center(node(page, "r30-c0-g0"));
    await dragToPoint(page, node(page, "r30-c0-g0"), { x: start.x - 24, y: start.y + 64 });
    await expect(node(page, "r30-c0-g0-x")).toHaveCount(0);
    await expect(overlay(page)).toBeVisible();
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"r30-c0-g0"');
    await expect(node(page, "r30-c0-g0")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "r30-c0-g0-x")).toBeAttached();
  });

  test("pointer below the last visible row drops at the end of the roots (last root expanded)", async ({ page }) => {
    await page.goto(url);
    await expect(node(page, "r0")).toBeVisible();
    await tree(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(node(page, "r59-c5")).toBeVisible();
    // r58 is the root just before the expanded last root r59
    const start = await center(node(page, "r58"));
    await dragToPoint(page, node(page, "r58"), { x: start.x, y: start.y + 8 });
    // the very bottom edge of the container is below the last visible row
    const bottom = await tree(page).evaluate((el) => el.getBoundingClientRect().bottom);
    await page.mouse.move(start.x, bottom, { steps: 4 });
    await expect(indicator(page)).toBeVisible();
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"r58","fromParentId":null,"toParentId":null');
    const ids = await order(page);
    expect(ids[ids.length - 1]).toBe("r58");
    await expect(node(page, "r58")).toHaveAttribute("aria-level", "1");
    await expect(node(page, "r58")).toHaveAttribute("aria-posinset", "60");
    // r59 stays expanded with its children, now before r58
    await expect(node(page, "r59")).toHaveAttribute("aria-expanded", "true");
    expect(ids.indexOf("r59-c5")).toBe(ids.indexOf("r58") - 1);
  });

  test("a non-expanded node still drags as before", async ({ page }) => {
    await page.goto(url);
    await reveal(page, 30, "r30");
    const start = await center(node(page, "r29"));
    await dragToPoint(page, node(page, "r29"), { x: start.x, y: start.y - 64 });
    await expect(overlay(page)).toBeVisible();
    await expect(node(page, "r30-c1")).toBeVisible();
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"r29"');
  });
});

test.describe("end of the tree with a bare container (no padding, no border)", () => {
  const bareUrl = storyUrl("draggabletreeview-draggable--drag-bare-container");

  test("a row-tall zone below the last row exists and drops at the end of the roots", async ({ page }) => {
    await page.goto(bareUrl);
    await expect(node(page, "r0")).toBeVisible();
    const style = await tree(page).evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.paddingTop, cs.paddingBottom, cs.borderTopWidth, cs.borderBottomWidth];
    });
    expect(style).toEqual(["0px", "0px", "0px", "0px"]);
    await tree(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(node(page, "r59-c5")).toBeVisible();
    const start = await center(node(page, "r58"));
    await dragToPoint(page, node(page, "r58"), { x: start.x, y: start.y + 8 });
    // the reserved row lets the list scroll one row further: the last row ends above the
    // container's bottom edge and the pointer 6px above that edge is below it
    const treeBox = (await tree(page).boundingBox())!;
    const target = treeBox.y + treeBox.height - 6;
    await page.mouse.move(start.x, target, { steps: 4 });
    await expect
      .poll(async () => {
        const box = await node(page, "r59-c5").boundingBox();
        return box ? box.y + box.height : Infinity;
      })
      .toBeLessThan(target);
    await expect(indicator(page)).toBeVisible();
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"r58","fromParentId":null,"toParentId":null');
    const ids = await order(page);
    expect(ids[ids.length - 1]).toBe("r58");
    await expect(node(page, "r58")).toHaveAttribute("aria-posinset", "60");
  });
});
