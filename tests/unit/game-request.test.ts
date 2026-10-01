import { afterEach, expect, test, vi } from "vitest";
import { requestGame } from "../../src/client/game-request";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test.each([
  {
    response: Response.json({ error: "tableExpired" }, { status: 400 }),
    error: { message: "tableExpired", status: 400, retryable: false },
  },
  {
    response: new Response("<html>Unavailable</html>", { status: 503 }),
    error: {
      message: "unreachable",
      status: 503,
      retryable: true,
    },
  },
  {
    response: new Response("<html>Unexpected page</html>"),
    error: { message: "invalidResponse" },
  },
])("reports HTTP and invalid response errors: $error.message", async ({ response, error }) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(requestGame("guest-token", { action: "create" })).rejects.toMatchObject(error);
});

test("bounds response body reads as well as the initial request", async () => {
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
  const pending = expect(requestGame("guest-token", { action: "join" })).rejects.toThrow("timeout");
  await vi.advanceTimersByTimeAsync(10000);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
