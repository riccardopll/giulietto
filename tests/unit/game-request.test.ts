import { afterEach, expect, it, vi } from "vitest";
import { requestGame } from "../../src/client/game-request";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([
  {
    response: Response.json({ error: "Table expired." }, { status: 400 }),
    error: { message: "Table expired.", status: 400 },
  },
  {
    response: new Response("<html>Unavailable</html>", { status: 503 }),
    error: { message: "Could not reach the table. Please try again.", status: 503 },
  },
  {
    response: new Response("<html>Unexpected page</html>"),
    error: { message: "Invalid table response. Please try again." },
  },
])("reports HTTP and invalid response errors: $error.message", async ({ response, error }) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(requestGame("guest-token", { action: "create" })).rejects.toMatchObject(error);
});

it("bounds response body reads as well as the initial request", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const response = Response.json({});
    vi.spyOn(response, "json").mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        }),
    );
    return response;
  });
  const pending = expect(requestGame("guest-token", { action: "join" })).rejects.toThrow(
    "The request timed out. Please try again.",
  );
  await vi.advanceTimersByTimeAsync(10000);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
