import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { cn as cnTables } from "cn/vite";

export default defineConfig({
  plugins: [
    cnTables({
      content: ["src/client/**/*.{ts,tsx}"],
      css: "src/client/globals.css",
      out: "src/client/cn-tables.ts",
    }),
    react(),
    tailwindcss(),
    cloudflare(),
  ],
  resolve: { tsconfigPaths: true },
});
