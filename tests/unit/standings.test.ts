import { expect, it } from "vitest";
import { standings } from "../../src/client/standings";

it("ranks by elimination round and shares places without breaking ties", () => {
  const players = [
    { id: "early", eliminatedRound: 2 },
    { id: "second-a", eliminatedRound: 8 },
    { id: "winner" },
    { id: "second-b", eliminatedRound: 8 },
    { id: "last", eliminatedRound: 1 },
  ];
  expect(
    standings(players, "winner").map(({ place, players }) => ({
      place,
      ids: players.map((p) => p.id),
    })),
  ).toEqual([
    { place: 1, ids: ["winner"] },
    { place: 2, ids: ["second-a", "second-b"] },
    { place: 4, ids: ["early"] },
    { place: 5, ids: ["last"] },
  ]);
});
