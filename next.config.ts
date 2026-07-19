import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Keep Turbopack anchored to this project when the workspace contains a
  // second lockfile (for example, the parent Downloads directory).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
