import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Replit's preview proxy sits in front of the dev server on a domain that
  // isn't localhost, and Next.js's dev-only origin check otherwise rejects
  // those requests (breaking hydration: JS/CSS chunks 403, page loads inert).
  allowedDevOrigins: ["*.replit.dev", "*.kirk.replit.dev", "*.repl.co", "127.0.0.1", "localhost"],
};

export default nextConfig;
