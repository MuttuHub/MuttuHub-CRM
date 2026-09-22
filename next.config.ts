import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows the WSL network IP (browser -> Windows-hosted `next dev`) to load
  // dev-only JS/HMR resources; Next.js 16 blocks cross-origin dev requests
  // by default. Dev-only setting, harmless in production builds.
  allowedDevOrigins: ["10.102.66.2"],
};

export default nextConfig;
