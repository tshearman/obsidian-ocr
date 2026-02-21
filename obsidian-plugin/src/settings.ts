export type LlmProvider = "anthropic" | "openai";

/** Persisted record of one successfully OCR'd PDF. */
export interface ProcessedEntry {
  /** ISO 8601 timestamp of when OCR completed. */
  processedAt: string;
  /** TFile.stat.mtime (ms since epoch) at time of processing.
   *  Used as a cheap first check — if unchanged, skip hashing entirely. */
  mtime: number;
  /** SHA-256 hex digest of the PDF binary.
   *  Consulted only when mtime changes, to confirm the content actually differs. */
  hash: string;
  /** Provider used, e.g. "anthropic" | "openai". */
  provider: string;
  /** Model identifier, e.g. "claude-sonnet-4-6". */
  model: string;
}

export interface OcrPluginSettings {
  provider: LlmProvider;
  anthropicApiKey: string;
  openaiApiKey: string;
  anthropicModel: string;
  openaiModel: string;
  /** Vault-relative folder paths to watch, e.g. ["Inbox", "Scans"] */
  watchFolders: string[];
  /** Appended to the PDF basename for the output file, e.g. "-ocr" → "doc-ocr.md" */
  outputSuffix: string;
  /** Vault-relative folder for output files. Empty = same folder as the source PDF. */
  outputDir: string;
  overwriteExisting: boolean;
  /** PDF rendering resolution (higher = better quality, larger API payload) */
  pdfDpi: number;
  /** Apply auto-contrast + unsharp-mask preprocessing before sending to the LLM */
  preprocess: boolean;
  /** Optional extra instructions appended to the OCR user prompt. */
  additionalOcrPromptInstructions: string;
  /** Log of every PDF successfully OCR'd, keyed by vault path. */
  processedLog: Record<string, ProcessedEntry>;
}

export const DEFAULT_SETTINGS: OcrPluginSettings = {
  provider: "anthropic",
  anthropicApiKey: "",
  openaiApiKey: "",
  anthropicModel: "claude-sonnet-4-6",
  openaiModel: "gpt-4o",
  watchFolders: [],
  outputSuffix: "",
  outputDir: "",
  overwriteExisting: false,
  pdfDpi: 150,
  preprocess: true,
  additionalOcrPromptInstructions: "",
  processedLog: {},
};
