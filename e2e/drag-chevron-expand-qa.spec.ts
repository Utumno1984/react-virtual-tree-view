import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { center, node, startDrag, storyUrl } from "./helpers";

const nest = storyUrl("draggabletreeview-draggable--nest-under-collapsed");
const chevron = (page: Page, id: string) => node(page, id).locator("[data-toggle]");
const DELAY = 400;

test.describe("expand on chevron hover (QA)", () => {
  test("the dragged node is not expanded by resting on its own chevron", async ({ page }) => {
    await page.goto(nest);
    await startDrag(page, node(page, "C"));
    const point = await center(chevron(page, "C"));
    await page.mouse.move(point.x, point.y + 2, { steps: 6 });
    await page.waitForTimeout(DELAY * 2);
    await expect(node(page, "C")).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(node(page, "C")).toHaveAttribute("aria-expanded", "false");
  });

  test("releasing on the chevron after the expansion fired still resolves a normal drop", async ({
    page,
  }) => {
    await page.goto(nest);
    await startDrag(page, node(page, "A"));
    const point = await center(chevron(page, "docs"));
    await page.mouse.move(point.x, point.y, { steps: 6 });
    await expect(node(page, "cv")).toBeVisible();
    await page.waitForTimeout(300);
    await page.mouse.up();
    await expect(page.getByTestId("last-event")).toContainText('"nodeId":"A"');
  });

  test("with a search query active there is no drag and hovering does nothing", async ({ page }) => {
    await page.goto(storyUrl("draggabletreeview-draggable--drag-disabled-while-searching"));
    const row = node(page, "C");
    await expect(row).toBeVisible();
    const a = await center(node(page, "A"));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x, a.y + 12, { steps: 4 });
    const point = await center(row.locator("[data-toggle]"));
    await page.mouse.move(point.x, point.y, { steps: 6 });
    const before = await row.getAttribute("aria-expanded");
    await page.waitForTimeout(DELAY * 2);
    await expect(row).toHaveAttribute("aria-expanded", before ?? "");
    await expect(page.locator("[data-drop-indicator]")).toHaveCount(0);
    await page.mouse.up();
    await expect(page.getByTestId("last-event")).toContainText("none yet");
  });

  test("large tree (1500 nodes): hover expands a collapsed root; a quick pass does not", async ({
    page,
  }) => {
    await page.goto(storyUrl("draggabletreeview-draggable--large-tree"));
    const rows = page.getByRole("treeitem");
    await expect(rows.first()).toBeVisible();
    const target = page.locator('[role="treeitem"][aria-expanded="false"]').nth(1);
    const id = await target.getAttribute("data-node-id");
    await startDrag(page, rows.first());
    const tg = node(page, id!);
    const p = await center(tg.locator("[data-toggle]"));
    await page.mouse.move(p.x, p.y, { steps: 6 });
    await page.mouse.move(p.x + 200, p.y, { steps: 4 });
    await page.waitForTimeout(DELAY * 2);
    await expect(tg).toHaveAttribute("aria-expanded", "false");
    await page.mouse.move(p.x, p.y, { steps: 4 });
    await expect(tg).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });
});
