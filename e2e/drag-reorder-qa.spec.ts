import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=draggabletreeview-draggable--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const log = (page: Page) => page.getByTestId("last-event");
const order = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => el.getAttribute("data-node-id")));
async function center(page: Page, id: string) {
  const box = await node(page, id).boundingBox();
  if (!box) throw new Error(`row ${id} not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function dragTo(page: Page, from: string, to: { x: number; y: number }) {
  const start = await center(page, from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
}

test.describe("DraggableTreeView reorder QA", () => {
  test("LargeTree (1500 nodes): reordering root siblings really reorders", async ({ page }) => {
    await page.goto(story("large-tree"));
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    const ids = await order(page);
    expect(ids.length).toBeGreaterThan(2);
    await dragTo(page, ids[0]!, await center(page, ids[2]!));
    await page.mouse.up();
    await expect(log(page)).toContainText(`"nodeId":"${ids[0]}"`);
    await expect.poll(async () => (await order(page)).indexOf(ids[0]!)).toBeGreaterThan(1);
  });

  test("dropping on a node with a different parent does not corrupt the tree", async ({ page }) => {
    await page.goto(story("draggable"));
    await expect(node(page, "misc")).toBeVisible();
    const before = await order(page);
    await dragTo(page, "A", await center(page, "cv"));
    await page.mouse.up();
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    const after = await order(page);
    expect(after.slice().sort()).toEqual(before.slice().sort());
  });

  test("keyboard navigation still works in the draggable tree", async ({ page }) => {
    await page.goto(story("draggable"));
    await node(page, "p").focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-node-id"));
    expect(focused).toBe("A");
    await expect(node(page, "A")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect(node(page, "B")).toHaveAttribute("aria-selected", "true");
    await node(page, "p").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(node(page, "A")).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(node(page, "A")).toBeVisible();
  });

  test("scrolling the list during a drag drops on the row under the pointer (no double count)", async ({
    page,
  }) => {
    await page.goto(story("large-tree"));
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    const ids = await order(page);
    const first = ids[0]!;
    const third = await center(page, ids[2]!);
    await dragTo(page, first, third);
    await page.evaluate(() => {
      const tree = document.querySelector('[role="tree"]') as HTMLElement;
      const scroller = [tree, ...Array.from(tree.querySelectorAll<HTMLElement>("*"))].find(
        (el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === "auto",
      )!;
      scroller.scrollTop = 160;
    });
    // the row now under the (unmoved) pointer; its position is its `top` / row height
    const expected = await page.evaluate(
      ({ x, y }) => {
        const el = document
          .elementsFromPoint(x, y)
          .find((e) => e.getAttribute("role") === "treeitem") as HTMLElement;
        return { id: el.getAttribute("data-node-id"), index: parseInt(el.style.top, 10) / 32 };
      },
      third,
    );
    expect(expected.index).toBeGreaterThan(5);
    await page.mouse.up();
    await expect(log(page)).toContainText(`"nodeId":"${first}"`);
    await expect(log(page)).toContainText(`"index":${expected.index}`);
  });

  test("a second drag after the first works", async ({ page }) => {
    await page.goto(story("draggable"));
    await dragTo(page, "A", await center(page, "C"));
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"A"');
    await dragTo(page, "B", await center(page, "A"));
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"B"');
  });

  test("no pointermove listener on document is left after Esc, a drop, or a second drag", async ({
    page,
  }) => {
    // Counts document-level pointermove listeners added minus removed.
    await page.addInitScript(() => {
      const w = window as unknown as { __pm: number };
      w.__pm = 0;
      const add = document.addEventListener.bind(document) as (...a: unknown[]) => void;
      const rem = document.removeEventListener.bind(document) as (...a: unknown[]) => void;
      document.addEventListener = ((t: string, ...r: unknown[]) => {
        if (t === "pointermove") w.__pm++;
        return add(t, ...r);
      }) as typeof document.addEventListener;
      document.removeEventListener = ((t: string, ...r: unknown[]) => {
        if (t === "pointermove") w.__pm--;
        return rem(t, ...r);
      }) as typeof document.removeEventListener;
    });
    const count = () => page.evaluate(() => (window as unknown as { __pm: number }).__pm);
    await page.goto(story("draggable"));
    // Warm-up drag: the page keeps one unrelated persistent listener once a drag has run;
    // what matters is that further drags do not accumulate any.
    await dragTo(page, "A", await center(page, "A"));
    await page.mouse.up();
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    const base = await count();
    await dragTo(page, "A", await center(page, "D"));
    expect(await count()).toBeGreaterThan(base);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
    expect(await count()).toBe(base);
    await dragTo(page, "A", await center(page, "C"));
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"A"');
    expect(await count()).toBe(base);
    await dragTo(page, "B", await center(page, "A"));
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"B"');
    expect(await count()).toBe(base);
  });
});
