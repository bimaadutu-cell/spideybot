import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@whiskeysockets/baileys",
    "pino",
    "sharp",
    "jimp",
    "link-preview-js",
    "audio-decode",
    "qrcode",
  ],
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default nextConfig;
