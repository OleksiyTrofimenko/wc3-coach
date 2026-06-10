import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WC3 Coach — Replay Analyzer",
  description: "Post-game Warcraft III replay analysis and APM coaching",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
