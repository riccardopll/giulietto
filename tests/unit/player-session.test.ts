import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cookieError, restorePlayer } from "../../src/client/player-session";

let cookies: Map<string, string>;
let writable: boolean;

beforeEach(() => {
  cookies = new Map();
  writable = true;
  vi.stubGlobal("location", { protocol: "https:" });
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    removeItem: () => {},
  });
  vi.stubGlobal("document", {
    get cookie() {
      return [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
    },
    set cookie(value: string) {
      const [key, encoded] = value.split(";", 1)[0].split("=");
      if (writable) cookies.set(key, encoded);
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

it("restores the cookie identity when local storage is unavailable", () => {
  const token = crypto.randomUUID();
  cookies.set("giulietto-token", token);
  cookies.set("giulietto-name", "bot%5F1");
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("Storage unavailable");
    },
    removeItem: () => {
      throw new Error("Storage unavailable");
    },
  });
  expect(restorePlayer()).toEqual({ token, name: "bot_1" });
});

it("replaces invalid credentials and recovers from malformed names", () => {
  cookies.set("giulietto-token", "invalid");
  cookies.set("giulietto-name", "%invalid");
  const identity = restorePlayer();
  expect(identity.name).toBe("");
  expect(identity.token).toMatch(/^[0-9a-f]{64}$/);
  cookies.set("giulietto-name", "%invalid");
  expect(restorePlayer()).toEqual(identity);
});

it("rejects a session when its credential cannot be saved", () => {
  writable = false;
  expect(() => restorePlayer()).toThrow(cookieError);
});
