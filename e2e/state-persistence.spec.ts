import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { collectConsole, node, storyUrl } from "./helpers";

const KEY = "rvtv-demo:state-persistence";
const story = (name = "default") =>
  storyUrl(`treeview-statepersistence--${name}`);
const toggle = (page: Page, id: string) =>
  node(page, id).locator("[data-toggle]").click();
const selected = (page: Page) =>
  page.locator('[role="treeitem"][aria-selected="true"]');
const stored = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key), KEY);
const storedJson = async (page: Page) =>
  JSON.parse((await stored(page)) ?? "null");
const search = (page: Page) => page.getByTestId("search-input");

/** Opens the story with `value` already in the key (`null`: key removed). */
async function openWith(page: Page, value: string | null, name = "default") {
  // Any page of the same origin gives access to its localStorage.
  await page.goto("/iframe.html");
  await page.evaluate(
    ({ key, v }) => {
      if (v === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, v);
    },
    { key: KEY, v: value },
  );
  await page.goto(story(name));
  await expect(page.getByTestId("stored-json")).toBeVisible();
}

/** Open docs and reports, select "Q2.xlsx", search "x". */
async function interact(page: Page) {
  await toggle(page, "docs");
  await toggle(page, "reports");
  await node(page, "q2").click();
  await search(page).fill("x");
}

const EXPECTED = {
  expandedIds: ["docs", "reports"],
  selectedId: "q2",
  searchQuery: "x",
};

