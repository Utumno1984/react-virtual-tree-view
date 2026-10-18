import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { dragToZone, moveToZone, startDrag } from "./helpers";

const story = (id: string) => `/iframe.html?id=draggabletreeview-draggable--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const log = (page: Page) => page.getByTestId("last-event");
const indicator = (page: Page) => page.locator("[data-drop-indicator]");
const order = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => el.getAttribute("data-node-id")));

const INITIAL_ORDER = ["p", "A", "B", "C", "C1", "D", "docs", "cv", "notes", "misc"];

// Drop model (#63): the zone of the hovered row decides the result, not the horizontal offset.
// Upper quarter = previous sibling, middle half = first child, lower quarter = next sibling.
test.describe("DraggableTreeView nesting", () => {
  test("dropping B on the middle of A nests it as first child of A", async ({ page }) => {
    await page.goto(story("draggable"));
    await expect(node(page, "misc")).toBeVisible();
    await dragToZone(page, node(page, "B"), node(page, "A"), "inside");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    await expect(indicator(page)).toHaveAttribute("data-drop-zone", "inside");
    await page.mouse.up();
    await expect(log(page)).toContainText(
      '{"nodeId":"B","fromParentId":"p","toParentId":"A","index":0}',
    );
    // A was a leaf: it is expanded after the drop so that B is visible, one level deeper
    await expect(node(page, "B")).toBeVisible();
    await expect(node(page, "B")).toHaveAttribute("aria-level", "3");
    await expect(node(page, "A")).toHaveAttribute("aria-expanded", "true");
    expect(await order(page)).toEqual(INITIAL_ORDER);
    await expect(indicator(page)).toHaveCount(0);
  });

  test("dropping the only child of C on the upper quarter of D makes it the next sibling of C", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    await dragToZone(page, node(page, "C1"), node(page, "D"), "before");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await expect(indicator(page)).toHaveAttribute("data-drop-zone", "before");
    await page.mouse.up();
    await expect(log(page)).toContainText(
      '{"nodeId":"C1","fromParentId":"C","toParentId":"p","index":3}',
    );
    await expect(node(page, "C1")).toHaveAttribute("aria-level", "2");
    await expect(node(page, "C")).not.toHaveAttribute("aria-expanded", "true");
    expect(await order(page)).toEqual(INITIAL_ORDER);
  });

  test("nest then un-nest: aria-level goes 2 -> 3 -> 2", async ({ page }) => {
    await page.goto(story("draggable"));
    await expect(node(page, "B")).toHaveAttribute("aria-level", "2");
    await dragToZone(page, node(page, "B"), node(page, "A"), "inside");
    await page.mouse.up();
    await expect(node(page, "B")).toHaveAttribute("aria-level", "3");
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    // back out: upper quarter of C, the next sibling of the (open) A
    await dragToZone(page, node(page, "B"), node(page, "C"), "before");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    await expect(node(page, "B")).toHaveAttribute("aria-level", "2");
    await expect(log(page)).toContainText('"nodeId":"B","fromParentId":"A","toParentId":"p","index":1');
  });

  test("the indicator follows the zone of the hovered row, not the horizontal offset", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    await startDrag(page, node(page, "B"));
    // upper quarter of C: a line at C's depth (1), indented by depth * indentation
    await moveToZone(page, node(page, "C"), "before");
    await expect(indicator(page)).toHaveAttribute("data-drop-mode", "line");
    await expect(indicator(page)).toHaveAttribute("data-drop-zone", "before");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await expect(indicator(page)).toHaveCSS("left", "24px");
    // middle of C: the whole row is highlighted, one level deeper
    await moveToZone(page, node(page, "C"), "inside");
    await expect(indicator(page)).toHaveAttribute("data-drop-mode", "child");
    await expect(indicator(page)).toHaveAttribute("data-drop-zone", "inside");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    await expect(indicator(page)).toHaveCSS("left", "0px");
    // far right on the same zone: unchanged (the horizontal position is ignored)
    await moveToZone(page, node(page, "C"), "inside", 120);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    // lower quarter of C (expanded, with C1): a line again, its first child, right under C
    await moveToZone(page, node(page, "C"), "after");
    await expect(indicator(page)).toHaveAttribute("data-drop-mode", "line");
    await expect(indicator(page)).toHaveAttribute("data-drop-zone", "after");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    // lower quarter of D (a leaf): its next sibling, depth 1
    await moveToZone(page, node(page, "D"), "after");
    await expect(indicator(page)).toHaveAttribute("data-drop-zone", "after");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    await expect(indicator(page)).toHaveCount(0);
  });

  test("Esc removes the indicator and changes nothing", async ({ page }) => {
    await page.goto(story("draggable"));
    await dragToZone(page, node(page, "B"), node(page, "A"), "inside");
    await expect(indicator(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(indicator(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
    await expect(node(page, "B")).toHaveAttribute("aria-level", "2");
  });

  test("the upper quarter of the first row projects to depth 0; hovering the dragged row itself shows nothing", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    // the dragged row is not a valid target: no indicator, dropping it does nothing
    await dragToZone(page, node(page, "p"), node(page, "p"), "inside");
    await expect(indicator(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
    // another row on the upper quarter of the first row becomes the first root
    await dragToZone(page, node(page, "misc"), node(page, "p"), "before");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "0");
    await page.mouse.up();
    await expect(log(page)).toContainText(
      '{"nodeId":"misc","fromParentId":null,"toParentId":null,"index":0}',
    );
    expect((await order(page)).slice(0, 2)).toEqual(["misc", "p"]);
  });

  test("nesting under a collapsed parent expands it and shows the moved node", async ({ page }) => {
    await page.goto(story("nest-under-collapsed"));
    await expect(node(page, "misc")).toBeVisible();
    await expect(node(page, "cv")).toHaveCount(0);
    await expect(node(page, "misc")).toHaveAttribute("aria-level", "1");
    await dragToZone(page, node(page, "misc"), node(page, "docs"), "inside");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    // documented choice: "inside" inserts as the FIRST child
    await expect(log(page)).toContainText(
      '{"nodeId":"misc","fromParentId":null,"toParentId":"docs","index":0}',
    );
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "misc")).toBeVisible();
    await expect(node(page, "misc")).toHaveAttribute("aria-level", "2");
    expect(await order(page)).toEqual(["p", "A", "B", "C", "D", "docs", "misc", "cv", "notes"]);
    // and back out to the root: upper quarter of docs (the lower quarter is its first-child zone)
    await dragToZone(page, node(page, "misc"), node(page, "docs"), "before");
    await page.mouse.up();
    await expect(node(page, "misc")).toHaveAttribute("aria-level", "1");
  });

  test("a disabled node can receive a child", async ({ page }) => {
    await page.goto(story("draggable"));
    await expect(node(page, "D")).toHaveAttribute("aria-disabled", "true");
    await dragToZone(page, node(page, "docs"), node(page, "D"), "inside");
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
    await startDrag(page, node(page, "C"));
    // descendants are hidden while dragging
    await expect(node(page, "C1")).toHaveCount(0);
    await moveToZone(page, node(page, "B"), "inside");
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"C","fromParentId":"p","toParentId":"B","index":0');
    await expect(node(page, "C")).toHaveAttribute("aria-level", "3");
    await expect(node(page, "C1")).toHaveAttribute("aria-level", "4");
  });

  test("a node cannot be dropped into itself or its descendants", async ({ page }) => {
    await page.goto(story("draggable"));
    // C hovered on every zone of its own row: never a valid target
    await startDrag(page, node(page, "C"));
    // its descendants are not rendered during the drag, so they cannot be hovered either
    await expect(node(page, "C1")).toHaveCount(0);
    await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    await expect(node(page, "C")).toHaveAttribute("data-dragging", "");
    for (const zone of ["before", "inside", "after"] as const) {
      await moveToZone(page, node(page, "C"), zone);
      await expect(indicator(page)).toHaveCount(0);
    }
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
    expect(await order(page)).toEqual(INITIAL_ORDER);
  });

  test("the draggable id stays node.id while nesting", async ({ page }) => {
    await page.goto(story("draggable"));
    await dragToZone(page, node(page, "B"), node(page, "A"), "inside");
    await expect(node(page, "B")).toHaveAttribute("data-dragging", "");
    await expect(node(page, "B")).toHaveAttribute("data-node-id", "B");
    await page.mouse.up();
    await expect(node(page, "B")).not.toHaveAttribute("data-dragging", "");
  });

  test("a cancelled drag does not leak its result into the next drag over the same row", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    // C1 over the middle of B, then Esc
    await dragToZone(page, node(page, "C1"), node(page, "B"), "inside");
    await expect(indicator(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
    // now B itself, released on the spot (same row, same zone): nothing may move
    await dragToZone(page, node(page, "B"), node(page, "B"), "inside");
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
    expect(await order(page)).toEqual(INITIAL_ORDER);
  });

  test("an only child dropped where it already is does not call onTreeChange", async ({ page }) => {
    await page.goto(story("draggable"));
    // middle of its own parent = first child of C = where C1 already is
    await dragToZone(page, node(page, "C1"), node(page, "C"), "inside");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
  });

  test("a root dropped on the upper quarter of a child lands between the children of that open parent", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    await dragToZone(page, node(page, "misc"), node(page, "notes"), "before");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    await expect(log(page)).toContainText(
      '{"nodeId":"misc","fromParentId":null,"toParentId":"docs","index":1}',
    );
    expect(await order(page)).toEqual(["p", "A", "B", "C", "C1", "D", "docs", "cv", "misc", "notes"]);
  });

  test("a root dropped on the upper quarter of the first child of an open parent becomes its first child", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    await dragToZone(page, node(page, "misc"), node(page, "A"), "before", 90);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    await expect(log(page)).toContainText(
      '{"nodeId":"misc","fromParentId":null,"toParentId":"p","index":0}',
    );
    expect((await order(page)).slice(0, 3)).toEqual(["p", "misc", "A"]);
  });

  test("LargeTree: moving between zones keeps the indicator in sync", async ({ page }) => {
    await page.goto(story("large-tree"));
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    // the roots start collapsed
    const [first, second] = await order(page);
    const t0 = Date.now();
    await startDrag(page, node(page, second!));
    await moveToZone(page, node(page, first!), "inside");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await expect(indicator(page)).toHaveAttribute("data-drop-mode", "child");
    await moveToZone(page, node(page, first!), "before");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "0");
    await expect(indicator(page)).toHaveAttribute("data-drop-mode", "line");
    await moveToZone(page, node(page, first!), "inside", 96);
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    await expect(indicator(page)).toHaveCount(0);
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
