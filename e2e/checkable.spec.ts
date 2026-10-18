import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { center, collectConsole, dragToZone, node, order, storyUrl } from "./helpers";

const open = (page: Page, story: string) => page.goto(storyUrl(`treeview-checkable--${story}`));
const box = (page: Page, id: string) => node(page, id).locator("[data-checkbox]");
const events = (page: Page) => page.getByTestId("events");

test.describe("checkable", () => {
  test("renders a checkbox per row and aria-multiselectable on the tree", async ({ page }) => {
    const log = collectConsole(page);
    await open(page, "default");
    await expect(page.getByRole("tree")).toHaveAttribute("aria-multiselectable", "true");
    await expect(page.locator("[data-checkbox]")).toHaveCount(10);
    await expect(page.getByRole("treeitem").first()).toHaveAttribute("aria-checked", "false");
    await expect(events(page)).toHaveText("onCheckedChange: none yet");
    expect(log.errors).toEqual([]);
    expect(log.warnings).toEqual([]);
  });

  test("checking a parent checks all descendants and logs one event", async ({ page }) => {
    await open(page, "default");
    await box(page, "docs").click();
    for (const id of ["docs", "cv", "notes", "reports", "q1", "q2"]) {
      await expect(node(page, id)).toHaveAttribute("aria-checked", "true");
    }
    await expect(node(page, "src")).toHaveAttribute("aria-checked", "false");
    // only the leaves: derived parents are not listed
    await expect(events(page)).toHaveText('onCheckedChange ["cv","notes","q1","q2"]');
    await box(page, "docs").click();
    await expect(node(page, "q2")).toHaveAttribute("aria-checked", "false");
    await expect(events(page)).toContainText("onCheckedChange []");
  });

  test("unchecking one child makes the ancestors mixed; checking it back restores them", async ({
    page,
  }) => {
    await open(page, "default");
    await box(page, "docs").click();
    await box(page, "q1").click();
    await expect(node(page, "reports")).toHaveAttribute("aria-checked", "mixed");
    await expect(node(page, "docs")).toHaveAttribute("aria-checked", "mixed");
    expect(await box(page, "docs").evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
    await box(page, "q1").click();
    await expect(node(page, "reports")).toHaveAttribute("aria-checked", "true");
    await expect(node(page, "docs")).toHaveAttribute("aria-checked", "true");
    await box(page, "q1").click();
    await box(page, "q2").click();
    await expect(node(page, "reports")).toHaveAttribute("aria-checked", "false");
    await expect(node(page, "docs")).toHaveAttribute("aria-checked", "mixed");
  });

  test("clicking the checkbox does not select, clicking the row does not check", async ({
    page,
  }) => {
    await open(page, "default");
    await box(page, "readme").click();
    await expect(page.getByTestId("selected")).toHaveText("selected: none");
    await expect(node(page, "readme")).toHaveAttribute("aria-selected", "false");
    await node(page, "readme").getByText("README.md").click();
    await expect(page.getByTestId("selected")).toHaveText("selected: readme");
    await node(page, "src").getByText("Source").click();
    await expect(node(page, "src")).toHaveAttribute("aria-checked", "false");
    await expect(node(page, "readme")).toHaveAttribute("aria-checked", "true");
  });

  test("Space toggles the focused node, Enter selects without checking", async ({ page }) => {
    await open(page, "default");
    await node(page, "notes").focus();
    await page.keyboard.press("Space");
    await expect(node(page, "notes")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("selected")).toHaveText("selected: none");
    await expect(events(page)).toHaveText('onCheckedChange ["notes"]');
    await page.keyboard.press("Space");
    await expect(node(page, "notes")).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("selected")).toHaveText("selected: notes");
    await expect(node(page, "notes")).toHaveAttribute("aria-checked", "false");
  });

  test("after a checkbox click Space keeps working on that row", async ({ page }) => {
    await open(page, "default");
    await box(page, "notes").click();
    await page.keyboard.press("Space");
    await expect(node(page, "notes")).toHaveAttribute("aria-checked", "false");
  });

  test("WithSearch: checking a parent while the filter hides children checks them too", async ({
    page,
  }) => {
    await open(page, "with-search");
    await page.getByTestId("search-input").fill("CV");
    await expect(node(page, "notes")).toHaveCount(0);
    await box(page, "docs").click();
    await expect(node(page, "docs")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("search-input").fill("");
    for (const id of ["cv", "notes", "reports"]) {
      await expect(node(page, id)).toHaveAttribute("aria-checked", "true");
    }
    await node(page, "reports").locator("[data-toggle]").click();
    await expect(node(page, "q1")).toHaveAttribute("aria-checked", "true");
    await expect(node(page, "q2")).toHaveAttribute("aria-checked", "true");
  });

  test("WithSearch: a parent is mixed because of hidden children even if all visible are checked", async ({
    page,
  }) => {
    await open(page, "with-search");
    await page.getByTestId("search-input").fill("Q1");
    await expect(node(page, "q2")).toHaveCount(0);
    await box(page, "q1").click();
    await expect(node(page, "q1")).toHaveAttribute("aria-checked", "true");
    await expect(node(page, "reports")).toHaveAttribute("aria-checked", "mixed");
    await expect(node(page, "docs")).toHaveAttribute("aria-checked", "mixed");
  });

  test("WithSearch: no matches shows the message and no checkbox", async ({ page }) => {
    const log = collectConsole(page);
    await open(page, "with-search");
    await page.getByTestId("search-input").fill("zzzzz");
    await expect(page.getByTestId("no-results")).toBeVisible();
    await expect(page.locator("[data-checkbox]")).toHaveCount(0);
    expect(log.errors).toEqual([]);
  });

  test("WithDisabled: the cascade skips disabled nodes and their subtree", async ({ page }) => {
    await open(page, "with-disabled");
    await expect(node(page, "viewer")).toHaveAttribute("aria-checked", "true");
    await expect(node(page, "all")).toHaveAttribute("aria-checked", "mixed");
    await expect(box(page, "admin")).toBeDisabled();
    await expect(box(page, "a1")).toBeDisabled();
    await expect(box(page, "viewer")).toBeDisabled();

    await box(page, "all").click();
    await expect(events(page)).toHaveText('onCheckedChange ["e1","e2","viewer","guest"]');
    for (const id of ["editor", "e1", "e2", "guest", "viewer"]) {
      await expect(node(page, id)).toHaveAttribute("aria-checked", "true");
    }
    for (const id of ["admin", "a1", "a2"]) {
      await expect(node(page, id)).toHaveAttribute("aria-checked", "false");
    }

    // A disabled node does not react to the keyboard either.
    await node(page, "viewer").focus();
    await page.keyboard.press("Space");
    await expect(node(page, "viewer")).toHaveAttribute("aria-checked", "true");
    await expect(events(page)).toHaveText('onCheckedChange ["e1","e2","viewer","guest"]');
  });

  test("Controlled: ignoring the change keeps the UI, following it updates it", async ({
    page,
  }) => {
    await open(page, "controlled");
    await expect(node(page, "cv")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("apply").uncheck();
    await box(page, "notes").click();
    await expect(events(page)).toContainText('onCheckedChange ["cv","notes"]');
    await expect(node(page, "notes")).toHaveAttribute("aria-checked", "false");
    expect(await box(page, "notes").isChecked()).toBe(false);

    await page.getByTestId("apply").check();
    await box(page, "notes").click();
    await expect(node(page, "notes")).toHaveAttribute("aria-checked", "true");

    await page.getByTestId("set-q1").click();
    await expect(node(page, "q1")).toHaveAttribute("aria-checked", "true");
    await expect(node(page, "notes")).toHaveAttribute("aria-checked", "false");
    await expect(node(page, "reports")).toHaveAttribute("aria-checked", "mixed");
  });

  test("Controlled: clicking a mixed parent the owner ignores keeps it indeterminate", async ({
    page,
  }) => {
    await open(page, "controlled");
    await page.getByTestId("apply").uncheck();
    await expect(node(page, "docs")).toHaveAttribute("aria-checked", "mixed");
    await box(page, "docs").click();
    await expect(events(page)).toContainText("onCheckedChange");
    await expect(node(page, "docs")).toHaveAttribute("aria-checked", "mixed");
    expect(await box(page, "docs").evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
  });

  test("Draggable: the checkbox does not start a drag", async ({ page }) => {
    await open(page, "draggable");
    await expect(node(page, "util")).toBeVisible();
    const before = await order(page);
    expect(before).toHaveLength(10);
    const start = await center(box(page, "cv"));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 60, { steps: 8 });
    await expect(page.locator("[data-drop-indicator]")).toHaveCount(0);
    await page.mouse.up();
    expect(await order(page)).toEqual(before);
  });

  test("Draggable: a moved checked node stays checked and the parents are recomputed", async ({
    page,
  }) => {
    await open(page, "draggable");
    await expect(node(page, "docs")).toHaveAttribute("aria-checked", "mixed");
    await expect(node(page, "src")).toHaveAttribute("aria-checked", "mixed");
    // lower zone of "util": cv becomes the last child of src
    await dragToZone(page, node(page, "cv"), node(page, "util"), "after");
    await page.mouse.up();
    await expect(node(page, "cv")).toHaveAttribute("aria-checked", "true");
    // docs lost its only checked descendant.
    await expect(node(page, "docs")).toHaveAttribute("aria-checked", "false");
    await expect(node(page, "src")).toHaveAttribute("aria-checked", "mixed");
    await expect(events(page)).toHaveText("onCheckedChange: none yet");
  });
});

test.describe("checkable: a parent emptied by dragging", () => {
  // Upper zone of the parent "p": the node becomes its previous sibling, at the root (the lower
  // zone of an expanded "p" is its first-child zone).
  const dragLeft = async (page: Page, id: string) => {
    await dragToZone(page, node(page, id), node(page, "p"), "before");
    await page.mouse.up();
    // let the drop animation finish: a drag started during it is not picked up
    await expect(page.locator("[data-drag-overlay]")).toHaveCount(0);
  };

  test("does not become checked, whatever the order of the drags", async ({ page }) => {
    await open(page, "draggable-emptied-parent");
    await box(page, "a").click();
    await expect(events(page)).toHaveText('onCheckedChange ["a"]');
    await expect(node(page, "p")).toHaveAttribute("aria-checked", "mixed");

    // b leaves: p is now derived from a alone (checked), with no event.
    await dragLeft(page, "b");
    await expect(node(page, "b")).toHaveAttribute("aria-level", "1");
    await expect(node(page, "p")).toHaveAttribute("aria-checked", "true");

    // a leaves too: p is an empty leaf nobody checked.
    await dragLeft(page, "a");
    await expect(node(page, "a")).toHaveAttribute("aria-level", "1");
    await expect(node(page, "p")).toHaveAttribute("aria-checked", "false");
    await expect(node(page, "a")).toHaveAttribute("aria-checked", "true");
    await expect(node(page, "b")).toHaveAttribute("aria-checked", "false");
    await expect(events(page)).toHaveText('onCheckedChange ["a"]');
  });
});
