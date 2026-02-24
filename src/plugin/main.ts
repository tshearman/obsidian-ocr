import { App, FuzzySuggestModal, Plugin, TFile, Notice } from "obsidian";
import { OcrSettingTab } from "./settings-tab";
import { DEFAULT_SETTINGS, type OcrPluginSettings } from "./settings";
import { AnthropicProvider } from "../core/providers/anthropic";
import { OpenAIProvider } from "../core/providers/openai";
import { OllamaProvider } from "../core/providers/ollama";
import type { LlmProvider } from "../core/providers/base";
import { FileWatcher, buildKnownHashes } from "./watcher";
import { configurePdfWorker } from "../core/pdf-converter";
import { configurePreprocessingWorker } from "../core/preprocessing";
import { SUPPORTED_EXTENSIONS } from "../core/ocr";

export default class OcrPlugin extends Plugin {
  settings!: OcrPluginSettings;
  private watcher!: FileWatcher;
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

    // Right-click context menu on supported files in the file explorer / editor tabs
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && SUPPORTED_EXTENSIONS.has(file.extension)) {
          menu.addItem((item) =>
            item
              .setTitle("OCR: generate markdown")
              .setIcon("scan-line")
              .onClick(() => this.watcher.handleFile(file, { force: true }))
          );
        }
      })
    );

    // Command palette: OCR the currently active file (only shown when a supported file is open)
    this.addCommand({
      id: "ocr-active-file",
      name: "OCR: ocr active file",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file && SUPPORTED_EXTENSIONS.has(file.extension)) {
          if (!checking) this.watcher.handleFile(file, { force: true });
          return true;
        }
        return false;
      },
    });

    // Command palette: pick any file in the vault via fuzzy search
    this.addCommand({
      id: "ocr-pick-file",
      name: "OCR: pick a file",
      callback: () => {
        new FilePickerModal(this.app, (file) => {
          this.watcher.handleFile(file);
        }).open();
      },
    });

    // Command palette: rebuild hash index and queue any unprocessed files
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

  /** Build knownHashes from vault markdown files, then enqueue any unprocessed files. */
  private async initializeAndScan(knownHashes: Set<string>): Promise<void> {
    const built = await buildKnownHashes(this.app.vault);
    for (const h of built) knownHashes.add(h);
    this.initialized = true;
    this.watcher.markReady(); // unblock drain — queued events now process
    await this.watcher.scanWatchedFolders();
  }

  /** Rebuild hash index from scratch and re-queue any unprocessed files. */
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
    this.watcher = new FileWatcher(this.app.vault, this.settings, provider, hashes);
    // If startup has already completed, immediately unblock the new watcher's
    // drain queue — otherwise initializeAndScan() will call markReady() later.
    if (this.initialized) this.watcher.markReady();
  }

  private buildProvider(): LlmProvider {
    const s = this.settings;
    switch (s.provider) {
      case "anthropic":
        if (!s.anthropicApiKey)
          new Notice("OCR Plugin: Anthropic API key not configured — open settings.");
        return new AnthropicProvider(s.anthropicApiKey, s.anthropicModel);

      case "openai":
        if (!s.openaiApiKey)
          new Notice("OCR Plugin: OpenAI API key not configured — open settings.");
        return new OpenAIProvider(s.openaiApiKey, s.openaiModel);

      case "ollama":
        if (!s.ollamaHost)
          new Notice("OCR Plugin: Ollama host not configured — open settings.");
        return new OllamaProvider(s.ollamaHost, s.ollamaModel);

      default:
        throw new Error(`Unknown OCR provider: ${s.provider}`);
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

class FilePickerModal extends FuzzySuggestModal<TFile> {
  private onChoose: (file: TFile) => void;

  constructor(app: App, onChoose: (file: TFile) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("Pick a file to OCR…");
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((f) => SUPPORTED_EXTENSIONS.has(f.extension));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}
