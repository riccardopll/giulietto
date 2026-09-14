import { readFile } from "node:fs/promises";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("migrations");
  const site = await readFile("index.html", "utf8");
  return {
    test: {
      restoreMocks: true,
      projects: [
        {
          test: { name: "unit", environment: "node", include: ["tests/unit/**/*.test.ts"] },
        },
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: { TEST_MIGRATIONS: migrations },
                // The Vite plugin serves built assets in production; tests only need the page.
                serviceBindings: {
                  ASSETS: () =>
                    new Response(site, {
                      headers: {
                        "Content-Type": "text/html; charset=utf-8",
                        "Cache-Control": "public, max-age=60",
                        ETag: '"site-html"',
                        "Content-Length": String(Buffer.byteLength(site)),
                      },
                    }),
                },
              },
            }),
          ],
          test: {
            name: "integration",
            include: ["tests/integration/**/*.test.ts"],
            setupFiles: ["tests/integration/setup.ts"],
            testTimeout: 10_000,
            hookTimeout: 30_000,
          },
        },
      ],
    },
  };
});
