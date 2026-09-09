import { expect, type Page } from "@playwright/test";
import { attachScreenshot, checkLayout, openPreview, test } from "./helpers";

const viewports = [
  { width: 320, height: 568 },
  { width: 357, height: 774 },
  { width: 393, height: 852 },
  { width: 568, height: 320 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 800, height: 600 },
  { width: 800, height: 900 },
  { width: 912, height: 600 },
  { width: 1024, height: 600 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

// Cover the supported dimensions and dense game states without a Cartesian product.
const scenarios = [
  ...[2, 3, 4, 5, 6].flatMap((people) => [
    {
      name: `${people} players, six cards, full trick`,
      query: `people=${people}&cards=6&played=${people}`,
    },
    {
      name: `${people} players, revealed last cards`,
      query: `people=${people}&phase=blind&played=0`,
    },
  ]),
  {
    name: "two players, five cards, bidding",
    query: "people=2&cards=5&phase=bidding",
  },
  {
    name: "three players, two cards, empty trick",
    query: "people=3&cards=2&played=0",
  },
  {
    name: "four players, three cards, partial trick",
    query: "people=4&cards=3&played=2",
  },
  {
    name: "five players, four cards, partial trick",
    query: "people=5&cards=4&played=2",
  },
  {
    name: "six players predicting with six cards",
    query: "people=6&cards=6&phase=bidding",
  },
  {
    name: "six players predicting with one card",
    query: "people=6&cards=1&phase=bidding",
  },
  {
    name: "six players, revealed last cards, partial trick",
    query: "people=6&phase=blind&played=3",
  },
  {
    name: "six players, full blind trick",
    query: "people=6&phase=blind&played=6",
  },
  {
    name: "five active players and one eliminated seat, full trick",
    query: "people=6&cards=6&played=5&inactive=eliminated",
  },
  {
    name: "six players, six cards, empty trick",
    query: "people=6&cards=6&played=0",
  },
  {
    name: "six players, six cards, partial trick",
    query: "people=6&cards=6&played=3",
  },
  {
    name: "six players viewed from the last seat",
    query: "people=6&cards=6&played=3&viewer=5",
  },
  {
    name: "eliminated spectator, six cards",
    query: "people=6&cards=6&played=3&viewer=5&inactive=eliminated",
  },
  {
    name: "eliminated spectator, blind round",
    query: "people=6&phase=blind&played=0&viewer=5&inactive=eliminated",
  },
  {
    name: "departed spectator, blind round",
    query: "people=6&phase=blind&played=0&viewer=5&inactive=left",
  },
];

async function tableGeometry(page: Page) {
  return page.evaluate(() => {
    const bounds = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      table: Object.fromEntries(
        [".table-arena", ".table-surface", ".play-table"].map((selector) => [
          selector,
          bounds(document.querySelector(selector)!),
        ]),
      ),
      seats: Object.fromEntries(
        [...document.querySelectorAll<HTMLElement>("[data-seat]")].map((seat) => {
          const { x, y, width, height } = bounds(seat.querySelector(".seat-identity")!);
          return [
            seat.dataset.seat!,
            { centerX: x + width / 2, centerY: y + height / 2, width, height },
          ];
        }),
      ),
    };
  });
}

async function expectTableGeometry(
  page: Page,
  expected: Awaited<ReturnType<typeof tableGeometry>>,
  inactive = false,
) {
  const actual = await tableGeometry(page);
  for (const [selector, bounds] of Object.entries(expected.table)) {
    for (const key of ["x", "y", "width", "height"] as const)
      expect(
        Math.abs(actual.table[selector][key] - bounds[key]),
        `${selector} ${key}`,
      ).toBeLessThanOrEqual(0.5);
  }
  expect(Object.keys(actual.seats).sort()).toEqual(Object.keys(expected.seats).sort());
  for (const [id, bounds] of Object.entries(expected.seats)) {
    // Out/Left labels can widen a name; its seat must still stay in the same place.
    const keys = inactive
      ? (["centerX", "centerY", "height"] as const)
      : (["centerX", "centerY", "width", "height"] as const);
    for (const key of keys)
      expect(Math.abs(actual.seats[id][key] - bounds[key]), `${id} ${key}`).toBeLessThanOrEqual(
        0.5,
      );
  }
}

for (const viewport of viewports) {
  test(`table and controls fit ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const geometry = new Map<string, Awaited<ReturnType<typeof tableGeometry>>>();
    for (const scenario of scenarios) {
      await test.step(scenario.name, async () => {
        await openPreview(page, `${scenario.query}&longNames=1`);
        await checkLayout(page);
        const query = new URLSearchParams(scenario.query);
        const seating = `${query.get("people")}-${query.get("viewer") ?? "0"}`;
        const baseline = geometry.get(seating);
        if (baseline) await expectTableGeometry(page, baseline, query.has("inactive"));
        else geometry.set(seating, await tableGeometry(page));
        if (/people=6&cards=6&played=/.test(scenario.query))
          await attachScreenshot(page, testInfo, `six-players-${scenario.query.at(-1)}-played`);
      });
    }
  });
}

for (const viewport of [
  { width: 1366, height: 960 },
  { width: 1220, height: 1340 },
  { width: 1920, height: 1080 },
]) {
  test(`desktop game uses balanced vertical space at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    for (const people of [2, 4, 6]) {
      await test.step(`${people} players in normal and blind rounds`, async () => {
        let geometry: Awaited<ReturnType<typeof tableGeometry>> | undefined;
        for (const query of [
          `people=${people}&cards=6&played=${people}`,
          `people=${people}&phase=blind&played=0`,
        ]) {
          await openPreview(page, `${query}&longNames=1`);
          await checkLayout(page);
          if (geometry) await expectTableGeometry(page, geometry);
          else geometry = await tableGeometry(page);
          const spacing = await page.evaluate(() => {
            const board = document.querySelector(".match-board")!.getBoundingClientRect();
            const events = document.querySelector(".match-events")!.getBoundingClientRect();
            const hand = document.querySelector(".hand-area")!.getBoundingClientRect();
            return {
              events: events.height,
              above: events.top - board.top,
              below: board.bottom - hand.bottom,
            };
          });
          expect(
            spacing.events,
            "Notifications reserve at most three complete rows",
          ).toBeLessThanOrEqual(132.5);
          expect(
            Math.abs(spacing.above - spacing.below),
            "Spare space is balanced around the game",
          ).toBeLessThanOrEqual(1);
        }
      });
    }
  });
}

