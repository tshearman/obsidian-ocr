export interface LlmProvider {
  ocr(imageDataUrls: string[], outputFormat: "markdown" | "text", extraInstructions?: string): Promise<string>;
}
