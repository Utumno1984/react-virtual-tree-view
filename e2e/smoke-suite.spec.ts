import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { center, collectConsole, dragToPoint, node, order, storyUrl } from "./helpers";

/**
 * Smoke battery over the statically built Storybook: every planned story opens without
 * console errors/warnings, and the nine scenarios of the original request are checked
 * end to end. No skip/only/fixme and no custom timeouts: the Playwright config applies.
 */

const STORIES: Array<[name: string, id: string]> = [
  ["Basic", "treeview--basic"],
  ["Empty", "treeview--empty"],
  ["SingleNode", "treeview--single-node"],
  ["WithDisabledNodes", "treeview--with-disabled-nodes"],
  ["LargeTree", "treeview--large-tree"],
  ["Search", "treeview-search--search"],
  ["ControlledSelection", "treeview--controlled-selection"],
  ["Draggable", "draggabletreeview-draggable--draggable"],
  ["DraggableMaxDepth", "draggabletreeview-draggablemaxdepth--default"],
  ["DraggableAutoScroll", "draggabletreeview-draggableautoscroll--default"],
  ["ContextMenu", "treeview-contextmenu--context-menu"],
  ["ExampleTheme", "styling-exampletheme--themed"],
  ["ExampleThemeSearch", "styling-exampletheme--themed-search"],
];

const log = (page: Page) => page.getByTestId("last-event");
const indicator = (page: Page) => page.locator("[data-drop-indicator]");
const overlay = (page: Page) => page.locator("[data-drag-overlay]");
const scrollTop = (page: Page) => page.getByRole("tree").evaluate((el) => el.scrollTop);

test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage();
  try {
    await page.goto(`${baseURL}${storyUrl("treeview--basic")}`);
    await page.waitForFunction(() => "__RVTV_E2E_BUILD__" in window);
    const isE2eBuild = await page.evaluate(
      () => (window as unknown as { __RVTV_E2E_BUILD__?: boolean }).__RVTV_E2E_BUILD__ === true,
    );
    if (!isE2eBuild) {
      throw new Error("Storybook non buildato in modalità e2e: esegui `npm run build-storybook:e2e`");
    }
  } finally {
    await page.close();
  }
});

test.describe("every story opens cleanly", () => {
  for (const [name, id] of STORIES) {
    test(`${name} renders without console errors or warnings`, async ({ page }) => {
      const consoleLog = collectConsole(page);
      await page.goto(storyUrl(id));
      await expect(page.getByRole("tree")).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(consoleLog.errors).toEqual([]);
      expect(consoleLog.warnings).toEqual([]);
    });
  }
});

