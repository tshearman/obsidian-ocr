/**
 * Tests for ocrFile() from ocr.ts.
 * pdf-converter and preprocessing are mocked to avoid DOM/canvas dependency.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LlmProvider } from "../src/providers/base";

// Mock pdf-converter before importing ocrFile
vi.mock("../src/pdf-converter", () => ({
  pdfToDataUrls: vi.fn().mockResolvedValue(["data:image/png;base64,abc123"]),
  dpiToScale: (dpi: number) => dpi / 72,
}));

// Mock preprocessing (uses DOM Canvas — not available in Node)
vi.mock("../src/preprocessing", () => ({
  preprocessImageDataUrl: vi.fn().mockImplementation((url: string) =>
    Promise.resolve(url)
  ),
}));

import { ocrFile } from "../src/ocr";
import { pdfToDataUrls } from "../src/pdf-converter";
import { preprocessImageDataUrl } from "../src/preprocessing";

function makeProvider(response: string): LlmProvider {
  return {
    ocr: vi.fn().mockResolvedValue(response),
  };
}

function makeBuffer(content = "fake"): ArrayBuffer {
  return new TextEncoder().encode(content).buffer;
}

describe("ocrFile", () => {
  beforeEach(() => {
    // Reset the resolved value after clearMocks resets it
    vi.mocked(pdfToDataUrls).mockResolvedValue([
      "data:image/png;base64,abc123",
    ]);
    vi.mocked(preprocessImageDataUrl).mockImplementation((url: string) =>
      Promise.resolve(url)
    );
  });

  describe("PDF input", () => {
    it("passes buffer through pdfToDataUrls and calls provider.ocr", async () => {
      const provider = makeProvider("# Heading\n\nSome text.");
      const result = await ocrFile(makeBuffer(), "pdf", provider);

      expect(pdfToDataUrls).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
        scale: expect.any(Number),
      });
      expect(provider.ocr).toHaveBeenCalledWith(
        ["data:image/png;base64,abc123"],
        undefined
      );
      expect(result).toContain("# Heading");
    });

    it("uses pdfDpi to derive scale", async () => {
      const provider = makeProvider("text");
      await ocrFile(makeBuffer(), "pdf", provider, 144);

      expect(pdfToDataUrls).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
        scale: 2.0,
      });
    });

    it("passes multiple data URLs to provider.ocr for multi-page PDF", async () => {
      vi.mocked(pdfToDataUrls).mockResolvedValue([
        "data:image/png;base64,page1",
        "data:image/png;base64,page2",
      ]);
      const provider = makeProvider("multi page");
      await ocrFile(makeBuffer(), "pdf", provider);

      expect(provider.ocr).toHaveBeenCalledWith(
        ["data:image/png;base64,page1", "data:image/png;base64,page2"],
        undefined
      );
    });
  });

  describe("image input", () => {
    it("converts a PNG buffer directly to a data URL", async () => {
      const provider = makeProvider("image text");
      const result = await ocrFile(makeBuffer(), "png", provider);

      expect(pdfToDataUrls).not.toHaveBeenCalled();
      expect(provider.ocr).toHaveBeenCalledWith(
        [expect.stringMatching(/^data:image\/png;base64,/)],
        undefined
      );
      expect(result).toBe("image text");
    });

    it("uses correct MIME type for jpg", async () => {
      const provider = makeProvider("jpeg text");
      await ocrFile(makeBuffer(), "jpg", provider);

      const [urls] = vi.mocked(provider.ocr).mock.calls[0];
      expect((urls as string[])[0]).toMatch(/^data:image\/jpeg;base64,/);
    });

    it("uses correct MIME type for webp", async () => {
      const provider = makeProvider("webp text");
      await ocrFile(makeBuffer(), "webp", provider);

      const [urls] = vi.mocked(provider.ocr).mock.calls[0];
      expect((urls as string[])[0]).toMatch(/^data:image\/webp;base64,/);
    });

    it("is case-insensitive for extension", async () => {
      const provider = makeProvider("text");
      await ocrFile(makeBuffer(), "PNG", provider);

      expect(provider.ocr).toHaveBeenCalledWith(
        [expect.stringMatching(/^data:image\/png;base64,/)],
        undefined
      );
    });
  });

  it("normalizes latex delimiters in the output", async () => {
    const provider = makeProvider(String.raw`\(x\)`);
    const result = await ocrFile(makeBuffer(), "png", provider);
    expect(result).toBe("$x$");
  });

  // ── Preprocessing flag — mirrors TestCliPreprocessFlag ──────────────────────

  describe("preprocessing (TestCliPreprocessFlag equivalents)", () => {
    it("preprocessing is applied by default (preprocess=true)", async () => {
      const provider = makeProvider("text");
      await ocrFile(makeBuffer(), "png", provider);
      expect(preprocessImageDataUrl).toHaveBeenCalledOnce();
    });

    it("preprocessing is applied to images when preprocess=true", async () => {
      const provider = makeProvider("text");
      await ocrFile(makeBuffer(), "png", provider, 150, true);
      expect(preprocessImageDataUrl).toHaveBeenCalledOnce();
    });

    it("preprocessing is skipped when preprocess=false", async () => {
      const provider = makeProvider("text");
      await ocrFile(makeBuffer(), "png", provider, 150, false);
      expect(preprocessImageDataUrl).not.toHaveBeenCalled();
    });

    it("preprocessing is applied to every PDF page when preprocess=true", async () => {
      vi.mocked(pdfToDataUrls).mockResolvedValue([
        "data:image/png;base64,page1",
        "data:image/png;base64,page2",
        "data:image/png;base64,page3",
      ]);
      const provider = makeProvider("text");
      await ocrFile(makeBuffer(), "pdf", provider, 150, true);
      expect(preprocessImageDataUrl).toHaveBeenCalledTimes(3);
    });

    it("no preprocessing of PDF pages when preprocess=false", async () => {
      vi.mocked(pdfToDataUrls).mockResolvedValue([
        "data:image/png;base64,page1",
        "data:image/png;base64,page2",
      ]);
      const provider = makeProvider("text");
      await ocrFile(makeBuffer(), "pdf", provider, 150, false);
      expect(preprocessImageDataUrl).not.toHaveBeenCalled();
    });
  });

  describe("error cases", () => {
    it("throws for unsupported file extension", async () => {
      const provider = makeProvider("text");
      await expect(
        ocrFile(makeBuffer(), "docx", provider)
      ).rejects.toThrow("Unsupported file extension: .docx");
    });
  });
});
