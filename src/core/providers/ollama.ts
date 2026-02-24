import OpenAI from "openai";
import type { LlmProvider } from "./base";
import { buildOpenAIUserContent } from "./base";
import { HANDWRITTEN_NOTES_PROMPT } from "../prompt";

export class OllamaProvider implements LlmProvider {
  private client: OpenAI;
  private model: string;

  constructor(host: string, model: string) {
    this.client = new OpenAI({
      apiKey: "ollama",
      baseURL: `${host}/v1`,
      dangerouslyAllowBrowser: true,
    });
    this.model = model;
  }

  async ocr(imageDataUrls: string[], extraInstructions?: string): Promise<string> {
    const userContent = buildOpenAIUserContent(imageDataUrls, extraInstructions);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: HANDWRITTEN_NOTES_PROMPT },
        { role: "user", content: userContent },
      ],
      // Keep the model loaded for 15 min between batches (default is 5 min,
      // which is too short for multi-batch PDF processing).
      // @ts-expect-error — Ollama extension field not in OpenAI types
      keep_alive: "15m",
    });

    return response.choices[0]?.message?.content ?? "";
  }
}
