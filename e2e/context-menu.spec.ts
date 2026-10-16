import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=treeview-contextmenu--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const menu = (page: Page) => page.getByRole("menu");
const message = (page: Page) => page.getByTestId("action-message");

test.describe("context menu", () => {
  test("right click opens the menu at the pointer with the consumer's items", async ({ page }) => {
    await page.goto(story("context-menu"));
    const box = (await node(page, "pics").boundingBox())!;
    const x = box.x + 40;
    const y = box.y + 10;
    await node(page, "pics").click({ button: "right", position: { x: 40, y: 10 } });
    await expect(menu(page)).toBeVisible();
    await expect(page.getByRole("menuitem")).toHaveText([
      "Rinomina (demo)",
      "Condividi (demo)",
      "Elimina (demo)",
    ]);
    const menuBox = (await menu(page).boundingBox())!;
    expect(Math.abs(menuBox.x - x)).toBeLessThan(2);
    expect(Math.abs(menuBox.y - y)).toBeLessThan(2);
  });

  test("clicking an item runs the action for that node and closes the menu", async ({ page }) => {
    await page.goto(story("context-menu"));
    await node(page, "pics").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Elimina (demo)" }).click();
    await expect(message(page)).toHaveText("Azione: Elimina su Pictures");
    await expect(menu(page)).toHaveCount(0);
  });

  test("keyboard: Tab, Shift+F10, ArrowDown, Enter runs the action", async ({ page }) => {
    await page.goto(story("context-menu"));
    await expect(node(page, "docs")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(node(page, "docs")).toBeFocused();
    await page.keyboard.press("Shift+F10");
    await expect(menu(page)).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Rinomina (demo)" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Condividi (demo)" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(message(page)).toHaveText("Azione: Condividi su Documents");
    await expect(menu(page)).toHaveCount(0);
    await expect(node(page, "docs")).toBeFocused();
  });

  test("the ContextMenu key opens it; Esc closes and returns focus to the node", async ({
    page,
  }) => {
    await page.goto(story("context-menu"));
    await node(page, "pics").focus();
    await page.keyboard.press("ContextMenu");
    await expect(menu(page)).toBeVisible();
    await expect(page.getByRole("menuitem")).toHaveCount(3);
    // Anchored to the row: its left edge, just below it.
    const rowBox = (await node(page, "pics").boundingBox())!;
    const menuBox = (await menu(page).boundingBox())!;
    expect(Math.abs(menuBox.x - rowBox.x)).toBeLessThan(2);
    expect(Math.abs(menuBox.y - (rowBox.y + rowBox.height))).toBeLessThan(2);
    await page.keyboard.press("Escape");
    await expect(menu(page)).toHaveCount(0);
    await expect(node(page, "pics")).toBeFocused();
  });

  test("arrows wrap skipping the disabled item, Home/End jump", async ({
    page,
  }) => {
    await page.goto(story("context-menu"));
    // "cv" has the middle item disabled.
    await node(page, "cv").click({ button: "right" });
    const items = page.getByRole("menuitem");
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(2)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(items.nth(2)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press("End");
    await expect(items.nth(2)).toBeFocused();
  });

  test("a disabled item is aria-disabled and does nothing when clicked", async ({ page }) => {
    await page.goto(story("context-menu"));
    await node(page, "cv").click({ button: "right" });
    const disabled = page.getByRole("menuitem", { name: "Condividi (demo)" });
    await expect(disabled).toHaveAttribute("aria-disabled", "true");
    // force: Playwright would wait forever for an aria-disabled element to become enabled.
    await disabled.click({ force: true });
    await expect(message(page)).toHaveText("");
    await expect(menu(page)).toBeVisible();
  });

  test("a click outside closes the menu and returns focus to the node", async ({ page }) => {
    await page.goto(story("context-menu"));
    await node(page, "pics").click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    await page.mouse.click(600, 500);
    await expect(menu(page)).toHaveCount(0);
    await expect(node(page, "pics")).toBeFocused();
  });

  test("a right or middle click outside closes the menu", async ({ page }) => {
    await page.goto(story("context-menu"));
    for (const button of ["right", "middle"] as const) {
      await node(page, "pics").click({ button: "right" });
      await expect(menu(page)).toBeVisible();
      await page.mouse.click(600, 500, { button });
      await expect(menu(page)).toHaveCount(0);
    }
  });

  test("right click on another node of the same tree opens the menu for that node", async ({
    page,
  }) => {
    await page.goto(story("context-menu"));
    await node(page, "pics").click({ button: "right" });
    await node(page, "docs").click({ button: "right" });
    await expect(menu(page)).toHaveCount(1);
    await page.getByRole("menuitem", { name: "Rinomina (demo)" }).click();
    await expect(message(page)).toHaveText("Azione: Rinomina su Documents");
  });

  test("with two trees only one menu is open at a time", async ({ page }) => {
    await page.goto(story("two-trees"));
    await node(page, "pics").click({ button: "right" });
    await expect(menu(page)).toHaveCount(1);
    await node(page, "other").click({ button: "right" });
    await expect(menu(page)).toHaveCount(1);
    await expect(menu(page)).toHaveAttribute("aria-label", "Other tree");
  });

  test("near the right edge the menu keeps its natural size (items do not wrap)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 500, height: 400 });
    await page.goto(story("context-menu"));
    // Without the demo's min-width the shrink-to-fit width is what is being measured.
    await page.addStyleTag({ content: "[role=menu] { min-width: 0 !important; }" });
    await node(page, "pics").click({ button: "right", position: { x: 5, y: 5 } });
    const open = (await menu(page).boundingBox())!;
    await page.evaluate(() => {
      document.querySelector('[data-node-id="pics"]')!.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: window.innerWidth - 1,
          clientY: 100,
        }),
      );
    });
    const edge = (await menu(page).boundingBox())!;
    expect(edge.width).toBeCloseTo(open.width, 0);
    expect(edge.height).toBeCloseTo(open.height, 0);
    expect(edge.x + edge.width).toBeLessThanOrEqual(500);
  });

  test("a node whose items() is [] gets no library menu", async ({ page }) => {
    await page.goto(story("context-menu"));
    await expect(node(page, "notes")).toBeVisible();
    const prevented = await page.evaluate(() => {
      const el = document.querySelector('[data-node-id="notes"]')!;
      const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await expect(menu(page)).toHaveCount(0);
    await node(page, "notes").focus();
    await page.keyboard.press("Shift+F10");
    await expect(menu(page)).toHaveCount(0);
  });

  test("a disabled node still opens the menu", async ({ page }) => {
    await page.goto(story("context-menu"));
    await node(page, "locked").click({ button: "right", force: true });
    await expect(menu(page)).toBeVisible();
    await page.getByRole("menuitem", { name: "Rinomina (demo)" }).click();
    await expect(message(page)).toHaveText("Azione: Rinomina su Locked folder");
  });

  test("near the bottom-right corner the menu stays inside the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 300 });
    await page.goto(story("context-menu"));
    await node(page, "pics").click({ button: "right", position: { x: 5, y: 5 } });
    // Reopen at the extreme corner by dispatching a contextmenu there.
    await page.evaluate(() => {
      const el = document.querySelector('[data-node-id="pics"]')!;
      el.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: window.innerWidth - 1,
          clientY: window.innerHeight - 1,
        }),
      );
    });
    const box = (await menu(page).boundingBox())!;
    const { width, height } = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
  });

  test("scrolling a large tree closes the menu", async ({ page }) => {
    await page.goto(story("large-tree"));
    await page.getByRole("treeitem").first().click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    await page.getByRole("tree").evaluate((el) => {
      el.scrollTop = 600;
    });
    await expect(menu(page)).toHaveCount(0);
  });

  test("pressing on another row to start a drag closes the menu (outside pointerdown)", async ({ page }) => {
    await page.goto(story("draggable"));
    await node(page, "pics").click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    // Drag a row that is not covered by the menu.
    const from = (await node(page, "notes").boundingBox())!;
    const startX = from.x + 100;
    const startY = from.y + from.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 20, { steps: 5 });
    await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    await expect(menu(page)).toHaveCount(0);
    await page.mouse.up();
  });
});
