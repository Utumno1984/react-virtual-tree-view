import { expect, test } from "@playwright/test";
import { collectConsole, storyUrl } from "./helpers";

const dragStory = storyUrl("draggabletreeview-dataswap--default") + "&args=maxDepth:2";
const count = (w: string[]) => w.filter((m) => m.includes("exceeds maxDepth")).length;

test.describe("DraggableTreeView maxDepth warning on data change (#45)", () => {
  test("DataSwap: warns once on deep, silent on repeat, re-arms after small", async ({ page }) => {
    const log = collectConsole(page);
    await page.goto(dragStory);
    await expect(page.getByRole("tree")).toBeVisible();
    expect(count(log.warnings)).toBe(0);
    await page.getByTestId("dataset-deep").click();
    await expect(page.getByTestId("active-dataset")).toHaveText("deep");
    await expect.poll(() => count(log.warnings)).toBe(1);
    await page.getByTestId("dataset-deep").click();
    await expect(page.getByTestId("active-dataset")).toHaveText("deep");
    expect(count(log.warnings)).toBe(1);
    await page.getByTestId("dataset-small").click();
    await expect(page.getByTestId("active-dataset")).toHaveText("small");
    expect(count(log.warnings)).toBe(1);
    await page.getByTestId("dataset-deep").click();
    await expect.poll(() => count(log.warnings)).toBe(2);
  });
});
