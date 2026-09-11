import { expect, test } from "@playwright/test";

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
  const errors = await page.evaluate(() => {
    const errors: string[] = [];
    if (
      document.documentElement.scrollWidth > innerWidth ||
      document.documentElement.scrollHeight > innerHeight
    )
      errors.push("Page overflows the viewport");
    for (const element of document.querySelectorAll<HTMLElement>(
      ".seat-identity, .playing-card, header, button",
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
  });
  expect(errors).toEqual([]);
  await expect(page.getByRole("status", { name: "1 spectator", exact: true })).toHaveCount(0);
  const handCenter = await page.locator(".hand-card").evaluateAll((cards) => {
    const bounds = cards.map((card) => card.getBoundingClientRect());
    return (
      (Math.min(...bounds.map((card) => card.left)) +
        Math.max(...bounds.map((card) => card.right))) /
      2
    );
  });
  expect(handCenter).toBeCloseTo(160, 0);
  await page.getByRole("button", { name: "Predict 0 tricks", exact: true }).click();
  await expect(page.locator("[data-seat][data-you]")).toHaveAttribute("aria-label", /Predicted/);
  const prediction = page.getByRole("status", { name: /predicts 0 tricks/ });
  await expect(prediction.locator(".prediction-digit")).toBeVisible();
  await prediction.evaluate((element) => {
    const animation = element.getAnimations()[0];
    animation.pause();
    animation.currentTime = 250;
  });
  const predictionSize = await prediction.locator(".emote-artwork").boundingBox();
  await page.getByRole("button", { name: "Emotes", exact: true }).click();
  const bottomProfiles = page.locator('[data-side="bottom"] .seat-identity');
  for (const profile of await bottomProfiles.all()) await expect(profile).toBeHidden();
  for (const profile of await page.locator('[data-side="top"] .seat-identity').all())
    await expect(profile).toBeVisible();
  await expect(page.locator('[data-side="bottom"] .seat-hand')).toHaveCount(2);
  for (const hand of await page.locator('[data-side="bottom"] .seat-hand').all())
    await expect(hand).toBeVisible();
  await expect(page.getByRole("button", { name: "Send chicken emote" })).not.toBeFocused();
  await expect(page.getByRole("button", { name: "Empty emote slot 1" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Empty emote slot 2" })).toBeDisabled();
  const menu = await page.getByRole("dialog", { name: "Emotes", exact: true }).boundingBox();
  const handTop = await page
    .locator(".hand-card")
    .evaluateAll((cards) => Math.min(...cards.map((card) => card.getBoundingClientRect().top)));
  expect(menu!.x + menu!.width / 2).toBeCloseTo(160, 0);
  expect(menu!.x).toBeGreaterThanOrEqual(12);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(308);
  expect(menu!.y).toBeGreaterThanOrEqual(12);
  expect(menu!.y + menu!.height).toBeLessThanOrEqual(handTop - 12);
  const menuArtwork = page
    .getByRole("button", { name: "Send chicken emote" })
    .locator(".emote-artwork");
  const menuSize = await menuArtwork.boundingBox();
  const menuChickenSize = await menuArtwork.locator("img").boundingBox();
  await page.screenshot({ path: testInfo.outputPath("emote-menu.png") });
  await page.getByRole("button", { name: "Send chicken emote" }).click();
  for (const profile of await bottomProfiles.all()) await expect(profile).toBeVisible();
  const bubble = page.getByRole("status", { name: /sent the chicken emote/ });
  await expect(bubble.locator(".emote-motion")).toBeVisible();
  await bubble.evaluate((element) => {
    const animation = element.getAnimations()[0];
    animation.pause();
    animation.currentTime = 250;
  });
  const playbackSize = await bubble.locator(".emote-artwork").boundingBox();
  const playbackChickenSize = await bubble.locator(".emote-motion").boundingBox();
  expect(playbackSize).toMatchObject({ width: menuSize!.width, height: menuSize!.height });
  expect(predictionSize).toMatchObject({ width: menuSize!.width, height: menuSize!.height });
  expect(playbackChickenSize!.width).toBeCloseTo(menuChickenSize!.width, 2);
  expect(playbackChickenSize!.height).toBeCloseTo(menuChickenSize!.height, 2);
  await page.mouse.wheel(0, 500);
  await page.clock.runFor(100);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({ x: 0, y: 0 });
  const path = testInfo.outputPath("small-phone.png");
  await page.screenshot({ path });
  await testInfo.attach("small-phone", { path, contentType: "image/png" });
  await page.clock.runFor(1600);
  await expect(prediction).toHaveCount(0);
  await expect(bubble).toHaveCount(0);

  await page.goto("/preview?people=6&cards=6&phase=playing&completedTricks=2");
  await expect(page.locator(".hand-card")).toHaveCount(4);
  const handGap = await page
    .locator(".hand-card")
    .nth(1)
    .evaluate((card) => parseFloat(getComputedStyle(card).marginLeft));
  expect(handGap).toBeGreaterThanOrEqual(0);
  await page.screenshot({
    path: testInfo.outputPath("four-card-hand.png"),
    animations: "disabled",
  });

  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/preview?people=6&cards=6&phase=trick");
  const playedCards = page
    .getByRole("region", { name: "Current trick", exact: true })
    .getByRole("img");
  await expect(playedCards).toHaveCount(6);
  const cards = await playedCards.evaluateAll((images) =>
    images.map((image) => {
      const { y, width } = image.getBoundingClientRect();
      return { y, width };
    }),
  );
  expect(
    Math.max(...cards.map((card) => card.y)) - Math.min(...cards.map((card) => card.y)),
  ).toBeLessThan(1);
  expect(Math.min(...cards.map((card) => card.width))).toBeGreaterThan(68);
  const desktopHandCenter = await page.locator(".hand-card").evaluateAll((cards) => {
    const bounds = cards.map((card) => card.getBoundingClientRect());
    return (
      (Math.min(...bounds.map((card) => card.left)) +
        Math.max(...bounds.map((card) => card.right))) /
      2
    );
  });
  expect(desktopHandCenter).toBeCloseTo(640, 0);
  await page.screenshot({ path: testInfo.outputPath("desktop-trick.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Emotes", exact: true }).click();
  await expect(page.locator("[data-you] .seat-identity")).toBeHidden();
  for (const profile of await page.locator("[data-seat]:not([data-you]) .seat-identity").all())
    await expect(profile).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("desktop-emote-menu.png") });
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-you] .seat-identity")).toBeVisible();
  await page.getByRole("button", { name: "Preview settings", exact: true }).click();
  await page.getByRole("button", { name: "Test ace selection", exact: true }).click();
  const aceDialog = page.getByRole("dialog", { name: "Ace of Coins", exact: true });
  const arrows = aceDialog.locator(".ace-arrow-track");
  await expect(arrows).toHaveCount(2);
  await expect(aceDialog.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  // Keep arrows animated even when the browser requests reduced motion.
  expect(
    await arrows.evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).animationName),
    ),
  ).toEqual(["ace-arrow", "ace-arrow"]);
  await page.keyboard.press("Escape");
  await expect(aceDialog).toBeHidden();
});
