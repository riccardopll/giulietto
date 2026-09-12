export async function serveSite(req: Request, assets: Pick<Fetcher, "fetch">) {
  const url = new URL(req.url);
  const preview = url.pathname === "/preview";
  // Preview is a development-only route; production serves a real 404.
  const assetRequest = preview && import.meta.env.DEV ? new Request(new URL("/", url), req) : req;
  const assetResponse = await assets.fetch(assetRequest);
  let response = new Response(assetResponse.body, assetResponse);
  if (
    url.pathname === "/" &&
    url.searchParams.has("table") &&
    response.status === 200 &&
    response.headers.get("Content-Type")?.includes("text/html")
  ) {
    const inviteUrl = new URL("https://giulietto.online/");
    inviteUrl.searchParams.set("table", url.searchParams.get("table")!);
    response = new HTMLRewriter()
      .on('meta[property="og:title"]', {
        element(element) {
          element.setAttribute("content", "Join me on Giulietto");
        },
      })
      .on('meta[property="og:description"]', {
        element(element) {
          element.setAttribute("content", "Open the link to join the room.");
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
