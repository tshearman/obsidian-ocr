/**
 * Node.js CLI for OCR — converts images and PDFs to markdown via LLM vision APIs.
 *
 * PDF rendering uses the `mupdf` npm package (WASM-based, no native compilation,
 * no system deps). Output is written to stdout; status messages go to stderr.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npm run ocr -- path/to/file.pdf
 *   OPENAI_API_KEY=sk-...  OCR_PROVIDER=openai npm run ocr -- path/to/image.png
 *
 * Or via just from the repo root:
 *   just ocr path/to/file.pdf
 *   OCR_PROVIDER=openai just ocr path/to/image.png
 *
 * Environment variables:
 *   OCR_PROVIDER       "openai" (default) or "anthropic"
 *   ANTHROPIC_API_KEY  required when provider = anthropic
 *   ANTHROPIC_MODEL    default: claude-sonnet-4-6
 *   OPENAI_API_KEY     required when provider = openai
 *   OPENAI_MODEL       default: gpt-4o
 *   PDF_DPI            default: 150
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import * as mupdf from "mupdf";
import { AnthropicProvider } from "./src/providers/anthropic.js";
import { OpenAIProvider } from "./src/providers/openai.js";
import { normalizeLatexDelimiters } from "./src/ocr.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif:  "image/gif",
};

function imageBufferToDataUrl(buf: Buffer, ext: string): string {
  const mime = MIME[ext];
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** Render every page of a PDF to a PNG data URL using mupdf (WASM, no DOM). */
function pdfToDataUrls(buf: Buffer, dpi: number): string[] {
  const scale = dpi / 72;
  const doc = mupdf.Document.openDocument(new Uint8Array(buf), "application/pdf");
  const urls: string[] = [];

  const pageCount = doc.countPages();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,  // no alpha
    );
    const png = pixmap.asPNG();
    urls.push(`data:image/png;base64,${Buffer.from(png).toString("base64")}`);
    pixmap.destroy();
    page.destroy();
  }

  doc.destroy();
  return urls;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npm run ocr -- <file>");
  console.error("       Supported: pdf, png, jpg, jpeg, webp, gif");
  process.exit(1);
}

const ext = extname(filePath).slice(1).toLowerCase();
const buf = readFileSync(filePath);
const dpi = Number(process.env.PDF_DPI ?? "150");

let imageDataUrls: string[];
if (ext === "pdf") {
  console.error(`Converting PDF → PNG (${dpi} DPI, ${buf.length} bytes)…`);
  imageDataUrls = pdfToDataUrls(buf, dpi);
  console.error(`  ${imageDataUrls.length} page(s) rendered`);
} else if (MIME[ext]) {
  imageDataUrls = [imageBufferToDataUrl(buf, ext)];
} else {
  console.error(`Unsupported extension: .${ext}`);
  process.exit(1);
}

const providerName = (process.env.OCR_PROVIDER ?? "openai").toLowerCase();
let provider: AnthropicProvider | OpenAIProvider;
if (providerName === "openai") {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) { console.error("OPENAI_API_KEY is not set"); process.exit(1); }
  provider = new OpenAIProvider(apiKey, process.env.OPENAI_MODEL ?? "gpt-4o");
} else {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!apiKey) { console.error("ANTHROPIC_API_KEY is not set"); process.exit(1); }
  provider = new AnthropicProvider(apiKey, process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6");
}

console.error(`Provider : ${providerName}`);
console.error(`File     : ${filePath} (${imageDataUrls.length} image(s))`);
console.error("Sending to API…\n");

const raw = await provider.ocr(imageDataUrls, "markdown");
console.log(normalizeLatexDelimiters(raw));
