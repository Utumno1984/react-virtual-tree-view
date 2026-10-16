import type { Locator, Page } from "@playwright/test";

export interface ConsoleLog {
  errors: string[];
  warnings: string[];
}

/** Collects console errors, warnings and uncaught page errors. Call before `page.goto`. */
export function collectConsole(page: Page): ConsoleLog {
  const log: ConsoleLog = { errors: [], warnings: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") log.errors.push(msg.text());
    else if (msg.type() === "warning") log.warnings.push(msg.text());
  });
  page.on("pageerror", (err) => log.errors.push(`pageerror: ${err.message}`));
  return log;
}

export const storyUrl = (id: string) => `/iframe.html?id=${id}&viewMode=story`;

export const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"]`);

export const order = (page: Page) =>
  page.getByRole("treeitem").evaluateAll((els) => els.map((el) => el.getAttribute("data-node-id")));

export async function center(target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("element not visible");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Press on `from`, move a little to pass the activation distance, then travel to `to` in
 * steps. The caller releases with `page.mouse.up()`.
 */
export async function dragToPoint(page: Page, from: Locator, to: { x: number; y: number }) {
  const start = await center(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 8, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
}
