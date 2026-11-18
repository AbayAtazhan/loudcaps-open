#!/usr/bin/env node
/**
 * Runs after `next build`.
 *
 * The bundler copies onnxruntime's ~26 MB WebAssembly binary into the build even
 * though the app loads that runtime from the jsDelivr CDN at run time. The copy is
 * never requested, and it is larger than some static hosts allow per file
 * (Cloudflare Pages: 25 MiB), so it is removed here.
 */
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const media = join(fileURLToPath(new URL("..", import.meta.url)), "out", "_next", "static", "media");
let freed = 0;
try {
  for (const file of readdirSync(media)) {
    if (!/^ort-wasm.*\.wasm$/.test(file)) continue;
    freed += statSync(join(media, file)).size;
    rmSync(join(media, file));
  }
} catch {
  // No media folder means there is nothing to clean up.
}
if (freed) console.log(`postbuild: removed unused speech runtime copy (${(freed / 1048576).toFixed(1)} MB)`);
