import { expect, test } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=treeview-contextmenu--${id}&viewMode=story`;

type EscWindow = Window & { __esc: number };

test.describe("context menu QA (round 2)", () => {
  test("treeitems expose aria-haspopup=menu; Esc closes, focus returns, Esc does not reach document", async ({
    page,
  }) => {
    await page.goto(story("context-menu"));
    await page.evaluate(() => {
      (window as unknown as EscWindow).__esc = 0;
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") (window as unknown as EscWindow).__esc++;
      });
    });
    const items = page.getByRole("treeitem");
    await expect(items.first()).toHaveAttribute("aria-haspopup", "menu");
    await items.first().focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(items.first()).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as EscWindow).__esc)).toBe(0);
  });

  test("LargeTree: menu on a row closes on outside right click, no console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(story("large-tree"));
    await page.getByRole("treeitem").nth(3).click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    await page.mouse.click(5, 5, { button: "right" });
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("Draggable: after dismissing the menu a drag still works and leaves no menu", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    const rows = page.getByRole("treeitem");
    await rows.first().click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    const b = (await rows.nth(3).boundingBox())!;
    await page.mouse.move(b.x + 100, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + 100, b.y + b.height / 2 - 40, { steps: 8 });
    await expect(page.locator("[data-drag-overlay]")).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.mouse.up();
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
  });
});
