import { expect, type Page } from "@playwright/test";
import { attachScreenshot, checkLayout, openPreview, test } from "./helpers";

test("preview header copies the room invite and opens settings", async ({ page }) => {
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
  await invite.click();
  const copiedInvite = await page.evaluate(() => sessionStorage.getItem("copiedInvite"));
  expect(copiedInvite).toBe(`${new URL(page.url()).origin}/?table=PREVIEW6`);
  await header.getByRole("button", { name: "Preview settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Local preview" })).toBeVisible();
  await page.keyboard.press("Escape");
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
  { width: 1220, height: 1340 },
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
    await attachScreenshot(page, testInfo, "sidebar-open");
    await sidebar.hover();
    await page.mouse.wheel(0, 600);
    if (viewport.height === 568)
      await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await gameGeometry(page)).toEqual(before);
    expect(await sidebar.boundingBox()).toEqual(sidebarBounds);
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeHidden();
    await page.clock.runFor(1);
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

test("playing outside the preview sidebar dismisses it", async ({ page }) => {
  await page.setViewportSize({ width: 1220, height: 1340 });
  await openPreview(page, "people=6&cards=6&phase=playing&played=0");
  await page.getByRole("button", { name: "Preview settings", exact: true }).click();
  await page.clock.runFor(1);
  const sidebar = page.getByRole("dialog", { name: "Local preview" });
  const hand = page.getByRole("region", { name: "Your hand", exact: true });
  await expect(hand.getByRole("button")).toHaveCount(6);
  await hand.getByRole("button").first().click();
  if (await page.getByRole("dialog", { name: "Ace of Coins", exact: true }).isVisible())
    await page.getByRole("button", { name: "High · 41" }).click();
  await expect(hand.getByRole("button")).toHaveCount(5);
  await expect(sidebar).toBeHidden();
});

test("preview autoplays by default and can pause and resume", async ({ page }) => {
  await openPreview(page, "people=3&cards=6&phase=playing&played=0");
  const cards = page.locator(".trick-cards .playing-card");
  await expect(cards).toHaveCount(0);
  await page.clock.runFor(1800);
  await expect(cards).toHaveCount(1);

  await page.getByRole("button", { name: "Preview settings", exact: true }).click();
  const sidebar = page.getByRole("dialog", { name: "Local preview" });
  await sidebar.getByRole("button", { name: "Pause", exact: true }).click();
  await page.clock.runFor(3600);
  await expect(cards).toHaveCount(1);

  await sidebar.getByRole("button", { name: "Autoplay", exact: true }).click();
  await page.clock.runFor(1800);
  await expect(cards).toHaveCount(2);
});

test("preview shortcut advances one move and pauses autoplay with settings closed", async ({
  page,
}) => {
  await openPreview(page, "people=3&cards=6&phase=playing&played=0");
  const cards = page.locator(".trick-cards .playing-card");
  const sidebar = page.getByRole("dialog", { name: "Local preview" });
  await page.keyboard.press("n");
  await expect(cards).toHaveCount(1);
  await expect(sidebar).toBeHidden();
  await page.clock.runFor(3600);
  await expect(cards).toHaveCount(1);

  await page.keyboard.press("Shift+N");
  await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "Preview settings", exact: true }).click();
  await expect(sidebar.getByRole("button", { name: "Autoplay", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Next move", exact: true })).toHaveAttribute(
    "aria-keyshortcuts",
    "n",
  );
});

test("preview shortcut follows the selected table and ignores select input and key chords", async ({
  page,
}) => {
  await openPreview(page, "people=3&cards=6&phase=playing&played=0");
  const cards = page.locator(".trick-cards .playing-card");
  const settings = page.getByRole("button", { name: "Preview settings", exact: true });
  const sidebar = page.getByRole("dialog", { name: "Local preview" });
  const players = sidebar.getByRole("combobox", { name: "Players", exact: true });
  await page.keyboard.press("n");
  await expect(cards).toHaveCount(1);
  await settings.click();
  await players.selectOption("4");
  await players.focus();
  await page.keyboard.press("n");
  await expect(cards).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sidebar).toBeHidden();

  for (const chord of ["Control+n", "Meta+n", "Alt+n"]) await page.keyboard.press(chord);
  await page.dispatchEvent("body", "keydown", { key: "n", repeat: true });
  await page.dispatchEvent("body", "keydown", { key: "n", isComposing: true });
  await expect(cards).toHaveCount(0);
  await page.keyboard.press("n");
  await expect(cards).toHaveCount(1);
  await expect(page.locator("[data-seat]")).toHaveCount(4);

  await settings.click();
  await players.selectOption("3");
  await expect(cards).toHaveCount(1);
});

