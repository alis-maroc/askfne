import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@whiskeysockets/baileys", "jimp", "sharp", "pino", "redis", "qrcode"],
};

export default nextConfig;
