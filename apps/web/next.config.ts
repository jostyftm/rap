import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rpa/dsl", "@rpa/locator"],
  /* config options here */
  cacheComponents: true,
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
