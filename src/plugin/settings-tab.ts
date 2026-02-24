import { App, PluginSettingTab, Setting } from "obsidian";
import type { ProviderName } from "./settings";
import type OcrPlugin from "./main";

export class OcrSettingTab extends PluginSettingTab {
  plugin: OcrPlugin;

  constructor(app: App, plugin: OcrPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "OCR File Watcher" });

    // ── Provider ──────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("LLM provider")
      .setDesc("Which vision API to use for OCR.")
      .addDropdown((d) =>
        d
          .addOption("anthropic", "Anthropic Claude")
          .addOption("openai", "OpenAI GPT-4o")
          .addOption("ollama", "Ollama (local / remote)")
          .setValue(this.plugin.settings.provider)
          .onChange(async (v) => {
            this.plugin.settings.provider = v as ProviderName;
            await this.plugin.saveSettings();
          })
      );

    // ── API keys ──────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Anthropic API key")
      .addText((t) =>
        t
          .setPlaceholder("sk-ant-…")
          .setValue(this.plugin.settings.anthropicApiKey)
          .onChange(async (v) => {
            this.plugin.settings.anthropicApiKey = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("OpenAI API key")
      .addText((t) =>
        t
          .setPlaceholder("sk-…")
          .setValue(this.plugin.settings.openaiApiKey)
          .onChange(async (v) => {
            this.plugin.settings.openaiApiKey = v.trim();
            await this.plugin.saveSettings();
          })
      );

    // ── Model overrides ───────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Anthropic model")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.anthropicModel)
          .onChange(async (v) => {
            this.plugin.settings.anthropicModel = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("OpenAI model")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.openaiModel)
          .onChange(async (v) => {
            this.plugin.settings.openaiModel = v.trim();
            await this.plugin.saveSettings();
          })
      );

    // ── Ollama ────────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Ollama host")
      .setDesc("URL of the Ollama server. Use the default for a local instance.")
      .addText((t) =>
        t
          .setPlaceholder("http://localhost:11434")
          .setValue(this.plugin.settings.ollamaHost)
          .onChange(async (v) => {
            this.plugin.settings.ollamaHost = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Ollama model")
      .setDesc("A vision-capable model pulled via `ollama pull <model>`.")
      .addText((t) =>
        t
          .setPlaceholder("llama3.2-vision")
          .setValue(this.plugin.settings.ollamaModel)
          .onChange(async (v) => {
            this.plugin.settings.ollamaModel = v.trim();
            await this.plugin.saveSettings();
          })
      );

    // ── Folders ───────────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Watch folders")
      .setDesc(
        "Vault-relative folder paths to watch for new files, one per line. Example: Inbox"
      )
      .addTextArea((t) =>
        t
          .setValue(this.plugin.settings.watchFolders.join("\n"))
          .onChange(async (v) => {
            this.plugin.settings.watchFolders = v
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    // ── Output options ────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Output directory")
      .setDesc(
        "Vault-relative folder for generated markdown files. Empty = same folder as the source file."
      )
      .addText((t) =>
        t
          .setPlaceholder("e.g. OCR Output")
          .setValue(this.plugin.settings.outputDir)
          .onChange(async (v) => {
            this.plugin.settings.outputDir = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Output filename suffix")
      .setDesc(
        'Appended to the file basename. Empty = same name as file. Example: "-ocr" → "scan-ocr.md"'
      )
      .addText((t) =>
        t
          .setValue(this.plugin.settings.outputSuffix)
          .onChange(async (v) => {
            this.plugin.settings.outputSuffix = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Processing log file")
      .setDesc(
        "Vault-relative path for the processing log. Each line records a success or failure with a timestamp. Empty = disabled."
      )
      .addText((t) =>
        t
          .setPlaceholder("e.g. _ocr-processing.log")
          .setValue(this.plugin.settings.logFilePath)
          .onChange(async (v) => {
            this.plugin.settings.logFilePath = v.trim();
            await this.plugin.saveSettings();
          })
      );

    // ── PDF quality ───────────────────────────────────────────────────────
    new Setting(containerEl)
      .setName("PDF render DPI")
      .setDesc("Resolution for PDF-to-image conversion. Higher = better OCR, larger API calls.")
      .addSlider((s) =>
        s
          .setLimits(72, 300, 12)
          .setValue(this.plugin.settings.pdfDpi)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.pdfDpi = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Pages per batch")
      .setDesc("Number of pages sent to the LLM in a single API call. Reduce for local models with small context windows.")
      .addSlider((s) =>
        s
          .setLimits(1, 20, 1)
          .setValue(this.plugin.settings.pagesPerBatch)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.pagesPerBatch = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max concurrent files")
      .setDesc("Maximum number of files processed in parallel. Lower values reduce API load and prevent timeouts when many files arrive at once.")
      .addSlider((s) =>
        s
          .setLimits(1, 5, 1)
          .setValue(this.plugin.settings.maxConcurrent)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.maxConcurrent = v;
            await this.plugin.saveSettings();
          })
      );

    // ── Prompt customisation ──────────────────────────────────────────────
    new Setting(containerEl)
      .setName("Additional OCR prompt instructions")
      .setDesc(
        "Extra instructions appended to the OCR prompt. Use this to tailor output style, language, or domain-specific formatting."
      )
      .addTextArea((t) =>
        t
          .setPlaceholder("e.g. Preserve table structure. Output in French.")
          .setValue(this.plugin.settings.additionalOcrPromptInstructions)
          .onChange(async (v) => {
            this.plugin.settings.additionalOcrPromptInstructions = v;
            await this.plugin.saveSettings();
          })
      );
  }
}
