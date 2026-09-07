import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Giulietto",
  description: "Join lobby.",
  openGraph: { title: "Giulietto", description: "Join lobby.", siteName: "Giulietto" },
  twitter: { card: "summary", title: "Giulietto", description: "Join lobby." },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
