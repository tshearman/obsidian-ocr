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
  pdfDpi = 150,
  preprocess = true,
  extraInstructions = "",
  pagesPerBatch = 3
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
    const preprocessed: string[] = [];
    for (const url of imageDataUrls) {
      preprocessed.push(await preprocessImageDataUrl(url));
      // Yield between pages so Obsidian's UI can update.
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    imageDataUrls = preprocessed;
  }

  const results: string[] = [];
  for (let i = 0; i < imageDataUrls.length; i += pagesPerBatch) {
    const batch = imageDataUrls.slice(i, i + pagesPerBatch);
    const raw = await provider.ocr(batch, extraInstructions || undefined);
    results.push(normalizeLatexDelimiters(raw));
  }
  return results.join("\n\n");
}

/**
 * Safety-net delimiter normalisation.
 *
 * The prompt instructs the model to use dollar-sign delimiters exclusively,
 * but models occasionally still emit bracket-style delimiters. These two
 * substitutions correct that without touching anything else.
 *
 * - `\( … \)` → `$ … $`   (inline math)
 * - `\[ … \]` → `$$ … $$` (display math)
 */
export function normalizeLatexDelimiters(text: string): string {
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$$");
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, "$$$$$1$$$$");
  return text;
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
