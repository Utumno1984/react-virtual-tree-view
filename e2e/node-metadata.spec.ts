import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { collectConsole, node, storyUrl } from "./helpers";
import { fileTree } from "../stories/data/fileTree";
import type { TreeNode } from "../src";
import { generateTree } from "../stories/data/generateTree";
import type { FileMeta } from "../stories/data/generateTree";

const url = (name: string) => storyUrl(`treeview-nodemetadata--${name}`);
const panel = (page: Page) => page.getByTestId("metadata-panel");

function search(nodes: TreeNode<FileMeta>[], id: string): TreeNode<FileMeta> | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const inner = n.children && search(n.children, id);
    if (inner) return inner;
  }
  return undefined;
}

function findIn(nodes: TreeNode<FileMeta>[], id: string): TreeNode<FileMeta> {
  const found = search(nodes, id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
}

async function expectPanelFor(page: Page, id: string) {
  const expected = findIn(fileTree, id);
  const d = expected.data!;
  await expect(page.getByTestId("meta-id")).toHaveText(id);
  await expect(page.getByTestId("meta-label")).toHaveText(expected.label);
  await expect(page.getByTestId("meta-owner")).toHaveText(d.owner);
  await expect(page.getByTestId("meta-status")).toHaveText(d.status);
  await expect(page.getByTestId("meta-size")).toHaveText(String(d.sizeBytes));
  await expect(page.getByTestId("meta-updated")).toHaveText(d.updatedAt);
}

test.describe("node metadata", () => {
  test("starts with an explicit empty state", async ({ page }) => {
    const log = collectConsole(page);
    await page.goto(url("node-metadata"));
    await expect(node(page, "docs")).toBeVisible();
    await expect(panel(page)).toContainText("Seleziona un nodo");
    expect(log.errors).toEqual([]);
    expect(log.warnings).toEqual([]);
  });

  test("clicking a node shows its id, label and data", async ({ page }) => {
    await page.goto(url("node-metadata"));
    await node(page, "cv").click();
    await expectPanelFor(page, "cv");
    await expect(page.getByTestId("meta-json")).toContainText('"owner": "alice"');
  });

  test("selecting another node replaces every value of the previous one", async ({ page }) => {
    await page.goto(url("node-metadata"));
    await node(page, "cv").click();
    await expectPanelFor(page, "cv");
    await node(page, "holiday").click();
    await expectPanelFor(page, "holiday");
    const text = await panel(page).innerText();
    expect(text).not.toContain("CV.pdf");
    expect(text).not.toContain("alice");
    expect(text).not.toContain("12698");
    expect(text).not.toContain(findIn(fileTree, "cv").data!.updatedAt);
  });

  test("a childless root node with data is selectable", async ({ page }) => {
    await page.goto(url("node-metadata"));
    await node(page, "readme").click();
    await expectPanelFor(page, "readme");
  });

  test("keyboard: Tab, ArrowDown x2, Enter and Space update the panel", async ({ page }) => {
    await page.goto(url("node-metadata"));
    await expect(node(page, "docs")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(node(page, "docs")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(node(page, "report")).toBeFocused();
    await page.keyboard.press("Enter");
    await expectPanelFor(page, "report");
    await page.keyboard.press("ArrowUp");
    await expect(node(page, "cv")).toBeFocused();
    await page.keyboard.press("Space");
    await expectPanelFor(page, "cv");
  });

  test("a disabled node (with data) does not change the panel", async ({ page }) => {
    await page.goto(url("node-metadata"));
    await expect(panel(page)).toContainText("Seleziona un nodo");
    await node(page, "locked").click({ force: true });
    await expect(panel(page)).toContainText("Seleziona un nodo");
    await expect(panel(page)).not.toContainText("elena");

    await node(page, "cv").click();
    await node(page, "locked").click({ force: true });
    await expectPanelFor(page, "cv");
    await expect(panel(page)).not.toContainText("elena");
  });

  test("a node without data shows id, label and an explicit message, no console errors", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await page.goto(url("node-metadata"));
    await node(page, "cv").click();
    await node(page, "scratch").click();
    await expect(page.getByTestId("meta-id")).toHaveText("scratch");
    await expect(page.getByTestId("meta-label")).toHaveText("scratch.txt");
    await expect(page.getByTestId("meta-empty")).toHaveText("Nessun metadato");
    await expect(page.getByTestId("meta-owner")).toHaveCount(0);
    await expect(panel(page)).not.toContainText("alice");
    expect(log.errors).toEqual([]);
    expect(log.warnings).toEqual([]);
  });

  test("empty data shows the emptyState and the empty panel", async ({ page }) => {
    await page.goto(url("node-metadata-empty"));
    await expect(page.getByText("Nessun file")).toBeVisible();
    await expect(page.getByRole("treeitem")).toHaveCount(0);
    await expect(panel(page)).toContainText("Seleziona un nodo");
  });

  test("large tree: selecting the last node shows its metadata, rows stay virtualized", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await page.goto(url("node-metadata-large-tree"));
    const tree = page.getByRole("tree");
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    await tree.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const items = page.getByRole("treeitem");
    await expect(items.last()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(60);

    const last = items.last();
    const id = await last.getAttribute("data-node-id");
    const label = (await last.innerText()).trim();
    await last.click();
    await expect(page.getByTestId("meta-id")).toHaveText(id!);
    await expect(page.getByTestId("meta-label")).toHaveText(label);
    // Same generator call as the story: compare against the dataset.
    const { data } = findIn(generateTree({ count: 1500, maxDepth: 4, seed: 21, withData: true }), id!);
    await expect(page.getByTestId("meta-owner")).toHaveText(data!.owner);
    await expect(page.getByTestId("meta-status")).toHaveText(data!.status);
    await expect(page.getByTestId("meta-size")).toHaveText(String(data!.sizeBytes));
    await expect(page.getByTestId("meta-updated")).toHaveText(data!.updatedAt);
    expect(log.errors).toEqual([]);
  });
});
