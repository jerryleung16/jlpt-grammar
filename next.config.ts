import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  serverExternalPackages: ["@github/copilot-sdk", "koffi"],
  trailingSlash: true,
  basePath: "/jlpt-grammar",
  assetPrefix: "/jlpt-grammar/",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
