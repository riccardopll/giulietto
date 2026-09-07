import { GET, POST } from "./game-api";

export default {
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/api/game") {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    if (request.method === "GET") return GET(request);
    if (request.method === "POST") return POST(request);
    return Response.json(
      { error: "Method not allowed." },
      {
        status: 405,
        headers: { Allow: "GET, POST" },
      },
    );
  },
};
