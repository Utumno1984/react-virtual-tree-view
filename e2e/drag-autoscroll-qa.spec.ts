import { expect, test } from "@playwright/test";

const url = "/iframe.html?id=draggabletreeview-draggableautoscroll--default&viewMode=story";

test.describe("auto-scroll QA", () => {
  test("two consecutive drags both auto-scroll, with a horizontal level change and no console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url);
    const tree = page.getByRole("tree");
    const box = (await tree.boundingBox())!;
    const scrollTop = () => tree.evaluate((el) => el.scrollTop);

    for (let round = 0; round < 2; round++) {
      const first = page.getByRole("treeitem").first();
      const row = (await first.boundingBox())!;
      const x = row.x + row.width / 2;
      await page.mouse.move(x, row.y + row.height / 2);
      await page.mouse.down();
      await page.mouse.move(x + 40, row.y + row.height / 2 + 10, { steps: 3 });
      await page.mouse.move(x + 40, box.y + box.height - 5, { steps: 5 });
      const before = await scrollTop();
      await expect.poll(scrollTop).toBeGreaterThan(before + 100);
      await page.mouse.up();
      await tree.evaluate((el) => {
        el.scrollTop = 0;
      });
      await expect.poll(scrollTop).toBe(0);
    }
    expect(errors).toEqual([]);
  });
});
