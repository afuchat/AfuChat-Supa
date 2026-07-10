import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    "*.replit.dev",
    "*.worf.replit.dev",
    "*.kirk.replit.dev",
    "*.repl.co",
    "*.replit.app",
    "127.0.0.1",
    "localhost",
  ],
};

export default nextConfig;
