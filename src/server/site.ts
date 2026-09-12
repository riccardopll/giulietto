export async function serveSite(req: Request, assets: Pick<Fetcher, "fetch">) {
  const url = new URL(req.url);
  const preview = url.pathname === "/preview";
  // Preview is a development-only route; production serves a real 404.
  const assetRequest = preview && import.meta.env.DEV ? new Request(new URL("/", url), req) : req;
  const assetResponse = await assets.fetch(assetRequest);
  const response = new Response(assetResponse.body, assetResponse);
  if (url.searchParams.has("table") || preview || url.hostname.endsWith(".workers.dev")) {
    response.headers.set("X-Robots-Tag", "noindex");
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}
