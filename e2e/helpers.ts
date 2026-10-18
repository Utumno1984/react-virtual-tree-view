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

export type DropZoneName = "before" | "inside" | "after";

/** Vertical position inside a row for each drop zone (upper 25% / middle 50% / lower 25%). */
const ZONE_FRACTION: Record<DropZoneName, number> = { before: 0.1, inside: 0.5, after: 0.9 };

/** Point on `target` (horizontally centred, shifted by `dx`) that falls in the given drop zone. */
export async function zonePoint(target: Locator, zone: DropZoneName, dx = 0) {
  const box = await target.boundingBox();
  if (!box) throw new Error("element not visible");
  return { x: box.x + box.width / 2 + dx, y: box.y + box.height * ZONE_FRACTION[zone] };
}

/** Press on `from` and move a little to pass the activation distance. The caller releases. */
export async function startDrag(page: Page, from: Locator) {
  const start = await center(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, start.y + 8, { steps: 3 });
}

/**
 * Move a drag already started to the given zone of `target`. The target is measured again
 * after the move: hiding the dragged node's descendants shifts the rows below it.
 */
export async function moveToZone(page: Page, target: Locator, zone: DropZoneName, dx = 0) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const point = await zonePoint(target, zone, dx);
    await page.mouse.move(point.x, point.y, { steps: 8 });
    const again = await zonePoint(target, zone, dx);
    if (Math.abs(again.y - point.y) < 1) return;
  }
}

/** Press on `from` and travel to the given zone of `target`. The caller releases. */
export async function dragToZone(
  page: Page,
  from: Locator,
  target: Locator,
  zone: DropZoneName,
  dx = 0,
) {
  await startDrag(page, from);
  await moveToZone(page, target, zone, dx);
}
