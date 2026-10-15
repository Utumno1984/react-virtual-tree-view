import { expect, test } from "@playwright/test";
import { generateTree } from "../stories/data/generateTree";

test("Basic story renders", async ({ page }) => {
  await page.goto("/iframe.html?id=treeview--basic&viewMode=story");
  await expect(page.getByRole("tree")).toBeVisible();
});

test("shared dataset generator is usable from e2e", () => {
  expect(generateTree({ count: 1000, maxDepth: 5, seed: 42 })).toEqual(
    generateTree({ count: 1000, maxDepth: 5, seed: 42 }),
  );
});
