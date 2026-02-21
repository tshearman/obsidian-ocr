/**
 * Converts a PDF ArrayBuffer to an array of PNG data URLs (one per page).
 * Uses pdfjs-dist to render pages to an HTML canvas — runs in Electron's
 * renderer process without any subprocess or native dependency.
 */

import type { App } from "obsidian";

export interface ConversionOptions {
  /** pdf.js uses a scale factor; scale=2 ≈ 144 DPI, scale=2.5 ≈ 180 DPI */
  scale?: number;
}

/** Convert a DPI value to a pdf.js scale factor (pdf.js uses 72 as base DPI). */
export function dpiToScale(dpi: number): number {
  return dpi / 72;
}

/**
 * Point pdfjs-dist at its worker file so it can spawn a real worker thread.
 * Must be called once at plugin load time (onload) before any PDF is rendered.
 *
 * The worker file is copied to the plugin directory during the build and
 * referenced via Obsidian's resource-path API so Electron can load it.
 */
export function configurePdfWorker(app: App, manifestDir: string | undefined): void {
  if (!manifestDir) return;
  // FileSystemAdapter (desktop) exposes getResourcePath; mobile has no PDF support.
  const adapter = app.vault.adapter as { getResourcePath?: (p: string) => string };
  if (typeof adapter.getResourcePath !== "function") return;

  import("pdfjs-dist").then(({ GlobalWorkerOptions }) => {
    GlobalWorkerOptions.workerSrc = adapter.getResourcePath!(
      `${manifestDir}/pdf.worker.min.mjs`
    );
  });
}

export async function pdfToDataUrls(
  pdfBuffer: ArrayBuffer,
  options: ConversionOptions = {}
): Promise<string[]> {
  const scale = options.scale ?? 2.0;

  // Dynamic import keeps the initial bundle load lighter
  const pdfjsLib = await import("pdfjs-dist");

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const dataUrls: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Electron exposes the full DOM; create an offscreen canvas element
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D canvas context");

    await page.render({ canvasContext: ctx, viewport }).promise;
    dataUrls.push(canvas.toDataURL("image/png"));

    // Explicitly destroy the page to free memory on large documents
    page.cleanup();
  }

  return dataUrls;
}
