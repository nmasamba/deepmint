import { randomUUID } from "node:crypto";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // The service worker's offline fallback page. Precached with a revision per
  // build, so each deploy replaces the cached copy.
  additionalPrecacheEntries: [
    { url: "/offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID() },
  ],
});

const nextConfig: NextConfig = {
  transpilePackages: ["@deepmint/api", "@deepmint/db", "@deepmint/shared", "@deepmint/ingestion", "@deepmint/worker"],
  serverExternalPackages: ["playwright", "playwright-core", "@aws-sdk/client-s3"],
};

export default withSerwist(nextConfig);
