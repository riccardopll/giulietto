import { expect } from "@playwright/test";
import { makePreview } from "../../src/client/preview/games";
import { makeGame, player, view } from "../../src/shared/game";
import type { Command } from "../../src/server/protocol";
import { attachScreenshot, checkLayout, openPreview, test } from "./helpers";

test("playable hand cards stay accessible when hovered and focused", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openPreview(page, "people=6&cards=6&phase=playing&played=0");
  const card = page
    .getByRole("region", { name: "Your hand", exact: true })
    .getByRole("button")
    .nth(2);
  const resting = await card.boundingBox();
  expect(resting).not.toBeNull();

  await card.hover();
  await expect.poll(async () => (await card.boundingBox())!.y).toBeLessThan(resting!.y);
  await page.mouse.move(resting!.x + resting!.width / 2, resting!.y + resting!.height - 1);
  await page.clock.runFor(32);
  await expect.poll(async () => (await card.boundingBox())!.y).toBeLessThan(resting!.y);
  await checkLayout(page);
  await attachScreenshot(page, testInfo, "hovered-hand");

  await page.mouse.move(0, 0);
  await expect.poll(async () => (await card.boundingBox())!.y).toBe(resting!.y);
  await page.keyboard.press("Tab");
  await card.focus();
  await expect(card).toBeFocused();
  await expect.poll(async () => (await card.boundingBox())!.y).toBeLessThan(resting!.y);
  await expect(card).not.toHaveCSS("outline-color", "rgba(0, 0, 0, 0)");
  await checkLayout(page);
});

test("players can predict and play cards with the keyboard on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openPreview(page, "people=6&cards=6&phase=bidding");
  await page.getByRole("button", { name: "Predict 1 trick", exact: true }).click();
  await expect(page.getByRole("status", { name: "bot_1 predicts 1 trick" })).toBeVisible();
  await expect(page.getByRole("log", { name: "Game events" })).toContainText("You predicted 1");
  await checkLayout(page);
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
  await checkLayout(page);
});

test("mobile lobby settings and live header use the same compact layout", async ({
  page,
  browserName,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const safeArea = browserName === "chromium" ? await page.context().newCDPSession(page) : null;
  const portraitInsets = { top: 47, right: 0, bottom: 34, left: 0 };
  async function checkShellInsets(insets: typeof portraitInsets) {
    await page.evaluate(() => scrollTo(0, 0));
    const failures = await page.evaluate((insets) => {
      return [...document.querySelectorAll<HTMLElement>("a, button, input")].flatMap((element) => {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return [];
        const label = element.getAttribute("aria-label") ?? (element.id || element.textContent);
        if (rect.left < insets.left - 1 || rect.right > innerWidth - insets.right + 1)
          return [`Control outside horizontal safe area: ${label}`];
        if (element.closest("header") && rect.top < insets.top - 1)
          return [`Header control above safe area: ${label}`];
        return [];
      });
    }, insets);
    expect(failures).toEqual([]);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const bottomClear = await page.evaluate((bottom) => {
      const controls = [...document.querySelectorAll<HTMLElement>("a, button, input")];
      return controls.every(
        (element) => element.getBoundingClientRect().bottom <= innerHeight - bottom + 1,
      );
    }, insets.bottom);
    expect(bottomClear).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
  }
  if (safeArea) {
    await page.setViewportSize({ width: 393, height: 852 });
    await safeArea.send("Emulation.setSafeAreaInsetsOverride", { insets: portraitInsets });
  }
  const host = player("test-player-1", "bot_1", Date.now());
  const lobby = makeGame("WWWWWWWW", host, false);
  lobby.players.push(player("test-player-2", "bot_2", Date.now()));
  let state = view(lobby, host.id);
  await page.route("**/api/game", (route) => route.fulfill({ json: state }));
  await page.routeWebSocket("**/api/game/socket?*", (socket) => {
    socket.send(JSON.stringify({ type: "state", state }));
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as Command;
      if (message.action === "settings" && typeof message.startingLives === "number") {
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
  if (safeArea) {
    await checkShellInsets(portraitInsets);
    await attachScreenshot(page, testInfo, "home-safe-area");
  }
  await page.getByLabel("Display name").fill("bot_1");
  await page.getByRole("button", { name: "Create private lobby" }).click();
  await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
  if (safeArea) {
    const landscapeInsets = { top: 0, right: 44, bottom: 21, left: 44 };
    await page.setViewportSize({ width: 844, height: 390 });
    await safeArea.send("Emulation.setSafeAreaInsetsOverride", { insets: landscapeInsets });
    await checkShellInsets(landscapeInsets);
    await attachScreenshot(page, testInfo, "lobby-safe-area");
    await safeArea.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await page.setViewportSize({ width: 320, height: 568 });
  }
  await page.getByRole("slider", { name: "Starting lives" }).press("End");
  await expect.poll(() => lobby.startingLives).toBe(5);
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Round LXXXVIII" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy lobby invite" })).toContainText("WWWWWWWW");
  await checkLayout(page);
  await page.getByRole("banner").getByRole("button", { name: "Leave table", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Stay", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
});
