import { expect, type Route } from "@playwright/test";
import { test } from "./helpers";

test("profile edits recover from failed saves and stats loads without shifting layout", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open your profile" }).click();
  await page.getByRole("button", { name: "Edit your name", exact: true }).click();
  await page.getByLabel("New name").fill("bot_1");
  await expect(page.getByRole("radio")).toHaveCount(0);
  let statsRefresh: Route | undefined;
  await page.route("**/api/stats", (route) => {
    statsRefresh = route;
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit your name" })).toBeHidden();
  await expect.poll(() => !!statsRefresh).toBe(true);

  await page.getByRole("button", { name: "Edit your avatar", exact: true }).click();
  await expect(page.getByLabel("New name")).toHaveCount(0);
  await page.getByRole("radio", { name: "King of Cups", exact: true }).check();
  const avatarDialog = page.getByRole("dialog", { name: "Choose your avatar" });
  await expect(avatarDialog).toHaveCSS("opacity", "1");
  const dialogBounds = await avatarDialog.boundingBox();
  await page.route(
    "**/api/profile",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Could not save your profile." }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.locator("[role=alert]").filter({ hasText: "Could not save your profile." }),
  ).toBeVisible();
  expect(await avatarDialog.boundingBox()).toEqual(dialogBounds);
  await statsRefresh!.fulfill({ status: 503 });
  await page.unroute("**/api/stats");
  const statsError = page
    .locator("[role=alert]")
    .filter({ hasText: "Could not load player stats." });
  await expect(statsError).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(avatarDialog).toBeHidden();
  await page.waitForLoadState("networkidle");

  const editName = page.getByRole("button", { name: "Edit your name", exact: true });
  const editAvatar = page.getByRole("button", { name: "Edit your avatar", exact: true });
  const avatarBounds = await editAvatar.boundingBox();
  await page.route("**/api/stats", (route) => route.fulfill({ status: 503 }), { times: 1 });
  await page.reload();
  await expect(statsError).toBeVisible();
  await expect(editName).toBeDisabled();
  await expect(editAvatar).toBeDisabled();
  await page.getByRole("main").evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  expect(await editAvatar.boundingBox()).toEqual(avatarBounds);
  let statsRetry: Route | undefined;
  await page.route(
    "**/api/stats",
    (route) => {
      statsRetry = route;
    },
    { times: 1 },
  );
  await statsError.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => !!statsRetry).toBe(true);
  await expect(editName).toBeDisabled();
  await expect(editAvatar).toBeDisabled();
  await statsRetry!.continue();
  await expect(statsError).toBeHidden();
  await expect(editName).toHaveText("bot_1");
  await expect(editAvatar.locator("img")).toHaveAttribute("src", "/avatars/king-cups.webp");

  await editName.click();
  await page.getByLabel("New name").fill("bot_1");
  const nameSave = page.waitForResponse("**/api/profile");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect((await nameSave).request().postDataJSON()).toEqual({
    name: "bot_1",
    avatar: "king-cups",
  });
  await expect(page.getByRole("dialog", { name: "Edit your name" })).toBeHidden();
});
