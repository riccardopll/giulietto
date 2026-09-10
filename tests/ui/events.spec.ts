import { expect, type Page } from "@playwright/test";
import { attachScreenshot, checkLayout, openPreview, test } from "./helpers";

function events(page: Page, type?: string) {
  return page
    .getByRole("log", { name: "Game events" })
    .locator(type ? `[data-event-type='${type}']` : ".match-event");
}

async function pausePreview(page: Page) {
  await page.getByRole("button", { name: "Preview settings", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Close preview settings" }).click();
}

async function nextMove(page: Page) {
  await page.getByRole("button", { name: "Preview settings", exact: true }).click();
  await page.getByRole("button", { name: "Next move", exact: true }).click();
  await page.getByRole("button", { name: "Close preview settings" }).click();
}

async function checkEventLayout(page: Page) {
  const failures = await page.evaluate(() => {
    const errors: string[] = [];
    const rail = document
      .querySelector("[role='log'][aria-label='Game events']")!
      .getBoundingClientRect();
    if (
      rail.left < -1 ||
      rail.top < -1 ||
      rail.right > innerWidth + 1 ||
      rail.bottom > innerHeight + 1
    )
      errors.push("Event feed outside viewport");
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        "header, .seat-identity, .seat-hand .playing-card, .hand .playing-card, .trick-cards .playing-card, .bid-options button",
      ),
    ];
    for (const event of document.querySelectorAll<HTMLElement>(".match-event")) {
      if (!event.checkVisibility({ visibilityProperty: true })) continue;
      const bounds = event.getBoundingClientRect();
      const rect = {
        left: Math.max(bounds.left, rail.left),
        top: Math.max(bounds.top, rail.top),
        right: Math.min(bounds.right, rail.right),
        bottom: Math.min(bounds.bottom, rail.bottom),
      };
      if (rect.right <= rect.left || rect.bottom <= rect.top) continue;
      const label = event.textContent;
      // Notifications may clip inside their reserved rail; visible portions must not cover play.
      if (
        rect.left < -1 ||
        rect.top < -1 ||
        rect.right > innerWidth + 1 ||
        rect.bottom > innerHeight + 1
      )
        errors.push(`Event outside viewport: ${label}`);
      for (const control of controls) {
        const bounds = control.getBoundingClientRect();
        const overlapX = Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left);
        const overlapY = Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top);
        if (overlapX > 1 && overlapY > 1)
          errors.push(`Event covers ${control.getAttribute("aria-label")}: ${label}`);
      }
    }
    return errors;
  });
  expect(failures).toEqual([]);
}

async function checkEventCapacity(page: Page) {
  const capacity = await page.evaluate(() => {
    const rail = document.querySelector(".match-events")!.getBoundingClientRect();
    const slots = [...document.querySelectorAll<HTMLElement>(".match-event-slot")];
    const rowHeight = slots[0].getBoundingClientRect().height;
    const expected = Math.min(slots.length, Math.floor((rail.height + 1) / rowHeight));
    const visible = slots.filter((slot) => {
      const event = slot.querySelector<HTMLElement>(".match-event")!;
      if (!event.checkVisibility({ visibilityProperty: true })) return false;
      const bounds = event.getBoundingClientRect();
      return bounds.top >= rail.top - 1 && bounds.bottom <= rail.bottom + 1;
    }).length;
    return { visible, expected };
  });
  expect(capacity.visible).toBe(capacity.expected);
}

