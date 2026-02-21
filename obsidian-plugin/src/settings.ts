export type LlmProvider = "anthropic" | "openai";

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
};
