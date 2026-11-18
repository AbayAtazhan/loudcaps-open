#!/usr/bin/env node
/**
 * Serves the production build in ./out exactly as a static host would,
 * including the cross-origin isolation headers from public/_headers.
 * Usage: npm run build && npm run preview
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "out");
const port = Number(process.env.PORT || 3000);
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
};

if (!existsSync(root)) {
  console.error("No ./out folder yet. Run `npm run build` first.");
  process.exit(1);
}

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
    res.writeHead(404).end();
    return;
  }
  const path = pathname.slice(basePath.length) || "/";
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": TYPES[".html"] });
    createReadStream(join(root, "404.html")).pipe(res);
    return;
  }
  const headers = { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" };
  if (path.startsWith("/studio")) headers["Cross-Origin-Opener-Policy"] = "same-origin";
  if (path.startsWith("/studio") || path.startsWith("/_next")) headers["Cross-Origin-Embedder-Policy"] = "credentialless";
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`LoudCaps production preview: http://localhost:${port}`));
