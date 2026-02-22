import OpenAI from "openai";
import type { LlmProvider } from "./base";
import { HANDWRITTEN_NOTES_PROMPT } from "../prompt";

const SYSTEM_PROMPT = HANDWRITTEN_NOTES_PROMPT;

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
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = imageDataUrls.flatMap(
      (url, i): OpenAI.Chat.ChatCompletionContentPart[] => [
        ...(imageDataUrls.length > 1
          ? [{ type: "text" as const, text: `[Page ${i + 1}]` }]
          : []),
        { type: "image_url" as const, image_url: { url, detail: "high" as const } },
      ]
    );

    const userText = extraInstructions
      ? `OCR all content above.\n\n${extraInstructions}`
      : `OCR all content above.`;
    userContent.push({ type: "text", text: userText });

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
