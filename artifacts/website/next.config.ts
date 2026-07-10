import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Replit's preview proxy sits in front of the dev server on a domain that
  // isn't localhost, and Next.js's dev-only origin check otherwise rejects
  // those requests.
  allowedDevOrigins: ["*"],
};

export default nextConfig;
