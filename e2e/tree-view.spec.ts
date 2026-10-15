import { expect, test } from "@playwright/test";

const story = (id: string) => `/iframe.html?id=treeview--${id}&viewMode=story`;

test.describe("TreeView e2e", () => {
  test("Basic: role=tree, expand and collapse the first parent", async ({ page }) => {
    await page.goto(story("basic"));
    await expect(page.getByRole("tree")).toBeVisible();
    const docs = page.locator('[data-node-id="docs"]');
    await expect(docs).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("treeitem")).toHaveCount(3);

    await docs.locator("[data-toggle]").click();
    await expect(docs).toHaveAttribute("aria-expanded", "true");
    const cv = page.locator('[data-node-id="cv"]');
    await expect(cv).toBeVisible();
    await expect(cv).toHaveAttribute("aria-level", "2");
    await expect(page.getByRole("treeitem")).toHaveCount(5);

    await docs.locator("[data-toggle]").click();
    await expect(docs).toHaveAttribute("aria-expanded", "false");
    await expect(cv).toHaveCount(0);
    await expect(page.getByRole("treeitem")).toHaveCount(3);
  });

  test("Basic: children are indented by depth * indentation", async ({ page }) => {
    await page.goto(story("basic"));
    await page.locator('[data-node-id="docs"] [data-toggle]').click();
    await page.locator('[data-node-id="reports"] [data-toggle]').click();
    const q1 = page.locator('[data-node-id="q1"]');
    await expect(q1).toHaveAttribute("aria-level", "3");
    const padding = await q1.evaluate((el) => (el as HTMLElement).style.paddingLeft);
    expect(padding).toBe("48px");
  });

  test("Empty: no treeitem, empty state visible", async ({ page }) => {
    await page.goto(story("empty"));
    await expect(page.getByRole("tree")).toBeVisible();
    await expect(page.getByRole("treeitem")).toHaveCount(0);
    await expect(page.getByText("Nothing to show")).toBeVisible();
  });

  test("SingleNode: one treeitem without aria-expanded", async ({ page }) => {
    await page.goto(story("single-node"));
    const items = page.getByRole("treeitem");
    await expect(items).toHaveCount(1);
    await expect(items.first()).not.toHaveAttribute("aria-expanded", /.*/);
  });

  test("WithDisabledNodes: disabled node is marked and still expands", async ({ page }) => {
    await page.goto(story("with-disabled-nodes"));
    const locked = page.locator('[data-node-id="locked"]');
    await expect(locked).toHaveAttribute("aria-disabled", "true");
    await expect(locked).toHaveAttribute("data-disabled", "");
    await locked.locator("[data-toggle]").click();
    await expect(locked).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('[data-node-id="locked-1"]')).toBeVisible();
  });
});
