import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { collectConsole, dragToZone, node, storyUrl } from "./helpers";

const story = (name: string) => storyUrl(`tests-persistablestate--${name}`);
const stateLog = (page: Page) => page.getByTestId("state-log");
const counter = (page: Page) => page.getByTestId("state-count");
const toggle = (page: Page, id: string) => node(page, id).locator("[data-toggle]").click();
const selected = (page: Page) => page.locator('[role="treeitem"][aria-selected="true"]');
const parsed = async (page: Page) => JSON.parse((await stateLog(page).textContent()) ?? "null");

test.describe("Tests/PersistableState (#47)", () => {
  test("one onStateChange per gesture, never at mount", async ({ page }) => {
    const log = collectConsole(page);
    await page.goto(story("default"));
    await expect(node(page, "docs")).toBeVisible();
    await expect(counter(page)).toHaveText("0");
    await expect(stateLog(page)).toHaveText("none");

    await toggle(page, "docs");
    await expect(counter(page)).toHaveText("1");
    await toggle(page, "pics");
    await expect(counter(page)).toHaveText("2");
    await node(page, "p1").click();
    await expect(counter(page)).toHaveText("3");
    // same node again: no change
    await node(page, "p1").click();
    await expect(counter(page)).toHaveText("3");
    // a disabled node: no change
    await node(page, "off").click({ force: true });
    await expect(counter(page)).toHaveText("3");
    expect(await parsed(page)).toEqual({
      expandedIds: ["docs", "pics"],
      selectedId: "p1",
      searchQuery: "",
    });
    expect(log.errors).toEqual([]);
    expect(log.warnings).toEqual([]);
  });

  test("searchQuery is reported; toggling during a search is silent", async ({ page }) => {
    await page.goto(story("default"));
    await toggle(page, "pics");
    await expect(counter(page)).toHaveText("1");
    await page.getByTestId("search-input").fill("old");
    await expect(counter(page)).toHaveText("2");
    expect(await parsed(page)).toEqual({
      expandedIds: ["pics"],
      selectedId: null,
      searchQuery: "old",
    });
    // searching opened docs and "Archive" temporarily: closing one is not a persistent change
    await expect(node(page, "8")).toBeVisible();
    await toggle(page, "7");
    await expect(node(page, "8")).toHaveCount(0);
    await expect(counter(page)).toHaveText("2");
    expect((await parsed(page)).expandedIds).toEqual(["pics"]);
    await page.getByTestId("search-input").fill("");
    await expect(counter(page)).toHaveText("3");
    expect((await parsed(page)).expandedIds).toEqual(["pics"]);
    await expect(node(page, "p1")).toBeVisible();
  });

  test("a search with no match reports the query and shows noResults", async ({ page }) => {
    await page.goto(story("default"));
    await page.getByTestId("search-input").fill("zzzz");
    await expect(page.getByTestId("no-results")).toBeVisible();
    expect((await parsed(page)).searchQuery).toBe("zzzz");
  });

  test("remount restores branches and selection from the saved JSON (numeric ids stay numbers)", async ({
    page,
  }) => {
    await page.goto(story("default"));
    await toggle(page, "docs");
    await toggle(page, "7");
    await node(page, "8").click();
    await page.getByTestId("search-input").fill("o");
    await expect(counter(page)).toHaveText("4");
    const before = await parsed(page);
    expect(before.selectedId).toBe(8);
    expect(before.expandedIds).toEqual(["docs", 7]);

    await page.getByTestId("remount").click();
    // no call at mount: the restored state equals what was saved
    await expect(counter(page)).toHaveText("0");
    await expect(page.getByTestId("search-input")).toHaveValue("o");
    await page.getByTestId("search-input").fill("");
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "7")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "8")).toHaveAttribute("aria-selected", "true");
    await expect(selected(page)).toHaveCount(1);
    await expect(counter(page)).toHaveText("1");
    expect(await parsed(page)).toEqual({
      expandedIds: ["docs", 7],
      selectedId: 8,
      searchQuery: "",
    });
  });

  test("Malformed: mounts without errors and logs a single library warning", async ({ page }) => {
    const log = collectConsole(page);
    await page.goto(story("malformed"));
    await expect(node(page, "docs")).toBeVisible();
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(selected(page)).toHaveCount(0);
    await expect(counter(page)).toHaveText("0");
    await page.waitForLoadState("networkidle");
    expect(log.errors).toEqual([]);
    expect(log.warnings.filter((w) => w.includes("[react-virtual-tree-view]"))).toHaveLength(1);
  });

  test("StaleIds: the cleaned state is reported once after the mount", async ({ page }) => {
    await page.goto(story("stale-ids"));
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(counter(page)).toHaveText("1");
    expect(await parsed(page)).toEqual({
      expandedIds: ["docs"],
      selectedId: null,
      searchQuery: "",
    });
    await expect(selected(page)).toHaveCount(0);
  });

  test("ControlledSelection: the prop wins over initialState and a click is reported through the prop", async ({
    page,
  }) => {
    await page.goto(story("controlled-selection"));
    await expect(counter(page)).toHaveText("0");
    // initialState.selectedId is "cv" but the controlled prop (null) wins
    await expect(selected(page)).toHaveCount(0);
    await toggle(page, "pics");
    await expect(counter(page)).toHaveText("1");
    await node(page, "readme").click();
    await expect(node(page, "readme")).toHaveAttribute("aria-selected", "true");
    await expect(counter(page)).toHaveText("2");
    expect((await parsed(page)).selectedId).toBe("readme");
  });

  test("DraggableTreeView: a drop that auto-expands the new parent is reported", async ({
    page,
  }) => {
    await page.goto(story("draggable"));
    await expect(node(page, "readme")).toBeVisible();
    await expect(counter(page)).toHaveText("0");
    // middle of the (collapsed) previous sibling "pics": readme becomes its child
    await dragToZone(page, node(page, "readme"), node(page, "pics"), "inside");
    await expect(page.locator("[data-drop-indicator]")).toHaveAttribute(
      "data-projected-depth",
      "1",
    );
    await page.mouse.up();
    await expect(node(page, "pics")).toHaveAttribute("aria-expanded", "true");
    await expect(counter(page)).toHaveText("1");
    expect((await parsed(page)).expandedIds).toEqual(["pics"]);
  });
});
