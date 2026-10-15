import { expect, test } from "@playwright/test";

const url = "/iframe.html?id=treeview--large-tree&viewMode=story";

test.describe("TreeView virtualization QA", () => {
  test("fast scrolling never leaves an uncovered gap in the viewport", async ({ page }) => {
    await page.goto(url);
    const tree = page.getByRole("tree");
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    for (const top of [13, 5000, 17001, 333, 30000, 20007, 0]) {
      const result = await tree.evaluate(async (el, scrollTop) => {
        el.scrollTop = scrollTop;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const rows = [...el.querySelectorAll('[role="treeitem"]')] as HTMLElement[];
        const tops = rows.map((r) => r.offsetTop);
        const min = Math.min(...tops);
        const max = Math.max(...tops) + 32;
        return { min, max, count: rows.length, st: el.scrollTop, h: el.clientHeight };
      }, top);
      expect(result.min).toBeLessThanOrEqual(result.st);
      expect(result.max).toBeGreaterThanOrEqual(result.st + result.h);
      // ceil(400/32)+2*5 = 23, also for an unaligned scroll
      expect(result.count).toBeLessThanOrEqual(23);
    }
  });

  test("an empty tree with a fixed height does not leave a blank box above the empty state", async ({
    page,
  }) => {
    await page.goto("/iframe.html?id=treeview--empty-with-height&viewMode=story");
    const empty = page.getByText("Nothing to show");
    await expect(empty).toBeVisible();
    const treeBox = await page.getByRole("tree").boundingBox();
    const emptyBox = await empty.boundingBox();
    expect(treeBox!.height).toBeLessThan(100);
    expect(emptyBox!.y - (treeBox!.y + treeBox!.height)).toBeLessThan(20);
  });

  test("expanding a node above the viewport keeps scrollTop", async ({ page }) => {
    await page.goto("/iframe.html?id=treeview--large-tree-first-parent-collapsed&viewMode=story");
    const tree = page.getByRole("tree");
    const collapsed = page.locator('[role="treeitem"][aria-expanded="false"]').first();
    await expect(collapsed).toBeVisible();
    const id = await collapsed.getAttribute("data-node-id");
    const rowTop = await collapsed.evaluate((el) => (el as HTMLElement).offsetTop);
    // Scroll so the collapsed row is just above the viewport (still rendered as overscan).
    const target = rowTop + 64;
    await tree.evaluate((el, top) => {
      el.scrollTop = top;
    }, target);
    const row = page.locator(`[data-node-id="${id}"]`);
    await expect(row).toHaveCount(1);
    const before = await tree.evaluate((el) => el.scrollTop);
    expect(before).toBe(target);
    const heightBefore = await tree.evaluate((el) => (el.firstElementChild as HTMLElement).offsetHeight);
    await row.locator("[data-toggle]").dispatchEvent("click");
    await expect(row).toHaveAttribute("aria-expanded", "true");
    expect(await tree.evaluate((el) => el.scrollTop)).toBe(before);
    const heightAfter = await tree.evaluate((el) => (el.firstElementChild as HTMLElement).offsetHeight);
    expect(heightAfter).toBeGreaterThan(heightBefore);
  });

  test("collapsing a node mid list keeps scrollTop", async ({ page }) => {
    await page.goto(url);
    const tree = page.getByRole("tree");
    await tree.evaluate((el) => {
      el.scrollTop = 10000;
    });
    const first = page.locator('[role="treeitem"][aria-expanded="true"]').first();
    await expect(first).toBeVisible();
    const id = await first.getAttribute("data-node-id");
    const toggle = page.locator(`[data-node-id="${id}"]`);
    const before = await tree.evaluate((el) => el.scrollTop);
    const heightBefore = await tree.evaluate((el) => (el.firstElementChild as HTMLElement).offsetHeight);
    // dispatchEvent: a real click would make Playwright scroll the (overscan) row into view.
    await toggle.locator("[data-toggle]").dispatchEvent("click");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(await tree.evaluate((el) => el.scrollTop)).toBe(before);
    const heightAfter = await tree.evaluate((el) => (el.firstElementChild as HTMLElement).offsetHeight);
    expect(heightAfter).toBeLessThan(heightBefore);
  });
});
