export type ProviderName = "anthropic" | "openai" | "ollama";

export interface OcrPluginSettings {
  provider: ProviderName;
  anthropicApiKey: string;
  openaiApiKey: string;
  anthropicModel: string;
  openaiModel: string;
  /** Ollama server URL, e.g. "http://localhost:11434" or a remote host */
  ollamaHost: string;
  ollamaModel: string;
  /** Vault-relative folder paths to watch, e.g. ["Inbox", "Scans"] */
  watchFolders: string[];
  /** Appended to the file basename for the output file, e.g. "-ocr" → "doc-ocr.md" */
  outputSuffix: string;
  /** Vault-relative folder for output files. Empty = same folder as the source file. */
  outputDir: string;
  /** PDF rendering resolution (higher = better quality, larger API payload) */
  pdfDpi: number;
  /** Apply auto-contrast + unsharp-mask preprocessing before sending to the LLM */
  preprocess: boolean;
  /** Number of pages sent to the LLM in a single API call (batched sequentially) */
  pagesPerBatch: number;
  /** Optional extra instructions appended to the OCR user prompt. */
  additionalOcrPromptInstructions: string;
  /** Maximum number of files processed concurrently. Reduce to 1 to serialise all requests. */
  maxConcurrent: number;
  /** Vault-relative path for the processing log file. Empty string disables logging. */
  logFilePath: string;
}

export const DEFAULT_SETTINGS: OcrPluginSettings = {
  provider: "anthropic",
  anthropicApiKey: "",
  openaiApiKey: "",
  anthropicModel: "claude-sonnet-4-6",
  openaiModel: "gpt-4o",
  ollamaHost: "http://localhost:11434",
  ollamaModel: "llama3.2-vision",
  watchFolders: [],
  outputSuffix: "",
  outputDir: "",
  pdfDpi: 150,
  preprocess: true,
  pagesPerBatch: 3,
  additionalOcrPromptInstructions: "",
  maxConcurrent: 1,
  logFilePath: "_ocr-processing.log",
};
