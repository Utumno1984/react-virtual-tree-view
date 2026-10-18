import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { collectConsole, node, storyUrl } from "./helpers";

const url = storyUrl("treeview-dataswap--default");
const menu = (page: Page) => page.getByRole("menu");

test.describe("TreeView/DataSwap: context menu (#53)", () => {
  test("the menu closes silently when its node vanishes from the new data", async ({ page }) => {
    const log = collectConsole(page);
    await page.goto(url);
    await node(page, "a-readme").click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Alt+L"); // swap to `large`
    await expect(node(page, "b-0")).toBeVisible();
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByTestId("menu-selects")).toHaveText("0");
    expect(log.errors).toEqual([]);
  });

  test("the menu stays open when the same id exists in the new data", async ({ page }) => {
    await page.goto(url);
    await node(page, "a-cv").click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    await page.keyboard.press("Alt+V"); // swap to `variant`
    await expect(node(page, "a-cv")).toHaveText(/CV \(updated\)\.pdf/);
    await expect(menu(page)).toBeVisible();
    await page.getByRole("menuitem", { name: "Action" }).click();
    await expect(page.getByTestId("menu-selects")).toHaveText("1");
  });

  test("the menu stays open when the node is hidden by the search filter", async ({ page }) => {
    await page.goto(url);
    await node(page, "a-readme").click({ button: "right" });
    await expect(menu(page)).toBeVisible();
    await page.getByTestId("search-input").fill("Holiday");
    await expect(node(page, "a-readme")).toHaveCount(0);
    await expect(menu(page)).toBeVisible();
  });
});
