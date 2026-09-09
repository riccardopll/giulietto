import { expect, type Page } from "@playwright/test";
import type { PreviewSeatState } from "../../src/client/preview/games";
import {
  attachScreenshot,
  checkLayout,
  configurePreview,
  openPreview,
  test,
  type PreviewFixture,
  type TableGeometry,
} from "./helpers";

const viewports = [
  { width: 320, height: 568 },
  { width: 357, height: 774 },
  { width: 393, height: 852 },
  { width: 768, height: 1024 },
  { width: 800, height: 900 },
  { width: 1220, height: 1340 },
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
    query: "people=6&cards=6&played=5&seats=active,active,active,active,active,eliminated",
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
    query: "people=6&cards=6&played=3&viewer=5&seats=active,active,active,active,active,eliminated",
  },
  {
    name: "eliminated spectator, blind round",
    query:
      "people=6&phase=blind&played=0&viewer=5&seats=active,active,active,active,active,eliminated",
  },
  {
    name: "departed spectator, blind round",
    query: "people=6&phase=blind&played=0&viewer=5&seats=active,active,active,active,active,left",
  },
];

for (const viewport of viewports) {
  test(`table and controls fit ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const geometry = new Map<string, TableGeometry>();
    for (const scenario of scenarios) {
      await test.step(scenario.name, async () => {
        await openPreview(page, `${scenario.query}&longNames=1`);
        const query = new URLSearchParams(scenario.query);
        const seating = `${query.get("people")}-${query.get("viewer") ?? "0"}`;
        const baseline = geometry.get(seating);
        const current = await checkLayout(page, baseline);
        if (!baseline) geometry.set(seating, current);
        if (/people=6&cards=6&played=/.test(scenario.query))
          await attachScreenshot(page, testInfo, `six-players-${scenario.query.at(-1)}-played`);
      });
    }
  });
}

test("large portrait game starts below the header", async ({ page }) => {
  await page.setViewportSize({ width: 1220, height: 1340 });
  for (const people of [2, 4, 6]) {
    await test.step(`${people} players in normal and blind rounds`, async () => {
      let geometry: TableGeometry | undefined;
      for (const query of [
        `people=${people}&cards=6&played=${people}`,
        `people=${people}&phase=blind&played=0`,
      ]) {
        await openPreview(page, `${query}&longNames=1`);
        geometry = await checkLayout(page, geometry);
        const spacing = await page.evaluate(() => {
          const available = document.querySelector("main")!.getBoundingClientRect();
          const board = document.querySelector(".match-board")!.getBoundingClientRect();
          const events = document.querySelector(".match-events")!.getBoundingClientRect();
          return {
            events: events.height,
            boardOffset: board.top - available.top,
            eventsOffset: events.top - available.top,
          };
        });
        expect(
          spacing.events,
          "Notifications reserve at most three complete rows",
        ).toBeLessThanOrEqual(132.5);
        expect(
          Math.abs(spacing.boardOffset),
          "The board starts below the header",
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(spacing.eventsOffset),
          "Notifications start at the top of the game",
        ).toBeLessThanOrEqual(1);
      }
    });
  }
});

test("the table stays fixed through the blind round and the next six-card round", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await openPreview(page, "people=6&cards=1&phase=bidding&played=0&longNames=1");
  const geometry = await checkLayout(page);
  const board = page.locator(".match-board");
  await expect(page.locator("header h2")).toHaveText("Round VI");

  for (let bid = 1; bid <= 6; bid++) {
    await page.keyboard.press("n");
    await expect(board).toHaveAttribute("data-phase", bid < 6 ? "bidding" : "playing");
    await checkLayout(page, geometry);
  }
  for (let played = 1; played <= 6; played++) {
    await page.keyboard.press("n");
    await expect(page.locator(".trick-cards .playing-card")).toHaveCount(played);
    await checkLayout(page, geometry);
  }
  await page.keyboard.press("n");
  await expect(page.getByRole("heading", { name: "Round results" })).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.locator("header h2")).toHaveText("Round VII");
  await expect(board).toHaveAttribute("data-phase", "bidding");
  await expect(page.locator(".hand .playing-card")).toHaveCount(6);
  await checkLayout(page, geometry);
  await expect(page.getByRole("dialog", { name: "Local preview" })).toBeHidden();
});

test("played and revealed cards are readable in small and large portrait views", async ({
  page,
}) => {
  for (const viewport of [
    { width: 393, height: 740 },
    { width: 1220, height: 1340 },
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
      await openPreview(
        page,
        `people=6&cards=6&played=3&viewer=5&seats=active,active,active,active,active,${inactive}`,
      );
      await checkLayout(page);
    });
  }
  await page.goto("/preview?people=6&cards=6&phase=results&longNames=1");
  await expect(page.getByRole("heading", { name: "Round results" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText("Next round in 12s")).toBeVisible();
});

test("table adapts to browser chrome and portrait viewport resizing", async ({ page }) => {
  for (const query of ["people=6&cards=6&played=3", "people=6&phase=blind&played=3"]) {
    await page.setViewportSize({ width: 393, height: 740 });
    await openPreview(page, query);
    await checkLayout(page);
    await page.setViewportSize({ width: 393, height: 600 });
    await checkLayout(page);
    await page.setViewportSize({ width: 480, height: 568 });
    await checkLayout(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await checkLayout(page);
  }
});

// Full finite sweeps are opt-in because they inspect thousands of rendered states.
// Run LAYOUT_SWEEP=1 for all, or LAYOUT_SWEEP=rounds / seats / identities independently.
const sweep = process.env.CI ? undefined : process.env.LAYOUT_SWEEP;
if (sweep) test.use({ trace: "off" });
const sweepViewports = [
  { width: 320, height: 568 },
  { width: 393, height: 852 },
  { width: 800, height: 900 },
  { width: 1220, height: 1340 },
];

function* roundFixtures(people: number): Generator<PreviewFixture> {
  let index = 0;
  for (let cards = 1; cards <= 6; cards++) {
    for (let bids = 0; bids < people; bids++) {
      yield {
        people,
        cards,
        phase: "bidding",
        bids,
        longNames: true,
        viewer: index++ % people,
        startingLives: 5,
      };
    }
    for (let completedTricks = 0; completedTricks < cards; completedTricks++) {
      for (let played = 0; played <= people; played++) {
        yield {
          people,
          cards,
          phase: played === people ? "trick" : "playing",
          played,
          completedTricks,
          longNames: true,
          viewer: index++ % people,
          startingLives: 5,
        };
      }
    }
  }
}

function* seatPatterns(people: number): Generator<PreviewSeatState[]> {
  const states: PreviewSeatState[] = ["active", "eliminated", "left", "leaving"];
  for (let code = 0; code < states.length ** people; code++) {
    const pattern = Array.from(
      { length: people },
      (_, index) => states[Math.floor(code / states.length ** index) % states.length],
    );
    if (pattern.filter((state) => state === "active" || state === "leaving").length >= 2)
      yield pattern;
  }
}

function* seatFixtures(people: number): Generator<PreviewFixture> {
  let index = 0;
  for (const relativeSeats of seatPatterns(people)) {
    // Rotating the absolute fixture preserves each relative arrangement while exercising every viewer.
    const viewer = index++ % people;
    const seatStates = Array.from(
      { length: people },
      (_, seat) => relativeSeats[(seat - viewer + people) % people],
    );
    const active = seatStates.filter((state) => state === "active" || state === "leaving").length;
    const shared = { people, seatStates, viewer, startingLives: 5, longNames: true };
    yield { ...shared, cards: 6, phase: "trick", played: active };
    for (let played = 0; played <= active; played++)
      yield { ...shared, cards: 1, phase: "blind", played };
  }
}

function* identityFixtures(people: number): Generator<PreviewFixture> {
  for (let viewer = 0; viewer < people; viewer++) {
    for (let startingLives = 1; startingLives <= 5; startingLives++) {
      for (const longNames of [false, true]) {
        for (const cards of [1, 6])
          yield { people, viewer, startingLives, longNames, cards, phase: "bidding", bids: viewer };
      }
    }
  }
}

async function sweepFixtures(page: Page, fixtures: Iterable<PreviewFixture>) {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", {
      value: (values: Uint32Array) => values.fill(5),
    });
  });
  await openPreview(page, "people=6&cards=6&phase=playing&played=0");
  await page.evaluate(async () => {
    await Promise.all(
      Array.from({ length: 40 }, async (_, index) => {
        const image = new Image();
        image.src = `/cards/neapolitan/${index + 1}.webp`;
        await image.decode();
      }),
    );
  });
  const baselines = new Map<string, TableGeometry>();
  let checked = 0;
  for (const fixture of fixtures) {
    await test.step(JSON.stringify(fixture), async () => {
      await configurePreview(page, fixture);
      const key = `${fixture.people}-${fixture.viewer ?? 0}`;
      const geometry = await checkLayout(page, baselines.get(key));
      if (!baselines.has(key)) baselines.set(key, geometry);
      checked++;
    });
  }
  return checked;
}

function* boundaryFixtures(): Generator<PreviewFixture> {
  for (const people of [2, 6]) {
    const common = { people, longNames: true, startingLives: 5 };
    yield { ...common, cards: 6, phase: "bidding" };
    yield { ...common, cards: 6, phase: "trick" };
    yield { ...common, cards: 1, phase: "blind", played: 0 };
    yield { ...common, cards: 1, phase: "blind", played: people / 2 };
  }
}

// Viewport values include the shell's 8px gutters and 64px desktop header.
// Each threshold is exercised on both sides and exactly at the transition.
const boundaryViewports = [
  ...[335, 336, 337].map((width) => ({ width, height: 852 })), // 320px board text breakpoint
  ...[639, 640, 641].map((width) => ({ width, height: 900 })), // header and seat-number sizes
  ...[687, 688, 689].map((width) => ({ width, height: 900 })), // 672px identities
  ...[1039, 1040, 1041].map((width) => ({ width, height: 1340 })), // board maximum width
  ...[1031, 1032, 1033].map((height) => ({ width: 800, height })), // board maximum height
];

for (const viewport of boundaryViewports) {
  test(`layout fits responsive boundary ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const checked = await sweepFixtures(page, boundaryFixtures());
    testInfo.annotations.push({ type: "rendered-configurations", description: String(checked) });
  });
}

