import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=treeview-search--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);

test.describe("search QA", () => {
  test("keyboard navigation works inside a filtered tree; disabled match is not selectable", async ({
    page,
  }) => {
    await page.goto(story("search"));
    await page.getByTestId("search-input").fill("quarterly");
    await node(page, "docs").focus();
    await page.keyboard.press("ArrowDown");
    await expect(node(page, "reports")).toBeFocused();
    await page.keyboard.press("ArrowLeft"); // collapse during the search
    await expect(node(page, "reports")).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("ArrowRight");
    await expect(node(page, "reports")).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Enter");
    await expect(node(page, "reports")).toHaveAttribute("aria-selected", "true");
    await node(page, "locked").focus();
    await page.keyboard.press("Space");
    await expect(node(page, "locked")).toHaveAttribute("aria-selected", "false");
  });
});
