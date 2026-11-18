import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * Cross-origin isolation lets the speech model run multi-threaded.
 *
 * A static export cannot set response headers itself, so:
 *   - `next dev` sets them here,
 *   - Cloudflare Pages and Netlify read `public/_headers`,
 *   - Vercel reads `vercel.json`.
 * Without them everything still works, on one thread.
 */
const isolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
];

export default function config(phase: string): NextConfig {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    // LoudCaps is a fully static site: `next build` writes plain files to ./out.
    output: dev ? undefined : "export",
    basePath: (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, ""),
    trailingSlash: true,
    images: { unoptimized: true },
    turbopack: {
      // One copy of the video library for the whole app. Without this the optional AAC
      // encoder bundles its own copy and registers itself where the exporter can't see it.
      resolveAlias: { mediabunny: "./node_modules/mediabunny/dist/modules/src/index.js" },
      rules: {
        "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
      },
    },
    ...(dev && {
      async headers() {
        return [
          { source: "/studio/:path*", headers: isolation },
          { source: "/_next/:path*", headers: [isolation[1]] },
        ];
      },
    }),
  };
}
