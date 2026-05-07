// Runs during Docker build to pre-compile the Remotion webpack bundle.
// This means the server never has to webpack on first request (was 1-2 min).

import { bundle } from "@remotion/bundler";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const outDir = resolve(process.cwd(), ".remotion-bundle");
mkdirSync(outDir, { recursive: true });

console.log("[prebundle] Bundling Remotion compositions...");

const bundlePath = await bundle({
  entryPoint: resolve(process.cwd(), "src/remotion/index.ts"),
  outDir,
  webpackOverride: (config) => config,
  onProgress: (progress) => {
    process.stdout.write(`\r[prebundle] ${Math.round(progress * 100)}%  `);
  },
});

process.stdout.write("\n");

// Write the resolved path so the server can load it without re-bundling
writeFileSync(resolve(process.cwd(), ".remotion-bundle-path"), bundlePath);
console.log("[prebundle] Done:", bundlePath);
