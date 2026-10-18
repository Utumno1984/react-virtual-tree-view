import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const draggable = "/iframe.html?id=draggabletreeview-draggable--draggable&viewMode=story";
const plain = "/iframe.html?id=treeview--basic&viewMode=story";
const searchActive = "/iframe.html?id=draggabletreeview-draggableautoscroll--search-active&viewMode=story";
const many = "/iframe.html?id=draggabletreeview-draggableautoscroll--default&viewMode=story";
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const selectedText = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? "");
const userSelect = (page: Page, id: string) =>
  node(page, id).evaluate((el) => getComputedStyle(el).userSelect);

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

async function pressMove(page: Page, cdpStart: { x: number; y: number }, moves: { x: number; y: number }[]) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, p?: { x: number; y: number }) =>
    cdp.send("Input.dispatchTouchEvent", {
      type: type as "touchStart",
      touchPoints: p ? [{ x: p.x, y: p.y }] : [],
    });
  await send("touchStart", cdpStart);
  await page.waitForTimeout(400);
  for (const m of moves) await send("touchMove", m);
  return { end: () => send("touchEnd"), send };
}

test.describe("touch drag ghost (#60) - QA extras", () => {
  test("plain TreeView rows stay text-selectable", async ({ page }) => {
    await page.goto(plain);
    await expect(node(page, "docs")).toBeVisible();
    expect(await userSelect(page, "docs")).not.toBe("none");
  });

  test("active search keeps drag disabled and rows selectable", async ({ page }) => {
    await page.goto(searchActive);
    const first = page.getByRole("treeitem").first();
    await expect(first).toBeVisible();
    expect(await first.evaluate((el) => getComputedStyle(el).userSelect)).not.toBe("none");
    const box = (await first.boundingBox())!;
    const t = await pressMove(page, { x: box.x + 40, y: box.y + box.height / 2 }, [
      { x: box.x + 40, y: box.y + box.height / 2 + 30 },
      { x: box.x + 40, y: box.y + box.height / 2 + 80 },
    ]);
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    await t.end();
  });

  test("a touch drag released outside the tree leaves no overlay and no selection", async ({ page }) => {
    await page.goto(draggable);
    const a = node(page, "A");
    await expect(a).toBeVisible();
    const box = (await a.boundingBox())!;
    const s = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const t = await pressMove(page, s, [
      { x: s.x, y: s.y + 6 },
      { x: s.x, y: s.y + 300 },
      { x: s.x, y: 830 },
    ]);
    await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    await t.end();
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    expect(await selectedText(page)).toBe("");
  });

  test("touch drag in a 1200-node tree keeps the overlay and ends cleanly", async ({ page }) => {
    await page.goto(many);
    const n = node(page, "n3");
    await expect(n).toBeVisible();
    const box = (await n.boundingBox())!;
    const s = { x: box.x + 60, y: box.y + box.height / 2 };
    const t = await pressMove(page, s, [{ x: s.x, y: s.y + 6 }]);
    for (let i = 1; i <= 8; i++) {
      await t.send("touchMove", { x: s.x, y: s.y + 6 + i * 10 });
      await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    }
    await t.end();
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    expect(await selectedText(page)).toBe("");
  });
});
