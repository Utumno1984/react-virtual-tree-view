import { expect, test } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=treeview--${id}&viewMode=story`;

test.describe("selection and keyboard QA", () => {
  test("LargeTree: ArrowDown past the viewport scrolls and keeps DOM focus", async ({ page }) => {
    await page.goto(story("large-tree"));
    await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press("Tab");
    await expect(page.locator('[role="treeitem"]:focus')).toHaveCount(1);
    for (let i = 0; i < 80; i++) await page.keyboard.press("ArrowDown");
    const focused = page.locator('[role="treeitem"]:focus');
    await expect(focused).toHaveCount(1);
    await expect(focused).toHaveAttribute("data-row-index", "80");
    await expect(focused).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  });

  test("ControlledSelection: click selects and updates the parent text", async ({ page }) => {
    await page.goto(story("controlled-selection"));
    await page.locator('[data-node-id="notes"]').click();
    await expect(page.getByTestId("selection")).not.toHaveText("Selezionato: nessuno");
    await expect(page.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(1);
  });
});
