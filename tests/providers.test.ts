/**
 * Tests that each provider sends the correct system prompt and correctly
 * appends user-supplied extra instructions to the user-turn message.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { HANDWRITTEN_NOTES_PROMPT } from "../src/core/prompt";

// ── Anthropic mock ────────────────────────────────────────────────────────────

const mockAnthropicCreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "ocr result" }],
  })
);

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}));

// ── OpenAI mock ───────────────────────────────────────────────────────────────

const mockOpenAICreate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    choices: [{ message: { content: "ocr result" } }],
  })
);

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAICreate } },
  })),
}));

// ── Imports (must come after vi.mock calls) ───────────────────────────────────

import { AnthropicProvider } from "../src/core/providers/anthropic";
import { OpenAIProvider } from "../src/core/providers/openai";
import { OllamaProvider } from "../src/core/providers/ollama";

const FAKE_URLS = ["data:image/png;base64,abc123"];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the text of the last content block in the Anthropic user message. */
function lastAnthropicUserText(): string {
  const call = mockAnthropicCreate.mock.calls[0][0];
  const content: Array<{ type: string; text?: string }> = call.messages[0].content;
  const last = content.at(-1);
  if (!last || last.type !== "text" || last.text === undefined) {
    throw new Error("Last content block is not a text block");
  }
  return last.text;
}

/** Returns the text of the last content part in the OpenAI user message. */
function lastOpenAIUserText(): string {
  const call = mockOpenAICreate.mock.calls[0][0];
  const userMessage = call.messages.find(
    (m: { role: string }) => m.role === "user"
  );
  const parts: Array<{ type: string; text?: string }> = userMessage.content;
  const last = parts.at(-1);
  if (!last || last.type !== "text" || last.text === undefined) {
    throw new Error("Last content part is not a text part");
  }
  return last.text;
}

// ── AnthropicProvider ─────────────────────────────────────────────────────────

describe("AnthropicProvider", () => {
  beforeEach(() => mockAnthropicCreate.mockClear());

  it("sends the system prompt", async () => {
    const provider = new AnthropicProvider("key", "claude-sonnet-4-6");
    await provider.ocr(FAKE_URLS);

    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.system).toBe(HANDWRITTEN_NOTES_PROMPT);
  });

  it("appends extra instructions to the user message when provided", async () => {
    const provider = new AnthropicProvider("key", "claude-sonnet-4-6");
    await provider.ocr(FAKE_URLS,"Output in French.");

    expect(lastAnthropicUserText()).toContain("Output in French.");
  });

  it("user message contains both base instruction and extra instructions", async () => {
    const provider = new AnthropicProvider("key", "claude-sonnet-4-6");
    await provider.ocr(FAKE_URLS,"Preserve table structure.");

    const text = lastAnthropicUserText();
    expect(text).toContain("OCR");
    expect(text).toContain("Preserve table structure.");
  });

  it("does not append extra instructions when none are provided", async () => {
    const provider = new AnthropicProvider("key", "claude-sonnet-4-6");
    await provider.ocr(FAKE_URLS);

    const text = lastAnthropicUserText();
    expect(text).not.toContain("\n\n");
  });
});

// ── OpenAIProvider ────────────────────────────────────────────────────────────

describe("OpenAIProvider", () => {
  beforeEach(() => mockOpenAICreate.mockClear());

  it("sends the system prompt", async () => {
    const provider = new OpenAIProvider("key", "gpt-4o");
    await provider.ocr(FAKE_URLS);

    const call = mockOpenAICreate.mock.calls[0][0];
    const systemMsg = call.messages.find(
      (m: { role: string }) => m.role === "system"
    );
    expect(systemMsg.content).toBe(HANDWRITTEN_NOTES_PROMPT);
  });

  it("appends extra instructions to the user message when provided", async () => {
    const provider = new OpenAIProvider("key", "gpt-4o");
    await provider.ocr(FAKE_URLS,"Output in French.");

    expect(lastOpenAIUserText()).toContain("Output in French.");
  });

  it("user message contains both base instruction and extra instructions", async () => {
    const provider = new OpenAIProvider("key", "gpt-4o");
    await provider.ocr(FAKE_URLS,"Preserve table structure.");

    const text = lastOpenAIUserText();
    expect(text).toContain("OCR");
    expect(text).toContain("Preserve table structure.");
  });

  it("does not append extra instructions when none are provided", async () => {
    const provider = new OpenAIProvider("key", "gpt-4o");
    await provider.ocr(FAKE_URLS);

    const text = lastOpenAIUserText();
    expect(text).not.toContain("\n\n");
  });
});

// ── OllamaProvider ────────────────────────────────────────────────────────────

describe("OllamaProvider", () => {
  beforeEach(() => mockOpenAICreate.mockClear());

  it("sends the system prompt", async () => {
    const provider = new OllamaProvider("http://localhost:11434", "llama3.2-vision");
    await provider.ocr(FAKE_URLS);

    const call = mockOpenAICreate.mock.calls[0][0];
    const systemMsg = call.messages.find(
      (m: { role: string }) => m.role === "system"
    );
    expect(systemMsg.content).toBe(HANDWRITTEN_NOTES_PROMPT);
  });

  it("appends extra instructions to the user message when provided", async () => {
    const provider = new OllamaProvider("http://localhost:11434", "llama3.2-vision");
    await provider.ocr(FAKE_URLS, "Output in French.");

    expect(lastOpenAIUserText()).toContain("Output in French.");
  });

  it("user message contains both base instruction and extra instructions", async () => {
    const provider = new OllamaProvider("http://localhost:11434", "llama3.2-vision");
    await provider.ocr(FAKE_URLS, "Preserve table structure.");

    const text = lastOpenAIUserText();
    expect(text).toContain("OCR");
    expect(text).toContain("Preserve table structure.");
  });

  it("does not append extra instructions when none are provided", async () => {
    const provider = new OllamaProvider("http://localhost:11434", "llama3.2-vision");
    await provider.ocr(FAKE_URLS);

    const text = lastOpenAIUserText();
    expect(text).not.toContain("\n\n");
  });
});
