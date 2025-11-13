import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack configuration for development
  turbopack: {
    resolveExtensions: [".mdx", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
    // external: ["pino-pretty", "lokijs", "encoding"],
  },
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
};

export default nextConfig;

// added by create cloudflare to enable calling `getCloudflareContext()` in `next dev`
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
