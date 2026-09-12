import { expect } from "vitest";
import { test } from "./worker";

test("homepage and room invites expose distinct link previews in HTML", async ({ api }) => {
  const home = await api.runtime.dispatchFetch("https://giulietto.online/");
  const html = await home.text();
  expect(home.status).toBe(200);
  expect(html).toContain('<meta property="og:title" content="Giulietto"');
  expect(html).toContain(
    '<meta property="og:description" content="An online card game for 2 to 6 players."',
  );
  expect(home.headers.get("ETag")).toBe('"site-html"');
  expect(home.headers.has("X-Robots-Tag")).toBe(false);

  const image = '<meta property="og:image" content="https://giulietto.online/logo.png"';
  expect(html).toContain(image);
  for (const code of ["ABCD2345", "VWJ68J8G"]) {
    const url = `https://giulietto.online/?table=${code}`;
    const invite = await api.runtime.dispatchFetch(url);
    const body = await invite.text();
    expect(invite.status).toBe(200);
    expect(body).toContain('<meta property="og:title" content="Join me on Giulietto"');
    expect(body).toContain(
      '<meta property="og:description" content="Open the link to join the room."',
    );
    expect(body).toContain(`<meta property="og:url" content="${url}"`);
    expect(body).toContain(image);
    expect(body).not.toContain('<meta property="og:title" content="Giulietto"');
    expect(invite.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(invite.headers.get("Cache-Control")).toBe("no-store");
    expect(invite.headers.has("ETag")).toBe(false);
    expect(invite.headers.has("Content-Length")).toBe(false);
  }
});
