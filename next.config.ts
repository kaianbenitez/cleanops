import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Keep Turbopack anchored to this project when the workspace contains a
  // second lockfile (for example, the parent Downloads directory).
  turbopack: {
    root: process.cwd(),
  },
  // Sentry DSNs aren't secret, so it's safe to bake the existing server-only
  // SENTRY_DSN into the client bundle under this name at build time instead
  // of duplicating it as a second Vercel env var.
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN,
  },
};

export default nextConfig;
