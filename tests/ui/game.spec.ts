import { findPlayer } from "../../src/shared/game";
import { expect } from "@playwright/test";
import { playCard, predict, screenshot, start, synced, test, type Player } from "./helpers";

function predictions(players: Player[], eliminated: string) {
  const state = players[0].state!;
  const hands = state.order.map((id) => {
    const own = players.find((player) => player.state!.you === id)!.state!;
    return { id, cards: findPlayer(own, id)!.hand as number[] };
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
  await screenshot(players[0].page, testInfo, "lobby", { fullPage: true });
  await players[0].page.getByRole("slider", { name: "Starting lives" }).press("Home");
  await synced(players, (state) => state.startingLives === 1);
  const moveTime = players[0].page.getByRole("slider", { name: "Move time" });
  await expect(moveTime).toHaveValue("30");
  await expect(players[1].page.getByRole("slider", { name: "Move time" })).toBeDisabled();
  await moveTime.press("ArrowLeft");
  await synced(players, (state) => state.turnSeconds === 25);
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
  await players[0].page.getByRole("button", { name: "Chat", exact: true }).click();
  const hostChat = players[0].page.getByRole("dialog", { name: "Chat", exact: true });
  await expect(hostChat.getByRole("log", { name: "Messages" })).toContainText("No messages yet.");
  await hostChat.getByLabel("Message", { exact: true }).fill("good luck all");
  await hostChat.getByRole("button", { name: "Send message" }).click();
  await expect(hostChat.getByRole("log", { name: "Messages" })).toContainText("good luck all");
  await expect(hostChat.getByLabel("Message", { exact: true })).toHaveValue("");
  await players[1].page.getByRole("button", { name: "Chat, 1 unread", exact: true }).click();
  const guestChat = players[1].page.getByRole("dialog", { name: "Chat", exact: true });
  await expect(guestChat.getByRole("log", { name: "Messages" })).toContainText(
    "bot_1 good luck all",
  );
  await guestChat.getByLabel("Message", { exact: true }).fill("thanks");
  await guestChat.getByLabel("Message", { exact: true }).press("Enter");
  await expect(hostChat.getByRole("log", { name: "Messages" })).toContainText("bot_2 thanks");
  await guestChat.getByRole("button", { name: "Close chat" }).click();
  await expect(guestChat).toBeHidden();
  await expect(players[1].page.getByRole("button", { name: "Chat", exact: true })).toBeVisible();
  await players[0].page.keyboard.press("Escape");
  await expect(hostChat).toBeHidden();
  await expect(
    players[2].page.getByRole("button", { name: "Chat, 2 unread", exact: true }),
  ).toBeVisible();
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
      expect(state!.players.filter((player) => player.lives > 0)).toHaveLength(3 - round);
      if (round === 1) {
        await expect(page.getByRole("table").getByRole("row")).toHaveCount(4);
        await expect(page.getByRole("heading", { name: "Round results" })).toBeVisible();
      } else {
        await expect(page.getByLabel("First place", { exact: true })).toBeVisible();
        await expect(page.getByLabel("Second place", { exact: true })).toBeVisible();
        await expect(page.getByLabel("Third place", { exact: true })).toBeVisible();
      }
    }
    if (round === 1) {
      const page = players[0].page;
      const countdown = page.getByText(/^Next round in/);
      await expect(countdown).toHaveText("Next round in 8s");
      const bar = countdown.locator("..").locator("[aria-hidden='true'] > div");
      const width = () => bar.evaluate((element) => parseFloat(element.style.width));
      expect(await width()).toBeGreaterThan(85);
      await expect(countdown).toHaveText("Next round in 4s", { timeout: 5000 });
      expect(await width()).toBeGreaterThan(35);
      expect(await width()).toBeLessThanOrEqual(50);
      await synced(players, (state) => state.round === 2 && state.phase === "bidding");
      await expect(players[2].page.getByRole("region", { name: "Spectator mode" })).toBeVisible();
      await expect(
        players[2].page
          .getByRole("button", { name: /^Predict / })
          .and(players[2].page.locator(":enabled")),
      ).toHaveCount(0);
      await players[2].page.getByRole("button", { name: "Emotes", exact: true }).click();
      await players[2].page.getByRole("button", { name: "Send Perso emote" }).click();
      for (const { page } of players) {
        await expect(
          page.getByRole("status", { name: "bot_3 sent the perso emote" }),
        ).toBeVisible();
      }
      await players[2].page.getByRole("button", { name: "Chat, 2 unread", exact: true }).click();
      const spectatorChat = players[2].page.getByRole("dialog", { name: "Chat", exact: true });
      await expect(spectatorChat.getByRole("log", { name: "Messages" })).toContainText(
        "bot_2 thanks",
      );
      await spectatorChat.getByRole("button", { name: "Close chat" }).click();
      await expect(
        players[2].page.getByRole("button", { name: "Chat", exact: true }),
      ).toBeVisible();
    }
  }

  await expect(
    players[0].page.getByRole("status", { name: "2 spectators", exact: true }),
  ).toBeVisible();
  await screenshot(players[0].page, testInfo, "winner", { fullPage: true });
  const otherTab = await players[0].page.context().newPage();
  await otherTab.addInitScript(() => {
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        Reflect.set(window, "testSocket", this);
      }
    };
  });
  await otherTab.goto(players[0].page.url());
  await expect(otherTab.getByRole("heading", { name: "You win", exact: true })).toBeVisible();
  const finished = players.map((player) => player.state!);
  for (const [i, { page }] of players.entries()) {
    expect(finished[i].winner).toBe(winner);
    await expect(
      page.getByRole("heading", {
        name: finished[i].you === winner ? "You win" : "bot_1 wins",
        exact: true,
      }),
    ).toBeVisible();
  }

  // The winner opens a rematch lobby; one guest accepts the invite and the other stays.
  await players[0].page.getByRole("button", { name: "Rematch", exact: true }).click();
  await expect(players[0].page.getByRole("list", { name: "Players", exact: true })).toBeVisible();
  await expect.poll(() => players[0].state?.code).not.toBe(finished[0].code);
  const rematchCode = players[0].state!.code;
  await expect(players[0].page).toHaveURL(`/?table=${rematchCode}`);
  await expect(players[0].page.getByText("bot_1 (you)")).toBeVisible();
  const invites = players.map(({ page }) =>
    page.getByRole("status").filter({ hasText: "Rematch with bot_1?" }),
  );
  await expect(invites[1]).toBeVisible();
  await expect(invites[2]).toBeVisible();
  const expiry = invites[1].getByText(/^Expires in \d+s$/);
  await expect(expiry).toHaveText(/^Expires in (60|59|58)s$/);
  const expiryBar = expiry.locator("..").locator("[aria-hidden='true'] > div");
  expect(await expiryBar.evaluate((element) => parseFloat(element.style.width))).toBeGreaterThan(
    90,
  );
  await expect(invites[1]).toHaveCSS("opacity", "1");
  await screenshot(players[1].page, testInfo, "rematch-invite", { fullPage: true });
  await expect(otherTab.getByRole("button", { name: "Rematch", exact: true })).toBeDisabled();
  await expect(otherTab.getByText("Rematch with bot_1?")).toHaveCount(0);
  await invites[1].getByRole("button", { name: "Join", exact: true }).click();
  await synced(
    players.slice(0, 2),
    (state) => state.code === rematchCode && state.phase === "lobby" && state.players.length === 2,
  );
  await expect(players[1].page).toHaveURL(`/?table=${rematchCode}`);
  await expect(invites[1]).toBeHidden();
  await screenshot(players[1].page, testInfo, "rematch-lobby", { fullPage: true });
  await invites[2].getByRole("button", { name: "Decline", exact: true }).click();
  await expect(invites[2]).toBeHidden();
  await expect(
    players[2].page.getByRole("button", { name: "Rematch", exact: true }),
  ).toBeDisabled();

  for (const [i, { page }] of players.entries()) {
    const state = finished[i];
    if (i < 2) {
      await page.getByRole("button", { name: "Leave table", exact: true }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Leave table", exact: true })
        .click();
    } else await page.getByRole("button", { name: "Back to tables", exact: true }).click();
    await expect(page.getByRole("button", { name: "Open your profile" })).toHaveAttribute(
      "title",
      state.viewerName,
    );
    await expect(page).toHaveURL("/");
    expect(await page.evaluate(() => localStorage.getItem("giulietto-room"))).toBeNull();
    await page.getByRole("button", { name: "Open your profile" }).click();
    await expect(async () => {
      await page.reload();
      await expect(
        page.getByText(state.you === winner ? "30 / 100 XP" : "10 / 100 XP", { exact: true }),
      ).toBeVisible();
      await expect(
        page.locator("dl > div").filter({ hasText: "Average turn time" }).locator("dd"),
      ).toHaveText(/^\d+\.\d s$/);
    }).toPass();
    await screenshot(page, testInfo, `stats-${state.viewerName}`, { fullPage: true });
    await page.getByRole("button", { name: "Back to home" }).click();
    await page.getByRole("button", { name: "Leaderboard", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Leaderboard" })).toBeVisible();
    await screenshot(page, testInfo, `leaderboard-${state.viewerName}`, { fullPage: true });
    await page.getByRole("button", { name: "Back to home" }).click();
  }

  // Another open tab must not restore the saved table when its connection resumes.
  const resumed = otherTab
    .waitForEvent("websocket")
    .then((socket) => socket.waitForEvent("framereceived"));
  await otherTab.evaluate(() => {
    Reflect.get(window, "testSocket").close(4000, "Test connection loss");
  });
  await resumed;
  await players[0].page.reload();
  await expect(players[0].page.getByRole("button", { name: "Open your profile" })).toHaveAttribute(
    "title",
    "bot_1",
  );
  expect(await otherTab.evaluate(() => localStorage.getItem("giulietto-room"))).toBeNull();
  await otherTab.close();
});
