/**
 * Orchestrates: file buffer → images (data URLs) → LLM OCR → string.
 */

import type { LlmProvider } from "./providers/base";
import { pdfToDataUrls, dpiToScale } from "./pdf-converter";
import { preprocessImageDataUrl } from "./preprocessing";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export async function ocrFile(
  fileBuffer: ArrayBuffer,
  fileExtension: string,
  provider: LlmProvider,
  outputFormat: "markdown" | "text" = "markdown",
  pdfDpi = 150,
  preprocess = true
): Promise<string> {
  let imageDataUrls: string[];

  if (fileExtension === "pdf") {
    const scale = dpiToScale(pdfDpi);
    imageDataUrls = await pdfToDataUrls(fileBuffer, { scale });
  } else if (IMAGE_EXTENSIONS.has(fileExtension.toLowerCase())) {
    const b64 = arrayBufferToBase64(fileBuffer);
    const mime = extensionToMime(fileExtension);
    imageDataUrls = [`data:${mime};base64,${b64}`];
  } else {
    throw new Error(`Unsupported file extension: .${fileExtension}`);
  }

  if (preprocess) {
    imageDataUrls = await Promise.all(imageDataUrls.map(preprocessImageDataUrl));
  }

  const raw = await provider.ocr(imageDataUrls, outputFormat);
  return outputFormat === "markdown" ? normalizeLatexDelimiters(raw) : raw;
}

/**
 * Replace LaTeX bracket delimiters with dollar-sign equivalents.
 *
 * - `\( ... \)` → `$ ... $`    (inline math)
 * - `\[ ... \]` → `$$ ... $$`  (display math)
 */
export function normalizeLatexDelimiters(text: string): string {
  // Display math: \[ ... \]  (possibly multi-line) → $$ ... $$
  // "$$$$" → "$$", "$1" → capture group, "$$$$" → "$$"  ⟹  $$<content>$$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, "$$$$$1$$$$");
  // Inline math: \( ... \) → $ ... $
  // "$$" → "$", "$1" → capture group, "$$" → "$"  ⟹  $<content>$
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$$");
  // Merge consecutive single-line $$...$$ blocks into one multi-line block
  text = mergeConsecutiveDisplayBlocks(text);
  // Add \\ line terminators to multi-line $$ blocks (math-only blocks only)
  text = text.replace(/\$\$\n([\s\S]*?)\n\$\$/g, addDisplayLinebreaks);
  // Convert $$...$$ that appears inline with surrounding text to $...$
  text = fixInlineDoubleDollar(text);
  return text;
}

function mergeConsecutiveDisplayBlocks(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^\$\$(.+)\$\$$/);
    if (m) {
      const run: string[] = [m[1].trim()];
      let j = i + 1;
      while (j < lines.length) {
        const m2 = lines[j].match(/^\$\$(.+)\$\$$/);
        if (m2) {
          run.push(m2[1].trim());
          j++;
        } else {
          break;
        }
      }
      if (run.length === 1) {
        result.push(lines[i]); // lone block — leave untouched
      } else {
        result.push("$$");
        result.push(...run);
        result.push("$$");
      }
      i = j;
    } else {
      result.push(lines[i]);
      i++;
    }
  }
  return result.join("\n");
}

/**
 * True if a line looks like English prose: contains ≥2 lowercase word tokens
 * of ≥3 letters that are NOT preceded by a backslash (i.e. not LaTeX commands).
 */
function looksLikeProse(line: string): boolean {
  // Strip \text{...} groups before checking — their English content is intentional math annotation
  const stripped = line.replace(/\\text\{[^}]*\}/g, "");
  const words = stripped.match(/(?<!\\)\b[a-z]{3,}\b/g) ?? [];
  return words.length >= 2;
}

function addDisplayLinebreaks(_match: string, inner: string): string {
  const lines = inner.split("\n").map((l) => l.trimEnd());
  const nonEmptyIndices = lines.reduce<number[]>((acc, l, i) => {
    if (l) acc.push(i);
    return acc;
  }, []);
  if (nonEmptyIndices.length <= 1) return `$$\n${inner}\n$$`;
  // Already wrapped in a LaTeX environment (e.g. \begin{gathered}) — leave alone
  if (lines[nonEmptyIndices[0]]?.startsWith("\\begin{")) {
    return `$$\n${inner}\n$$`;
  }
  // If any non-empty content line looks like prose, this is a malformed block —
  // leave it untouched rather than scattering \\ through prose text.
  if (nonEmptyIndices.some((i) => looksLikeProse(lines[i]))) {
    return `$$\n${inner}\n$$`;
  }
  const content = nonEmptyIndices.map((i) => {
    const line = lines[i];
    const withSlash = line.endsWith("\\\\") ? line : line + " \\\\";
    return `& ${withSlash}`;
  });
  return `$$\n\\begin{gather}\n${content.join("\n")}\n\\end{gather}\n$$`;
}

/**
 * Convert $$...$$ that appears inline (with surrounding text on the same line)
 * to $...$ so it renders as inline math rather than a display block.
 *
 * Leaves untouched:
 *   - bare `$$` lines (multi-line block delimiters)
 *   - lines whose entire content is `$$...$$` (standalone display math)
 */
function fixInlineDoubleDollar(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      // Bare $$ delimiter line — part of a multi-line block
      if (/^\s*\$\$\s*$/.test(line)) return line;
      // Entire line is $$...$$ — standalone display math, leave as is
      if (/^\s*\$\$[^$].*\$\$\s*$/.test(line)) return line;
      // Anything else: replace $$...$$ occurrences with $...$
      return line.replace(/\$\$(.+?)\$\$/g, (_, content) => `$${content}$`);
    })
    .join("\n");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function extensionToMime(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return map[ext.toLowerCase()] ?? "image/png";
}
