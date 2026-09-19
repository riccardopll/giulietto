import { expect } from "@playwright/test";
import { screenshot, test } from "./helpers";

test("six players and full hands fit the smallest supported phone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goto("/preview?people=6&cards=6&phase=bidding&longNames=1");
  await expect(page.locator("[data-seat]")).toHaveCount(6);
  await expect(
    page.getByRole("region", { name: "Your hand", exact: true }).getByRole("button"),
  ).toHaveCount(6);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  // Container-query size transitions can outlast font and image loading.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const errors: string[] = [];
        if (
          document.documentElement.scrollWidth > innerWidth ||
          document.documentElement.scrollHeight > innerHeight
        )
          errors.push("Page overflows the viewport");
        for (const element of document.querySelectorAll<HTMLElement>(
          ".seat-identity, .seat-avatar, .playing-card, header, button",
        )) {
          const rect = element.getBoundingClientRect();
          const label = element.getAttribute("aria-label") ?? element.className;
          if (
            rect.left < -1 ||
            rect.top < -1 ||
            rect.right > innerWidth + 1 ||
            rect.bottom > innerHeight + 1
          )
            errors.push(`Outside viewport: ${label}`);
          if (element.matches("button:enabled")) {
            if (rect.width < 44 || rect.height < 44) errors.push(`Small touch target: ${label}`);
            if (
              !element.contains(
                document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
              )
            )
              errors.push(`Covered control: ${label}`);
          }
        }
        return errors;
      }),
    )
    .toEqual([]);
  await screenshot(page, testInfo, "bidding");
  const overlappingProfiles = await page.locator(".seat-profile").evaluateAll(
    (profiles) =>
      profiles.filter((profile) => {
        const avatar = profile.querySelector(".seat-avatar")!.getBoundingClientRect();
        const details = profile.querySelector(".seat-details")!.getBoundingClientRect();
        return avatar.right + 3 > details.left;
      }).length,
  );
  expect(overlappingProfiles).toBe(0);
  const spectators = page.getByRole("status", { name: "1 spectator", exact: true });
  await expect(spectators).toBeVisible();
  const title = await page.getByRole("heading", { name: "Round I", exact: true }).boundingBox();
  const spectatorBounds = await spectators.boundingBox();
  const copyBounds = await page.getByRole("button", { name: "Copy lobby invite" }).boundingBox();
  expect(spectatorBounds!.x).toBeGreaterThan(title!.x + title!.width);
  expect(spectatorBounds!.x + spectatorBounds!.width).toBeLessThanOrEqual(copyBounds!.x);

  await page.getByRole("button", { name: "Predict 0 tricks", exact: true }).click();
  await expect(page.locator("[data-seat][data-you]")).toHaveAttribute("aria-label", /Predicted/);
  // Bots bid on their own after this, so match only the viewer's bubble.
  const prediction = page.getByRole("status", { name: "W".repeat(19) + "1 predicts 0 tricks" });
  await expect(prediction.locator(".prediction-digit")).toBeVisible();
  await page.getByRole("button", { name: "Emotes", exact: true }).click();
  const bottomProfiles = page.locator('[data-side="bottom"] .seat-identity');
  for (const profile of await bottomProfiles.all()) await expect(profile).toBeHidden();
  for (const profile of await page.locator('[data-side="top"] .seat-identity').all())
    await expect(profile).toBeVisible();
  await expect(page.locator('[data-side="bottom"] .seat-hand')).toHaveCount(2);
  for (const hand of await page.locator('[data-side="bottom"] .seat-hand').all())
    await expect(hand).toBeVisible();
  await expect(page.getByRole("button", { name: "Send chicken emote" })).not.toBeFocused();
  await expect(page.getByRole("button", { name: "Send Perso emote" })).toBeEnabled();
  const menu = await page.getByRole("dialog", { name: "Emotes", exact: true }).boundingBox();
  const handTop = await page
    .locator(".hand-card")
    .evaluateAll((cards) => Math.min(...cards.map((card) => card.getBoundingClientRect().top)));
  expect(menu!.x).toBeGreaterThanOrEqual(12);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(308);
  expect(menu!.y).toBeGreaterThanOrEqual(12);
  expect(menu!.y + menu!.height).toBeLessThanOrEqual(handTop - 12);
  await screenshot(page, testInfo, "emote-menu");
  await page.getByRole("button", { name: "Send chicken emote" }).click();
  const emoteTrigger = page.locator('button[aria-label="Emotes"]');
  await expect(emoteTrigger).toBeVisible();
  await expect(emoteTrigger).toBeDisabled();
  for (const profile of await bottomProfiles.all()) await expect(profile).toBeVisible();
  const bubble = page.getByRole("status", { name: /sent the chicken emote/ });
  await expect(bubble.locator(".emote-motion")).toBeVisible();
  await page.mouse.wheel(0, 500);
  await page.clock.runFor(100);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({ x: 0, y: 0 });
  await screenshot(page, testInfo, "small-phone");
  await page.clock.runFor(1600);
  await expect(prediction).toHaveCount(0);
  await expect(bubble).toHaveCount(0);
  await expect(emoteTrigger).toBeVisible();
  await expect(emoteTrigger).toBeDisabled();
  await page.clock.runFor(1400);
  await expect(emoteTrigger).toBeVisible();
  await expect(emoteTrigger).toBeEnabled();

  await emoteTrigger.click();
  await page.getByRole("button", { name: "Send Perso emote" }).click();
  const perso = page.getByRole("status", { name: /sent the perso emote/ });
  await expect(perso).toBeVisible();
  await expect(perso.locator(".emote-motion")).toBeVisible();
  await page.clock.runFor(300);
  await screenshot(page, testInfo, "perso-emote");
  await page.clock.runFor(1600);
  await expect(perso).toHaveCount(0);

  await page.getByRole("button", { name: "Chat", exact: true }).click();
  const chat = page.getByRole("dialog", { name: "Chat", exact: true });
  const composer = chat.getByLabel("Message", { exact: true });
  await expect(composer).toBeFocused();
  await composer.fill("Room for a chat on the smallest phone?");
  await chat.getByRole("button", { name: "Send message" }).click();
  await expect(chat.getByRole("log", { name: "Messages" })).toContainText(
    "Room for a chat on the smallest phone?",
  );
  await expect(composer).toHaveValue("");
  await expect.poll(() => chat.boundingBox()).toEqual({ x: 0, y: 0, width: 320, height: 568 });
  const sendBox = (await chat.getByRole("button", { name: "Send message" }).boundingBox())!;
  expect(sendBox.y + sendBox.height).toBeLessThanOrEqual(568);
  expect(sendBox.height).toBeGreaterThanOrEqual(44);
  await screenshot(page, testInfo, "chat-sheet", { animations: "disabled" });
  await chat.getByRole("button", { name: "Close chat" }).click();
  await expect(chat).toBeHidden();
  await expect(page.getByRole("button", { name: "Chat", exact: true })).toBeEnabled();

  await page.goto("/preview?people=6&cards=6&phase=playing&completedTricks=2");
  await expect(page.locator(".hand-card")).toHaveCount(4);
  const handGap = await page
    .locator(".hand-card")
    .nth(1)
    .evaluate((card) => parseFloat(getComputedStyle(card).marginLeft));
  expect(handGap).toBeGreaterThanOrEqual(0);
  await screenshot(page, testInfo, "four-card-hand", { animations: "disabled" });

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/preview?people=6&cards=6&phase=trick");
  const playedCards = page
    .getByRole("region", { name: "Current trick", exact: true })
    .getByRole("img");
  await expect(playedCards).toHaveCount(6);
  const rows = await playedCards.evaluateAll((images) =>
    images.map((image) => image.getBoundingClientRect().y),
  );
  expect(Math.max(...rows) - Math.min(...rows)).toBeLessThan(1);
  await screenshot(page, testInfo, "desktop-trick", { animations: "disabled" });
  await page.getByRole("button", { name: "Emotes", exact: true }).click();
  await expect(page.locator("[data-you] .seat-identity")).toBeHidden();
  for (const profile of await page.locator("[data-seat]:not([data-you]) .seat-identity").all())
    await expect(profile).toBeVisible();
  await screenshot(page, testInfo, "desktop-emote-menu");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-you] .seat-identity")).toBeVisible();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  const desktopChat = page.getByRole("dialog", { name: "Chat", exact: true });
  await expect(desktopChat.getByLabel("Message", { exact: true })).toBeFocused();
  await expect.poll(async () => (await desktopChat.boundingBox())!.width).toBeLessThanOrEqual(448);
  await screenshot(page, testInfo, "desktop-chat", { animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(desktopChat).toBeHidden();
  await page.getByRole("button", { name: "Preview settings", exact: true }).click();
  await page.getByRole("button", { name: "Test ace selection", exact: true }).click();
  const aceDialog = page.getByRole("dialog", { name: "Ace of Coins", exact: true });
  await expect(aceDialog.locator(".ace-mode")).toHaveText(["low", "high"]);
  await expect(aceDialog.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  await screenshot(page, testInfo, "ace-selection", { animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(aceDialog).toBeHidden();

  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/preview?people=6&cards=6&phase=bidding&viewer=-1");
  const spectatorHand = page.getByRole("region", { name: "Spectator mode" });
  await expect(spectatorHand.getByRole("img", { name: "Hidden card", exact: true })).toHaveCount(6);
  await expect(spectatorHand.getByRole("button")).toHaveCount(0);
  await expect(page.locator('.seat-slot[data-center] [data-side="bottom"] .seat-hand')).toHaveCount(
    0,
  );
  await screenshot(page, testInfo, "spectator-hand");
  await page.getByRole("button", { name: "Emotes", exact: true }).click();
  await page.getByRole("button", { name: "Send chicken emote" }).click();
  const reaction = page.getByRole("status", { name: "Spectator sent the chicken emote" });
  await expect(reaction.locator(".emote-motion")).toBeVisible();
  await expect
    .poll(async () => {
      const box = (await reaction.boundingBox())!;
      return box.x >= 0 && box.x + box.width <= 393;
    })
    .toBe(true);
  await page.clock.runFor(300);
  await screenshot(page, testInfo, "spectator-reaction");
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  const spectatorChat = page.getByRole("dialog", { name: "Chat", exact: true });
  await spectatorChat.getByLabel("Message", { exact: true }).fill("Watching from the stands");
  await spectatorChat.getByLabel("Message", { exact: true }).press("Enter");
  await expect(spectatorChat.getByRole("log", { name: "Messages" })).toContainText(
    "Watching from the stands",
  );
  await screenshot(page, testInfo, "spectator-chat", { animations: "disabled" });
});
