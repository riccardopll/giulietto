import { expect, test, type Page } from "@playwright/test";
import { attachScreenshot, checkLayout, openPreview } from "./helpers";

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
    await attachScreenshot(page, testInfo, "sidebar-open");
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
