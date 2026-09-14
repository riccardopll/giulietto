import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";

test("homepage and room invites expose distinct link previews in HTML", async () => {
  const home = await SELF.fetch("https://giulietto.online/");
  const html = await home.text();
  expect(home.status).toBe(200);
  expect(html).toContain('<meta property="og:title" content="Giulietto"');
  expect(html).toContain(
    '<meta property="og:description" content="An online card game for 2 to 6 players."',
  );
  expect(home.headers.get("ETag")).toBe('"site-html"');
  expect(home.headers.has("X-Robots-Tag")).toBe(false);

  expect(html).not.toContain('property="og:image');
  for (const code of ["ABCD2345", "VWJ68J8G"]) {
    const url = `https://giulietto.online/?table=${code}`;
    const invite = await SELF.fetch(url);
    const body = await invite.text();
    expect(invite.status).toBe(200);
    expect(body).toContain('<meta property="og:title" content="Join me on Giulietto"');
    expect(body).toContain(
      '<meta property="og:description" content="Open the link to join the room."',
    );
    expect(body).toContain(`<meta property="og:url" content="${url}"`);
    expect(body).not.toContain('property="og:image');
    expect(body).not.toContain('<meta property="og:title" content="Giulietto"');
    expect(invite.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(invite.headers.get("Cache-Control")).toBe("no-store");
    expect(invite.headers.has("ETag")).toBe(false);
    expect(invite.headers.has("Content-Length")).toBe(false);
  }
});
