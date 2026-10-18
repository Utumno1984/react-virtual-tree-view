import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { collectConsole, node, storyUrl } from "./helpers";

const url = storyUrl("treeview-dataswap--default");
const menu = (page: Page) => page.getByRole("menu");

test.describe("TreeView/DataSwap: context menu QA extras (#53)", () => {
  test("a menu opened from the keyboard closes when its node vanishes", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await page.goto(url);
    await node(page, "a-todo").focus();
    await page.keyboard.press("Shift+F10");
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Alt+V"); // a-todo is not in `variant`
    await expect(node(page, "a-new")).toBeVisible();
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByTestId("menu-selects")).toHaveText("0");
    expect(log.errors).toEqual([]);
  });

  test("repeated swaps keep the menu while the id exists, then close it", async ({
    page,
  }) => {
    await page.goto(url);
    await node(page, "a-cv").click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Alt+V");
    await page.keyboard.press("Alt+V");
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Alt+L");
    await expect(node(page, "b-0")).toBeVisible();
    await expect(menu(page)).toHaveCount(0);
  });

  test("a menu opened after a swap works normally", async ({ page }) => {
    await page.goto(url);
    await node(page, "a-readme").click({ button: "right" });
    await page.keyboard.press("Alt+L");
    await expect(menu(page)).toHaveCount(0);
    await node(page, "b-0").click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    await page.getByRole("menuitem", { name: "Action" }).click();
    await expect(page.getByTestId("menu-selects")).toHaveText("1");
    await expect(menu(page)).toHaveCount(0);
  });
});
