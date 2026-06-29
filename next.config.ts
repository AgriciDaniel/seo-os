import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return [
      { source: "/dashboard", destination: "/office", permanent: false },
    ];
  },
  outputFileTracingExcludes: {
    "/*": [
      "./.env.local",
      "./.env.*.local",
      "./.seo-office/**/*",
      "./AGENTS.md",
      "./CLAUDE.md",
      "./README.md",
      "./docs/**/*",
      "./docs/screenshots/**/*",
      "./eslint.config.*",
      "./next.config.*",
      "./smoke-*.png",
    ],
  },
};

export default nextConfig;
