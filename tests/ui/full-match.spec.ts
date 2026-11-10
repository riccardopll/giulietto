import { writeFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { AUTO_PLAY_MS, findPlayer, strength, type GameView } from "../../src/shared/game";
import {
  chooseHighAce,
  current,
  playCard,
  predict,
  screenshot,
  start,
  synced,
  test,
  type Player,
} from "./helpers";

function playOrders(players: Player[]) {
  const state = players[0].state!;
  return new Map(
    state.order.map((id) => {
      const viewer = players.find(
        (player) => (player.state!.you === id) === state.count > 1,
      )!.state!;
      const hand = findPlayer(viewer, id)!.hand as number[];
      return [id, [...hand.filter((card) => card !== 31), ...hand.filter((card) => card === 31)]];
    }),
  );
}

function tricksWon(orders: Map<string, number[]>, count: number) {
  const won = new Map(Array.from(orders.keys(), (id) => [id, 0]));
  const value = (cards: number[], trick: number) =>
    strength({ player: "", card: cards[trick], mode: "high" });
  for (let trick = 0; trick < count; trick++) {
    const [winner] = [...orders].reduce((best, entry) =>
      value(best[1], trick) > value(entry[1], trick) ? best : entry,
    );
    won.set(winner, won.get(winner)! + 1);
  }
  return won;
}

function predictions(won: Map<string, number>, count: number, missing: string[], spare: string) {
  const bids = new Map(won);
  const miss = (id: string) => bids.set(id, won.get(id)! > 0 ? won.get(id)! - 1 : 1);
  missing.forEach(miss);
  if (Array.from(bids.values()).reduce((sum, bid) => sum + bid) === count) miss(spare);
  return bids;
}

function roundPlays(states: GameView[], round: number) {
  const revisions = new Map(
    states.filter((state) => state.round === round).map((state) => [state.revision, state]),
  );
  const frames = Array.from(revisions.values()).sort((a, b) => a.revision - b.revision);
  const plays = [];
  let turnStart = 0;
  for (let i = 1; i < frames.length; i++) {
    const before = frames[i - 1];
    const after = frames[i];
    expect(after.revision).toBe(before.revision + 1);
    const added = after.played.length - before.played.length;
    expect(added).toBeLessThanOrEqual(1);
    if (added === 1) {
      const actor = before.order[before.turn];
      const move = after.played.at(-1)!;
      const left = findPlayer(before, actor)!.hand.length;
      const table = before.turnMs === AUTO_PLAY_MS;
      const afterMs = after.serverTime - turnStart;
      expect(before.phase).toBe("playing");
      expect(move.player).toBe(actor);
      expect(findPlayer(after, actor)!.hand).toHaveLength(left - 1);
      expect(table).toBe(left === 1 && move.card !== 31);
      if (table) {
        expect(afterMs).toBeGreaterThanOrEqual(AUTO_PLAY_MS - 50);
        expect(afterMs).toBeLessThan(AUTO_PLAY_MS + 1500);
      } else expect(before.turnMs).toBe(before.turnSeconds * 1000);
      plays.push({ ...move, player: findPlayer(after, actor)!.name, id: actor, table, afterMs });
    }
    if (after.phase === "playing" && (added === 1 || before.phase !== "playing"))
      turnStart = after.serverTime;
  }
  return plays;
}

test("three players play every hand size while the table plays each last card", async ({
  players,
}, testInfo) => {
  test.setTimeout(300_000);
  await start(players);
  const ids = players.map((player) => player.state!.you);
  const [winner, first, second] = ids;
  const missing = [[first], [second], [first], [second], [winner], [first, second]];
  const lives = new Map(ids.map((id) => [id, 3]));
  const shots = new Set<string>();
  const log = [];
  const ace = (page: Player["page"]) =>
    page.getByRole("dialog", { name: "Ace of Coins", exact: true });

  for (let round = 1; round <= 6; round++) {
    await synced(players, (state) => state.round === round && state.phase === "bidding");
    const state = players[0].state!;
    const count = state.count;
    expect(count).toBe(7 - round);
    const orders = playOrders(players);
    const won = tricksWon(orders, count);
    const bids = predictions(won, count, missing[round - 1], winner);
    const sent = players.map((player) => player.sentPlays);
    for (const id of state.order) {
      expect(current(players).state!.you).toBe(id);
      await predict(players, bids.get(id)!);
    }

    for (let trick = 0; trick < count - 1; trick++) {
      await synced(players, (state) => state.phase === "playing");
      for (let turn = 0; turn < state.order.length; turn++)
        await playCard(players, false, orders.get(current(players).state!.you)![trick]);
    }
    await synced(players, (state) => state.phase === "playing");
    const over = () => players.every((player) => player.state!.phase !== "playing");
    const chooser = () => players.find((player) => player.state!.canChooseAce);
    const shot = async (name: string, page: Player["page"]) => {
      if (shots.has(name)) return;
      shots.add(name);
      await screenshot(page, testInfo, name);
    };
    if (count === 1) await shot("one-card-round", players[0].page);
    await expect
      .poll(() => over() || !!chooser() || players[0].state!.trick.length > 0, {
        timeout: 20_000,
        intervals: [50],
      })
      .toBe(true);
    if (count > 1 && !over() && !chooser()) await shot("last-card-autoplay", current(players).page);
    await expect.poll(() => over() || !!chooser(), { timeout: 20_000, intervals: [50] }).toBe(true);
    const choosing = chooser();
    if (choosing) {
      await expect(ace(choosing.page)).toBeVisible();
      await shot(count === 1 ? "ace-one-card-round" : "ace-last-card", choosing.page);
      await chooseHighAce(choosing.page);
    }
    await synced(players, (state) => state.phase !== "playing");
    for (const { page } of players) await expect(ace(page)).toBeHidden();
    await synced(
      players,
      (state) => state.round === round && ["results", "finished"].includes(state.phase),
    );

    const plays = roundPlays(players[0].states, round);
    const final = players[0].state!;
    expect(final.played).toHaveLength(count * ids.length);
    expect(new Set(final.played.map((play) => play.card)).size).toBe(final.played.length);
    expect(plays.map(({ id, card }) => `${id}:${card}`)).toEqual(
      final.played.map(({ player, card }) => `${player}:${card}`),
    );
    for (const [seat, id] of ids.entries()) {
      const mine = plays.filter((play) => play.id === id);
      const tabled = mine.filter((play) => play.table);
      expect(mine.map((play) => play.card)).toEqual(orders.get(id));
      expect(tabled).toHaveLength(orders.get(id)!.at(-1) === 31 ? 0 : 1);
      expect(tabled.every((play) => play === mine.at(-1))).toBe(true);
      expect(players[seat].sentPlays - sent[seat]).toBe(count - tabled.length);
      const result = final.results.find((entry) => entry.id === id)!;
      const lost = Math.abs(won.get(id)! - bids.get(id)!);
      lives.set(id, lives.get(id)! - lost);
      expect(result).toMatchObject({
        bid: bids.get(id),
        taken: won.get(id),
        lost,
        lives: lives.get(id),
      });
    }
    if (round < 6) {
      const page = players[0].page;
      await expect(page.getByRole("heading", { name: "Round results" })).toBeVisible();
      for (const player of final.players) {
        const left = lives.get(player.id)!;
        await expect(
          page
            .getByRole("row")
            .filter({ hasText: player.name })
            .getByLabel(left === 1 ? "1 life" : `${left} lives`, { exact: true }),
        ).toBeVisible();
      }
    }
    log.push({
      round,
      cards: count,
      order: state.order.map((id) => findPlayer(state, id)!.name),
      hands: Object.fromEntries(
        Array.from(orders, ([id, cards]) => [findPlayer(state, id)!.name, cards]),
      ),
      plays: plays.map(({ player, card, mode, table, afterMs }) => ({
        player,
        card,
        ...(mode ? { mode } : {}),
        by: table ? "table" : "player",
        afterMs,
      })),
      results: final.results.map(({ name, bid, taken, lost, lives }) => ({
        name,
        bid,
        taken,
        lost,
        lives,
      })),
    });
  }

  const path = testInfo.outputPath("match.json");
  writeFileSync(path, JSON.stringify(log, null, 2));
  await testInfo.attach("match", { path, contentType: "application/json" });
  expect(ids.map((id) => lives.get(id)! > 0)).toEqual([true, false, false]);
  for (const { page, state } of players) {
    expect(state).toMatchObject({ phase: "finished", winner, round: 6 });
    await expect(
      page.getByRole("heading", {
        name: state!.you === winner ? "You win" : "bot_1 wins",
        exact: true,
      }),
    ).toBeVisible();
  }
  await expect(players[0].page.getByLabel("First place", { exact: true })).toBeVisible();
  await screenshot(players[0].page, testInfo, "final-results", { fullPage: true });
});
