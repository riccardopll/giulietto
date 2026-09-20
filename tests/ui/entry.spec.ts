import { expect } from "@playwright/test";
import { observe, screenshot, test, type Player } from "./helpers";

test("entry retries reuse the create command, refresh the join command, and leave despite lost replies", async ({
  browser,
  baseURL,
  viewport,
  reducedMotion,
}) => {
  const players: Player[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext({ baseURL, viewport, reducedMotion });
      await context.addCookies([{ name: "giulietto-name", value: `bot_${i + 1}`, url: baseURL! }]);
      const page = await context.newPage();
      players.push(observe(page));
      await page.goto("/");
    }

    for (const [index, { action, expires }] of [
      { action: "create", expires: false },
      { action: "join", expires: true },
      { action: "create", expires: true },
    ].entries()) {
      const page = players[index].page;
      if (action === "join") await page.getByLabel("Lobby code").fill(players[0].state!.code);
      let committed: { code: string } | undefined;
      let commandId: string | undefined;
      await page.route(
        "**/api/game",
        async (route) => {
          const command = route.request().postDataJSON();
          commandId = command.commandId;
          committed = await (await route.fetch()).json();
          if (expires) {
            // Creation recovery records a join receipt; then membership expires while offline.
            if (action === "create") expect((await route.fetch()).ok()).toBe(true);
            const removed = await route.fetch({
              postData: {
                ...command,
                code: committed!.code,
                action: "leave",
                commandId: crypto.randomUUID(),
              },
            });
            expect(removed.ok()).toBe(true);
          }
          await route.abort();
        },
        { times: 1 },
      );
      const button = page.getByRole("button", {
        name: action === "create" ? "Create private lobby" : "Join",
        exact: true,
      });
      await button.click();
      await expect.poll(() => committed?.code).toBeDefined();
      await expect(button).toBeEnabled();
      const retry = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/game") && response.request().method() === "POST",
      );
      await button.click();
      const retryResponse = await retry;
      const retriedId = retryResponse.request().postDataJSON().commandId;
      if (action === "create") expect(retriedId).toBe(commandId);
      else expect(retriedId).not.toBe(commandId);
      if (action === "create" && expires) {
        expect(retryResponse.status()).toBe(400);
        expect(await retryResponse.json()).toEqual({ error: "Table already exists." });
        await expect(button).toBeEnabled();
        const replacement = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/game") && response.request().method() === "POST",
        );
        await button.click();
        const response = await replacement;
        expect(response.request().postDataJSON().commandId).not.toBe(commandId);
        const created = await response.json();
        expect(created.code).not.toBe(committed!.code);
        committed = created;
      }
      await expect(page.getByRole("list", { name: "Players", exact: true })).toBeVisible();
      await expect.poll(() => players[index].state?.code).toBe(committed!.code);
    }

    const page = players[0].page;
    let left = false;
    await page.route(
      "**/api/game",
      async (route) => {
        expect(route.request().postDataJSON().action).toBe("leave");
        expect((await route.fetch()).ok()).toBe(true);
        left = true;
        await route.abort();
      },
      { times: 1 },
    );
    await page.getByRole("button", { name: "Leave table", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Leave table", exact: true })
      .click();
    await expect(page.getByRole("button", { name: "Open your profile" })).toBeVisible();
    expect(left).toBe(true);
    await expect
      .poll(() => players[1].state?.players.map((p) => p.id))
      .toEqual([players[1].state!.you]);
  } finally {
    for (const player of players) await player.page.context().close();
  }
});

test("menu tutorial explains play and returns focus when closed", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const help = page.getByRole("button", { name: "How to play", exact: true });
  await expect(help).toBeVisible();
  await screenshot(page, testInfo, "tutorial-menu", { animations: "disabled", fullPage: true });
  await help.click();
  const tutorial = page.getByRole("dialog", { name: "How to play" });
  await expect(tutorial).toBeVisible();
  await screenshot(page, testInfo, "tutorial-top", { animations: "disabled" });
  await tutorial.getByLabel("One card from each player makes a trick").scrollIntoViewIfNeeded();
  await screenshot(page, testInfo, "tutorial-trick-definition", { animations: "disabled" });
  await expect(tutorial.getByRole("heading", { level: 3 })).toHaveText([
    "Prediction round",
    "Playing round",
    "Blind round",
    "Reading the table",
  ]);
  await tutorial
    .getByLabel("Cards per player: 6, 5, 4, 3, 2, 1, then repeat")
    .scrollIntoViewIfNeeded();
  await screenshot(page, testInfo, "tutorial-rounds", { animations: "disabled" });
  await tutorial.getByLabel("Prediction example").scrollIntoViewIfNeeded();
  await screenshot(page, testInfo, "tutorial-prediction", { animations: "disabled" });
  await tutorial.getByLabel("Suit strength").scrollIntoViewIfNeeded();
  await screenshot(page, testInfo, "tutorial-suits", { animations: "disabled" });
  await tutorial.getByLabel("Ace of Coins choices").scrollIntoViewIfNeeded();
  await screenshot(page, testInfo, "tutorial-cards", { animations: "disabled" });
  await expect(tutorial.getByText("Reading the table", { exact: true })).toBeAttached();
  await tutorial.getByRole("button", { name: "Got it", exact: true }).scrollIntoViewIfNeeded();
  await screenshot(page, testInfo, "tutorial-controls", { animations: "disabled" });
  await tutorial.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(tutorial).toBeHidden();
  await expect(help).toBeFocused();
  await help.click();
  await page.keyboard.press("Escape");
  await expect(tutorial).toBeHidden();
  await expect(help).toBeFocused();
});
