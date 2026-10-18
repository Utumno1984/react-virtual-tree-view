import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  center,
  collectConsole,
  dragToPoint,
  dragToZone,
  moveToZone,
  node,
  order,
  storyUrl,
} from "./helpers";

const treeStory = storyUrl("treeview-dataswap--default");
const dragStory = storyUrl("draggabletreeview-dataswap--default");

// `defaultExpandedIds` is read on mount only: "a-docs" is open at first load (these are the
// rows of `small` at that moment).
const SMALL_ROWS = [
  "a-docs",
  "a-cv",
  "a-reports",
  "a-notes",
  "a-pics",
  "a-music",
  "a-readme",
  "a-todo",
  "a-locked",
  "a-tmp",
];

// After a swap to a tree without `a-docs`, the library forgets its expansion (#44): coming back
// to `small` shows the same rows with `a-docs` collapsed.
const SMALL_ROWS_AFTER_SWAP = SMALL_ROWS.filter(
  (id) => !["a-cv", "a-reports", "a-notes"].includes(id),
);

const pick = (page: Page, name: string) => page.getByTestId(`dataset-${name}`).click();
const tree = (page: Page) => page.getByRole("tree");
const items = (page: Page) => page.getByRole("treeitem");
const ids = (page: Page) => order(page) as Promise<string[]>;
const contentHeight = (page: Page) =>
  tree(page).evaluate((el) => (el.firstElementChild as HTMLElement).offsetHeight);

/** Focus the search field (just before the tree in tab order), then Tab into the tree. */
async function tabIntoTree(page: Page) {
  await page.getByTestId("search-input").focus();
  await page.keyboard.press("Tab");
}

async function expectOnlyPrefix(page: Page, prefix: string) {
  await expect.poll(async () => (await ids(page)).length).toBeGreaterThan(0);
  const current = await ids(page);
  expect(current.every((id) => id.startsWith(prefix))).toBe(true);
}

