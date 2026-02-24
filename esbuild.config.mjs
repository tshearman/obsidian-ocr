import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { copyFileSync, mkdirSync } from "fs";

function copyWorker() {
  mkdirSync("dist", { recursive: true });
  copyFileSync(
    "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
    "dist/pdf.worker.min.mjs"
  );
}

const isProd = process.argv[2] === "production";

// Main plugin bundle (CommonJS, required by Obsidian)
const mainContext = await esbuild.context({
  entryPoints: ["src/plugin/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  define: {
    "process.env.NODE_ENV": isProd ? '"production"' : '"development"',
  },
  target: "es2022",
  logLevel: "info",
  sourcemap: isProd ? false : "inline",
  treeShaking: true,
  outfile: "dist/main.js",
  minify: isProd,
});

// Preprocessing Web Worker (IIFE — workers don't support CommonJS exports)
const workerContext = await esbuild.context({
  entryPoints: ["src/core/preprocessing.worker.ts"],
  bundle: true,
  external: [...builtins],
  format: "iife",
  target: "es2022",
  logLevel: "info",
  sourcemap: isProd ? false : "inline",
  treeShaking: true,
  outfile: "dist/preprocessing.worker.js",
  minify: isProd,
});

copyWorker();

if (isProd) {
  await Promise.all([mainContext.rebuild(), workerContext.rebuild()]);
  process.exit(0);
} else {
  await Promise.all([mainContext.watch(), workerContext.watch()]);
}
