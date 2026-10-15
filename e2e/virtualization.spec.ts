import { expect, test } from "@playwright/test";

const url = "/iframe.html?id=treeview--large-tree&viewMode=story";

test.describe("TreeView virtualization (LargeTree)", () => {
  test("renders only a window of the 1200 rows and keeps it bounded while scrolling", async ({
    page,
  }) => {
    await page.goto(url);
    const items = page.getByRole("treeitem");
    await expect(items.first()).toBeVisible();
    const initial = await items.count();
    expect(initial).toBeGreaterThan(0);
    expect(initial).toBeLessThan(40);

    const tree = page.getByRole("tree");
    const total = await tree.evaluate((el) => (el.firstElementChild as HTMLElement).offsetHeight);
    expect(total).toBeGreaterThan(500 * 32);

    await tree.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.locator('[data-node-id="node-0"]')).toHaveCount(0);
    const last = items.last();
    await expect(last).toBeVisible();
    expect(await items.count()).toBeLessThan(40);

    // The last row sits at the bottom edge of the viewport.
    const box = await last.boundingBox();
    const treeBox = await tree.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(treeBox!.y + treeBox!.height + 1);
  });

  test("rows use top and no transform", async ({ page }) => {
    await page.goto(url);
    const row = page.getByRole("treeitem").nth(2);
    await expect(row).toBeVisible();
    const style = await row.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { position: cs.position, top: cs.top, transform: cs.transform };
    });
    expect(style.position).toBe("absolute");
    expect(style.top).toBe("64px");
    expect(style.transform).toBe("none");
  });

  test("scrolling to the middle shows the matching rows", async ({ page }) => {
    await page.goto(url);
    const tree = page.getByRole("tree");
    await tree.evaluate((el) => {
      el.scrollTop = 320 * 32;
    });
    const first = page.getByRole("treeitem").first();
    await expect(first).toHaveCSS("top", `${315 * 32}px`);
  });
});
