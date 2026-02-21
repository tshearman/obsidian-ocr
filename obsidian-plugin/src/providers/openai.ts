import OpenAI from "openai";
import type { LlmProvider } from "./base";
import { HANDWRITTEN_NOTES_PROMPT } from "../prompt";

const SYSTEM_PROMPT = HANDWRITTEN_NOTES_PROMPT;

export class OpenAIProvider implements LlmProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    this.model = model;
  }

  async ocr(imageDataUrls: string[], outputFormat: "markdown" | "text"): Promise<string> {
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = imageDataUrls.flatMap(
      (url, i): OpenAI.Chat.ChatCompletionContentPart[] => [
        ...(imageDataUrls.length > 1
          ? [{ type: "text" as const, text: `[Page ${i + 1}]` }]
          : []),
        { type: "image_url" as const, image_url: { url, detail: "high" as const } },
      ]
    );

    userContent.push({
      type: "text",
      text: `OCR all content above. Output format: ${outputFormat}.`,
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    return response.choices[0]?.message?.content ?? "";
  }
}
