import { expect } from "@playwright/test";
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
];

for (const viewport of viewports) {
  test(`table and controls fit ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    for (const scenario of scenarios) {
      await test.step(scenario.name, async () => {
        await openPreview(page, `${scenario.query}&longNames=1`);
        await checkLayout(page);
        if (/people=6&cards=6&played=/.test(scenario.query))
          await attachScreenshot(page, testInfo, `six-players-${scenario.query.at(-1)}-played`);
      });
    }
  });
}

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
