import { findPlayer } from "../../src/shared/game";
import { expect } from "@playwright/test";
import { playCard, predict, start, synced, test } from "./helpers";

test("reloading and reconnecting during play restore the player and hand and allow the next move", async ({
  players,
}) => {
  await start(players);
  for (let i = 0; i < 3; i++) await predict(players, 0);
  await playCard(players);
  const state = players[0].state!;
  const returning = players.find((player) => player.state!.you === state.order[state.turn])!;
  const before = returning.state!;
  const own = findPlayer(before, before.you)!;
  const hand = returning.page.getByRole("region", { name: "Your hand", exact: true });
  const labels = () =>
    hand
      .getByRole("button")
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label")));
  const dealt = await labels();
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
  expect(findPlayer(returning.state!, before.you)).toMatchObject({
    name: own.name,
    hand: own.hand,
    bid: own.bid,
    taken: own.taken,
  });
  await expect(hand.getByRole("button")).toHaveCount(dealt.length);
  expect(await labels()).toEqual(dealt);

  const joins: string[] = [];
  returning.page.on("request", (request) => {
    if (request.method() === "POST" && request.postDataJSON()?.action === "join")
      joins.push(request.url());
  });
  const reconnected = returning.page.waitForEvent("websocket");
  returning.state = undefined;
  await returning.page.evaluate(() => {
    Reflect.get(window, "testSocket").close(4000, "Test connection loss");
  });
  expect((await reconnected).url()).toContain(`/api/game/socket?code=${before.code}`);
  await synced(players, (state) => state.phase === "playing");
  expect(joins).toEqual([]);
  expect(returning.state).toMatchObject({
    you: before.you,
    round: before.round,
    turn: before.turn,
    trick: before.trick,
  });
  expect(findPlayer(returning.state!, before.you)).toMatchObject({
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

  await returning.page.getByRole("button", { name: "Leave table", exact: true }).click();
  const confirmation = returning.page.getByRole("alertdialog");
  await expect(confirmation).toContainText("You can rejoin as a spectator.");
  let leaveCommandId: string | undefined;
  await returning.page.route(
    "**/api/game",
    (route) => {
      leaveCommandId = route.request().postDataJSON().commandId;
      return route.fulfill({ status: 503, json: { error: "Could not leave the table." } });
    },
    { times: 1 },
  );
  await confirmation.getByRole("button", { name: "Leave table", exact: true }).click();
  await expect(returning.page.getByText("Could not leave the table.")).toBeVisible();
  expect(await returning.page.evaluate(() => localStorage.getItem("giulietto-room"))).toBe(
    before.code,
  );
  expect(findPlayer(returning.state!, before.you)?.forfeited).not.toBe(true);
  const retry = returning.page.waitForRequest(
    (request) => request.method() === "POST" && request.postDataJSON()?.action === "leave",
  );
  await returning.page.getByRole("button", { name: "Retry", exact: true }).click();
  expect((await retry).postDataJSON().commandId).toBe(leaveCommandId);
  await expect(returning.page.getByRole("button", { name: "Open your profile" })).toBeVisible();
  await synced(
    players.filter((player) => player !== returning),
    (state) => !!findPlayer(state, before.you)?.forfeited,
  );
  returning.state = undefined;
  await returning.page.goto(`/?table=${before.code}`);
  await expect.poll(() => returning.state?.spectating).toBe(true);
  expect(findPlayer(returning.state!, before.you)).toMatchObject({ lives: 0, forfeited: true });
  await expect(returning.page.getByRole("region", { name: "Your hand", exact: true })).toBeHidden();
});