test("preview follows configuration URLs and browser history", async ({ page }) => {
  await openPreview(page, "people=3&cards=6&phase=playing&played=0");
  await page.evaluate(() => {
    const query = new URLSearchParams({
      people: "5",
      cards: "6",
      phase: "playing",
      played: "2",
      viewer: "1",
      seats: "eliminated,active,eliminated,active,active",
      startingLives: "2",
      completedTricks: "4",
      pending: "1",
    });
    history.pushState(null, "", `/preview?${query}`);
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page).not.toHaveURL(/pending=/);
  await expect(page.locator("[data-seat]")).toHaveCount(5);
  await expect(page.locator(".trick-cards .playing-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Preview settings", exact: true }).click();
  const sidebar = page.getByRole("dialog", { name: "Local preview" });
  await expect(sidebar.getByRole("combobox", { name: "Starting lives", exact: true })).toHaveValue(
    "2",
  );
  await expect(
    sidebar.getByRole("combobox", { name: "Completed tricks", exact: true }),
  ).toHaveValue("4");
  await expect(sidebar.getByRole("combobox", { name: "Seat 4", exact: true })).toHaveValue(
    "active",
  );
  await expect(sidebar.getByRole("button", { name: "Autoplay", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goBack();
  await expect(page.locator("[data-seat]")).toHaveCount(3);
  await expect(page.locator(".trick-cards .playing-card")).toHaveCount(0);
  await page.goForward();
  await expect(page.locator("[data-seat]")).toHaveCount(5);
  await expect(page.locator(".trick-cards .playing-card")).toHaveCount(2);
});

test.describe("preview motion settings", () => {
  test.use({ previewMotion: null });

  test("defaults to full motion, saves the selection and follows system changes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPreview(page, "people=6&cards=6&phase=playing&played=1");
    await page.getByRole("button", { name: "Preview settings", exact: true }).click();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const motion = page.getByRole("combobox", { name: "Motion", exact: true });
    const animation = () =>
      page
        .locator(".played-card")
        .first()
        .evaluate((card) => getComputedStyle(card).animationName);
    const cards = await page
      .locator(".hand .card-art")
      .evaluateAll((images) => images.map((image) => image.getAttribute("src")));

    await expect(motion).toHaveValue("full");
    await expect.poll(animation).toBe("card-land");
    await motion.selectOption("reduced");
    await expect.poll(animation).toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect.poll(animation).toBe("none");
    await expect(page.locator(".seat-timer circle")).toHaveCSS("animation-name", "seat-countdown");
    expect(
      await page
        .locator(".hand .card-art")
        .evaluateAll((images) => images.map((image) => image.getAttribute("src"))),
    ).toEqual(cards);

    await motion.selectOption("system");
    await expect.poll(animation).toBe("card-land");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(animation).toBe("none");
    await page.reload();
    await page.getByRole("button", { name: "Preview settings", exact: true }).click();
    await expect(motion).toHaveValue("system");
    await expect.poll(animation).toBe("none");
    await motion.selectOption("full");
    await expect.poll(animation).toBe("card-land");
    await page.reload();
    await page.getByRole("button", { name: "Preview settings", exact: true }).click();
    await expect(motion).toHaveValue("full");
    await expect.poll(animation).toBe("card-land");

    await page.goto("/");
    await expect(page.locator("html")).not.toHaveAttribute("data-preview-motion");
    await expect(page.locator("body")).toHaveCSS("animation-name", "none");
  });
});
