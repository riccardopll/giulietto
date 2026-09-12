import { expect, type Route } from "@playwright/test";
import { playCard, predict, start, synced, test, type Player } from "./helpers";

function predictions(players: Player[], eliminated: string) {
  const state = players[0].state!;
  const hands = state.order.map((id) => {
    const own = players.find((player) => player.state!.you === id)!.state!;
    return { id, cards: own.players.find((player) => player.id === id)!.hand as number[] };
  });
  const bids = new Map(hands.map(({ id }) => [id, 0]));
  // Plan against the dealt hands, playing each in order with Aces high. One wrong
  // prediction per round gives a repeatable two-round finish without seeded deals.
  for (let i = 0; i < state.count; i++) {
    const value = (card: number) => (card === 31 ? 41 : card);
    const winner = hands.reduce((a, b) => (value(a.cards[i]) > value(b.cards[i]) ? a : b));
    bids.set(winner.id, bids.get(winner.id)! + 1);
  }
  bids.set(eliminated, bids.get(eliminated) === 0 ? 1 : 0);
  return bids;
}

test("three players complete a game, including round results and elimination", async ({
  players,
}, testInfo) => {
  test.setTimeout(120_000);
  const slider = players[0].page.getByRole("slider", { name: "Starting lives" });
  expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await players[0].page.screenshot({ path: testInfo.outputPath("lobby.png"), fullPage: true });
  await players[0].page.getByRole("slider", { name: "Starting lives" }).press("Home");
  await synced(players, (state) => state.startingLives === 1);
  await start(players);
  await expect(
    players[0].page.getByRole("status", { name: "0 spectators", exact: true }),
  ).toHaveCount(0);
  await players[0].page.getByRole("button", { name: "Emotes", exact: true }).click();
  await players[0].page.getByRole("button", { name: "Send chicken emote" }).click();
  for (const { page } of players) {
    await expect(page.getByRole("status", { name: "bot_1 sent the chicken emote" })).toBeVisible();
  }
  await expect(players[0].page.getByRole("button", { name: "Emotes", exact: true })).toBeDisabled();
  await expect(
    players[1].page.getByRole("status", { name: "bot_1 sent the chicken emote" }),
  ).toBeHidden();
  await expect(players[0].page.getByRole("button", { name: "Emotes", exact: true })).toBeEnabled();
  const winner = players[0].state!.you;

  for (let round = 1; round <= 2; round++) {
    await synced(players, (state) => state.round === round && state.phase === "bidding");
    const state = players[0].state!;
    const bids = predictions(players, players[3 - round].state!.you);
    for (const id of state.order) await predict(players, bids.get(id)!, true);
    await synced(players, (state) => state.phase === "playing");
    for (let trick = 0; trick < state.count; trick++) {
      await synced(players, (state) => state.phase === "playing");
      for (let turn = 0; turn < state.order.length; turn++) await playCard(players);
      for (const { page } of players) {
        await expect(
          page.getByRole("region", { name: "Current trick", exact: true }).getByRole("img"),
        ).toHaveCount(state.order.length);
      }
    }
    await synced(players, (state) => state.phase === (round === 1 ? "results" : "finished"));
    for (const { page, state } of players) {
      await expect(page.getByRole("table").getByRole("row")).toHaveCount(4);
      expect(state!.players.filter((player) => player.lives > 0)).toHaveLength(3 - round);
      if (round === 1)
        await expect(page.getByRole("heading", { name: "Round results" })).toBeVisible();
    }
    if (round === 1) {
      await synced(players, (state) => state.round === 2 && state.phase === "bidding");
      await expect(players[2].page.getByRole("region", { name: "Spectator mode" })).toContainText(
        "You are spectating.",
      );
      await expect(
        players[2].page
          .getByRole("button", { name: /^Predict / })
          .and(players[2].page.locator(":enabled")),
      ).toHaveCount(0);
    }
  }

  await expect(
    players[0].page.getByRole("status", { name: "2 spectators", exact: true }),
  ).toBeVisible();
  await players[0].page.screenshot({ path: testInfo.outputPath("winner.png"), fullPage: true });
  for (const { page, state } of players) {
    expect(state!.winner).toBe(winner);
    await expect(
      page.getByRole("heading", {
        name: state!.you === winner ? "You win" : "bot_1 wins",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to tables", exact: true }).click();
    await expect(page.getByLabel("Display name")).toHaveValue(state!.viewerName);
  }
});

test("reloading and reconnecting during play restore the player and hand and allow the next move", async ({
  players,
}, testInfo) => {
  await start(players);
  for (let i = 0; i < 3; i++) await predict(players, 0);
  await playCard(players);
  const state = players[0].state!;
  const returning = players.find((player) => player.state!.you === state.order[state.turn])!;
  const before = returning.state!;
  const own = before.players.find((player) => player.id === before.you)!;
  const labels = await returning.page
    .getByRole("region", { name: "Your hand", exact: true })
    .getByRole("button")
    .evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label")));
  const pendingImages: Route[] = [];
  await returning.page.route("**/cards/neapolitan/*.webp", (route) => {
    pendingImages.push(route);
  });
  await returning.page.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        Reflect.set(window, "testSocket", this);
      }
    };
  });
  returning.state = undefined;
  await returning.page.route(
    "**/api/game",
    (route) => route.fulfill({ status: 503, body: "Temporarily unavailable" }),
    { times: 1 },
  );
  await returning.page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    returning.page.getByText("Could not reach the table. Please try again."),
  ).toBeVisible();
  expect(await returning.page.evaluate(() => localStorage.getItem("giulietto-room"))).toBe(
    before.code,
  );
  await returning.page.reload({ waitUntil: "domcontentloaded" });
  await synced(players, (state) => state.phase === "playing");
  expect(returning.state).toMatchObject({
    you: before.you,
    code: before.code,
    round: before.round,
    turn: before.turn,
    trick: before.trick,
  });
  expect(returning.state!.players.find((player) => player.id === before.you)).toMatchObject({
    name: own.name,
    hand: own.hand,
    bid: own.bid,
    taken: own.taken,
  });
  await expect(
    returning.page.getByRole("region", { name: "Your hand", exact: true }).getByRole("button"),
  ).toHaveCount(labels.length);
  expect(
    await returning.page
      .getByRole("region", { name: "Your hand", exact: true })
      .getByRole("button")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label"))),
  ).toEqual(labels);
  // All card faces and the back preload on resume, even though most are not on screen.
  await expect
    .poll(() => new Set(pendingImages.map((route) => route.request().url())).size)
    .toBe(41);
  const hand = returning.page.getByRole("region", { name: "Your hand", exact: true });
  const fallbacks = hand.locator(".card-fallback");
  for (let i = 0; i < own.hand.length; i++) {
    await expect(fallbacks.nth(i)).toBeVisible();
    await expect(fallbacks.nth(i)).toContainText(
      own.hand[i] === 31 ? "0 / 41" : String(own.hand[i]),
    );
    await expect(hand.locator(".card-art").nth(i)).toBeHidden();
  }
  await expect(returning.page.locator(".seat-hand .card-fallback").first()).toHaveText(
    "Hidden card",
  );
  await returning.page.screenshot({ path: testInfo.outputPath("cards-loading.png") });
  const failedPath = `/cards/neapolitan/${own.hand[0]}.webp`;
  await Promise.all(
    pendingImages.map((route) =>
      route.request().url().endsWith(failedPath) ? route.abort() : route.continue(),
    ),
  );
  await expect(fallbacks.first()).toBeVisible();
  await expect(hand.locator(".card-art").first()).toBeHidden();
  await expect(fallbacks.nth(1)).toBeHidden();
  await expect(hand.locator(".card-art").nth(1)).toBeVisible();
  await returning.page.unroute("**/cards/neapolitan/*.webp");
  const rejoin = returning.page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/game") &&
      request.method() === "POST" &&
      request.postDataJSON()?.action === "join",
  );
  returning.state = undefined;
  await returning.page.evaluate(() => {
    Reflect.get(window, "testSocket").close(4000, "Test connection loss");
  });
  expect((await rejoin).postDataJSON()).toMatchObject({
    action: "join",
    name: own.name,
    code: before.code,
  });
  await synced(players, (state) => state.phase === "playing");
  expect(returning.state).toMatchObject({
    you: before.you,
    round: before.round,
    turn: before.turn,
    trick: before.trick,
  });
  expect(returning.state!.players.find((player) => player.id === before.you)).toMatchObject({
    hand: own.hand,
    bid: own.bid,
    taken: own.taken,
  });
  const emoteMenu = returning.page.getByRole("button", { name: "Emotes", exact: true });
  const menuBefore = await emoteMenu.boundingBox();
  await playCard(players, true);
  expect(await emoteMenu.boundingBox()).toEqual(menuBefore);
  for (const { page } of players) {
    await expect(
      page.getByRole("region", { name: "Current trick", exact: true }).getByRole("img"),
    ).toHaveCount(2);
  }
});
