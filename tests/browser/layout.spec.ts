import { expect, test, type Page } from "@playwright/test";
import { makePreview } from "../../src/client/preview/games";
import { makeGame, player, view } from "../../src/shared/game";

const sizes = [
  { width: 320, height: 568 },
  { width: 393, height: 664 },
  { width: 430, height: 932 },
  { width: 568, height: 320 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 2560, height: 1440 },
];

async function openPreview(page: Page, query: string) {
  await page.goto(`/preview?${query}`);
  await expect(page.locator("[data-seat]").first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
}

async function checkLayout(page: Page) {
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
    const bounds = elements.map((element) => ({ element, rect: element.getBoundingClientRect() }));
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

for (const viewport of sizes) {
  for (let people = 2; people <= 6; people++) {
    test(`${viewport.width}×${viewport.height}, ${people} players`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      for (const scenario of [
        "phase=bidding&cards=6",
        "phase=playing&cards=6&played=0",
        `phase=playing&cards=3&played=${Math.floor(people / 2)}`,
        `phase=playing&cards=6&played=${people}`,
        "phase=blind&played=0",
      ]) {
        await openPreview(page, `people=${people}&longNames=1&${scenario}`);
        await checkLayout(page);
        if (people === 6 && scenario.includes(`played=${people}`)) {
          const path = testInfo.outputPath("full-trick.png");
          await page.screenshot({ path });
          await testInfo.attach("full-trick", { path, contentType: "image/png" });
        }
      }
    });
  }
}

test("mobile predictions, card play and preview settings stay usable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openPreview(page, "people=6&cards=6&phase=bidding");
  await page.getByRole("button", { name: "Predict 1 trick", exact: true }).click();
  await expect(page.getByRole("status", { name: "bot_1 predicts 1 trick" })).toBeVisible();
  await page.getByRole("button", { name: "Preview settings" }).click();
  await expect(page.getByRole("dialog", { name: "Local preview" })).toBeVisible();
  await page.getByRole("combobox", { name: "Scenario", exact: true }).selectOption("playing");
  await page.getByRole("combobox", { name: "Cards played", exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Close preview settings" }).click();
  const hand = page.getByRole("region", { name: "Your hand", exact: true });
  const card = hand.getByRole("button").first();
  await card.focus();
  await expect(card).toBeFocused();
  await card.press("Enter");
  if (await page.getByRole("dialog", { name: "Ace of Coins", exact: true }).isVisible())
    await page.getByRole("button", { name: "High · 41" }).click();
  await expect(hand.getByRole("button")).toHaveCount(5);
});

test("preview has the live room-code control and replaces exit with settings", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => sessionStorage.setItem("copiedInvite", text),
      },
    });
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await openPreview(page, "people=6&cards=6&phase=playing");
  const header = page.getByRole("banner");
  const invite = header.getByRole("button", {
    name: "Copy lobby invite",
    exact: true,
  });
  await expect(invite).toHaveText("PREVIEW6");
  await expect(header.getByRole("button", { name: "Preview settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Leave table", exact: true })).toHaveCount(0);
  await invite.click();
  const copiedInvite = await page.evaluate(() => sessionStorage.getItem("copiedInvite"));
  expect(copiedInvite).toBe(`${new URL(page.url()).origin}/?table=PREVIEW6`);
  await expect(page.getByRole("dialog", { name: "Local preview" })).toHaveCount(0);
  await checkLayout(page);
});

