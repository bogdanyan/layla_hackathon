import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // We open the app at 127.0.0.1 (Spotify rejects localhost redirect URIs). Without this, the dev
  // server blocks its HMR connection for that origin and client components never start.
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  // /api/story reads these with fs at runtime; make sure Vercel bundles them with the function.
  outputFileTracingIncludes: {
    "/api/story": ["./assets/fonts/**/*"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
