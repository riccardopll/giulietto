import type { Env } from "./env";
import { roomCode } from "./protocol";

type SiteEnv = Pick<Env, "REQUEST_LIMIT"> & {
  ASSETS: Pick<Fetcher, "fetch">;
  ROOMS: Pick<Env["ROOMS"], "getByName">;
};

export async function serveSite(req: Request, env: SiteEnv) {
  const url = new URL(req.url);
  const preview = url.pathname === "/preview";
  const assetRequest = preview && import.meta.env.DEV ? new Request(new URL("/", url), req) : req;
  const assetResponse = await env.ASSETS.fetch(assetRequest);
  let response = new Response(assetResponse.body, assetResponse);
  if (
    url.pathname === "/" &&
    url.searchParams.has("table") &&
    response.status === 200 &&
    response.headers.get("Content-Type")?.includes("text/html")
  ) {
    const table = url.searchParams.get("table")!;
    const inviteUrl = new URL("https://giulietto.online/");
    inviteUrl.searchParams.set("table", table);
    let host = null;
    try {
      const code = roomCode(table);
      const key = req.headers.get("cf-connecting-ip") || "anonymous";
      if ((await env.REQUEST_LIMIT.limit({ key })).success)
        host = await env.ROOMS.getByName(code).hostName();
    } catch {}
    response = new HTMLRewriter()
      .on('meta[property="og:title"]', {
        element(element) {
          element.setAttribute("content", "Join me on Giulietto");
        },
      })
      .on('meta[property="og:description"]', {
        element(element) {
          if (host) element.setAttribute("content", `${host}'s table`);
        },
      })
      .on('meta[property="og:url"]', {
        element(element) {
          element.setAttribute("content", inviteUrl.href);
        },
      })
      .transform(response);
    response.headers.delete("ETag");
    response.headers.delete("Content-Length");
  }
  if (url.searchParams.has("table") || preview || url.hostname.endsWith(".workers.dev")) {
    response.headers.set("X-Robots-Tag", "noindex");
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}
