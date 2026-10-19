import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { center, moveToZone, node, startDrag, storyUrl } from "./helpers";

// `p` is expanded; `C` (child C1) and `docs` (children cv, notes) are collapsed; `A`, `B` are leaves.
const url = storyUrl("draggabletreeview-draggable--nest-under-collapsed");
const log = (page: Page) => page.getByTestId("last-event");
const indicator = (page: Page) => page.locator("[data-drop-indicator]");
const chevron = (page: Page, id: string) => node(page, id).locator("[data-toggle]");

// Fixed delay of the library (CHEVRON_HOVER_EXPAND_DELAY = 400ms).
const DELAY = 400;

test.describe("expand on chevron hover while dragging", () => {
  test("resting on the chevron of a collapsed node expands it, with no indicator while waiting", async ({
    page,
  }) => {
    await page.goto(url);
    await expect(node(page, "misc")).toBeVisible();
    await startDrag(page, node(page, "A"));
    const point = await center(chevron(page, "C"));
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await expect(indicator(page)).toHaveCount(0);
    await page.waitForTimeout(DELAY / 2);
    await expect(node(page, "C")).toHaveAttribute("aria-expanded", "false");
    await expect(indicator(page)).toHaveCount(0);
    await expect(node(page, "C")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "C1")).toBeVisible();
    // C is open now: the pointer on its row decides normally (indicator, drop as first child)
    await expect(indicator(page)).toBeVisible();
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"A","fromParentId":"p","toParentId":"C","index":0');
  });

  test("passing quickly over the chevron does not expand", async ({ page }) => {
    await page.goto(url);
    await startDrag(page, node(page, "A"));
    const point = await center(chevron(page, "C"));
    await page.mouse.move(point.x, point.y, { steps: 4 });
    await page.mouse.move(point.x + 150, point.y, { steps: 4 });
    await page.waitForTimeout(DELAY * 2);
    await expect(node(page, "C")).toHaveAttribute("aria-expanded", "false");
    // (releasing here would nest A under C, which expands C: cancel instead)
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(node(page, "C")).toHaveAttribute("aria-expanded", "false");
  });

  test("a leaf chevron area does not expand or show anything odd", async ({ page }) => {
    await page.goto(url);
    await startDrag(page, node(page, "A"));
    const point = await center(chevron(page, "B"));
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await page.waitForTimeout(DELAY * 2);
    await expect(node(page, "B")).not.toHaveAttribute("aria-expanded", /.*/);
    await expect(indicator(page)).toBeVisible();
    await page.mouse.up();
  });

  test("an already expanded node keeps normal zones on its chevron", async ({ page }) => {
    await page.goto(url);
    await startDrag(page, node(page, "A"));
    const point = await center(chevron(page, "p"));
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await page.waitForTimeout(DELAY * 2);
    await expect(node(page, "p")).toHaveAttribute("aria-expanded", "true");
    await expect(indicator(page)).toBeVisible();
    await page.mouse.up();
  });

  test("a drag cancelled while the timer runs never expands the node", async ({ page }) => {
    await page.goto(url);
    await startDrag(page, node(page, "A"));
    const point = await center(chevron(page, "C"));
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await page.waitForTimeout(DELAY / 2);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForTimeout(DELAY * 2);
    await expect(node(page, "C")).toHaveAttribute("aria-expanded", "false");
    await expect(log(page)).toContainText("none yet");
  });

  test("a drop released before the delay on the chevron does not expand afterwards", async ({ page }) => {
    await page.goto(url);
    await startDrag(page, node(page, "A"));
    const point = await center(chevron(page, "docs"));
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await page.waitForTimeout(DELAY / 4);
    await page.mouse.up();
    await page.waitForTimeout(DELAY * 2);
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "false");
  });

  test("the child that just appeared accepts the sibling/child zones", async ({ page }) => {
    await page.goto(url);
    await startDrag(page, node(page, "A"));
    const point = await center(chevron(page, "docs"));
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await expect(node(page, "cv")).toBeVisible();
    await moveToZone(page, node(page, "cv"), "inside");
    await expect(indicator(page)).toHaveAttribute("data-drop-zone", "inside");
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"A"');
    await expect(log(page)).toContainText('"toParentId":"cv"');
  });

  test("two collapsed nodes in sequence: only the one rested on expands", async ({ page }) => {
    await page.goto(url);
    await startDrag(page, node(page, "A"));
    const c = await center(chevron(page, "C"));
    await page.mouse.move(c.x, c.y, { steps: 6 });
    await page.waitForTimeout(DELAY / 2);
    const d = await center(chevron(page, "docs"));
    await page.mouse.move(d.x, d.y, { steps: 6 });
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "C")).toHaveAttribute("aria-expanded", "false");
    await page.mouse.up();
  });
});
