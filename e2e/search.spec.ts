import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=treeview-search--${id}&viewMode=story`;
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);
const input = (page: Page) => page.getByTestId("search-input");

test.describe("search", () => {
  test("typing a deep term shows the node with <mark>, ancestors expanded; clearing restores", async ({
    page,
  }) => {
    await page.goto(story("search"));
    // Initial state: only "docs" expanded.
    await expect(page.getByRole("treeitem")).toHaveCount(6);
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "reports")).toHaveAttribute("aria-expanded", "false");
    await expect(node(page, "q1-2019")).toHaveCount(0);

    await input(page).fill("QUARTERLY");
    await expect(node(page, "q1-2019")).toBeVisible();
    await expect(node(page, "q1-2019").locator("mark")).toHaveText("Quarterly");
    for (const id of ["docs", "reports", "archive"]) {
      await expect(node(page, id)).toHaveAttribute("aria-expanded", "true");
      await expect(node(page, id).locator("mark")).toHaveCount(0);
    }
    // The disabled match is visible, highlighted and not selectable.
    await expect(node(page, "locked")).toHaveAttribute("aria-disabled", "true");
    await expect(node(page, "locked").locator("mark")).toHaveText("Quarterly");
    await expect(node(page, "pics")).toHaveCount(0);
    await expect(node(page, "cv")).toHaveCount(0);

    await input(page).fill("");
    await expect(page.getByRole("treeitem")).toHaveCount(6);
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "reports")).toHaveAttribute("aria-expanded", "false");
    await expect(node(page, "pics")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("mark")).toHaveCount(0);
  });

  test("whitespace-only query restores the initial expansion, even after toggling during the search", async ({
    page,
  }) => {
    await page.goto(story("search"));
    await input(page).fill("quarterly");
    await node(page, "archive").locator("[data-toggle]").click(); // collapse during the search
    await expect(node(page, "q1-2019")).toHaveCount(0);
    await input(page).fill("   ");
    await expect(page.getByRole("treeitem")).toHaveCount(6);
    await expect(node(page, "reports")).toHaveAttribute("aria-expanded", "false");
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
  });

  test("a term without matches shows the message and no treeitem", async ({ page }) => {
    await page.goto(story("search"));
    await input(page).fill("nothing-like-this");
    await expect(page.getByTestId("no-results")).toHaveText("Nessun risultato");
    await expect(page.getByRole("treeitem")).toHaveCount(0);
    await input(page).fill("");
    await expect(page.getByTestId("no-results")).toHaveCount(0);
    await expect(page.getByRole("treeitem")).toHaveCount(6);
  });

  test("regex characters and surrounding spaces are literal / ignored", async ({ page }) => {
    await page.goto(story("search"));
    await input(page).fill("a.b(");
    await expect(page.getByTestId("no-results")).toBeVisible();
    await input(page).fill("  holiday ");
    await expect(node(page, "holiday")).toBeVisible();
    await expect(node(page, "holiday").locator("mark")).toHaveText("Holiday");
    await expect(node(page, "pics")).toHaveAttribute("aria-expanded", "true");
  });

  test("WithMatches story starts filtered with ancestors expanded", async ({ page }) => {
    await page.goto(story("with-matches"));
    await expect(node(page, "q1-2019").locator("mark")).toHaveText("Quarterly");
    await expect(node(page, "archive")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "notes")).toHaveCount(0);
  });

  test("NoMatches story starts with the message and no treeitem", async ({ page }) => {
    await page.goto(story("no-matches"));
    await expect(page.getByTestId("no-results")).toBeVisible();
    await expect(page.getByRole("treeitem")).toHaveCount(0);
  });

  test("LargeTree: searching a single node of 1500 filters the virtualized tree", async ({
    page,
  }) => {
    await page.goto(story("large-tree"));
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    await input(page).fill("Node 1499");
    const hit = node(page, "node-1499");
    await expect(hit).toBeVisible();
    await expect(hit.locator("mark")).toHaveText("Node 1499");
    expect(await page.getByRole("treeitem").count()).toBeLessThan(10);
    await input(page).fill("");
    await expect(page.locator("mark")).toHaveCount(0);
    await expect(page.getByRole("treeitem").first()).toBeVisible();
  });
});
