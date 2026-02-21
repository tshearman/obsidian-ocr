/**
 * Watches configured vault folders for new or modified PDF files.
 * For each matching file, runs OCR and writes a sibling .md file.
 */

import { Notice, TFile, Vault, normalizePath } from "obsidian";
import type { OcrPluginSettings } from "./settings";
import type { LlmProvider } from "./providers/base";
import { ocrFile } from "./ocr";

export class PdfWatcher {
  private vault: Vault;
  private settings: OcrPluginSettings;
  private provider: LlmProvider;
  /** Tracks files currently being processed to prevent duplicate runs */
  private processing = new Set<string>();

  constructor(vault: Vault, settings: OcrPluginSettings, provider: LlmProvider) {
    this.vault = vault;
    this.settings = settings;
    this.provider = provider;
  }

  /** Call from plugin's vault onCreate/onModify event handlers. */
  async handleFile(file: TFile): Promise<void> {
    if (!this.shouldProcess(file)) return;
    if (this.processing.has(file.path)) return;

    this.processing.add(file.path);
    try {
      await this.processFile(file);
    } catch (err) {
      new Notice(`OCR failed for ${file.name}: ${(err as Error).message}`);
      console.error("[OCR Plugin] Error processing file:", file.path, err);
    } finally {
      this.processing.delete(file.path);
    }
  }

  private shouldProcess(file: TFile): boolean {
    if (file.extension !== "pdf") return false;
    if (this.settings.watchFolders.length === 0) return false;

    return this.settings.watchFolders.some((folder) => {
      const normalized = normalizePath(folder);
      return (
        file.path.startsWith(normalized + "/") ||
        file.parent?.path === normalized
      );
    });
  }

  private async processFile(file: TFile): Promise<void> {
    const outputPath = this.getOutputPath(file);

    if (!this.settings.overwriteExisting) {
      const exists = await this.vault.adapter.exists(outputPath);
      if (exists) return;
    }

    new Notice(`OCR: processing ${file.name}…`);

    const buffer = await this.vault.readBinary(file);
    const markdown = await ocrFile(
      buffer,
      file.extension,
      this.provider,
      "markdown",
      this.settings.pdfDpi,
      this.settings.preprocess
    );

    const content = this.buildOutput(file, markdown);

    const exists = await this.vault.adapter.exists(outputPath);
    if (exists) {
      await this.vault.adapter.write(outputPath, content);
    } else {
      await this.vault.create(outputPath, content);
    }

    new Notice(`OCR: done → ${outputPath}`);
  }

  private buildOutput(file: TFile, markdown: string): string {
    const { tags, body } = extractFrontmatterTags(markdown);

    const lines = [
      "---",
      `source: "[[${file.basename}]]"`,
      `generated: "${new Date().toISOString()}"`,
      `provider: "${this.settings.provider}"`,
    ];

    if (tags.length > 0) {
      lines.push("tags:");
      for (const tag of tags) lines.push(`  - ${tag}`);
    }

    lines.push("---", "");
    return lines.join("\n") + body;
  }

  private getOutputPath(file: TFile): string {
    const suffix = this.settings.outputSuffix || "";
    const basename = `${file.basename}${suffix}.md`;
    const dir = this.settings.outputDir.trim() || file.parent?.path || "";
    return normalizePath(dir ? `${dir}/${basename}` : basename);
  }
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
