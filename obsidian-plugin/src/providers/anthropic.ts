import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider } from "./base";
import { HANDWRITTEN_NOTES_PROMPT } from "../prompt";

const SYSTEM_PROMPT = HANDWRITTEN_NOTES_PROMPT;

export class AnthropicProvider implements LlmProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    this.model = model;
  }

  async ocr(imageDataUrls: string[], outputFormat: "markdown" | "text"): Promise<string> {
    const content: Anthropic.MessageParam["content"] = [];

    imageDataUrls.forEach((dataUrl, i) => {
      const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) return;
      const [, rawMediaType, b64] = match;
      const mediaType = rawMediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif";

      if (imageDataUrls.length > 1) {
        content.push({ type: "text", text: `[Page ${i + 1}]` });
      }
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: b64 },
      });
    });

    content.push({
      type: "text",
      text: `Please OCR all content above. Output format: ${outputFormat}.`,
    });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const block = response.content[0];
    return block.type === "text" ? block.text : "";
  }
}