test.describe("TreeView/DataSwap", () => {
  test("small -> large: only b- rows remain, nothing from small", async ({ page }) => {
    await page.goto(treeStory);
    await expect(node(page, "a-docs")).toBeVisible();
    await pick(page, "large");
    await expect(node(page, "b-0")).toBeVisible();
    await expectOnlyPrefix(page, "b-");
    await expect(page.locator('[data-node-id^="a-"]')).toHaveCount(0);
    await expect(items(page).first()).toContainText("Node");
  });

  test("large scrolled to the bottom -> small: starts from the first row, height matches", async ({
    page,
  }) => {
    await page.goto(treeStory);
    await pick(page, "large");
    await expect(node(page, "b-0")).toBeVisible();
    await tree(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(node(page, "b-0")).toHaveCount(0);
    await pick(page, "small");
    await expect.poll(() => tree(page).evaluate((el) => el.scrollTop)).toBe(0);
    expect(await ids(page)).toEqual(SMALL_ROWS_AFTER_SWAP);
    await expect(node(page, "a-docs")).toHaveCSS("top", "0px");
    expect(await contentHeight(page)).toBe(SMALL_ROWS_AFTER_SWAP.length * 32);
    const treeBox = await tree(page).boundingBox();
    const firstBox = await node(page, "a-docs").boundingBox();
    expect(firstBox!.y).toBeGreaterThanOrEqual(treeBox!.y);
  });

  test("empty shows emptyState; a non-empty dataset brings rows and keyboard back", async ({
    page,
  }) => {
    await page.goto(treeStory);
    await expect(page.getByTestId("empty-state")).toHaveCount(0);
    await pick(page, "empty");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(items(page)).toHaveCount(0);
    await pick(page, "deep");
    await expect(page.getByTestId("empty-state")).toHaveCount(0);
    await expect(node(page, "c-0-0")).toBeVisible();
    await tabIntoTree(page);
    await expect(node(page, "c-0-0")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(node(page, "c-1-0")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(node(page, "c-1-0")).toHaveAttribute("aria-expanded", "true");
    await pick(page, "empty");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await pick(page, "single");
    await expect(node(page, "d-solo")).toBeVisible();
    await expect(items(page)).toHaveCount(1);
  });

  test("keyboard and onSelect operate on the new tree, with one tabbable row", async ({ page }) => {
    await page.goto(treeStory);
    await expect(node(page, "a-docs")).toBeVisible();
    // select something in the old tree first
    await node(page, "a-cv").click();
    await expect(page.getByTestId("selected")).toHaveText("a-cv|CV.pdf");
    await pick(page, "large");
    await expect(node(page, "b-0")).toBeVisible();
    await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
    await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveAttribute(
      "data-node-id",
      /^b-/,
    );
    await tabIntoTree(page);
    await expect(page.locator('[role="treeitem"]:focus')).toHaveCount(1);
    await expect(page.locator('[role="treeitem"]:focus')).toHaveAttribute("data-node-id", /^b-/);
    await page.keyboard.press("ArrowDown");
    const focusedId = await page.locator('[role="treeitem"]:focus').getAttribute("data-node-id");
    expect(focusedId).toMatch(/^b-/);
    await page.keyboard.press("Enter");
    const label = await node(page, focusedId!).innerText();
    await expect(page.getByTestId("selected")).toHaveText(`${focusedId}|${label.trim()}`);
    await expect(page.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
  });

  test("a disabled node of the new dataset is not selectable", async ({ page }) => {
    await page.goto(treeStory);
    await pick(page, "large");
    await pick(page, "small");
    await expect(node(page, "a-locked")).toHaveAttribute("aria-disabled", "true");
    await node(page, "a-tmp").click();
    await expect(page.getByTestId("selected")).toHaveText("a-tmp|Tmp");
    await node(page, "a-locked").click({ force: true });
    await expect(page.getByTestId("selected")).toHaveText("a-tmp|Tmp");
    await expect(node(page, "a-locked")).toHaveAttribute("aria-selected", "false");
  });

  test("an active search is recomputed on the new tree; no match shows noResults", async ({
    page,
  }) => {
    await page.goto(treeStory);
    await page.getByTestId("search-input").fill("report");
    await expect(node(page, "a-reports")).toBeVisible();
    await expect(node(page, "a-docs")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "a-reports").locator("mark")).toHaveText("Report");
    // no match in `large` ("Node n" labels): noResults, no rows
    await pick(page, "large");
    await expect(page.getByTestId("no-results")).toBeVisible();
    await expect(items(page)).toHaveCount(0);
    // a query that only matches the new tree: matches and expanded ancestors from b-
    await page.getByTestId("search-input").fill("node 11");
    await expect(page.getByTestId("no-results")).toHaveCount(0);
    await expectOnlyPrefix(page, "b-");
    await expect(page.locator("mark").first()).toHaveText("Node 11");
    // back to small with the same query: no match again
    await pick(page, "small");
    await expect(page.getByTestId("no-results")).toBeVisible();
    await page.getByTestId("search-input").fill("");
    await expect(node(page, "a-docs")).toBeVisible();
    await expect(page.getByTestId("no-results")).toHaveCount(0);
  });

  test("a query that matches in every dataset, left untouched, is recomputed on each new tree", async ({
    page,
  }) => {
    await page.goto(treeStory);
    await page.getByTestId("search-input").fill("1");
    await expect(node(page, "a-q1")).toBeVisible();
    await expect(node(page, "a-docs")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "a-reports")).toHaveAttribute("aria-expanded", "true");

    for (const [name, prefix] of [
      ["large", "b-"],
      ["deep", "c-"],
      ["small", "a-"],
    ] as const) {
      await pick(page, name);
      await expect(page.getByTestId("no-results")).toHaveCount(0);
      await expectOnlyPrefix(page, prefix);
      await expect(page.locator("mark").first()).toBeVisible();
      // a nested row whose parent is expanded: ancestors were recomputed on the new tree
      const nested = await items(page).evaluateAll((els) =>
        els.some((el) => {
          if (Number(el.getAttribute("aria-level")) <= 1) return false;
          const level = Number(el.getAttribute("aria-level"));
          let prev = el.previousElementSibling;
          while (prev && Number(prev.getAttribute("aria-level")) >= level) {
            prev = prev.previousElementSibling;
          }
          return prev?.getAttribute("aria-expanded") === "true";
        }),
      );
      expect(nested).toBe(true);
    }
    await expect(node(page, "a-q1")).toBeVisible();
    await expect(node(page, "a-reports")).toHaveAttribute("aria-expanded", "true");
  });

  test("the role=tree element is the same DOM node across swaps; 10 rapid swaps are console-clean", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await page.goto(treeStory);
    await expect(node(page, "a-docs")).toBeVisible();
    await tree(page).evaluate((el) => {
      (el as HTMLElement & { __marker?: string }).__marker = "same";
    });
    const sequence = [
      "large",
      "deep",
      "empty",
      "small",
      "large",
      "single",
      "deep",
      "empty",
      "large",
      "small",
    ];
    for (const name of sequence) await pick(page, name);
    await expect(node(page, "a-docs")).toBeVisible();
    // `empty` removes the scroll container styles but never the element itself
    const marker = await tree(page).evaluate(
      (el) => (el as HTMLElement & { __marker?: string }).__marker,
    );
    expect(marker).toBe("same");
    await expect(page.getByTestId("active-dataset")).toHaveText("small");
    expect(log.errors).toEqual([]);
    expect(log.warnings).toEqual([]);
  });
});

test.describe("DraggableTreeView/DataSwap", () => {
  test("after a swap, reorder and nesting act on the new tree by id", async ({ page }) => {
    const log = collectConsole(page);
    await page.goto(dragStory);
    await expect(node(page, "a-docs")).toBeVisible();
    await pick(page, "large");
    await expect(node(page, "b-0")).toBeVisible();
    await pick(page, "small");
    await expect(node(page, "a-tmp")).toBeVisible();

    // reorder: a-todo goes above a-readme
    await dragToPoint(page, node(page, "a-todo"), {
      x: (await center(node(page, "a-readme"))).x,
      y: (await center(node(page, "a-readme"))).y - 12,
    });
    await page.mouse.up();
    await expect(page.getByTestId("last-event")).toContainText(
      '"nodeId":"a-todo","fromParentId":null,"toParentId":null,"index":3',
    );
    expect(await ids(page)).toEqual(
      SMALL_ROWS_AFTER_SWAP.map((id) =>
        id === "a-readme" ? "a-todo" : id === "a-todo" ? "a-readme" : id,
      ),
    );
    let flat = (await page.getByTestId("last-tree-ids").getAttribute("data-ids"))!.split(",");
    expect(flat.every((id) => id.startsWith("a-"))).toBe(true);
    expect(flat).toHaveLength(16);

    // nesting: a-readme dropped on the middle of its previous sibling a-todo goes under it
    await dragToZone(page, node(page, "a-readme"), node(page, "a-todo"), "inside");
    await page.mouse.up();
    await expect(page.getByTestId("last-event")).toContainText(
      '"nodeId":"a-readme","fromParentId":null,"toParentId":"a-todo","index":0',
    );
    await expect(node(page, "a-readme")).toHaveAttribute("aria-level", "2");
    flat = (await page.getByTestId("last-tree-ids").getAttribute("data-ids"))!.split(",");
    expect(flat.every((id) => id.startsWith("a-"))).toBe(true);
    expect(flat).toHaveLength(16);
    expect(log.errors).toEqual([]);
    expect(log.warnings).toEqual([]);
  });

  test("small -> large -> small restores the preset and drag still works", async ({ page }) => {
    await page.goto(dragStory);
    await expect(node(page, "a-tmp")).toBeVisible();
    await dragToPoint(page, node(page, "a-tmp"), {
      x: (await center(node(page, "a-readme"))).x,
      y: (await center(node(page, "a-readme"))).y - 12,
    });
    await page.mouse.up();
    await expect(page.getByTestId("last-event")).toContainText('"nodeId":"a-tmp"');
    expect(await ids(page)).toContain("a-tmp");
    expect((await ids(page)).indexOf("a-tmp")).toBeLessThan((await ids(page)).indexOf("a-readme"));

    await pick(page, "large");
    await expect(node(page, "b-0")).toBeVisible();
    await pick(page, "small");
    expect(await ids(page)).toEqual(SMALL_ROWS_AFTER_SWAP);
    await dragToPoint(page, node(page, "a-todo"), {
      x: (await center(node(page, "a-pics"))).x,
      y: (await center(node(page, "a-pics"))).y - 12,
    });
    await page.mouse.up();
    await expect(page.getByTestId("last-event")).toContainText('"nodeId":"a-todo"');
    expect((await ids(page)).indexOf("a-todo")).toBeLessThan((await ids(page)).indexOf("a-pics"));
  });

  test("deep respects maxDepth=6: a subtree already 6 tall cannot be nested", async ({ page }) => {
    await page.goto(dragStory);
    await pick(page, "deep");
    await expect(node(page, "c-0-0")).toBeVisible();
    await expect(page.locator('[data-node-id^="a-"]')).toHaveCount(0);
    const indicator = page.locator("[data-drop-indicator]");
    // "becomes a child" of any row is refused: no indicator
    await dragToZone(page, node(page, "c-1-0"), node(page, "c-2-0"), "inside");
    await expect(indicator).toHaveCount(0);
    // the sibling zones at the root level are still allowed
    await moveToZone(page, node(page, "c-2-0"), "after");
    await expect(indicator).toHaveAttribute("data-projected-depth", "0");
    await expect(indicator).toHaveAttribute("data-depth-clamped", "false");
    // back on the refused zone and release: nothing changes
    await moveToZone(page, node(page, "c-2-0"), "inside");
    await expect(indicator).toHaveCount(0);
    await page.mouse.up();
    // the refused drop leaves the tree as it was: no change reported
    await expect(page.getByTestId("last-event")).toContainText("none yet");
    await expect(node(page, "c-1-0")).toHaveAttribute("aria-level", "1");
  });

  test("deep: a leaf nests within the limit and onTreeChange reports the new parent", async ({
    page,
  }) => {
    await page.goto(dragStory);
    await pick(page, "deep");
    await node(page, "c-0-0").locator("[data-toggle]").click();
    await expect(node(page, "c-0-0-leaf")).toBeVisible();
    await dragToZone(page, node(page, "c-0-0-leaf"), node(page, "c-0-1"), "inside");
    const indicator = page.locator("[data-drop-indicator]");
    await expect(indicator).toHaveAttribute("data-projected-depth", "2");
    await expect(indicator).toHaveAttribute("data-depth-clamped", "false");
    await page.mouse.up();
    await expect(page.getByTestId("last-event")).toContainText(
      '"nodeId":"c-0-0-leaf","fromParentId":"c-0-0","toParentId":"c-0-1"',
    );
    const flat = (await page.getByTestId("last-tree-ids").getAttribute("data-ids"))!.split(",");
    expect(flat.every((id) => id.startsWith("c-"))).toBe(true);
    await expect(node(page, "c-0-0-leaf")).toHaveAttribute("aria-level", "3");
  });

  test("deep: reorder of roots reports ids of the new tree only", async ({ page }) => {
    await page.goto(dragStory);
    await pick(page, "deep");
    await dragToPoint(page, node(page, "c-2-0"), {
      x: (await center(node(page, "c-0-0"))).x,
      y: (await center(node(page, "c-0-0"))).y - 12,
    });
    await page.mouse.up();
    await expect(page.getByTestId("last-event")).toContainText(
      '"nodeId":"c-2-0","fromParentId":null,"toParentId":null,"index":0',
    );
    expect(await ids(page)).toEqual(["c-2-0", "c-0-0", "c-1-0"]);
    const flat = (await page.getByTestId("last-tree-ids").getAttribute("data-ids"))!.split(",");
    expect(flat.every((id) => id.startsWith("c-"))).toBe(true);
    expect(flat).toHaveLength(3 * 13);
  });

  test("empty and single: swaps from and to the draggable tree", async ({ page }) => {
    await page.goto(dragStory);
    await pick(page, "empty");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await pick(page, "single");
    await expect(items(page)).toHaveCount(1);
    await expect(node(page, "d-solo")).toBeVisible();
    await pick(page, "small");
    await expect(node(page, "a-docs")).toBeVisible();
  });

  test("the role=tree element is not remounted across swaps", async ({ page }) => {
    await page.goto(dragStory);
    await expect(node(page, "a-docs")).toBeVisible();
    await tree(page).evaluate((el) => {
      (el as HTMLElement & { __marker?: string }).__marker = "same";
    });
    for (const name of ["large", "empty", "deep", "small"]) await pick(page, name);
    await expect(node(page, "a-docs")).toBeVisible();
    expect(
      await tree(page).evaluate((el) => (el as HTMLElement & { __marker?: string }).__marker),
    ).toBe("same");
  });
});
