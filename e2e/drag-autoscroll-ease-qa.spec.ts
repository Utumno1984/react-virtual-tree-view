import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) =>
  `/iframe.html?id=draggabletreeview-draggableautoscroll--${id}&viewMode=story`;
const tree = (page: Page) => page.getByRole("tree");
const scrollTop = (page: Page) => tree(page).evaluate((el) => el.scrollTop);

/** Scroll distance covered in `ms` with the pointer held `fromBottom` px above the tree's bottom edge. */
async function distanceAt(page: Page, fromBottom: number, ms = 500): Promise<number> {
  await page.goto(story("default"));
  const box = await tree(page).boundingBox();
  const row = await page.locator('[data-node-id="n0"]').boundingBox();
  if (!box || !row) throw new Error("not visible");
  const x = row.x + row.width / 2;
  await page.mouse.move(x, row.y + row.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, row.y + row.height / 2 + 10, { steps: 3 });
  await page.mouse.move(x, box.y + box.height - fromBottom, { steps: 5 });
  const start = await scrollTop(page);
  await page.waitForTimeout(ms);
  const end = await scrollTop(page);
  await page.mouse.up();
  return end - start;
}

test.describe("auto-scroll ease-in (QA)", () => {
  test("just inside the band scrolls far slower than at the very edge", async ({ page }) => {
    const slow = await distanceAt(page, 32); // 20% into the 40 px band: 0.8 px/frame (linear: 4)
    const fast = await distanceAt(page, 1); // ~full speed: ~20 px/frame
    expect(fast).toBeGreaterThan(100);
    expect(slow).toBeLessThan(fast / 10); // ease-in ~25x slower; linear would be only ~5x
  });

  test("speed grows monotonically with the depth into the band", async ({ page }) => {
    const a = await distanceAt(page, 30);
    const b = await distanceAt(page, 15);
    const c = await distanceAt(page, 2);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});
