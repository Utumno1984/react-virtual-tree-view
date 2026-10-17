import { expect, test } from "@playwright/test";
import { collectConsole, node, storyUrl } from "./helpers";

const dragStory = storyUrl("draggabletreeview-dataswap--default");

test("DraggableTreeView/DataSwap: large scrolled to the bottom -> small starts from the top, console clean over 10 swaps", async ({
  page,
}) => {
  const log = collectConsole(page);
  await page.goto(dragStory);
  await page.getByTestId("dataset-large").click();
  await expect(node(page, "b-0")).toBeVisible();
  await page.getByRole("tree").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(node(page, "b-0")).toHaveCount(0);
  await page.getByTestId("dataset-small").click();
  await expect(node(page, "a-docs")).toBeVisible();
  await expect.poll(() => page.getByRole("tree").evaluate((el) => el.scrollTop)).toBe(0);
  const seq = ["large", "deep", "empty", "single", "small", "large", "deep", "empty", "large", "small"];
  for (const n of seq) await page.getByTestId(`dataset-${n}`).click();
  await expect(node(page, "a-docs")).toBeVisible();
  await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  expect(log.errors).toEqual([]);
  expect(log.warnings).toEqual([]);
});
