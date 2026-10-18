import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { dragToZone } from "./helpers";

const story = (id: string) =>
  `/iframe.html?id=draggabletreeview-draggablemaxdepth--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const log = (page: Page) => page.getByTestId("last-event");
const indicator = (page: Page) => page.locator("[data-drop-indicator]");
const levels = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => Number(el.getAttribute("aria-level"))));

// Drop model (#63): maxDepth no longer cuts the projected depth, it refuses the zones that would
// put the node (with its subtree) too deep: no indicator and no drop there.
test.describe("DraggableTreeView maxDepth", () => {
  test("a leaf over the middle of a row at the limit has no drop; the sibling zones of that row land at aria-level 3", async ({
    page,
  }) => {
    await page.goto(story("default"));
    await expect(page.getByTestId("max-depth")).toContainText("maxDepth = 2");
    // C1 is at depth 2: "becomes a child" would be depth 3 > 2, refused
    await dragToZone(page, node(page, "A"), node(page, "C1"), "inside");
    await expect(indicator(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
    // its lower quarter (next sibling of C1, depth 2) is valid
    await dragToZone(page, node(page, "A"), node(page, "C1"), "after");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    await expect(indicator(page)).toHaveAttribute("data-drop-mode", "line");
    await page.mouse.up();
    await expect(log(page)).toContainText(
      '{"nodeId":"A","fromParentId":"p","toParentId":"C","index":1}',
    );
    await expect(node(page, "A")).toHaveAttribute("aria-level", "3");
    expect(Math.max(...(await levels(page)))).toBe(3);
    await expect(indicator(page)).toHaveCount(0);
  });

  test("a projection within the limit is valid and not flagged", async ({ page }) => {
    await page.goto(story("default"));
    await dragToZone(page, node(page, "A"), node(page, "C"), "inside");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "2");
    await expect(indicator(page)).toHaveAttribute("data-depth-clamped", "false");
    await page.mouse.up();
  });

  test("a node with children is refused as a child where its subtree would exceed the limit, but still moves among the siblings", async ({
    page,
  }) => {
    await page.goto(story("default"));
    // C has a child (height 1): as a child of B it would be depth 2 and its child depth 3, refused
    await dragToZone(page, node(page, "C"), node(page, "B"), "inside");
    await expect(indicator(page)).toHaveCount(0);
    // same level as B (depth 1) fits: C -> 1, C1 -> 2
    await dragToZone(page, node(page, "C"), node(page, "A"), "before");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "1");
    await page.mouse.up();
    await expect(log(page)).toContainText(
      '{"nodeId":"C","fromParentId":"p","toParentId":"p","index":0}',
    );
    await expect(node(page, "C")).toHaveAttribute("aria-level", "2");
    await expect(node(page, "C1")).toHaveAttribute("aria-level", "3");
    expect(Math.max(...(await levels(page)))).toBe(3);
  });

  test("maxDepth 0: the middle of a row is refused, only reordering among the roots is possible", async ({
    page,
  }) => {
    await page.goto(story("roots-only"));
    await dragToZone(page, node(page, "tail"), node(page, "misc"), "inside");
    await expect(indicator(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");
    await dragToZone(page, node(page, "tail"), node(page, "misc"), "before");
    await expect(indicator(page)).toHaveAttribute("data-projected-depth", "0");
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"tail","fromParentId":null,"toParentId":null,"index":2');
    await expect(node(page, "tail")).toHaveAttribute("aria-level", "1");
  });
});
