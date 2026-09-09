import { expect } from "@playwright/test";
import { attachScreenshot, checkLayout, openPreview, test } from "./helpers";

const viewports = [
  { width: 320, height: 568 },
  { width: 393, height: 852 },
  { width: 568, height: 320 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 800, height: 900 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

// Cover the supported dimensions and dense game states without a Cartesian product.
const scenarios = [
  { name: "two players, blind round", query: "people=2&phase=blind&played=0" },
  {
    name: "three players, two cards, empty trick",
    query: "people=3&cards=2&played=0",
  },
  {
    name: "four players, three cards, partial trick",
    query: "people=4&cards=3&played=2",
  },
  {
    name: "five players, four cards, full trick",
    query: "people=5&cards=4&played=5",
  },
  {
    name: "six players predicting with five cards",
    query: "people=6&cards=5&phase=bidding",
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
    name: "six players, six cards, full trick",
    query: "people=6&cards=6&played=6",
  },
  {
    name: "six players, visible blind cards",
    query: "people=6&phase=blind&played=0",
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

test("spectators and round results are readable on a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const inactive of ["eliminated", "left"]) {
    await test.step(`${inactive} spectator`, async () => {
      await openPreview(page, `people=6&cards=6&played=3&viewer=5&inactive=${inactive}`);
      await checkLayout(page);
      await expect(page.getByText("Watching · you return if everyone is out")).toBeVisible();
    });
  }
  await page.goto("/preview?people=6&cards=6&phase=results&longNames=1");
  await expect(page.getByRole("heading", { name: "Round results" })).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByText("Next round in 12s")).toBeVisible();
});

test("table adapts to mobile browser chrome and orientation changes", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 740 });
  await openPreview(page, "people=6&cards=6&played=3");
  await checkLayout(page);
  await page.setViewportSize({ width: 393, height: 600 });
  await checkLayout(page);
  await page.setViewportSize({ width: 740, height: 393 });
  await checkLayout(page);
});