test("the table stays fixed through the blind round and the next six-card round", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await openPreview(page, "people=6&cards=1&phase=bidding&played=0&longNames=1");
  const geometry = await tableGeometry(page);
  const board = page.locator(".match-board");
  await expect(page.locator("header h2")).toHaveText("Round VI");

  for (let bid = 1; bid <= 6; bid++) {
    await page.keyboard.press("n");
    await expect(board).toHaveAttribute("data-phase", bid < 6 ? "bidding" : "playing");
    await expectTableGeometry(page, geometry);
    await checkLayout(page);
  }
  for (let played = 1; played <= 6; played++) {
    await page.keyboard.press("n");
    await expect(page.locator(".trick-cards .playing-card")).toHaveCount(played);
    await expectTableGeometry(page, geometry);
    await checkLayout(page);
  }
  await page.keyboard.press("n");
  await expect(page.getByRole("heading", { name: "Round results" })).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.locator("header h2")).toHaveText("Round VII");
  await expect(board).toHaveAttribute("data-phase", "bidding");
  await expect(page.locator(".hand .playing-card")).toHaveCount(6);
  await expectTableGeometry(page, geometry);
  await checkLayout(page);
  await expect(page.getByRole("dialog", { name: "Local preview" })).toBeHidden();
});

test("played and revealed cards are readable on phones and desktops", async ({ page }) => {
  for (const viewport of [
    { width: 393, height: 740 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    for (const people of [2, 3, 4, 5, 6]) {
      await test.step(`${people} players at ${viewport.width}×${viewport.height}`, async () => {
        for (const { query, selector, minimum } of [
          {
            query: `people=${people}&cards=6&played=${people}`,
            selector: ".trick-cards .playing-card",
            minimum: 56,
          },
          {
            query: `people=${people}&phase=blind&played=0`,
            selector: ".seat-hand[data-revealed] .playing-card",
            minimum: 48,
          },
        ]) {
          await openPreview(page, query);
          const widths = await page
            .locator(selector)
            .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().width));
          expect(widths.length).toBeGreaterThan(0);
          expect(Math.min(...widths)).toBeGreaterThanOrEqual(minimum - 0.5);
        }
      });
    }
  }
});

test("spectators and round results are readable on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const inactive of ["eliminated", "left"]) {
    await test.step(`${inactive} spectator`, async () => {
      await openPreview(page, `people=6&cards=6&played=3&viewer=5&inactive=${inactive}`);
      await checkLayout(page);
    });
  }
  await page.goto("/preview?people=6&cards=6&phase=results&longNames=1");
  await expect(page.getByRole("heading", { name: "Round results" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText("Next round in 12s")).toBeVisible();
});

test("table adapts to mobile browser chrome and orientation changes", async ({ page }) => {
  for (const query of ["people=6&cards=6&played=3", "people=6&phase=blind&played=3"]) {
    await page.setViewportSize({ width: 393, height: 740 });
    await openPreview(page, query);
    await checkLayout(page);
    await page.setViewportSize({ width: 393, height: 600 });
    await checkLayout(page);
    await page.setViewportSize({ width: 480, height: 568 });
    await checkLayout(page);
    await page.setViewportSize({ width: 768, height: 600 });
    await checkLayout(page);
    await page.setViewportSize({ width: 740, height: 393 });
    await checkLayout(page);
  }
});
