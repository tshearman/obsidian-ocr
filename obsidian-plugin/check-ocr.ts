/**
 * Integration check: downloads EWD1005.PDF, OCRs it, and asserts the result
 * is non-empty text. Does NOT validate quality — just that the pipeline works.
 *
 * Usage:
 *   PROVIDER=anthropic API_KEY=sk-ant-... npm run check-ocr
 *   PROVIDER=openai    API_KEY=sk-...     npm run check-ocr
 *
 * Or via just from the repo root:
 *   PROVIDER=anthropic API_KEY=sk-ant-... just check-ocr
 */

import * as mupdf from "mupdf";
import { AnthropicProvider } from "./src/providers/anthropic.js";
import { OpenAIProvider } from "./src/providers/openai.js";
import { normalizeLatexDelimiters } from "./src/ocr.js";

const PDF_URL = "https://www.cs.utexas.edu/~EWD/ewd10xx/EWD1005.PDF";

// ── Config ────────────────────────────────────────────────────────────────────

const providerName = (process.env.PROVIDER ?? "").toLowerCase();
const apiKey = process.env.API_KEY ?? "";

if (!providerName) {
  console.error("Error: PROVIDER env var is required (anthropic or openai)");
  process.exit(1);
}
if (!apiKey) {
  console.error("Error: API_KEY env var is required");
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Render every page of a PDF buffer to PNG data URLs using mupdf. */
function pdfToDataUrls(buf: Uint8Array, dpi = 150): string[] {
  const scale = dpi / 72;
  const doc = mupdf.Document.openDocument(buf, "application/pdf");
  const urls: string[] = [];

  const pageCount = doc.countPages();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.loadPage(i);
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
    );
    const png = pixmap.asPNG();
    urls.push(`data:image/png;base64,${Buffer.from(png).toString("base64")}`);
    pixmap.destroy();
    page.destroy();
  }

  doc.destroy();
  return urls;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.error(`Fetching ${PDF_URL} …`);
const response = await fetch(PDF_URL);

assert(response.ok, `HTTP ${response.status} fetching PDF`);

const arrayBuffer = await response.arrayBuffer();
const buf = new Uint8Array(arrayBuffer);

assert(buf.length > 0, "Downloaded PDF buffer is empty");
console.error(`  ${buf.length} bytes downloaded`);

console.error("Rendering PDF pages …");
const imageDataUrls = pdfToDataUrls(buf);

assert(imageDataUrls.length > 0, "No pages rendered from PDF");
console.error(`  ${imageDataUrls.length} page(s) rendered`);

let provider: AnthropicProvider | OpenAIProvider;
if (providerName === "openai") {
  provider = new OpenAIProvider(apiKey, process.env.OPENAI_MODEL ?? "gpt-4o");
} else if (providerName === "anthropic") {
  provider = new AnthropicProvider(apiKey, process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6");
} else {
  console.error(`Error: unknown provider "${providerName}" (use anthropic or openai)`);
  process.exit(1);
}

console.error(`Sending to ${providerName} API …`);
const raw = await provider.ocr(imageDataUrls);
const result = normalizeLatexDelimiters(raw);

assert(result.length > 0, "OCR result is empty");
assert(/[a-zA-Z]{3,}/.test(result), "OCR result contains no readable words");

console.error(`  ${result.length} characters returned`);
console.error("PASS");
