import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=draggabletreeview-draggable--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const log = (page: Page) => page.getByTestId("last-event");
const indicator = (page: Page) => page.locator("[data-drop-indicator]");
const order = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => el.getAttribute("data-node-id")));

async function center(page: Page, id: string) {
  const box = await node(page, id).boundingBox();
  if (!box) throw new Error(`row ${id} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press on `id` and move the pointer by (dx, dy) from the press point; the caller releases. */
async function dragBy(page: Page, id: string, dx: number, dy = 0) {
  const start = await center(page, id);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 8, { steps: 3 });
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 10 });
}

test.describe("DraggableTreeView nesting", () => {
  test("dragging B right by one indentation nests it as last child of A", async ({ page }) => {
    await page.goto(story("draggable"));
    await expect(node(page, "misc")).toBeVisible();
    await dragBy(page, "B", 24);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    await page.mouse.up();
    await expect(log(page)).toContainText(
      '{"nodeId":"B","fromParentId":"p","toParentId":"A","index":0}',
    );
    // A was a leaf: it is expanded after the drop so that B is visible, one level deeper
    await expect(node(page, "B")).toBeVisible();
    await expect(node(page, "B")).toHaveAttribute("aria-level", "3");
    await expect(node(page, "A")).toHaveAttribute("aria-expanded", "true");
    expect(await order(page)).toEqual(["p", "A", "B", "C", "C1", "D", "docs", "cv", "notes", "misc"]);
    await expect(indicator(page)).toHaveCount(0);
  });

  test("dragging the only child of C left by one indentation makes it the next sibling of C", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    await dragBy(page, "C1", -24);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    await expect(log(page)).toContainText(
      '{"nodeId":"C1","fromParentId":"C","toParentId":"p","index":3}',
    );
    await expect(node(page, "C1")).toHaveAttribute("aria-level", "2");
    await expect(node(page, "C")).not.toHaveAttribute("aria-expanded", "true");
    expect(await order(page)).toEqual(["p", "A", "B", "C", "C1", "D", "docs", "cv", "notes", "misc"]);
  });

  test("nest then un-nest: aria-level goes 2 -> 3 -> 2", async ({ page }) => {
    await page.goto(story("draggable"));
    await expect(node(page, "B")).toHaveAttribute("aria-level", "2");
    await dragBy(page, "B", 24);
    await page.mouse.up();
    await expect(node(page, "B")).toHaveAttribute("aria-level", "3");
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    await dragBy(page, "B", -24);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    await expect(node(page, "B")).toHaveAttribute("aria-level", "2");
    await expect(log(page)).toContainText('"nodeId":"B","fromParentId":"A","toParentId":"p","index":1');
  });

  test("the indicator follows the horizontal offset, indented by depth * indentation", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    const start = await center(page, "B");
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 8, { steps: 3 });
    await page.mouse.move(start.x, start.y, { steps: 3 });
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await expect(indicator(page)).toHaveCSS("left", "24px");
    await page.mouse.move(start.x + 24, start.y, { steps: 5 });
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    await expect(indicator(page)).toHaveCSS("left", "48px");
    // far right: limited to previous row + 1, no skipped levels
    await page.mouse.move(start.x + 120, start.y, { steps: 5 });
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    // back to the origin
    await page.mouse.move(start.x, start.y, { steps: 5 });
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await expect(indicator(page)).toHaveCSS("left", "24px");
    await page.mouse.up();
    await expect(indicator(page)).toHaveCount(0);
  });

  test("Esc removes the indicator and changes nothing", async ({ page }) => {
    await page.goto(story("draggable"));
    await dragBy(page, "B", 24);
    await expect(indicator(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(indicator(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
    await expect(node(page, "B")).toHaveAttribute("aria-level", "2");
  });

  test("the first node always projects to depth 0 and dropping it does nothing", async ({ page }) => {
    await page.goto(story("draggable"));
    await dragBy(page, "p", 72);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "0");
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
  });

  test("nesting under a collapsed parent expands it and shows the moved node", async ({ page }) => {
    await page.goto(story("nest-under-collapsed"));
    await expect(node(page, "misc")).toBeVisible();
    await expect(node(page, "cv")).toHaveCount(0);
    await expect(node(page, "misc")).toHaveAttribute("aria-level", "1");
    await dragBy(page, "misc", 24);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    await expect(log(page)).toContainText(
      '{"nodeId":"misc","fromParentId":null,"toParentId":"docs","index":2}',
    );
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "misc")).toBeVisible();
    await expect(node(page, "misc")).toHaveAttribute("aria-level", "2");
    expect(await order(page)).toEqual(["p", "A", "B", "C", "D", "docs", "cv", "notes", "misc"]);
    // and back out to the root
    await dragBy(page, "misc", -24);
    await page.mouse.up();
    await expect(node(page, "misc")).toHaveAttribute("aria-level", "1");
  });

  test("a disabled node can receive a child", async ({ page }) => {
    await page.goto(story("draggable"));
    await expect(node(page, "D")).toHaveAttribute("aria-disabled", "true");
    await dragBy(page, "docs", 48);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    await page.mouse.up();
    await expect(log(page)).toContainText(
      '{"nodeId":"docs","fromParentId":null,"toParentId":"D","index":0}',
    );
    await expect(node(page, "docs")).toHaveAttribute("aria-level", "3");
    // the subtree travelled along, one level deeper
    await expect(node(page, "cv")).toHaveAttribute("aria-level", "4");
  });

  test("a subtree moves with its node and its descendants change depth", async ({ page }) => {
    await page.goto(story("draggable"));
    await dragBy(page, "C", 24);
    // descendants are hidden while dragging
    await expect(node(page, "C1")).toHaveCount(0);
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"C","fromParentId":"p","toParentId":"B","index":0');
    await expect(node(page, "C")).toHaveAttribute("aria-level", "3");
    await expect(node(page, "C1")).toHaveAttribute("aria-level", "4");
  });

  test("a node cannot be dropped into itself or its descendants", async ({ page }) => {
    await page.goto(story("draggable"));
    // C cannot go deeper than previous row + 1, and never inside C1
    await dragBy(page, "C", 120);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    await page.mouse.up();
    await expect(log(page)).toContainText('"toParentId":"B"');
    await expect(log(page)).not.toContainText('"toParentId":"C"');
    await expect(log(page)).not.toContainText('"toParentId":"C1"');
    expect(await order(page)).toEqual(["p", "A", "B", "C", "C1", "D", "docs", "cv", "notes", "misc"]);
  });

  test("the draggable id stays node.id while nesting", async ({ page }) => {
    await page.goto(story("draggable"));
    await dragBy(page, "B", 24);
    await expect(node(page, "B")).toHaveAttribute("data-dragging", "");
    await expect(node(page, "B")).toHaveAttribute("data-node-id", "B");
    await page.mouse.up();
    await expect(node(page, "B")).not.toHaveAttribute("data-dragging", "");
  });

  test("LargeTree: moving the pointer sideways keeps the indicator in sync", async ({ page }) => {
    await page.goto(story("large-tree"));
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    // the roots start collapsed: the second one can nest under the first
    const id = (await order(page))[1]!;
    const t0 = Date.now();
    await dragBy(page, id, 0);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "0");
    const here = await center(page, id);
    await page.mouse.move(here.x + 24, here.y, { steps: 8 });
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.move(here.x + 96, here.y, { steps: 8 });
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    await expect(indicator(page)).toHaveCount(0);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
