import { expect, test } from "vitest";
import { progression } from "../../src/shared/player-stats";

test("participation and wins advance levels at each 100 XP without a cap", () => {
  expect(progression(0, 0)).toEqual({ xp: 0, level: 1 });
  expect(progression(9, 0)).toEqual({ xp: 90, level: 1 });
  expect(progression(10, 0)).toEqual({ xp: 100, level: 2 });
  expect(progression(4, 3)).toEqual({ xp: 100, level: 2 });
  expect(progression(1_000_000, 500_000)).toEqual({ xp: 20_000_000, level: 200_001 });
});
