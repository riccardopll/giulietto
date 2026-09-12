import { afterEach, expect, test, vi } from "vitest";
import { serveSite } from "../../src/server/site";

afterEach(() => vi.unstubAllEnvs());

test("public assets keep their body, status, content type, and caching", async () => {
  const request = new Request("https://giulietto.online/robots.txt");
  const assets = {
    fetch: vi.fn(
      async () =>
        new Response("User-agent: *\nAllow: /", {
          headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=60" },
        }),
    ),
  };
  const response = await serveSite(request, assets);
  expect(assets.fetch).toHaveBeenCalledWith(request);
  expect(await response.text()).toBe("User-agent: *\nAllow: /");
  expect(response.headers.get("Content-Type")).toBe("text/plain");
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
  expect(response.headers.has("X-Robots-Tag")).toBe(false);

  for (const status of [404, 304]) {
    const response = await serveSite(new Request("https://giulietto.online/missing"), {
      fetch: async () => new Response(null, { status }),
    });
    expect(response.status).toBe(status);
    expect(await response.text()).toBe("");
  }
});

test("invite pages and alternate workers.dev hosts remain accessible but unindexed", async () => {
  for (const url of [
    "https://giulietto.online/?table=ABCD2345",
    "https://giulietto.example.workers.dev/",
  ]) {
    const request = new Request(url);
    const assets = {
      fetch: vi.fn(
        async () =>
          new Response("home", {
            headers: { "Cache-Control": "public, max-age=60" },
          }),
      ),
    };
    const response = await serveSite(request, assets);
    expect(assets.fetch).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("home");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
});

test("preview loads the application only in development and is never indexed", async () => {
  for (const dev of [true, false]) {
    vi.stubEnv("DEV", dev);
    const assets = {
      fetch: vi.fn(async (req: RequestInfo | URL) => {
        const path = new URL(req instanceof Request ? req.url : String(req)).pathname;
        return new Response(path === "/" ? "home" : "not found", {
          status: path === "/" ? 200 : 404,
        });
      }),
    };
    const response = await serveSite(
      new Request("https://giulietto.online/preview?people=6"),
      assets,
    );
    expect(response.status).toBe(dev ? 200 : 404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  }
});
