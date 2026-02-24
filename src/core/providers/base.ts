export interface LlmProvider {
  ocr(imageDataUrls: string[], extraInstructions?: string): Promise<string>;
}

export function buildUserText(extraInstructions?: string): string {
  return extraInstructions
    ? `OCR all content above.\n\n${extraInstructions}`
    : "OCR all content above.";
}

/** Build the user-turn content array for OpenAI-compatible APIs. */
export function buildOpenAIUserContent(
  imageDataUrls: string[],
  extraInstructions?: string
) {
  const content = imageDataUrls.flatMap((url, i) => [
    ...(imageDataUrls.length > 1
      ? [{ type: "text" as const, text: `[Page ${i + 1}]` }]
      : []),
    { type: "image_url" as const, image_url: { url, detail: "high" as const } },
  ]);
  content.push({ type: "text" as const, text: buildUserText(extraInstructions) });
  return content;
}
