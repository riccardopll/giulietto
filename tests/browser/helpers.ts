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
    const elements = [
      ...document.querySelectorAll<HTMLElement>(
        ".prediction-emote, .seat-identity, .hand .playing-card, .trick-cards .playing-card, .bid-options button, header a, header h2, header button, .seat-hand[data-revealed] .playing-card",
      ),
    ];
    const bounds = elements.map((element) => ({
      element,
      rect: element.getBoundingClientRect(),
    }));
    for (const { element, rect } of bounds) {
      const label = element.getAttribute("aria-label") ?? element.className;
      if (
        rect.left < -1 ||
        rect.top < -1 ||
        rect.right > viewport.width + 1 ||
        rect.bottom > viewport.height + 1
      )
        errors.push(`Outside viewport: ${label}`);
      if (element.matches("button") && (rect.width < 43.5 || rect.height < 43.5))
        errors.push(`Small touch target: ${label}`);
      if (element.matches(".seat-hand[data-revealed] .playing-card") && rect.width < 31.5)
        errors.push(`Unreadable revealed card: ${label}`);
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
        const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (overlapX > 1 && overlapY > 1)
          errors.push(`Overlap: ${a.element.className} / ${b.element.className}`);
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
