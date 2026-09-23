import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev-only: Next.js 16 blocks cross-origin requests to dev assets/HMR by
  // default (403 on every /_next/static/chunks/*.js + broken HMR websocket),
  // which surfaces in the browser as "This page couldn't load" once React
  // fails to hydrate. This project's `next dev` runs under Windows node.exe
  // and gets reached from this machine's LAN IP, other LAN devices, and
  // WSL's NAT IP — all addresses that change across reboots/networks (see
  // fix history for single hardcoded IPs: 9ff2730, bd97f62, which kept going
  // stale and re-breaking pages like /administracion). Allow the private
  // ranges these origins come from instead of one IP at a time; harmless in
  // production builds (allowedDevOrigins only applies to `next dev`).
  allowedDevOrigins: ["10.*.*.*", "172.*.*.*", "192.168.*.*"],
};

export default nextConfig;
