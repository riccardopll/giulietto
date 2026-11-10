import { expect } from "@playwright/test";
import { cardLabel } from "../../src/client/i18n";
import { observe, predict, screenshot, start, synced, test } from "./helpers";

test("a late spectator sees every hand while players see only their own", async ({
  players,
  browser,
  baseURL,
  viewport,
  reducedMotion,
}, testInfo) => {
  await start(players);
  const code = players[0].state!.code;
  const context = await browser.newContext({ baseURL, viewport, reducedMotion });
  try {
    await context.addCookies([{ name: "giulietto-name", value: "bot_4", url: baseURL }]);
    const watcher = observe(await context.newPage());
    await watcher.page.goto(`/?table=${code.toLowerCase()}`);
    await expect(
      watcher.page.getByRole("status", { name: "Spectating", exact: true }),
    ).toBeVisible();
    await expect.poll(() => watcher.state?.openHands).toBe(true);
    expect(watcher.state).toMatchObject({ spectating: true, viewerName: "bot_4" });
    await synced(players, (state) => state.spectatorCount === 1);

    const hands = watcher.page.getByRole("region", { name: "Spectator mode", exact: true });
    await expect(hands.getByRole("group")).toHaveCount(3);
    await expect(hands.getByRole("img", { name: "Hidden card", exact: true })).toHaveCount(0);
    for (const player of players) {
      const state = player.state!;
      const own = state.players.find((seat) => seat.id === state.you)!;
      expect(state.openHands).toBe(false);
      expect(
        state.players.every((seat) => seat.id === state.you || seat.hand.every((card) => !card)),
      ).toBe(true);
      const hand = hands.getByRole("group", { name: `${own.name}'s hand`, exact: true });
      await expect(hand).toContainText(own.name);
      await expect
        .poll(() =>
          hand.getByRole("img").evaluateAll((cards) => cards.map((card) => card.ariaLabel)),
        )
        .toEqual(own.hand.map((card) => expect.stringContaining(cardLabel(card!))));
      await expect(
        player.page.getByRole("status", { name: "Spectating", exact: true }),
      ).toHaveCount(0);
      await expect(
        player.page
          .getByRole("region", { name: "Game table", exact: true })
          .getByRole("img", { name: "Hidden card", exact: true }),
      ).toHaveCount(12);
    }
    await expect(watcher.page.getByRole("button", { name: /^Play / })).toHaveCount(0);
    await expect(
      watcher.page.getByRole("button", { name: /^Predict / }).and(watcher.page.locator(":enabled")),
    ).toHaveCount(0);
    const box = (await hands.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport!.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport!.height);

    await predict(players, 0);
    await expect.poll(() => watcher.state?.players.filter((seat) => seat.bid === 0).length).toBe(1);
    expect(watcher.state!.players.every((seat) => seat.hand.every((card) => card !== null))).toBe(
      true,
    );
    await screenshot(watcher.page, testInfo, "spectator-open-hands");
  } finally {
    await context.close();
  }
});
