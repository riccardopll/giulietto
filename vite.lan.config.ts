import type { TLSSocket } from "node:tls";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import base from "./vite.config.ts";

const httpsRequestUrls: Plugin = {
  name: "https-request-urls",
  enforce: "pre",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const authority = req.headers[":authority"];
      if (typeof authority === "string" && !req.headers.host)
        req.rawHeaders.push("host", authority);
      next();
    });
    server.httpServer?.on("upgrade", (req) => {
      if ((req.socket as TLSSocket).encrypted) req.headers["x-forwarded-proto"] ??= "https";
    });
  },
};

export default mergeConfig(
  base,
  defineConfig({ plugins: [basicSsl(), httpsRequestUrls], server: { host: true } }),
);
