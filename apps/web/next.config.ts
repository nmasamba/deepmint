import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@deepmint/api", "@deepmint/db", "@deepmint/shared"],
};

export default nextConfig;
