/**
 * Integration check: downloads EWD1005.PDF, runs it through the OCR CLI,
 * and asserts the result is non-empty text. Does NOT validate quality —
 * just that the pipeline works end-to-end.
 *
 * Uses the same environment variables as cli.ts:
 *   OCR_PROVIDER       required — anthropic, openai, or ollama
 *   ANTHROPIC_API_KEY  required when provider = anthropic
 *   ANTHROPIC_MODEL    default: claude-sonnet-4-6
 *   OPENAI_API_KEY     required when provider = openai
 *   OPENAI_MODEL       default: gpt-4o
 *   OLLAMA_HOST        default: http://localhost:11434
 *   OLLAMA_MODEL       default: llama3.2-vision
 *   PDF_DPI            default: 150
 *
 * Usage:
 *   OCR_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-... just check-ocr
 *   OCR_PROVIDER=openai    OPENAI_API_KEY=sk-...        just check-ocr
 *   OCR_PROVIDER=ollama    OLLAMA_MODEL=llava            just check-ocr
 */

import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PDF_URL = "https://www.cs.utexas.edu/~EWD/ewd10xx/EWD1005.PDF";

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

// ── Download ──────────────────────────────────────────────────────────────────

console.error(`Fetching ${PDF_URL} …`);
const response = await fetch(PDF_URL);
if (!response.ok) fail(`HTTP ${response.status} fetching PDF`);

const buf = new Uint8Array(await response.arrayBuffer());
if (buf.length === 0) fail("Downloaded PDF buffer is empty");
console.error(`  ${buf.length} bytes downloaded`);

// ── Write temp file and invoke CLI ────────────────────────────────────────────

const tmpPath = join(tmpdir(), `check-ocr-${Date.now()}.pdf`);
writeFileSync(tmpPath, buf);

try {
  console.error("Running OCR via cli.ts …");
  const result = spawnSync(
    "node_modules/.bin/tsx",
    ["scripts/cli.ts", tmpPath],
    { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );

  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`Failed to spawn cli.ts: ${result.error.message}`);
  if (result.status !== 0) fail(`cli.ts exited with status ${result.status}`);

  const output = result.stdout;
  if (output.length === 0) fail("OCR result is empty");
  if (!/[a-zA-Z]{3,}/.test(output)) fail("OCR result contains no readable words");

  console.error(`  ${output.length} characters returned`);
  console.error("PASS");
} finally {
  unlinkSync(tmpPath);
}
