import { createHash } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { view } from "../../src/shared/game";

type State = ReturnType<typeof view>;

async function enter(page: Page, action: string, button: string) {
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/game" &&
      response.request().method() === "POST" &&
      response.request().postDataJSON().action === action,
  );
  await page.getByRole("button", { name: button, exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  await expect(page.getByRole("list", { name: "Players", exact: true })).toBeVisible();
  return (await result.json()) as State;
}

async function identityCookies(context: BrowserContext) {
  return (await context.cookies()).filter((cookie) =>
    ["giulietto-token", "giulietto-name"].includes(cookie.name),
  );
}

test("cookies restore the name and player across browser sessions and tables", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/");
  await page.getByLabel("Display name").fill(" bot_1 ");
  const created = await enter(page, "create", "Create private lobby");
  expect(created.players).toHaveLength(1);
  expect(created.players[0].name).toBe("bot_1");

  const cookies = await identityCookies(page.context());
  expect(cookies).toHaveLength(2);
  expect(cookies.find((cookie) => cookie.name === "giulietto-name")?.value).toBe("bot_1");
  const token = cookies.find((cookie) => cookie.name === "giulietto-token")!.value;
  expect(token).toMatch(/^[0-9a-f-]{36,80}$/i);
  expect(created.you).toBe(createHash("sha256").update(token).digest("hex"));
  for (const cookie of cookies) {
    expect(cookie).toMatchObject({ path: "/", sameSite: "Lax", secure: false });
    expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 364 * 86400);
    expect(cookie.expires).toBeLessThan(Date.now() / 1000 + 366 * 86400);
  }
  await page.close();

  const returning = await browser.newContext({
    baseURL,
    storageState: { cookies, origins: [] },
  });
  const stranger = await browser.newContext({ baseURL });
  try {
    await returning.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Storage is unavailable", "SecurityError");
        },
      });
    });
    const returned = await returning.newPage();
    await returned.goto(`/?table=${created.code}`);
    await expect(returned.getByLabel("Display name")).toHaveValue("bot_1");
    await expect(returned.getByLabel("Lobby code")).toHaveValue(created.code);
    await returned.getByLabel("Display name").fill("bot_2");
    const rejoined = await enter(returned, "join", "Join");
    expect(rejoined.you).toBe(created.you);
    expect(rejoined.players).toHaveLength(1);
    expect(rejoined.players[0].name).toBe("bot_1");
    expect(
      (await identityCookies(returning)).find((cookie) => cookie.name === "giulietto-name")?.value,
    ).toBe("bot_1");

    await returned.getByRole("button", { name: "Leave table", exact: true }).click();
    await returned
      .getByRole("alertdialog", { name: "Leave this table?" })
      .getByRole("button", { name: "Leave table", exact: true })
      .click();
    await expect(returned.getByLabel("Display name")).toBeVisible();
    const next = await enter(returned, "create", "Create private lobby");
    expect(next.you).toBe(created.you);
    expect(next.code).not.toBe(created.code);

    const other = await stranger.newPage();
    await other.goto(`/?table=${next.code}`);
    await expect(other.getByLabel("Display name")).toHaveValue("");
    await other.getByLabel("Display name").fill("bot_2");
    const joined = await enter(other, "join", "Join");
    expect(joined.you).not.toBe(created.you);
    expect(joined.players).toHaveLength(2);
    expect(joined.players.map((player) => player.id)).toContain(created.you);
  } finally {
    await returning.close();
    await stranger.close();
  }
});

test("existing localStorage identity moves to cookies without changing the player", async ({
  page,
}) => {
  const token = crypto.randomUUID();
  await page.addInitScript((token) => {
    localStorage.setItem("giulietto-token", token);
    localStorage.setItem("giulietto-name", "bot_1");
  }, token);
  await page.goto("/");
  await expect(page.getByLabel("Display name")).toHaveValue("bot_1");
  expect(await identityCookies(page.context())).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "giulietto-token", value: token }),
      expect.objectContaining({ name: "giulietto-name", value: "bot_1" }),
    ]),
  );
  expect(
    await page.evaluate(() => [
      localStorage.getItem("giulietto-token"),
      localStorage.getItem("giulietto-name"),
    ]),
  ).toEqual([null, null]);
  const created = await enter(page, "create", "Create private lobby");
  expect(created.you).toBe(createHash("sha256").update(token).digest("hex"));
});

