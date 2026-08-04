import type { NextConfig } from "next";

const repoName = "jlpt-grammar";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: "/jlpt-grammar",
  assetPrefix: "/jlpt-grammar/",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
