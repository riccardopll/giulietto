import assert from "node:assert/strict";

const origin = new URL(process.argv[2] || "http://127.0.0.1:5173");
async function request(path, options) {
  return fetch(new URL(path, origin), { signal: AbortSignal.timeout(15000), ...options });
}
const home = await request("/");
assert.equal(home.status, 200);
const html = await home.text();
assert.match(html, /<title>Giulietto<\/title>/);
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]);
assert.ok(assets.length >= 2, "Production JavaScript and CSS must be linked");
await Promise.all(
  [
    ...assets,
    "/cards/neapolitan/1.webp",
    "/cards/neapolitan/back.webp",
    "/fonts/pacifico-wordmark.woff",
  ].map(async (path) => {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.ok((await response.arrayBuffer()).byteLength > 0, path);
  }),
);
const unauthorized = await request("/api/game");
assert.equal(unauthorized.status, 400);
assert.match((await unauthorized.json()).error, /guest session/);
const missingRoom = await request("/api/game?code=ZZZZZZZZ", {
  headers: { "x-player-token": crypto.randomUUID() },
});
assert.equal(missingRoom.status, 400);
assert.match((await missingRoom.json()).error, /not found|Join this table/);
console.log(
  `Verified ${origin.origin}: HTML, JavaScript, CSS, cards, font, API, and room routing.`,
);
