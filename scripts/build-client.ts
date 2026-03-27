/**
 * Nexular client bundle builder — uses esbuild to compile src/client/main.ts
 * into dist/client/main.js (served at /client/main.js for hydration).
 *
 * Usage:
 *   npx tsx scripts/build-client.ts           # one-shot build
 *   npx tsx scripts/build-client.ts --watch   # watch mode for development
 */

import esbuild from "esbuild";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(__dirname, "..");
const ENTRY = path.join(ROOT, "src/client/main.ts");
const OUT_DIR = path.join(ROOT, "dist/client");
const OUT_FILE = path.join(OUT_DIR, "main.js");

const isWatch = process.argv.includes("--watch");
const isProd = process.env.NODE_ENV === "production";

async function main(): Promise<void> {
  if (!fs.existsSync(ENTRY)) {
    console.error(`[build-client] Entry not found: ${ENTRY}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const buildOptions: esbuild.BuildOptions = {
    entryPoints: [ENTRY],
    outfile: OUT_FILE,
    bundle: true,
    platform: "browser",
    target: ["es2020", "chrome90", "firefox88", "safari14"],
    format: "iife",
    globalName: "NexularClient",
    minify: isProd,
    sourcemap: !isProd,
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "development"),
    },
    // Resolve path aliases matching tsconfig
    alias: {
      "@nexular/core": path.join(ROOT, "src/app/core/index.ts"),
    },
    // Tree-shake aggressively
    treeShaking: true,
    logLevel: "info",
  };

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log(`[build-client] Watching ${ENTRY} → ${OUT_FILE}`);
  } else {
    const result = await esbuild.build(buildOptions);
    const sizeKb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
    if (result.errors.length === 0) {
      console.log(`[build-client] Built ${OUT_FILE} (${sizeKb} KB)`);
    }
  }
}

main().catch((err) => {
  console.error("[build-client] Build failed:", err);
  process.exit(1);
});