async function gameGeometry(page: Page) {
  return page.evaluate(() => ({
    elements: [
      ...document.querySelectorAll(
        ".match-screen, header, header a, header h2, header button, [aria-label='Game table'], [data-seat], .hand",
      ),
    ].map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
    page: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      x: scrollX,
      y: scrollY,
      overflow: getComputedStyle(document.body).overflow,
    },
  }));
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 568, height: 320 },
  { width: 1366, height: 768 },
]) {
  test(`preview sidebar leaves game geometry unchanged at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await openPreview(page, "people=6&cards=6&phase=playing&played=3");
    const before = await gameGeometry(page);
    const trigger = page.getByRole("button", {
      name: "Preview settings",
      exact: true,
    });
    await trigger.click();
    const sidebar = page.getByRole("dialog", { name: "Local preview" });
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveCSS("position", "fixed");
    expect(await gameGeometry(page)).toEqual(before);
    const sidebarBounds = await sidebar.boundingBox();
    expect(sidebarBounds!.x).toBeGreaterThanOrEqual(0);
    expect(sidebarBounds!.y).toBe(0);
    expect(sidebarBounds!.x + sidebarBounds!.width).toBe(viewport.width);
    expect(sidebarBounds!.height).toBe(viewport.height);
    const path = testInfo.outputPath("sidebar-open.png");
    await page.screenshot({ path });
    await testInfo.attach("sidebar-open", { path, contentType: "image/png" });
    await sidebar.hover();
    await page.mouse.wheel(0, 600);
    if (viewport.height === 320)
      await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await gameGeometry(page)).toEqual(before);
    expect(await sidebar.boundingBox()).toEqual(sidebarBounds);
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await gameGeometry(page)).toEqual(before);
    await checkLayout(page);
  });
}

test("preview sidebar retains focus and settings when reconfiguring the game", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openPreview(page, "people=6&cards=6&phase=playing");
  await page.getByRole("button", { name: "Preview settings", exact: true }).click();
  const sidebar = page.getByRole("dialog", { name: "Local preview" });
  for (const [name, value] of [
    ["Players", "4"],
    ["Scenario", "bidding"],
    ["View as", "2"],
    ["Cards each", "3"],
  ]) {
    const select = sidebar.getByRole("combobox", { name, exact: true });
    await select.focus();
    await select.selectOption(value);
    await expect(sidebar).toBeVisible();
    await expect(select).toBeFocused();
    await expect(select).toHaveValue(value);
  }
  await expect(page.locator("[data-seat]")).toHaveCount(4);
  await sidebar.getByRole("checkbox", { name: "Long names" }).check();
  await sidebar.getByRole("button", { name: "Close preview settings" }).click();
  await expect(sidebar).toBeHidden();
  await page.getByRole("button", { name: "Preview settings", exact: true }).click();
  await expect(sidebar.getByRole("combobox", { name: "Players", exact: true })).toHaveValue("4");
  await expect(sidebar.getByRole("combobox", { name: "Scenario", exact: true })).toHaveValue(
    "bidding",
  );
  await expect(sidebar.getByRole("combobox", { name: "View as", exact: true })).toHaveValue("2");
  await expect(sidebar.getByRole("combobox", { name: "Cards each", exact: true })).toHaveValue("3");
  await expect(sidebar.getByRole("checkbox", { name: "Long names" })).toBeChecked();
});

test("preview sidebar stays open while playing the game outside it", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openPreview(page, "people=6&cards=6&phase=playing&played=0");
  await page.getByRole("button", { name: "Preview settings", exact: true }).click();
  const sidebar = page.getByRole("dialog", { name: "Local preview" });
  const hand = page.getByRole("region", { name: "Your hand", exact: true });
  await expect(hand.getByRole("button")).toHaveCount(6);
  await hand.getByRole("button").first().click();
  if (await page.getByRole("dialog", { name: "Ace of Coins", exact: true }).isVisible())
    await page.getByRole("button", { name: "High · 41" }).click();
  await expect(hand.getByRole("button")).toHaveCount(5);
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText("playing · 1 of 6 cards on table", { exact: true })).toBeVisible();
  await sidebar.getByRole("button", { name: "Close preview settings" }).click();
  await expect(sidebar).toBeHidden();
});

test("mobile spectator and round results remain readable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const inactive of ["eliminated", "left"]) {
    await openPreview(page, `people=6&cards=6&played=3&viewer=5&inactive=${inactive}`);
    await checkLayout(page);
    await expect(page.getByText("Watching · you return if everyone is out")).toBeVisible();
    await expect(page.locator(".hand button")).toHaveCount(0);
  }
  await page.goto("/preview?people=6&cards=6&phase=results&longNames=1");
  await expect(page.getByRole("heading", { name: "Round results" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText("Next round in 12s")).toBeVisible();
});

test("phone layout responds to card counts and browser viewport changes", async ({ page }) => {
  for (let cards = 1; cards <= 6; cards++) {
    await page.setViewportSize({ width: 393, height: 740 });
    await openPreview(page, `people=6&cards=${cards}&played=3`);
    await checkLayout(page);
    await page.setViewportSize({ width: 393, height: 600 });
    await checkLayout(page);
    await page.setViewportSize({ width: 740, height: 393 });
    await checkLayout(page);
  }
});

test("mobile lobby settings and live header use the same compact layout", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const host = player("test-player-1", "bot_1", Date.now());
  const lobby = makeGame("WWWWWWWW", host, false);
  lobby.players.push(player("test-player-2", "bot_2", Date.now()));
  let state = view(lobby, host.id);
  await page.route("**/api/game", (route) => route.fulfill({ json: state }));
  await page.routeWebSocket("**/api/game/socket?*", (socket) => {
    socket.send(JSON.stringify({ type: "state", state }));
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.action === "settings") {
        lobby.startingLives = message.startingLives;
        state = view(lobby, host.id);
      } else if (message.action === "start") {
        const game = makePreview({
          people: 6,
          cards: 3,
          phase: "playing",
          longNames: true,
          played: 0,
        });
        game.code = lobby.code;
        game.round = 88;
        state = view(game, game.players[0].id);
      }
      socket.send(JSON.stringify({ type: "ack", commandId: message.commandId, state }));
    });
  });
  await page.goto("/");
  await page.getByLabel("Display name").fill("bot_1");
  await page.getByRole("button", { name: "Create private lobby" }).click();
  await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
  await page.getByRole("slider", { name: "Starting lives" }).press("End");
  await expect.poll(() => lobby.startingLives).toBe(5);
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Round LXXXVIII" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy lobby invite" })).toContainText("WWWWWWWW");
  await expect(page.getByRole("button", { name: "Preview settings", exact: true })).toHaveCount(0);
  await checkLayout(page);
  await page.getByRole("banner").getByRole("button", { name: "Leave table", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Stay", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
});

test("playing the last card keeps the table size stable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openPreview(page, "people=6&phase=blind&played=5");
  const before = await page.getByRole("region", { name: "Game table", exact: true }).boundingBox();
  await page.getByRole("region", { name: "Your hand", exact: true }).getByRole("button").click();
  if (await page.getByRole("dialog", { name: "Ace of Coins", exact: true }).isVisible())
    await page.getByRole("button", { name: "High · 41" }).click();
  await expect(page.locator(".hand button")).toHaveCount(0);
  const after = await page.getByRole("region", { name: "Game table", exact: true }).boundingBox();
  expect(after?.height).toBeCloseTo(before!.height, 0);
  await checkLayout(page);
});

test("prediction bubbles stay clear of the header", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 568, height: 320 },
  ]) {
    await page.setViewportSize(viewport);
    for (const viewer of [0, 3]) {
      await openPreview(page, `people=6&cards=6&phase=bidding&viewer=${viewer}`);
      await page.getByRole("button", { name: "Preview settings" }).click();
      await page.getByRole("button", { name: "Next move", exact: true }).click();
      await page.getByRole("button", { name: "Close preview settings" }).click();
      await expect(page.getByRole("status", { name: "bot_1 predicts 1 trick" })).toBeVisible();
      await checkLayout(page);
    }
  }
});
