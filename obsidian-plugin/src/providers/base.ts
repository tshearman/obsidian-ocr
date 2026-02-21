export interface LlmProvider {
  ocr(imageDataUrls: string[], extraInstructions?: string): Promise<string>;
}
