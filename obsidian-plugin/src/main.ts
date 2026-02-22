import { App, FuzzySuggestModal, Plugin, PluginSettingTab, Setting, TFile, Notice } from "obsidian";
import { DEFAULT_SETTINGS, type OcrPluginSettings, type ProviderName } from "./settings";
import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIProvider } from "./providers/openai";
import { OllamaProvider } from "./providers/ollama";
import type { LlmProvider } from "./providers/base";
import { PdfWatcher, buildKnownHashes } from "./watcher";
import { configurePdfWorker } from "./pdf-converter";
import { configurePreprocessingWorker } from "./preprocessing";

export default class OcrPlugin extends Plugin {
  settings!: OcrPluginSettings;
  private watcher!: PdfWatcher;
  /** Debounce timers for vault create/modify events, keyed by file path. */
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * Set to true once initializeAndScan() completes.
   * rebuildWatcher() immediately calls markReady() on the new watcher when
   * this is true, so settings changes after startup don't leave the queue
   * permanently blocked.
   */
  private initialized = false;

  async onload() {
    await this.loadSettings();
    configurePdfWorker(this.app, this.manifest.dir);
    await this.configureWorkers();

    // Start with an empty hash set; initializeAndScan() populates it in the
    // background and calls markReady() when done, unblocking the queue.
    const knownHashes = new Set<string>();
    this.rebuildWatcher(knownHashes);

    // Watch for new files dropped into watched folders
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) this.debounceHandle(file);
      })
    );

    // Watch for modifications (e.g. file replaced in place)
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) this.debounceHandle(file);
      })
    );

    this.addSettingTab(new OcrSettingTab(this.app, this));

    // Right-click context menu on PDF files in the file explorer / editor tabs
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "pdf") {
          menu.addItem((item) =>
            item
              .setTitle("OCR: generate markdown")
              .setIcon("scan-line")
              .onClick(() => this.watcher.handleFile(file, { force: true }))
          );
        }
      })
    );

    // Command palette: OCR the currently active PDF (only shown when a PDF is open)
    this.addCommand({
      id: "ocr-active-file",
      name: "OCR active PDF file",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file?.extension === "pdf") {
          if (!checking) this.watcher.handleFile(file, { force: true });
          return true;
        }
        return false;
      },
    });

    // Command palette: pick any PDF in the vault via fuzzy search
    this.addCommand({
      id: "ocr-pick-file",
      name: "OCR: pick a PDF file",
      callback: () => {
        new PdfPickerModal(this.app, (file) => {
          this.watcher.handleFile(file);
        }).open();
      },
    });

    // Command palette: rebuild hash index and queue any unprocessed PDFs
    this.addCommand({
      id: "ocr-rescan-watched-folders",
      name: "OCR: rescan watched folders",
      callback: () => void this.rescanWatchedFolders(),
    });

    // Defer until Obsidian has finished indexing the vault so that
    // vault.getFiles() returns the full file list rather than an empty array.
    this.app.workspace.onLayoutReady(() => {
      void this.initializeAndScan(knownHashes);
    });

    console.log("[OCR Plugin] loaded");
  }

  onunload() {
    console.log("[OCR Plugin] unloaded");
  }

  /** Build knownHashes from vault markdown files, then enqueue any unprocessed PDFs. */
  private async initializeAndScan(knownHashes: Set<string>): Promise<void> {
    const built = await buildKnownHashes(this.app.vault);
    for (const h of built) knownHashes.add(h);
    this.initialized = true;
    this.watcher.markReady(); // unblock drain — queued events now process
    await this.watcher.scanWatchedFolders();
  }

  /** Rebuild hash index from scratch and re-queue any unprocessed PDFs. */
  private async rescanWatchedFolders(): Promise<void> {
    new Notice("OCR: rebuilding index from vault…");
    const built = await buildKnownHashes(this.app.vault);
    this.watcher.knownHashes.clear();
    for (const h of built) this.watcher.knownHashes.add(h);
    this.watcher.markReady(); // idempotent — safe to call again
    new Notice("OCR: scanning watched folders…");
    await this.watcher.scanWatchedFolders();
  }

  /** Debounce vault events by 300 ms to avoid processing partially-written files. */
  private debounceHandle(file: TFile): void {
    const existing = this.debounceTimers.get(file.path);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(file.path);
      this.watcher.handleFile(file);
    }, 300);
    this.debounceTimers.set(file.path, timer);
  }

  /** Point background workers at their bundled scripts. Called once at load. */
  private async configureWorkers(): Promise<void> {
    if (!this.manifest.dir) return;
    const adapter = this.app.vault.adapter as { getResourcePath?: (p: string) => string };
    if (typeof adapter.getResourcePath !== "function") return;
    const workerUrl = adapter.getResourcePath(`${this.manifest.dir}/preprocessing.worker.js`);
    await configurePreprocessingWorker(workerUrl);
  }

  rebuildWatcher(knownHashes?: Set<string>) {
    const hashes = knownHashes ?? this.watcher?.knownHashes ?? new Set<string>();
    const provider = this.buildProvider();
    this.watcher = new PdfWatcher(this.app.vault, this.settings, provider, hashes);
    // If startup has already completed, immediately unblock the new watcher's
    // drain queue — otherwise initializeAndScan() will call markReady() later.
    if (this.initialized) this.watcher.markReady();
  }

  private buildProvider(): LlmProvider {
    if (this.settings.provider === "anthropic") {
      if (!this.settings.anthropicApiKey) {
        new Notice("OCR Plugin: Anthropic API key not configured — open settings.");
      }
      return new AnthropicProvider(
        this.settings.anthropicApiKey,
        this.settings.anthropicModel
      );
    } else if (this.settings.provider === "openai") {
      if (!this.settings.openaiApiKey) {
        new Notice("OCR Plugin: OpenAI API key not configured — open settings.");
      }
      return new OpenAIProvider(
        this.settings.openaiApiKey,
        this.settings.openaiModel
      );
    } else {
      return new OllamaProvider(
        this.settings.ollamaHost,
        this.settings.ollamaModel
      );
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.rebuildWatcher();
  }
}

class PdfPickerModal extends FuzzySuggestModal<TFile> {
  private onChoose: (file: TFile) => void;

  constructor(app: App, onChoose: (file: TFile) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("Pick a PDF to OCR…");
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((f) => f.extension === "pdf");
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}

class OcrSettingTab extends PluginSettingTab {
  plugin: OcrPlugin;

  constructor(app: App, plugin: OcrPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "OCR PDF Watcher" });

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
        "Vault-relative folder paths to watch for new PDFs, one per line. Example: Inbox"
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
        "Vault-relative folder for generated markdown files. Empty = same folder as the source PDF."
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
        'Appended to the PDF basename. Empty = same name as PDF. Example: "-ocr" → "scan-ocr.md"'
      )
      .addText((t) =>
        t
          .setValue(this.plugin.settings.outputSuffix)
          .onChange(async (v) => {
            this.plugin.settings.outputSuffix = v;
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
      .setDesc("Number of PDF pages sent to the LLM in a single API call. Reduce for local models with small context windows.")
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
