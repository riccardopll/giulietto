import { createRoot } from "react-dom/client";
import App from "./App";
import "./globals.css";

const root = createRoot(document.getElementById("root")!);
if (import.meta.env.DEV && location.pathname === "/preview") {
  const [{ Preview }, weights] = await Promise.all([
    import("./preview/Preview"),
    fetch("/bot/weights.json").then((response) => response.json()),
  ]);
  root.render(<Preview weights={weights} />);
} else {
  root.render(<App />);
}
