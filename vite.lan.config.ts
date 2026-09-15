import { defineConfig, mergeConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import base from "./vite.config";

// Serves the dev server to phones on the local network. HTTPS is required because the
// client uses APIs that only exist in secure contexts, and a LAN address over HTTP is not one.
export default mergeConfig(base, defineConfig({ plugins: [basicSsl()], server: { host: true } }));
