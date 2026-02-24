import OpenAI from "openai";
import type { LlmProvider } from "./base";
import { buildOpenAIUserContent } from "./base";
import { HANDWRITTEN_NOTES_PROMPT } from "../prompt";

export class OpenAIProvider implements LlmProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    this.model = model;
  }

  async ocr(imageDataUrls: string[], extraInstructions?: string): Promise<string> {
    const userContent = buildOpenAIUserContent(imageDataUrls, extraInstructions);

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 4096,
      messages: [
        { role: "system", content: HANDWRITTEN_NOTES_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    return response.choices[0]?.message?.content ?? "";
  }
}
