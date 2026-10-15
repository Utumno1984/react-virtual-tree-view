import { expect, test } from "@playwright/test";
import { generateTree } from "../stories/data/generateTree";

test("Placeholder story renders", async ({ page }) => {
  await page.goto("/iframe.html?id=placeholder--coming-soon&viewMode=story");
  await expect(page.getByText("TreeView coming soon")).toBeVisible();
});

test("shared dataset generator is usable from e2e", () => {
  expect(generateTree({ count: 1000, maxDepth: 5, seed: 42 })).toEqual(
    generateTree({ count: 1000, maxDepth: 5, seed: 42 }),
  );
});