test.describe("TreeView/StatePersistence (#48)", () => {
  test("empty storage: empty tree, no key until the user interacts", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await openWith(page, null);
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "false");
    await expect(selected(page)).toHaveCount(0);
    await expect(page.getByTestId("storage-error")).toHaveCount(0);
    await expect(page.getByTestId("stored-json")).toHaveText("(empty)");
    expect(await stored(page)).toBeNull();

    await toggle(page, "docs");
    await expect(page.getByTestId("stored-json")).toContainText('"docs"');
    expect(await storedJson(page)).toEqual({
      expandedIds: ["docs"],
      selectedId: null,
      searchQuery: "",
    });
    expect(log.errors).toEqual([]);
    expect(log.warnings).toEqual([]);
  });

  test("the stored-json panel mirrors the key at every gesture", async ({
    page,
  }) => {
    await openWith(page, null);
    await interact(page);
    await expect(page.getByTestId("stored-json")).toHaveText(
      JSON.stringify(EXPECTED),
    );
    expect(await stored(page)).toBe(JSON.stringify(EXPECTED));
  });

  test("page.reload() restores branches, selection and search text", async ({
    page,
  }) => {
    await openWith(page, null);
    await interact(page);
    await expect(page.getByTestId("stored-json")).toHaveText(
      JSON.stringify(EXPECTED),
    );
    await page.reload();
    await expect(search(page)).toHaveValue("x");
    await search(page).fill("");
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "reports")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(node(page, "q2")).toHaveAttribute("aria-selected", "true");
    await expect(selected(page)).toHaveCount(1);
  });

  test("simulate-reload remounts the tree from storage with the same result", async ({
    page,
  }) => {
    await openWith(page, null);
    await interact(page);
    await expect(page.getByTestId("stored-json")).toHaveText(
      JSON.stringify(EXPECTED),
    );
    await page.getByTestId("simulate-reload").click();
    await expect(search(page)).toHaveValue("x");
    await search(page).fill("");
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "reports")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(node(page, "q2")).toHaveAttribute("aria-selected", "true");
  });

  test("simulate-reload really remounts: state not saved is lost", async ({
    page,
  }) => {
    await openWith(page, null);
    await toggle(page, "docs");
    // Another "tab" rewrote the database behind the story's back.
    await page.evaluate(
      (key) =>
        window.localStorage.setItem(
          key,
          JSON.stringify({
            expandedIds: ["pics"],
            selectedId: null,
            searchQuery: "",
          }),
        ),
      KEY,
    );
    await page.getByTestId("simulate-reload").click();
    await expect(node(page, "pics")).toHaveAttribute("aria-expanded", "true");
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("stored-json")).toContainText('"pics"');
  });

  test("a no-match search is persisted and shows noResults after the reload", async ({
    page,
  }) => {
    await openWith(page, null);
    await search(page).fill("zzzz");
    await expect(page.getByTestId("no-results")).toBeVisible();
    await expect(page.getByTestId("stored-json")).toContainText('"zzzz"');
    await page.reload();
    await expect(search(page)).toHaveValue("zzzz");
    await expect(page.getByTestId("no-results")).toBeVisible();
  });

  test("a disabled node is not selectable and never reaches the state", async ({
    page,
  }) => {
    await openWith(page, null);
    await node(page, "locked").click({ force: true });
    await expect(selected(page)).toHaveCount(0);
    expect(await stored(page)).toBeNull();
  });

  test("not JSON: warning, empty tree, no console errors, overwritten on first interaction", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await openWith(page, "{not json");
    await expect(page.getByTestId("storage-error")).toBeVisible();
    await expect(page.getByTestId("storage-error")).toContainText(
      "not valid JSON",
    );
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "false");
    await expect(selected(page)).toHaveCount(0);
    // not touched until a gesture
    expect(await stored(page)).toBe("{not json");

    await toggle(page, "pics");
    await expect(page.getByTestId("storage-error")).toHaveCount(0);
    expect(await storedJson(page)).toEqual({
      expandedIds: ["pics"],
      selectedId: null,
      searchQuery: "",
    });
    expect(log.errors).toEqual([]);
  });

  test("valid but malformed JSON: mounts without exceptions, invalid fields empty", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await openWith(page, '{"expandedIds":"x","selectedId":{}}');
    await expect(node(page, "docs")).toBeVisible();
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "false");
    await expect(selected(page)).toHaveCount(0);
    await expect(page.getByTestId("storage-error")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(log.errors).toEqual([]);
    expect(
      log.warnings.filter((w) => w.includes("[react-virtual-tree-view]")),
    ).toHaveLength(1);
  });

  for (const [label, value] of [
    ["a number", "5"],
    ["null", "null"],
    ["an array", "[1,2]"],
  ] as const) {
    test(`valid JSON that is ${label}: empty tree, no exceptions`, async ({
      page,
    }) => {
      const log = collectConsole(page);
      await openWith(page, value);
      await expect(node(page, "docs")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(selected(page)).toHaveCount(0);
      await toggle(page, "docs");
      expect(await storedJson(page)).toEqual({
        expandedIds: ["docs"],
        selectedId: null,
        searchQuery: "",
      });
      expect(log.errors).toEqual([]);
    });
  }

  test("ids missing from data are dropped from the stored value at mount", async ({
    page,
  }) => {
    await openWith(
      page,
      JSON.stringify({
        expandedIds: ["docs", "gone", 99],
        selectedId: "gone",
        searchQuery: "",
      }),
    );
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    await expect(selected(page)).toHaveCount(0);
    await expect
      .poll(async () => await storedJson(page))
      .toEqual({ expandedIds: ["docs"], selectedId: null, searchQuery: "" });
    await expect(page.getByTestId("stored-json")).not.toContainText("gone");
  });

  test("clear-storage removes the key and remounts an empty tree", async ({
    page,
  }) => {
    await openWith(page, null);
    await interact(page);
    await expect(page.getByTestId("stored-json")).toHaveText(
      JSON.stringify(EXPECTED),
    );
    await page.getByTestId("clear-storage").click();
    expect(await stored(page)).toBeNull();
    await expect(page.getByTestId("stored-json")).toHaveText("(empty)");
    await expect(search(page)).toHaveValue("");
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "false");
    await expect(selected(page)).toHaveCount(0);
    expect(await stored(page)).toBeNull();
  });

  test("clear-storage also recovers from a corrupt value", async ({ page }) => {
    await openWith(page, "{not json");
    await expect(page.getByTestId("storage-error")).toBeVisible();
    await page.getByTestId("clear-storage").click();
    await expect(page.getByTestId("storage-error")).toHaveCount(0);
    expect(await stored(page)).toBeNull();
  });

  test("empty data: the saved state is cleaned up without errors", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await openWith(
      page,
      JSON.stringify({
        expandedIds: ["docs"],
        selectedId: "cv",
        searchQuery: "",
      }),
      "empty-tree",
    );
    await expect(page.getByText("The tree is empty")).toBeVisible();
    await expect
      .poll(async () => await storedJson(page))
      .toEqual({ expandedIds: [], selectedId: null, searchQuery: "" });
    expect(log.errors).toEqual([]);
  });

  test("single node without children: selection is persisted", async ({
    page,
  }) => {
    await openWith(page, null, "single-node");
    await node(page, "only").click();
    await expect(page.getByTestId("stored-json")).toContainText('"only"');
    await page.reload();
    await expect(node(page, "only")).toHaveAttribute("aria-selected", "true");
    expect(await storedJson(page)).toEqual({
      expandedIds: [],
      selectedId: "only",
      searchQuery: "",
    });
  });

  test("large tree (1200 nodes): every gesture is saved and restored", async ({
    page,
  }) => {
    await openWith(page, null, "large-tree");
    await expect(page.getByRole("treeitem").first()).toBeVisible();
    const firstId = await page
      .getByRole("treeitem")
      .first()
      .getAttribute("data-node-id");
    const t0 = Date.now();
    await page.getByRole("treeitem").first().click();
    await expect(page.getByTestId("stored-json")).toContainText(`"${firstId}"`);
    expect(Date.now() - t0).toBeLessThan(2000);
    await page.reload();
    await expect(node(page, firstId!)).toHaveAttribute("aria-selected", "true");
  });

  test("storage that throws on write: no crash, visible warning", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError",
        );
      };
    });
    await page.goto(story());
    await expect(node(page, "docs")).toBeVisible();
    await toggle(page, "docs");
    await expect(page.getByTestId("storage-error")).toBeVisible();
    await expect(page.getByTestId("storage-error")).toContainText("quota");
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "true");
    expect(log.errors).toEqual([]);
  });

  test("storage that throws on read: no crash, visible warning, empty tree", async ({
    page,
  }) => {
    const log = collectConsole(page);
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException("Access denied.", "SecurityError");
      };
    });
    await page.goto(story());
    await expect(node(page, "docs")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("storage-error")).toContainText(
      "unavailable",
    );
    expect(log.errors).toEqual([]);
  });
});