test("events follow predictions, played cards and the trick winner", async ({ page }) => {
  await openPreview(page, "people=3&cards=6&phase=bidding");
  await pausePreview(page);
  await expect(events(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Predict 2 tricks", exact: true }).click();
  await expect(events(page, "prediction").locator(".sr-only")).toHaveText(["You predicted 2"]);
  await nextMove(page);
  await expect(events(page, "prediction").locator(".sr-only")).toHaveText([
    "You predicted 2",
    "bot_2 predicted 2",
  ]);
  await nextMove(page);
  await expect(events(page)).toHaveCount(3);
  await expect(events(page, "prediction").locator(".sr-only")).toHaveText([
    "You predicted 2",
    "bot_2 predicted 2",
    "bot_3 predicted 0",
  ]);

  const handCard = page.locator(".hand .playing-card").first();
  const source = await handCard.locator("img").getAttribute("src");
  const label = (await handCard.getAttribute("aria-label"))!.replace(/^Play /, "");
  await handCard.click();
  if (await page.getByRole("dialog", { name: "Ace of Coins", exact: true }).isVisible())
    await page.getByRole("button", { name: "High · 41", exact: true }).click();
  const played = events(page, "play");
  await expect(played).toContainText("You played");
  await expect(played.locator(".playing-card")).toHaveAttribute("aria-label", label);
  await expect(played.locator("img")).toHaveAttribute("src", source!);

  await nextMove(page);
  await expect(events(page, "play").last()).toContainText("bot_2 played");
  await nextMove(page);
  await expect(events(page)).toHaveCount(3);
  await expect(events(page, "play").last()).toContainText("bot_3 played");
  const winner = page.locator("[data-seat][aria-label$='Trick winner']");
  const winnerId = await winner.getAttribute("data-seat");
  const winnerName = await winner.locator(".seat-name").innerText();
  const winningCard = page.locator(`.played-card[data-owner='${winnerId}'] .playing-card`);
  const won = events(page, "trick-won");
  await expect(won).toContainText(`${winnerName} won the trick with`);
  await expect(won.locator(".playing-card")).toHaveAttribute(
    "aria-label",
    (await winningCard.getAttribute("aria-label"))!,
  );
  await expect(won.locator("img")).toHaveAttribute(
    "src",
    (await winningCard.locator("img").getAttribute("src"))!,
  );
});

for (const mode of ["high", "low"]) {
  test(`played Ace of Coins event includes its ${mode} choice`, async ({ page }) => {
    // A fixed shuffle gives the local player the Ace in this six-player preview.
    await page.addInitScript(() => {
      Object.defineProperty(crypto, "getRandomValues", {
        value: (values: Uint32Array) => values.fill(5),
      });
    });
    await openPreview(page, "people=6&cards=6&phase=playing&played=0");
    await pausePreview(page);
    await page.getByRole("button", { name: "Play Ace of Coins, lowest or highest" }).click();
    await page
      .getByRole("button", { name: mode === "high" ? "High · 41" : "Low · 0", exact: true })
      .click();
    const played = events(page, "play");
    await expect(played).toContainText("You played");
    await expect(played.locator(".playing-card")).toHaveAttribute(
      "aria-label",
      "Ace of Coins, lowest or highest",
    );
    await expect(played.locator("img")).toHaveAttribute("src", "/cards/neapolitan/31.webp");
    await expect(played.locator(".match-event-mode")).toHaveText(mode);
  });
}

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`events expire after five seconds with motion ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await openPreview(page, "people=3&cards=6&phase=bidding");
    await pausePreview(page);
    await page.getByRole("button", { name: "Predict 1 trick", exact: true }).click();
    await expect(events(page).locator(".sr-only")).toHaveText(["You predicted 1"]);
    await page.clock.runFor(4900);
    await expect(events(page, "prediction")).toHaveCount(1);
    await page.clock.runFor(100);
    await expect(events(page)).toHaveCount(0);
  });
}

test("opening an existing trick or watching does not replay history", async ({ page }) => {
  await openPreview(page, "people=6&cards=6&phase=playing&played=3");
  await expect(events(page)).toHaveCount(0);
  await openPreview(page, "people=6&cards=6&phase=trick");
  await expect(events(page)).toHaveCount(0);
  for (const viewer of [5, -1]) {
    await openPreview(
      page,
      `people=6&cards=6&played=3&viewer=${viewer}&seats=active,active,active,active,active,eliminated`,
    );
    await pausePreview(page);
    await expect(events(page)).toHaveCount(0);
    await nextMove(page);
    await expect(events(page, "play")).toHaveCount(1);
  }
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 393, height: 740 },
  { width: 800, height: 900 },
  { width: 1220, height: 1340 },
]) {
  test(`events stay within their reserved space at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openPreview(page, "people=6&cards=6&phase=bidding&longNames=1");
    await pausePreview(page);
    await checkEventLayout(page);
    const geometry = await checkLayout(page);
    for (let move = 0; move < 6; move++) {
      await nextMove(page);
      await checkEventLayout(page);
      await checkLayout(page, geometry);
    }
    await expect(events(page)).toHaveCount(3);
    await checkEventCapacity(page);
    await checkLayout(page);
    for (let move = 0; move < 6; move++) {
      await nextMove(page);
      await checkEventLayout(page);
      await checkLayout(page, geometry);
    }
    await expect(events(page, "trick-won")).toHaveCount(1);
    await checkEventCapacity(page);
    await checkLayout(page);
    await attachScreenshot(page, testInfo, "events-full-trick");
    await page.clock.runFor(5000);
    await expect(events(page)).toHaveCount(0);
    await checkLayout(page, geometry);
  });
}
