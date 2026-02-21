export interface LlmProvider {
  ocr(imageDataUrls: string[], outputFormat: "markdown" | "text"): Promise<string>;
}
