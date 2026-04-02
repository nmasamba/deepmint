import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@deepmint/api", "@deepmint/db", "@deepmint/shared", "@deepmint/ingestion", "@deepmint/worker"],
  serverExternalPackages: ["playwright", "playwright-core", "@aws-sdk/client-s3"],
};

export default nextConfig;
