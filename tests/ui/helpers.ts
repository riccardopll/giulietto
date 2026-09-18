import { expect, test as base, type Page, type TestInfo } from "@playwright/test";
import type { GameView } from "../../src/shared/game";

export type Player = { page: Page; state?: GameView };

export function observe(page: Page): Player {
  const player: Player = { page };
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      if (String(payload) === "pong") return;
      const message = JSON.parse(String(payload));
      if (message.state?.you) player.state = message.state;
    });
  });
  return player;
}

export async function rename(page: Page, name: string) {
  await page.getByRole("button", { name: "Edit your name", exact: true }).click();
  await page.getByLabel("New name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit your name" })).toBeHidden();
}

export async function screenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: Parameters<Page["screenshot"]>[0] = {},
) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, ...options });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

export const test = base.extend<{ players: Player[] }>({
  players: async ({ page: hostPage, browser, baseURL, viewport, reducedMotion }, use) => {
    const players: Player[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        const page =
          i === 0
            ? hostPage
            : await (await browser.newContext({ baseURL, viewport, reducedMotion })).newPage();
        const player = observe(page);
        players.push(player);
        if (i === 0) {
          await page.goto("/");
          await page.getByRole("button", { name: "Create private lobby", exact: true }).click();
        } else {
          await page.goto(`/?table=${players[0].state!.code.toLowerCase()}`);
        }
        await expect(page.getByRole("list", { name: "Players", exact: true })).toBeVisible();
        await expect.poll(() => player.state?.phase).toBe("lobby");
        await expect(page.getByRole("button", { name: "Edit your name", exact: true })).toHaveCount(
          1,
        );
        await rename(page, `bot_${i + 1}`);
        await expect.poll(() => player.state?.viewerName).toBe(`bot_${i + 1}`);
      }
      await synced(players, (state) => state.players.length === 3);
      await use(players);
    } finally {
      for (const player of players.slice(1)) await player.page.context().close();
    }
  },
});

export async function synced(players: Player[], ready: (state: GameView) => boolean) {
  await expect
    .poll(() => players.every((player) => player.state && ready(player.state)), {
      timeout: 20_000,
      intervals: [50, 100, 250],
    })
    .toBe(true);
}

export async function start(players: Player[]) {
  await players[0].page.getByRole("button", { name: "Start game", exact: true }).click();
  await synced(players, (state) => state.phase === "bidding");
  for (const { page } of players) {
    await expect(page.getByRole("heading", { name: "Round I", exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Your hand", exact: true }).getByRole("button"),
    ).toHaveCount(6);
  }
}

function current(players: Player[]) {
  const state = players[0].state!;
  return players.find((player) => player.state!.you === state.order[state.turn])!;
}

export async function predict(players: Player[], bid: number, keyboard = false) {
  const { page, state } = current(players);
  const button = page.getByRole("button", {
    name: `Predict ${bid} ${bid === 1 ? "trick" : "tricks"}`,
    exact: true,
  });
  await expect(button).toBeEnabled();
  if (keyboard) {
    await button.focus();
    await button.press("Enter");
  } else await button.click();
  await synced(
    players,
    (next) =>
      next.revision > state!.revision && next.players.find((p) => p.id === state!.you)?.bid === bid,
  );
}

export async function playCard(players: Player[], keyboard = false) {
  const { page, state } = current(players);
  const hand = page.getByRole("region", { name: "Your hand", exact: true });
  const before = state!.players.find((p) => p.id === state!.you)!;
  const card = before.hand[0];
  const button = hand.getByRole("button").first();
  await expect(button).toBeEnabled();
  if (keyboard) {
    await button.focus();
    await button.press("Enter");
  } else await button.click();
  if (state!.canChooseAce && (card === 31 || card === null)) {
    const dialog = page.getByRole("dialog", { name: "Ace of Coins", exact: true });
    await expect(dialog.locator('img[src="/cards/neapolitan/31.webp"]')).toHaveCount(2);
    const low = dialog.getByRole("button", { name: "Low · 0", exact: true });
    const high = dialog.getByRole("button", { name: "High · 41", exact: true });
    await expect(low).toBeFocused();
    if (keyboard) {
      await page.keyboard.press("Tab");
      await expect(high).toBeFocused();
      await page.keyboard.press("Enter");
    } else await high.click();
  }
  await synced(
    players,
    (next) =>
      next.revision > state!.revision && next.trick.some((play) => play.player === state!.you),
  );
  await expect(hand.getByRole("button")).toHaveCount(before.hand.length - 1);
}
