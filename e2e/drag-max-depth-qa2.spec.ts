import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const url = "/iframe.html?id=draggabletreeview-draggablemaxdepth--default&viewMode=story";
const rows = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute("data-node-id")!, level: Number(el.getAttribute("aria-level")), top: r.top, bottom: r.bottom };
    }),
  );

// Deterministic generator.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

test("the indicator shows where the node really lands (depth and row), maxDepth never exceeded", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const rand = rng(7);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await expect(page.getByRole("treeitem").first()).toBeVisible();
  const mismatches: string[] = [];
  let checked = 0;
  for (let n = 0; n < 30; n++) {
    const before = await rows(page);
    const active = before[Math.floor(rand() * before.length)]!;
    const over = before[Math.floor(rand() * before.length)]!;
    // anywhere in the row: the vertical band decides the zone, the horizontal offset is ignored
    const fraction = 0.02 + rand() * 0.96;
    const sx = 100;
    const sy = (active.top + active.bottom) / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx, sy + 8, { steps: 3 });
    await page.mouse.move(sx + Math.floor(rand() * 200) - 60, over.top + (over.bottom - over.top) * fraction, {
      steps: 10,
    });
    const ind = page.locator("[data-drop-indicator]");
    if ((await ind.count()) === 0) {
      await page.mouse.up();
      continue;
    }
    const depth = Number(await ind.getAttribute("data-projected-depth"));
    const childMode = (await ind.getAttribute("data-drop-mode")) === "child";
    const iy = (await ind.boundingBox())!.y;
    // Rows laid out during the drag: the one right above a line, or the highlighted one.
    const during = await rows(page);
    const above = [...during].reverse().find((r) => r.bottom <= iy + 3 && r.id !== active.id);
    const highlighted = during.find((r) => Math.abs(r.top - iy) <= 3);
    await page.mouse.up();
    const after = await rows(page);
    const pos = after.findIndex((r) => r.id === active.id);
    const unchanged =
      after.map((r) => r.id).join() === before.map((r) => r.id).join() &&
      after[pos]!.level === before.find((r) => r.id === active.id)!.level;
    if (Math.max(...after.map((r) => r.level)) > 3) mismatches.push(`#${n} exceeded maxDepth: ${after.map((r) => r.level)}`);
    if (unchanged) continue;
    checked++;
    const label = `#${n} ${active.id}->${over.id} @${fraction.toFixed(2)}`;
    if (after[pos]!.level - 1 !== depth) mismatches.push(`${label}: indicator depth ${depth}, landed ${after[pos]!.level - 1}`);
    const prevAfter = after[pos - 1]?.id;
    if (childMode) {
      // "becomes a child": the highlighted row is the new parent and the node is its first child
      if (!highlighted || prevAfter !== highlighted.id) mismatches.push(`${label}: highlighted ${highlighted?.id}, row above landed node ${prevAfter}`);
    } else {
      // The row above the indicator must be the one that precedes the node, or one of its ancestors' subtree end.
      if (above && prevAfter !== above.id) mismatches.push(`${label}: row above indicator ${above.id}, row above landed node ${prevAfter}`);
      if (!above && pos !== 0) mismatches.push(`${label}: indicator at top but node landed at ${pos}`);
    }
  }
  console.log("checked drops:", checked);
  expect(mismatches).toEqual([]);
  expect(errors).toEqual([]);
});
