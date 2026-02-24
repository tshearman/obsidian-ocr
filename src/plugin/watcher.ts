/**
 * Watches configured vault folders for new or modified PDF/image files.
 * For each matching file, runs OCR and writes a sibling .md file.
 *
 * Processing state is derived entirely from the `source-hash:` field in the
 * generated markdown files — no separate log file is maintained.
 */

import { Notice, TFile, Vault, normalizePath } from "obsidian";
import type { OcrPluginSettings } from "./settings";
import type { LlmProvider } from "../core/providers/base";
import { ocrFile, SUPPORTED_EXTENSIONS } from "../core/ocr";

/** SHA-256 hex digest of an ArrayBuffer, using the Web Crypto API. */
async function computeHash(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class FileWatcher {
  private vault: Vault;
  private settings: OcrPluginSettings;
  private provider: LlmProvider;
  /** Tracks files currently being processed to prevent duplicate concurrent runs. */
  private processing = new Set<string>();

  /** In-memory set of SHA-256 hashes of every file that has a generated markdown output.
   *  Built at startup from vault markdown frontmatter; updated after each successful OCR. */
  readonly knownHashes: Set<string>;

  /** FIFO queue of files waiting to be processed. */
  private queue: TFile[] = [];
  /** Number of files currently being OCR'd (target concurrency = 1). */
  private activeCount = 0;

  /**
   * Resolves once knownHashes has been fully populated from the vault.
   * drain() awaits this before processing any queued file, so events that
   * arrive during startup are held safely until the index is complete.
   */
  private readyPromise: Promise<void>;
  /** Call once after knownHashes is fully built to unblock drain(). */
  markReady: () => void;

  constructor(
    vault: Vault,
    settings: OcrPluginSettings,
    provider: LlmProvider,
    knownHashes: Set<string>
  ) {
    this.vault = vault;
    this.settings = settings;
    this.provider = provider;
    this.knownHashes = knownHashes;

    let resolve!: () => void;
    this.readyPromise = new Promise<void>((r) => { resolve = r; });
    this.markReady = resolve;
  }

  /**
   * Add a file to the processing queue.
   * Safe to call before markReady() — files accumulate and drain only after init.
   */
  enqueue(file: TFile): void {
    if (!SUPPORTED_EXTENSIONS.has(file.extension)) return;
    if (
      !this.queue.some((f) => f.path === file.path) &&
      !this.processing.has(file.path)
    ) {
      this.queue.push(file);
      void this.drain();
    }
  }

  private async drain(): Promise<void> {
    await this.readyPromise; // hold until knownHashes is fully built
    if (this.activeCount > 0 || this.queue.length === 0) return;
    const file = this.queue.shift()!;
    this.activeCount++;
    try {
      await this.handleFile(file);
    } finally {
      this.activeCount--;
      void this.drain();
    }
  }

  /**
   * Call from plugin's vault onCreate/onModify event handlers.
   * Pass `force: true` from manual commands to bypass the hash check and
   * always re-run OCR.
   */
  async handleFile(file: TFile, { force = false } = {}): Promise<void> {
    if (!force && !this.shouldProcess(file)) return;
    if (!SUPPORTED_EXTENSIONS.has(file.extension)) return;
    if (this.processing.has(file.path)) return;

    this.processing.add(file.path);
    try {
      await this.processFile(file, force);
    } catch (err) {
      new Notice(`OCR failed for ${file.name}: ${(err as Error).message}`);
      console.error("[OCR Plugin] Error processing file:", file.path, err);
    } finally {
      this.processing.delete(file.path);
    }
  }

  /**
   * Walk all files in the configured watch folders, hash each one, and enqueue
   * any whose hash is not yet in knownHashes.  Called after markReady() at
   * startup and again by the "OCR: rescan watched folders" command.
   */
  async scanWatchedFolders(): Promise<void> {
    const files = this.vault
      .getFiles()
      .filter((f) => SUPPORTED_EXTENSIONS.has(f.extension) && this.shouldProcess(f));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!this.processing.has(file.path)) {
        const buf = await this.vault.readBinary(file);
        const hash = await computeHash(buf);
        if (!this.knownHashes.has(hash)) this.enqueue(file);
      }
      if (i % 10 === 0) await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  private shouldProcess(file: TFile): boolean {
    if (!SUPPORTED_EXTENSIONS.has(file.extension)) return false;
    if (this.settings.watchFolders.length === 0) return false;

    return this.settings.watchFolders.some((folder) => {
      const normalized = normalizePath(folder);
      return (
        file.path.startsWith(normalized + "/") ||
        file.parent?.path === normalized
      );
    });
  }

  private async processFile(file: TFile, force = false): Promise<void> {
    const buffer = await this.vault.readBinary(file);
    const hash = await computeHash(buffer);

    if (!force && this.knownHashes.has(hash)) return;

    new Notice(`OCR: processing ${file.name}…`);

    const model = resolveModel(this.settings);
    const markdown = await ocrFile(
      buffer,
      file.extension,
      this.provider,
      this.settings.pdfDpi,
      this.settings.preprocess,
      this.settings.additionalOcrPromptInstructions,
      this.settings.pagesPerBatch
    );

    const outputPath = this.getOutputPath(file);
    const content = buildOutputContent(
      { name: file.name, basename: file.basename },
      markdown,
      hash,
      model,
      this.settings.provider
    );

    const exists = await this.vault.adapter.exists(outputPath);
    if (exists) {
      await this.vault.adapter.write(outputPath, content);
    } else {
      await this.vault.create(outputPath, content);
    }

    this.knownHashes.add(hash);

    new Notice(`OCR: done → ${outputPath}`);
  }

  private getOutputPath(file: TFile): string {
    const suffix = this.settings.outputSuffix || "";
    const basename = `${file.basename}${suffix}.md`;
    const dir = this.settings.outputDir.trim() || file.parent?.path || "";
    return normalizePath(dir ? `${dir}/${basename}` : basename);
  }
}

// ── Pure exported functions ──────────────────────────────────────────────────

/**
 * Return the model identifier that corresponds to the currently-selected
 * provider. Exported for testing.
 */
export function resolveModel(settings: OcrPluginSettings): string {
  if (settings.provider === "anthropic") return settings.anthropicModel;
  if (settings.provider === "openai") return settings.openaiModel;
  return settings.ollamaModel;
}

/**
 * Build the final markdown file content: a YAML frontmatter block followed by
 * the OCR body. Any frontmatter tags emitted by the LLM are hoisted into the
 * plugin-controlled frontmatter block.
 *
 * Exported as a pure function so it can be unit-tested without Obsidian types.
 */
export function buildOutputContent(
  file: { name: string; basename: string },
  markdown: string,
  hash: string,
  model: string,
  provider: string
): string {
  const { tags, body } = extractFrontmatterTags(markdown);

  const lines = [
    "---",
    `source: "[[${file.name}]]"`,
    `generated: "${new Date().toISOString()}"`,
    `provider: "${provider}"`,
    `model: "${model}"`,
    `source-hash: "${hash}"`,
  ];

  if (tags.length > 0) {
    lines.push("tags:");
    for (const tag of tags) lines.push(`  - ${tag}`);
  }

  lines.push("---", "");
  return lines.join("\n") + body;
}

/**
 * Extract the `source-hash:` value from a markdown file's YAML frontmatter.
 * Returns the 64-character hex string, or null if absent or malformed.
 * Exported for testing and for buildKnownHashes().
 */
export function extractFrontmatterHash(text: string): string | null {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^source-hash:\s*"?([a-f0-9]{64})"?\s*$/m);
  return m ? m[1] : null;
}

