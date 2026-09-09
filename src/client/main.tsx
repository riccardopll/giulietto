import { createRoot } from "react-dom/client";
import App from "./App";
import "./globals.css";

const root = createRoot(document.getElementById("root")!);
if (import.meta.env.DEV && location.pathname === "/preview") {
  const { Preview } = await import("./preview/Preview");
  root.render(<Preview />);
} else {
  root.render(<App />);
}
