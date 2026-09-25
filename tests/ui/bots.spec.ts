import { expect } from "@playwright/test";
import { observe, rename, screenshot, test } from "./helpers";

test("a host fills seats with bots and plays against them online", async ({ page }, testInfo) => {
  const host = observe(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Create private lobby", exact: true }).click();
  await expect(page.getByRole("list", { name: "Players", exact: true })).toBeVisible();
  await rename(page, "bot_1");
  const add = page.getByRole("button", { name: "Add bot", exact: true });
  await expect(add).toHaveCount(5);
  await add.first().click();
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(1);
  await page.getByRole("button", { name: /^Remove / }).click();
  await expect(add).toHaveCount(5);
  for (let i = 0; i < 2; i++) {
    await add.first().click();
    await expect(add).toHaveCount(4 - i);
  }
  await page.reload();
  await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  await expect(page.getByText("Connecting…", { exact: true })).toBeHidden();
  await screenshot(page, testInfo, "bot-lobby", { fullPage: true });
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect.poll(() => host.state?.legalBids.length).toBeGreaterThan(0);
  const bid = host.state!.legalBids[0];
  const prediction = page.getByRole("button", {
    name: `Predict ${bid} ${bid === 1 ? "trick" : "tricks"}`,
    exact: true,
  });
  await expect(prediction).toBeEnabled();
  await prediction.click();
  await expect.poll(() => host.state?.phase).toBe("playing");
  expect(
    host.state!.players.filter((player) => player.bot).every((player) => player.bid !== null),
  ).toBe(true);
  const card = page
    .getByRole("region", { name: "Your hand", exact: true })
    .getByRole("button")
    .first();
  await expect(card).toBeEnabled();
  const ace = host.state!.players.find((player) => player.id === host.state!.you)!.hand[0] === 31;
  await card.click();
  if (ace) await page.getByRole("button", { name: "High · 41", exact: true }).click();
  await expect
    .poll(() => host.state?.played.filter((play) => play.player !== host.state!.you).length)
    .toBe(2);
  expect(
    host.state!.players.filter((player) => player.bot).every((player) => player.connected),
  ).toBe(true);
  await screenshot(page, testInfo, "bot-table");
});
