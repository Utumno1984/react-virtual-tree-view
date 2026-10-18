import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { collectConsole, node, storyUrl } from "./helpers";

const stories = [
  ["TreeView", storyUrl("treeview-dataswap--default")],
  ["DraggableTreeView", storyUrl("draggabletreeview-dataswap--default")],
] as const;
const controlledStory = storyUrl("treeview-dataswap--controlled-selection");

const pick = (page: Page, name: string) => page.getByTestId(`dataset-${name}`).click();
const selected = (page: Page) => page.locator('[role="treeitem"][aria-selected="true"]');
const tabbable = (page: Page) => page.locator('[role="treeitem"][tabindex="0"]');
const toggle = (page: Page, id: string) => node(page, id).locator("[data-toggle]").click();
const expandedEvents = (page: Page) => page.getByTestId("expanded-events");

for (const [name, url] of stories) {
  test.describe(`${name}/DataSwap: stale ids (#44)`, () => {
    test("a selected id missing from the new tree is reset, onSelect not called", async ({
      page,
    }) => {
      const log = collectConsole(page);
      await page.goto(url);
      await node(page, "a-readme").click();
      await expect(selected(page)).toHaveCount(1);
      await expect(page.getByTestId("selected")).toHaveText("a-readme|README.md");
      await pick(page, "large");
      await expect(node(page, "b-0")).toBeVisible();
      await expect(selected(page)).toHaveCount(0);
      // onSelect did not fire for the reset
      await expect(page.getByTestId("selected")).toHaveText("a-readme|README.md");
      // coming back does not resurrect the old selection
      await pick(page, "small");
      await expect(node(page, "a-readme")).toBeVisible();
      await expect(selected(page)).toHaveCount(0);
      expect(log.errors).toEqual([]);
    });

    test("an id present in both trees stays selected and shows the new label", async ({ page }) => {
      await page.goto(url);
      await node(page, "a-cv").click();
      await expect(node(page, "a-cv")).toHaveAttribute("aria-selected", "true");
      await pick(page, "variant");
      await expect(node(page, "a-cv")).toHaveText(/CV \(updated\)\.pdf/);
      await expect(node(page, "a-cv")).toHaveAttribute("aria-selected", "true");
      await expect(selected(page)).toHaveCount(1);
    });

    test("an id hidden by a closed branch survives the swap", async ({ page }) => {
      await page.goto(url);
      await node(page, "a-cv").click();
      await toggle(page, "a-docs"); // close the branch: a-cv is hidden
      await expect(node(page, "a-cv")).toHaveCount(0);
      await pick(page, "variant");
      await expect(node(page, "a-readme")).toBeVisible();
      await expect(node(page, "a-cv")).toHaveCount(0);
      await toggle(page, "a-docs");
      await expect(node(page, "a-cv")).toHaveAttribute("aria-selected", "true");
    });

    test("vanished expanded ids are dropped without onExpandedChange", async ({ page }) => {
      await page.goto(url);
      await toggle(page, "a-pics");
      await expect(node(page, "a-holiday")).toBeVisible();
      await expect(expandedEvents(page)).toHaveText("1");
      await pick(page, "large");
      await expect(node(page, "b-0")).toBeVisible();
      await pick(page, "small");
      await expect(node(page, "a-readme")).toBeVisible();
      // neither a-docs (open at mount) nor a-pics is expanded by memory
      await expect(node(page, "a-docs")).toHaveAttribute("aria-expanded", "false");
      await expect(node(page, "a-pics")).toHaveAttribute("aria-expanded", "false");
      await expect(node(page, "a-holiday")).toHaveCount(0);
      await expect(expandedEvents(page)).toHaveText("1");
    });

    test("expanded ids that still exist stay expanded", async ({ page }) => {
      await page.goto(url);
      await pick(page, "variant");
      await expect(node(page, "a-new")).toBeVisible();
      await expect(node(page, "a-docs")).toHaveAttribute("aria-expanded", "true");
      await expect(node(page, "a-cv")).toBeVisible();
      await expect(expandedEvents(page)).toHaveText("0");
    });

    test("after the focused node vanishes: one tabbable row of the new tree, keys work", async ({
      page,
    }) => {
      const log = collectConsole(page);
      await page.goto(url);
      await node(page, "a-readme").focus();
      await page.keyboard.press("ArrowDown");
      await expect(node(page, "a-todo")).toBeFocused();
      await pick(page, "large");
      await expect(node(page, "b-0")).toBeVisible();
      await expect(tabbable(page)).toHaveCount(1);
      expect(await tabbable(page).getAttribute("data-node-id")).toMatch(/^b-/);
      await tabbable(page).focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.locator('[role="treeitem"]:focus')).toHaveCount(1);
      expect(await page.locator('[role="treeitem"]:focus').getAttribute("data-node-id")).toMatch(
        /^b-/,
      );
      await page.keyboard.press("Enter");
      await expect(selected(page)).toHaveCount(1);
      expect(await selected(page).getAttribute("data-node-id")).toMatch(/^b-/);
      expect(log.errors).toEqual([]);
    });

    test("an empty new tree raises no errors", async ({ page }) => {
      const log = collectConsole(page);
      await page.goto(url);
      await node(page, "a-readme").click();
      await node(page, "a-readme").focus();
      await pick(page, "empty");
      await expect(page.getByTestId("empty-state")).toBeVisible();
      await pick(page, "single");
      await expect(node(page, "d-solo")).toBeVisible();
      await expect(selected(page)).toHaveCount(0);
      await expect(tabbable(page)).toHaveCount(1);
      expect(log.errors).toEqual([]);
    });
  });
}

test.describe("TreeView/DataSwap: controlled selection (#44)", () => {
  test("the library leaves a stale selectedId alone and warns once (development)", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await page.goto(controlledStory);
    await node(page, "a-readme").click();
    await expect(node(page, "a-readme")).toHaveAttribute("aria-selected", "true");
    expect(log.warnings.filter((w) => w.includes("selectedId"))).toEqual([]);
    await pick(page, "large");
    await expect(node(page, "b-0")).toBeVisible();
    await expect(selected(page)).toHaveCount(0);
    // typing in the search field re-renders without repeating the warning
    await page.getByTestId("search-input").fill("Node");
    await page.getByTestId("search-input").fill("");
    const warnings = log.warnings.filter((w) => w.includes("selectedId"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("[react-virtual-tree-view]");
    expect(warnings[0]).toContain("a-readme");
    // the controlled value is valid again: the selection is back, untouched by the library
    await pick(page, "small");
    await expect(node(page, "a-readme")).toHaveAttribute("aria-selected", "true");
  });
});
