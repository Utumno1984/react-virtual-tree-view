import { expect, test } from "@playwright/test";

const url = "/iframe.html?id=treeview--large-tree&viewMode=story";

test.describe("focus and virtualization QA", () => {
  test("a focused row scrolled out of the window stays mounted, and the rendered count stays bounded", async ({
    page,
  }) => {
    await page.goto(url);
    const tree = page.getByRole("tree");
    await expect(page.locator('[data-row-index="0"]')).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown");
    const focused = page.locator('[role="treeitem"]:focus');
    await expect(focused).toHaveAttribute("data-row-index", "1");
    await tree.evaluate((el) => (el.scrollTop = 20000));
    await expect(page.locator('[data-row-index="630"]')).toBeVisible();
    // Focused row (index 1) is out of the window but still mounted and focused.
    await expect(page.locator('[data-row-index="1"]')).toHaveCount(1);
    await expect(page.locator('[data-row-index="1"]')).toBeFocused();
    expect(await page.getByRole("treeitem").count()).toBeLessThan(41);
    // Keyboard continues from the focused row and scrolls it back into view.
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[role="treeitem"]:focus')).toHaveAttribute("data-row-index", "2");
    await expect(page.locator('[role="treeitem"]:focus')).toBeInViewport();
  });

  test("focus is recovered when the focused row is unmounted by a collapse", async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('[data-row-index="0"]')).toBeVisible();
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[role="treeitem"]:focus')).toHaveAttribute("data-row-index", "1");
    const parent = page.locator('[data-row-index="0"]');
    await expect(parent).toHaveAttribute("aria-expanded", "true");
    await parent.locator("[data-toggle]").dispatchEvent("click");
    await expect(parent).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('[role="treeitem"]:focus')).toHaveCount(1);
    await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press("ArrowRight");
    await expect(parent).toHaveAttribute("aria-expanded", "true");
  });
});