test("cookies take precedence over an older localStorage identity", async ({ page, baseURL }) => {
  const token = crypto.randomUUID();
  await page.context().addCookies([
    { name: "giulietto-token", value: token, url: baseURL! },
    { name: "giulietto-name", value: "%62ot_1", url: baseURL! },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem("giulietto-token", crypto.randomUUID());
    localStorage.setItem("giulietto-name", "bot_2");
  });
  await page.goto("/");
  await expect(page.getByLabel("Display name")).toHaveValue("bot_1");
  expect(
    (await identityCookies(page.context())).find((cookie) => cookie.name === "giulietto-token")
      ?.value,
  ).toBe(token);
  expect(
    await page.evaluate(() => [
      localStorage.getItem("giulietto-token"),
      localStorage.getItem("giulietto-name"),
    ]),
  ).toEqual([null, null]);
});

test("malformed cookies recover without replacing a valid player token", async ({
  page,
  baseURL,
}) => {
  await page.context().addCookies([
    { name: "giulietto-token", value: "invalid-token", url: baseURL! },
    { name: "giulietto-name", value: "%invalid", url: baseURL! },
  ]);
  await page.goto("/");
  await expect(page.getByLabel("Display name")).toHaveValue("");
  const token = (await identityCookies(page.context())).find(
    (cookie) => cookie.name === "giulietto-token",
  )!.value;
  expect(token).toMatch(/^[0-9a-f-]{36,80}$/i);
  await page.getByLabel("Display name").fill("bot_1");
  await expect(page.getByRole("button", { name: "Create private lobby" })).toBeEnabled();

  await page.context().addCookies([{ name: "giulietto-name", value: "%invalid", url: baseURL! }]);
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("");
  expect(
    (await identityCookies(page.context())).find((cookie) => cookie.name === "giulietto-token")
      ?.value,
  ).toBe(token);
});

test("a rejected join preserves the last accepted display name", async ({ page, baseURL }) => {
  await page.context().addCookies([
    { name: "giulietto-token", value: crypto.randomUUID(), url: baseURL! },
    { name: "giulietto-name", value: "bot_1", url: baseURL! },
  ]);
  await page.goto("/");
  await page.getByLabel("Display name").fill("bot_2");
  await page.getByLabel("Lobby code").fill("AAAAAAAA");
  const response = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/game",
  );
  await page.getByRole("button", { name: "Join", exact: true }).click();
  expect((await response).status()).toBe(400);
  await expect(page.getByText("Table not found or expired. Check the invite code.")).toBeVisible();
  expect(
    (await identityCookies(page.context())).find((cookie) => cookie.name === "giulietto-name")
      ?.value,
  ).toBe("bot_1");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("bot_1");
});

test("blocked cookies disable entry actions and preserve an unmigrated identity", async ({
  page,
}) => {
  const token = crypto.randomUUID();
  await page.addInitScript((token) => {
    localStorage.setItem("giulietto-token", token);
    localStorage.setItem("giulietto-name", "bot_1");
    Object.defineProperty(document, "cookie", {
      get: () => "",
      set: () => {},
    });
  }, token);
  await page.goto("/");
  await expect(page.getByText(/Allow cookies/)).toBeVisible();
  await page.getByLabel("Display name").fill("bot_1");
  await page.getByLabel("Lobby code").fill("AAAAAAAA");
  for (const name of ["Find matchmaking", "Create private lobby", "Join"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  }
  expect(
    await page.evaluate(() => [
      localStorage.getItem("giulietto-token"),
      localStorage.getItem("giulietto-name"),
    ]),
  ).toEqual([token, "bot_1"]);
});