test("played cards fit both sides of the portrait row breakpoint", async ({ page }) => {
  const width = 393;
  await page.setViewportSize({ width, height: 568 });
  await openPreview(page, "people=6&cards=6&phase=trick&longNames=1");
  // Locate the one-row/two-row transition through the rendered grid.
  let low = 568;
  let high = 900;
  while (high - low > 1) {
    const height = Math.floor((low + high) / 2);
    await page.setViewportSize({ width, height });
    const rows = await page
      .locator(".trick-cards")
      .evaluate((trick) => Number(getComputedStyle(trick).getPropertyValue("--trick-rows")));
    if (rows === 1) low = height;
    else high = height;
  }
  for (const height of [low - 1, low, high]) {
    await page.setViewportSize({ width, height });
    await test.step(`${width}×${height}`, async () => {
      const baselines = new Map<number, TableGeometry>();
      for (const fixture of boundaryFixtures()) {
        await configurePreview(page, fixture);
        const geometry = await checkLayout(page, baselines.get(fixture.people));
        if (!baselines.has(fixture.people)) baselines.set(fixture.people, geometry);
      }
    });
  }
});

async function checkResultsLayout(page: Page, people: number) {
  await expect(page.getByRole("row")).toHaveCount(people + 1);
  await page.evaluate(() => document.fonts.ready);
  const failures = await page.evaluate(() => {
    const errors: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1)
      errors.push("Results cause horizontal page overflow");
    if (document.documentElement.scrollHeight > innerHeight + 1)
      errors.push("Results scroll the page instead of their panel");
    for (const element of document.querySelectorAll<HTMLElement>(
      "main h1, main th, main td, main button",
    )) {
      const box = element.getBoundingClientRect();
      if (box.left < -1 || box.right > innerWidth + 1)
        errors.push(`Results content outside viewport: ${element.textContent}`);
      const text = document.createRange();
      text.selectNodeContents(element);
      for (const line of text.getClientRects()) {
        if (
          line.left < box.left - 1 ||
          line.right > box.right + 1 ||
          line.top < box.top - 1 ||
          line.bottom > box.bottom + 1
        )
          errors.push(`Results text clipped: ${element.textContent}`);
      }
      if (element.scrollWidth > element.clientWidth + 1)
        errors.push(`Results cell overflows: ${element.textContent}`);
    }
    return errors;
  });
  expect(failures).toEqual([]);
  const back = page.getByRole("button", { name: "Back to tables", exact: true });
  const footer = (await back.count()) ? back : page.getByText("Next round in 12s", { exact: true });
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeInViewport();
  if (await back.count()) {
    const reachable = await back.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return box.width >= 44 && box.height >= 44 && hit !== null && button.contains(hit);
    });
    expect(reachable, "Back to tables is a reachable touch target").toBe(true);
  }
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 1220, height: 1340 },
]) {
  test(`result panels keep every player readable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      Object.defineProperty(crypto, "getRandomValues", {
        value: (values: Uint32Array) => values.fill(5),
      });
    });
    for (let people = 2; people <= 6; people++) {
      for (let startingLives = 1; startingLives <= 5; startingLives++) {
        await test.step(`${people} seats, ${startingLives} starting lives`, async () => {
          await page.goto(
            `/preview?people=${people}&cards=6&phase=results&startingLives=${startingLives}&longNames=1&viewer=${people - 1}`,
          );
          await expect(page.locator("main h1")).toBeVisible();
          await checkResultsLayout(page, people);
        });
      }
    }
    for (const viewer of [0, 1]) {
      await test.step(`finished game viewed from seat ${viewer + 1}`, async () => {
        await page.goto(
          `/preview?people=2&cards=1&phase=results&startingLives=1&longNames=1&viewer=${viewer}`,
        );
        await expect(page.getByText("Game over", { exact: true })).toBeVisible();
        await checkResultsLayout(page, 2);
      });
    }
  });

  test(`all supported round headings fit at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    const numerals = [
      "I",
      "II",
      "III",
      "IV",
      "V",
      "VI",
      "VII",
      "VIII",
      "IX",
      "X",
      "XI",
      "XII",
      "XIII",
      "XIV",
      "XV",
      "XVI",
      "XVII",
      "XVIII",
      "XIX",
      "XX",
      "XXI",
      "XXII",
      "XXIII",
      "XXIV",
      "XXV",
      "XXVI",
      "XXVII",
      "XXVIII",
      "XXIX",
    ];
    await page.setViewportSize(viewport);
    let baseline: TableGeometry | undefined;
    for (const [index, numeral] of numerals.entries()) {
      const cards = 6 - (index % 6);
      await openPreview(
        page,
        `people=6&cards=${cards}&phase=bidding&cycle=${Math.floor(index / 6)}&longNames=1`,
      );
      await expect(page.locator("header h2")).toHaveText(`Round ${numeral}`);
      const geometry = await checkLayout(page, baseline);
      baseline ??= geometry;
    }
  });
}

if (sweep)
  test.describe("finite layout permutations", () => {
    for (const [kind, fixtures, viewports] of [
      ["rounds", roundFixtures, sweepViewports],
      ["identities", identityFixtures, sweepViewports],
      ["seats", seatFixtures, [sweepViewports[0], sweepViewports[3]]],
    ] as const) {
      if (sweep !== "1" && sweep !== kind) continue;
      for (const viewport of viewports) {
        for (let people = 2; people <= 6; people++) {
          // Bound each browser context's lifetime so the large seat sweep stays fast.
          const configurations = Array.from(fixtures(people));
          const batchSize = 1000;
          for (let start = 0; start < configurations.length; start += batchSize) {
            const end = Math.min(start + batchSize, configurations.length);
            test(`sweep ${kind}: ${people} seats at ${viewport.width}×${viewport.height}, fixtures ${start + 1}–${end} of ${configurations.length}`, async ({
              page,
            }, testInfo) => {
              test.setTimeout(5 * 60_000);
              await page.setViewportSize(viewport);
              const checked = await sweepFixtures(page, configurations.slice(start, end));
              testInfo.annotations.push({
                type: "rendered-configurations",
                description: String(checked),
              });
            });
          }
        }
      }
    }
  });
