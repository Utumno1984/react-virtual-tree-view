import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=treeview--${id}&viewMode=story`;

// Waits for the story to render, then Tabs into the tree and checks a treeitem got focus.
async function tabIntoTree(page: Page) {
  await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(page.locator('[role="treeitem"]:focus')).toHaveCount(1);
}

test.describe("selection and keyboard navigation", () => {
  test("ControlledSelection: Tab, arrows, Enter select the nested node", async ({ page }) => {
    await page.goto(story("controlled-selection"));
    await expect(page.getByTestId("selection")).toHaveText("Selezionato: nessuno");
    // Roving tabindex: exactly one tabbable treeitem.
    await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);

    await page.keyboard.press("Tab");
    await expect(page.locator('[data-node-id="docs"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-node-id="reports"]')).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-node-id="reports"]')).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-node-id="q1"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("selection")).toHaveText("Selezionato: Q1.xlsx");
    await expect(page.locator('[data-node-id="q1"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-node-id="q2"]')).toHaveAttribute("aria-selected", "false");
    // The selected node now holds the tabindex.
    await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  });

  test("ControlledSelection: ArrowLeft collapses, then goes to the parent; Space selects", async ({
    page,
  }) => {
    await page.goto(story("controlled-selection"));
    await page.locator('[data-node-id="reports"]').click();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('[data-node-id="reports"]')).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('[data-node-id="docs"]')).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('[data-node-id="docs"]')).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('[data-node-id="docs"]')).toBeFocused();
    await page.keyboard.press(" ");
    await expect(page.getByTestId("selection")).toHaveText("Selezionato: Documents");
  });

  test("Home/End and edges", async ({ page }) => {
    await page.goto(story("basic"));
    await tabIntoTree(page);
    await page.keyboard.press("ArrowUp");
    await expect(page.locator('[data-node-id="docs"]')).toBeFocused();
    await page.keyboard.press("End");
    await expect(page.locator('[data-node-id="notes"]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-node-id="notes"]')).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-node-id="notes"]')).toBeFocused();
    await page.keyboard.press("Home");
    await expect(page.locator('[data-node-id="docs"]')).toBeFocused();
  });

  test("Basic (uncontrolled): click selects, toggle click does not", async ({ page }) => {
    await page.goto(story("basic"));
    await page.locator('[data-node-id="notes"]').click();
    await expect(page.locator('[data-node-id="notes"]')).toHaveAttribute("aria-selected", "true");
    await page.locator('[data-node-id="docs"] [data-toggle]').click();
    await expect(page.locator('[data-node-id="docs"]')).toHaveAttribute("aria-selected", "false");
    await expect(page.locator('[data-node-id="notes"]')).toHaveAttribute("aria-selected", "true");
  });

  test("WithDisabledNodes: disabled is focusable but not selectable", async ({ page }) => {
    await page.goto(story("with-disabled-nodes"));
    await tabIntoTree(page);
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-node-id="open"]')).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-node-id="locked"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press(" ");
    await expect(page.locator('[data-node-id="locked"]')).toHaveAttribute("aria-selected", "false");
    await expect(page.locator('[data-node-id="open"]')).toHaveAttribute("aria-selected", "true");
    // Playwright treats aria-disabled rows as non-actionable, hence `force`.
    await page.locator('[data-node-id="locked-leaf"]').click({ force: true });
    await expect(page.locator('[data-node-id="locked-leaf"]')).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  test("LargeTree: End focuses the last row, scrolled into view", async ({ page }) => {
    await page.goto(story("large-tree"));
    await tabIntoTree(page);
    await page.keyboard.press("End");
    const focused = page.locator('[role="treeitem"]:focus');
    await expect(focused).toHaveCount(1);
    await expect(focused).toBeInViewport();
    const last = await focused.getAttribute("aria-posinset");
    const setsize = await focused.getAttribute("aria-setsize");
    expect(last).toBe(setsize);
    await page.keyboard.press("Home");
    await expect(page.locator('[role="treeitem"]:focus')).toHaveAttribute("aria-posinset", "1");
    await expect(page.locator('[role="treeitem"]:focus')).toBeInViewport();
  });

  test("Space does not scroll the page", async ({ page }) => {
    await page.goto(story("large-tree"));
    await tabIntoTree(page);
    await page.keyboard.press(" ");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
