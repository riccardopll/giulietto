import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Home, HomeHeader, homeShellClass } from "./src/client/components/home.tsx";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
    {
      name: "prerender-home",
      transformIndexHtml(html) {
        const home = createElement(
          "div",
          { className: homeShellClass },
          createElement(HomeHeader),
          createElement(Home, {
            name: "",
            code: "",
            ready: false,
            busy: false,
            onNameChange() {},
            onCodeChange() {},
            onAction() {},
          }),
        );
        return html.replace("<!--home-->", renderToStaticMarkup(home));
      },
    },
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
