import { expect, test as base, type Page, type TestInfo } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
    await use(page);
  },
});

export async function openPreview(page: Page, query: string) {
  await page.goto(`/preview?${query}`);
  await expect(page.locator("[data-seat]").first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
}

export async function checkLayout(page: Page) {
  const failures = await page.evaluate(() => {
    const errors: string[] = [];
    const viewport = { width: innerWidth, height: innerHeight };
    if (document.documentElement.scrollWidth > innerWidth + 1)
      errors.push("Horizontal page overflow");
    if (document.documentElement.scrollHeight > innerHeight + 1)
      errors.push("Vertical page overflow");
    for (const row of document.querySelectorAll(".seats-row")) {
      if (row.querySelectorAll("[data-seat]").length > 3)
        errors.push("More than three players in a seating row");
    }
    const localSeat = document
      .querySelector(".seat-name[aria-label='You']")
      ?.closest("[data-seat]");
    if (!localSeat?.matches(".seats-row[data-side='bottom'] .seat-slot[data-center] [data-seat]"))
      errors.push("The local player is not seated at the bottom center");
    for (const owner of document.querySelectorAll<HTMLElement>("[data-seat]")) {
      const cards = owner.querySelector<HTMLElement>(".seat-fan-orientation");
      if (!cards) continue;
      const expected =
        owner.dataset.side === "top" && !cards.closest("[data-revealed]") ? "180deg" : "0deg";
      const rotation = getComputedStyle(cards).rotate;
      if (rotation !== expected && !(expected === "0deg" && rotation === "none"))
        errors.push(`Card fan faces away from its owner: ${owner.dataset.seat}`);
    }
    const elements = [
      ...document.querySelectorAll<HTMLElement>(
        ".seat-identity, [data-seat-stats], .seat-number, .hand .playing-card, .trick-cards .playing-card, .bid-options button, header a, header h2, header button, .seat-hand .playing-card",
      ),
    ];
    const bounds = elements.map((element) => ({
      element,
      rect: element.getBoundingClientRect(),
      label: [
        element.closest("[data-seat]")?.getAttribute("aria-label"),
        element.getAttribute("aria-label") ?? element.className.split(" ")[0],
      ]
        .filter(Boolean)
        .join(" · "),
    }));
    for (const { element, rect, label } of bounds) {
      if (
        rect.left < -1 ||
        rect.top < -1 ||
        rect.right > viewport.width + 1 ||
        rect.bottom > viewport.height + 1
      )
        errors.push(`Outside viewport: ${label}`);
      if (element.matches("button") && (rect.width < 43.5 || rect.height < 43.5))
        errors.push(`Small touch target: ${label}`);
      if (element.matches(".seat-hand .playing-card")) {
        const minimum = element.closest("[data-revealed]") ? 32 : 24;
        if (parseFloat(getComputedStyle(element).width) < minimum - 0.5)
          errors.push(`Unreadable opponent card: ${label}`);
      }
      if (element.matches(".hand .playing-card") && !element.hasAttribute("disabled")) {
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        if (!hit || !element.contains(hit)) errors.push(`Covered playable card: ${label}`);
      }
    }
    for (let i = 0; i < bounds.length; i++) {
      for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i],
          b = bounds[j];
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const fan = a.element.closest(".seat-hand");
        if (fan && fan === b.element.closest(".seat-hand")) continue;
        const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (overlapX > 1 && overlapY > 1) errors.push(`Overlap: ${a.label} / ${b.label}`);
      }
    }
    const contour = document.querySelector<SVGGeometryElement>(".table-rail-edge");
    const tableCoordinates = contour?.getScreenCTM()?.inverse();
    if (contour && tableCoordinates) {
      for (const stats of document.querySelectorAll("[data-seat-stats]")) {
        const rect = stats.getBoundingClientRect();
        const overlapsFelt = [0, 0.5, 1].some((x) =>
          [0, 0.5, 1].some((y) =>
            contour.isPointInFill(
              new DOMPoint(rect.left + rect.width * x, rect.top + rect.height * y).matrixTransform(
                tableCoordinates,
              ),
            ),
          ),
        );
        if (overlapsFelt) errors.push(`Player stats overlap the table: ${stats.textContent}`);
      }
    }
    return errors;
  });
  expect(failures).toEqual([]);
}

export async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
