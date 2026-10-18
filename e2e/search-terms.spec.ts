import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { collectConsole, node, storyUrl } from "./helpers";

const open = (page: Page, story: string) =>
  page.goto(storyUrl(`treeview-searchterms--${story}`));
const addTerm = async (page: Page, term: string) => {
  await page.getByTestId("term-input").fill(term);
  await page.getByTestId("term-input").press("Enter");
};
const badge = (page: Page, index: number) => page.getByTestId("badge").nth(index);
const bg = (locator: ReturnType<Page["locator"]>) =>
  locator.evaluate((el) => getComputedStyle(el).backgroundColor);

test.describe("search terms", () => {
  test("two terms: two badges with counts, and marks tagged with the term index", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await open(page, "default");
    await expect(page.getByTestId("badge")).toHaveCount(0);
    await expect(node(page, "index")).toBeVisible();

    await addTerm(page, "src");
    await addTerm(page, "test");
    await expect(page.getByTestId("badge")).toHaveCount(2);
    await expect(badge(page, 0).getByTestId("badge-count")).toHaveText("1");
    await expect(badge(page, 1).getByTestId("badge-count")).toHaveText("4");
    await expect(page.getByTestId("total")).toHaveText("5 matching nodes");

    // The nodes that contain a term (and their ancestors) are visible, the others are not.
    await expect(node(page, "tree-test")).toBeVisible();
    await expect(node(page, "smoke")).toHaveCount(0);
    await expect(node(page, "readme")).toHaveCount(0);
    await expect(node(page, "locked")).toHaveAttribute("aria-disabled", "true");

    await expect(node(page, "src").locator("mark")).toHaveAttribute("data-term-index", "0");
    await expect(node(page, "tests").locator("mark")).toHaveAttribute("data-term-index", "1");
    await expect(node(page, "search-test").locator("mark")).toHaveText(["test"]);
    // "TreeView.test.tsx" contains only "test"; "search.test.ts" the same.
    await expect(node(page, "tree-test").locator("mark")).toHaveAttribute("data-term-index", "1");

    // Two different colors, the same as the badge's term, on tree and CSS.
    const first = await bg(node(page, "src").locator("mark"));
    const second = await bg(node(page, "tests").locator("mark"));
    expect(first).not.toBe(second);
    expect(log.errors).toEqual([]);
    expect(log.warnings).toEqual([]);
  });

  test("a term without matches shows 0, and removing badges restores the previous expansion", async ({
    page,
  }) => {
    await open(page, "default");
    await expect(node(page, "src")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "tests")).toHaveAttribute("aria-expanded", "false");

    await addTerm(page, "smoke");
    await expect(node(page, "tests")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "smoke")).toBeVisible();
    await addTerm(page, "nope-nothing");
    await expect(badge(page, 1).getByTestId("badge-count")).toHaveText("0");
    await expect(badge(page, 1)).toHaveAttribute("data-empty", "");
    await expect(badge(page, 0).getByTestId("badge-count")).toHaveText("1");

    await page.getByRole("button", { name: "Remove nope-nothing" }).click();
    await expect(page.getByTestId("badge")).toHaveCount(1);
    await expect(badge(page, 0).getByTestId("badge-count")).toHaveText("1");

    await page.getByRole("button", { name: "Remove smoke" }).click();
    await expect(page.getByTestId("badge")).toHaveCount(0);
    await expect(node(page, "src")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "tests")).toHaveAttribute("aria-expanded", "false");
    await expect(node(page, "smoke")).toHaveCount(0);
    await expect(page.locator("mark")).toHaveCount(0);
  });

  test("NoMatches: zero counts and the noResults message", async ({ page }) => {
    await open(page, "no-matches");
    await expect(page.getByTestId("no-results")).toBeVisible();
    await expect(page.getByRole("treeitem")).toHaveCount(0);
    await expect(page.getByTestId("badge-count")).toHaveText(["0", "0"]);
    await expect(page.getByTestId("total")).toHaveText("0 matching nodes");
  });

  test("Overlapping: only the longest term is highlighted, both are counted", async ({ page }) => {
    await open(page, "overlapping");
    const apple = node(page, "apple").locator("mark");
    await expect(apple).toHaveCount(1);
    await expect(apple).toHaveText("apple");
    await expect(apple).toHaveAttribute("data-term-index", "1");
    await expect(page.getByTestId("badge-count")).toHaveText(["2", "2"]);
    await expect(page.getByTestId("total")).toHaveText("2 matching nodes");
  });

  test("clicking a toggle during a multi-term search is temporary", async ({ page }) => {
    await open(page, "default");
    await addTerm(page, "test");
    await expect(node(page, "tree-test")).toBeVisible();
    await node(page, "components").locator("[data-toggle]").click();
    await expect(node(page, "tree-test")).toHaveCount(0);
    await page.getByRole("button", { name: "Remove test" }).click();
    // Back to the initial expansion: "src" open, "components" inside it closed.
    await expect(node(page, "components")).toHaveAttribute("aria-expanded", "false");
    await expect(node(page, "tree-test")).toHaveCount(0);
    await expect(node(page, "index")).toBeVisible();
  });

  test("LargeTree: 5000 nodes and 10 terms stay responsive", async ({ page }) => {
    await open(page, "large-tree");
    await expect(page.getByTestId("badge")).toHaveCount(10);
    await expect(page.getByTestId("total")).not.toHaveText("0 matching nodes");
    const started = Date.now();
    await addTerm(page, "node 4999");
    await expect(page.getByTestId("badge")).toHaveCount(11);
    await expect(page.getByTestId("badge").last().getByTestId("badge-count")).toHaveText("1");
    expect(Date.now() - started).toBeLessThan(5000);
    await expect(page.locator("mark").first()).toBeVisible();
  });
});
