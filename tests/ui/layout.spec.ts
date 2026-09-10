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
  await page.getByRole("button", { name: "Predict 0 tricks", exact: true }).click();
  await expect(page.locator("[data-seat][data-you]")).toHaveAttribute("aria-label", /Predicted/);
  await page.getByRole("button", { name: "Emotes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send chicken emote" })).not.toBeFocused();
  await expect(page.getByRole("button", { name: "Empty emote slot 1" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Empty emote slot 2" })).toBeDisabled();
  const menuArtwork = page
    .getByRole("button", { name: "Send chicken emote" })
    .locator(".emote-artwork");
  const menuSize = await menuArtwork.boundingBox();
  const menuChickenSize = await menuArtwork.locator("img").boundingBox();
  await page.screenshot({ path: testInfo.outputPath("emote-menu.png") });
  await page.getByRole("button", { name: "Send chicken emote" }).click();
  const bubble = page
    .locator("[data-seat][data-you] .seat-bubble")
    .filter({ has: page.locator(".emote-motion") });
  await expect(bubble.locator(".emote-motion")).toBeVisible();
  await bubble.evaluate((element) => {
    const animation = element.getAnimations()[0];
    animation.pause();
    animation.currentTime = 250;
  });
  const playbackSize = await bubble.locator(".emote-artwork").boundingBox();
  const playbackChickenSize = await bubble.locator(".emote-motion").boundingBox();
  expect(playbackSize).toMatchObject({ width: menuSize!.width, height: menuSize!.height });
  expect(playbackChickenSize).toMatchObject({
    width: menuChickenSize!.width,
    height: menuChickenSize!.height,
  });
  const path = testInfo.outputPath("small-phone.png");
  await page.screenshot({ path });
  await testInfo.attach("small-phone", { path, contentType: "image/png" });
});