test.describe("scenarios", () => {
  test("1. empty tree: no treeitem, empty state visible", async ({ page }) => {
    await page.goto(storyUrl("treeview--empty"));
    await expect(page.getByRole("tree")).toBeAttached();
    await expect(page.getByText("Nothing to show")).toBeVisible();
    await expect(page.getByRole("treeitem")).toHaveCount(0);
  });

  test("2. single node without children: no aria-expanded, selectable with Enter", async ({
    page,
  }) => {
    await page.goto(storyUrl("treeview--single-node"));
    const items = page.getByRole("treeitem");
    await expect(items).toHaveCount(1);
    await expect(items.first()).not.toHaveAttribute("aria-expanded", /.*/);
    await page.keyboard.press("Tab");
    await expect(items.first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(items.first()).toHaveAttribute("aria-selected", "true");
  });

  test("3. disabled node: aria-disabled, not selectable, not draggable, can receive a nested node", async ({
    page,
  }) => {
    await page.goto(storyUrl("draggabletreeview-draggable--draggable"));
    const disabled = node(page, "D");
    await expect(disabled).toHaveAttribute("aria-disabled", "true");

    // not selectable (aria-disabled rows are non-actionable for Playwright, hence `force`)
    await disabled.click({ force: true });
    await expect(disabled).toHaveAttribute("aria-selected", "false");

    // not draggable
    await dragToPoint(page, disabled, await center(node(page, "A")));
    await expect(overlay(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(log(page)).toContainText("none yet");

    // but it receives a nested node: drag "docs" one indentation (+ one) to the right of D
    const start = await center(node(page, "docs"));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 8, { steps: 3 });
    await page.mouse.move(start.x + 48, start.y, { steps: 10 });
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"docs","fromParentId":null,"toParentId":"D"');
    await expect(node(page, "docs")).toHaveAttribute("aria-level", "3");
  });

  test("4. duplicate ids: a single library warning, no errors, the tree renders", async ({
    page,
  }) => {
    const consoleLog = collectConsole(page);
    await page.goto(storyUrl("tests-duplicateids--duplicate-ids"));
    await expect(page.getByRole("tree")).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /Unique node/ })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const ours = consoleLog.warnings.filter((w) => w.includes("[react-virtual-tree-view]"));
    expect(ours).toHaveLength(1);
    expect(ours[0]).toContain("Duplicate node ids");
    expect(ours[0]).toContain("dup");
    expect(consoleLog.errors).toEqual([]);
  });

  test("5. search without matches: no treeitem, message; clearing restores the initial expansion", async ({
    page,
  }) => {
    await page.goto(storyUrl("treeview-search--search"));
    const input = page.getByTestId("search-input");
    await expect(page.getByRole("treeitem")).toHaveCount(6);
    await input.fill("zzzz-no-match");
    await expect(page.getByRole("treeitem")).toHaveCount(0);
    await expect(page.getByTestId("no-results")).toBeVisible();
    await input.fill("");
    await expect(page.getByTestId("no-results")).toHaveCount(0);
    await expect(page.getByRole("treeitem")).toHaveCount(6);
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "reports")).toHaveAttribute("aria-expanded", "false");
  });

  test("6. drag beyond maxDepth: data-depth-clamped while dragging, no aria-level over maxDepth + 1 after the drop", async ({
    page,
  }) => {
    await page.goto(storyUrl("draggabletreeview-draggablemaxdepth--default"));
    await expect(page.getByTestId("max-depth")).toContainText("maxDepth = 2");
    const start = await center(node(page, "A"));
    const target = await center(node(page, "C1"));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 8, { steps: 3 });
    await page.mouse.move(start.x + 72, target.y, { steps: 12 });
    await expect(indicator(page)).toHaveAttribute("data-depth-clamped", "true");
    await page.mouse.up();
    await expect(indicator(page)).toHaveCount(0);
    const levels = await page
      .getByRole("treeitem")
      .evaluateAll((els) => els.map((el) => Number(el.getAttribute("aria-level"))));
    expect(levels.length).toBeGreaterThan(0);
    expect(Math.max(...levels)).toBeLessThanOrEqual(2 + 1);
    await expect(node(page, "A")).toHaveAttribute("aria-level", "3");
  });

  test("7. many nodes: bounded DOM rows, scroll to the last node, mount under 5 s", async ({
    page,
  }) => {
    const t0 = Date.now();
    await page.goto(storyUrl("treeview--large-tree"));
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    // Mounting is measured with React in development mode (build-storybook:e2e), slower than production.
    // Documented threshold: the 1200-node tree mounts and shows its first row in under 5 s.
    expect(Date.now() - t0).toBeLessThan(5000);

    const items = page.getByRole("treeitem");
    const tree = page.getByRole("tree");
    // all rows are expanded: the virtual content is as tall as 1000+ rows of 32 px
    const total = await tree.evaluate((el) => (el.firstElementChild as HTMLElement).offsetHeight / 32);
    expect(total).toBeGreaterThanOrEqual(1000);
    expect(await items.count()).toBeLessThan(40);

    await tree.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const last = items.last();
    await expect(last).toBeVisible();
    await expect(last).toHaveCSS("top", `${(total - 1) * 32}px`);
    expect(await items.count()).toBeLessThan(40);
  });

  test("8. stable ids: the moved row lands in its new place and the overlay follows the pointer", async ({
    page,
  }) => {
    await page.goto(storyUrl("draggabletreeview-draggable--draggable"));
    await expect(node(page, "misc")).toBeVisible();
    const before = await order(page);
    expect(before).toEqual(["p", "A", "B", "C", "C1", "D", "docs", "cv", "notes", "misc"]);

    // while dragging the overlay sits where the row would be if it moved with the pointer
    const origin = await node(page, "B").boundingBox();
    const start = await center(node(page, "B"));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 30, start.y + 60, { steps: 10 });
    await expect(overlay(page)).toBeVisible();
    await expect
      .poll(async () => {
        const box = await overlay(page).boundingBox();
        return box ? Math.abs(box.x - (origin!.x + 30)) + Math.abs(box.y - (origin!.y + 60)) : 999;
      })
      .toBeLessThanOrEqual(4);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(overlay(page)).toHaveCount(0);
    await expect(log(page)).toContainText("none yet");

    // reorder: A goes after D
    await dragToPoint(page, node(page, "A"), await center(node(page, "D")));
    await page.mouse.up();
    await expect(log(page)).toContainText('"nodeId":"A","fromParentId":"p","toParentId":"p","index":3');
    await expect.poll(() => order(page)).toEqual(["p", "B", "C", "C1", "D", "A", "docs", "cv", "notes", "misc"]);
    const moved = await node(page, "A").boundingBox();
    const d = await node(page, "D").boundingBox();
    expect(Math.abs(moved!.y - d!.y - 32)).toBeLessThanOrEqual(1);
    await expect(overlay(page)).toHaveCount(0);
  });

  test("9. auto-scroll: grows scrollTop at the bottom edge, stops after the drop", async ({
    page,
  }) => {
    await page.goto(storyUrl("draggabletreeview-draggableautoscroll--default"));
    const box = await page.getByRole("tree").boundingBox();
    const row = await center(node(page, "n0"));
    await page.mouse.move(row.x, row.y);
    await page.mouse.down();
    await page.mouse.move(row.x, row.y + 10, { steps: 3 });
    await page.mouse.move(row.x, box!.y + box!.height - 6, { steps: 5 });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(100);
    await page.mouse.up();
    await expect(overlay(page)).toHaveCount(0);

    // let the last frames settle, then nudge the pointer near the edge again: no scrolling
    await expect
      .poll(async () => {
        const a = await scrollTop(page);
        await page.waitForTimeout(100);
        return a === (await scrollTop(page));
      })
      .toBe(true);
    const after = await scrollTop(page);
    await page.mouse.move(row.x, box!.y + box!.height - 4, { steps: 3 });
    await page.waitForTimeout(300);
    expect(await scrollTop(page)).toBe(after);
  });
});
