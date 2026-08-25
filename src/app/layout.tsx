import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPIDEYBOT — Powerful WhatsApp Automation Platform",
  description:
    "SPIDEYBOT is a premium WhatsApp automation control platform: real Baileys 6.7.22 engine, random math access, real downloader engine.",
};

export const viewport: Viewport = {
  themeColor: "#020817",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
