import { createRoot } from "react-dom/client";
import App from "./App";
import "./globals.css";

const root = createRoot(document.getElementById("root")!);
if (import.meta.env.DEV && location.pathname === "/preview") {
  const [{ Preview }, { createBot }, weights] = await Promise.all([
    import("./preview/Preview"),
    import("../shared/bot"),
    fetch("/bot/weights.json").then((response) => response.json()),
  ]);
  root.render(<Preview bot={createBot(weights)} />);
} else {
  root.render(<App />);
}