/**
 * Walk every markdown file in the vault and collect all `source-hash:` hashes
 * into a Set.  Yields every 50 files to stay non-blocking on the main thread.
 * Exported so main.ts can call it at startup.
 */
export async function buildKnownHashes(vault: Vault): Promise<Set<string>> {
  const hashes = new Set<string>();
  const files = vault.getFiles().filter((f) => f.extension === "md");
  for (let i = 0; i < files.length; i++) {
    const text = await vault.read(files[i]);
    const hash = extractFrontmatterHash(text);
    if (hash) hashes.add(hash);
    if (i % 50 === 0) await new Promise<void>((r) => setTimeout(r, 0));
  }
  return hashes;
}

/**
 * If the model output begins with a YAML frontmatter block, extract any
 * `tags:` list from it and return the tags separately from the body.
 * The frontmatter block is removed from the body so the caller can build
 * its own merged frontmatter.
 *
 * If no frontmatter is present the original text is returned as-is.
 */
export function extractFrontmatterTags(text: string): {
  tags: string[];
  body: string;
} {
  // Match an opening ---, a YAML block, a closing ---, then optional newline
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { tags: [], body: text };

  const yamlBlock = match[1];
  const body = match[2].trimStart();

  // Parse a `tags:` list in either block or flow form:
  //   tags:          tags: [foo, bar]
  //     - foo
  //     - bar
  const blockMatch = yamlBlock.match(/^tags:\s*\n((?:[ \t]+-[ \t]+\S[^\n]*\n?)*)/m);
  const flowMatch = yamlBlock.match(/^tags:\s*\[([^\]]*)\]/m);

  let tags: string[] = [];
  if (blockMatch) {
    tags = blockMatch[1]
      .split("\n")
      .map((line) => line.replace(/^[ \t]+-[ \t]+/, "").trim())
      .filter(Boolean);
  } else if (flowMatch) {
    tags = flowMatch[1]
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  return { tags, body };
}
