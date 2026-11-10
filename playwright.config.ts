import { defineConfig } from "@playwright/test";

const origin = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 5174}`;

export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: true,
  workers: process.env.CI ? 1 : 2,
  timeout: 60_000,
  use: {
    baseURL: origin,
    viewport: { width: 393, height: 852 },
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: `npm run db:migrate:local && npm run dev -- --host 127.0.0.1 --port ${new URL(origin).port} --strictPort`,
    url: `${origin}/preview`,
    reuseExistingServer: !process.env.CI,
  },
});
