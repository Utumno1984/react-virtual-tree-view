import { expect, test } from "@playwright/test";

// Deliberately failing test, probe commit for ticket #1.
test("probe: deliberately failing", async ({ page }) => {
  await page.goto("/iframe.html?id=placeholder--coming-soon&viewMode=story");
  await expect(page.getByText("this text does not exist")).toBeVisible({ timeout: 1000 });
});
