# OCR PDF Watcher

An Obsidian plugin that watches configured vault folders for new PDFs and generates OCR markdown files using LLM vision APIs (Anthropic Claude, OpenAI GPT-4o, or a local/remote Ollama instance).

A companion Node CLI (`cli.ts`) lets you run the same OCR pipeline from the command line without Obsidian.

## Features

- Automatically OCRs PDFs dropped into watched folders
- Supports handwritten notes, maths (LaTeX), tables, and diagrams
- Outputs structured markdown with frontmatter (tags, source link, model used)
- Supports Anthropic Claude, OpenAI GPT-4o, and Ollama (local or remote)
- Configurable DPI, output directory, filename suffix, and custom prompt instructions
- Deduplication via mtime + SHA-256 content hash — re-OCRs only when the file actually changes

---

## Installing the plugin into Obsidian

The plugin is not yet listed in the Obsidian community plugin registry. Install it manually:

```bash
git clone https://github.com/tshearman/obsidian-ocr ocr-pdf-watcher
cd ocr-pdf-watcher
just bootstrap                        # installs npm deps + git hook
just build                            # compiles TypeScript → dist/main.js
just install-plugin ~/path/to/vault   # creates plugin folder and symlinks files
```

### Verify the installation

Before opening Obsidian, confirm that the OCR pipeline works end-to-end with your API key:

```bash
# Anthropic
PROVIDER=anthropic API_KEY=sk-ant-... just check-ocr

# OpenAI
PROVIDER=openai API_KEY=sk-... just check-ocr

# Ollama (no API key required)
PROVIDER=ollama API_KEY=unused just check-ocr
```

This downloads a real PDF, renders it, sends it to the API, and prints `PASS` if the response contains readable text. No quality checks — just a smoke test that the credentials, network, and pipeline are all working.

### Enable the plugin

1. Open Obsidian → **Settings → Community plugins**
2. Enable **OCR PDF Watcher**
3. Open the plugin settings and enter your API key(s)

### Configuration

| Setting | Default | Description |
|---|---|---|
| LLM provider | `anthropic` | `anthropic`, `openai`, or `ollama` |
| Anthropic / OpenAI API key | — | Your API key (not required for Ollama) |
| Model | `claude-sonnet-4-6` / `gpt-4o` | Model identifier |
| Ollama host | `http://localhost:11434` | URL of the Ollama server |
| Ollama model | `llama3.2-vision` | Any vision-capable model pulled via `ollama pull` |
| Watch folders | — | Vault-relative paths, one per line |
| Output directory | *(same as PDF)* | Where to write the `.md` file |
| Output filename suffix | *(empty)* | Appended to the PDF basename, e.g. `-ocr` |
| PDF render DPI | 150 | Higher = better quality, larger API payload |
| Preprocessing | on | Auto-contrast + unsharp-mask before sending |
| Additional OCR instructions | *(empty)* | Extra prompt text, e.g. "Output in French." |

---

## Command line (CLI)

The `cli.ts` script runs the same OCR pipeline from Node, writing markdown to stdout:

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-... just ocr path/to/file.pdf

# OpenAI
OPENAI_API_KEY=sk-... OCR_PROVIDER=openai just ocr path/to/scan.png

# Ollama (local, no API key needed)
OCR_PROVIDER=ollama just ocr path/to/scan.png

# Ollama (remote server)
OCR_PROVIDER=ollama OLLAMA_HOST=http://my-server:11434 just ocr notes.pdf

# Redirect output to a file
ANTHROPIC_API_KEY=sk-ant-... just ocr notes.pdf > notes.md
```

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `OCR_PROVIDER` | `openai` | `anthropic`, `openai`, or `ollama` |
| `ANTHROPIC_API_KEY` | — | Required when provider = anthropic |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Model override |
| `OPENAI_API_KEY` | — | Required when provider = openai |
| `OPENAI_MODEL` | `gpt-4o` | Model override |
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3.2-vision` | Ollama model (must support vision) |
| `PDF_DPI` | `150` | Render resolution for PDFs |

---

## Development

### With Nix (recommended)

Nix provides a fully reproducible environment with the exact Node.js version pinned.

```bash
nix develop        # enters the dev shell (auto-installs npm deps on first run)
just --list        # see all available tasks
```

### Without Nix (global npm)

Requires **Node.js ≥ 22** and optionally [`just`](https://github.com/casey/just).

```bash
cd obsidian-plugin
npm install        # installs deps and wires up the pre-commit hook
```

Then use npm scripts directly, or install `just` and use the justfile from the repo root.

### Available tasks (`just --list`)

| Task | Description |
|---|---|
| `just bootstrap` | `npm install` (also installs git pre-commit hook) |
| `just build` | Production build → `obsidian-plugin/dist/main.js` |
| `just dev` | Watch mode — rebuilds on file changes |
| `just test` | Run the Vitest suite |
| `just lint` | ESLint |
| `just ocr <file>` | Run the CLI against a file |
| `just check-ocr` | Integration smoke test (requires `PROVIDER` + `API_KEY`) |
| `just install-plugin <vault>` | Symlink the plugin into an Obsidian vault |
| `just fmt` | Format Nix files |

### Pre-commit hook

`npm install` wires up a git pre-commit hook (via `simple-git-hooks`) that runs:

```
npm run lint && npm test
```

To install it manually after cloning: `cd obsidian-plugin && npx simple-git-hooks`.

### Project layout

```
obsidian-plugin/
  cli.ts              # Node CLI entry point
  check-ocr.ts        # Integration smoke test
  src/
    main.ts           # Obsidian plugin entry point + settings UI
    watcher.ts        # Vault event handler
    ocr.ts            # Orchestration: file → images → LLM → markdown
    pdf-converter.ts  # pdfjs-dist rendering (Electron/DOM)
    preprocessing.ts  # Auto-contrast + unsharp-mask
    prompt.ts         # Shared system prompt
    settings.ts       # Settings types and defaults
    providers/
      anthropic.ts    # Anthropic Claude provider
      openai.ts       # OpenAI GPT-4o provider
      ollama.ts       # Ollama provider (local / remote)
  tests/              # Vitest unit tests
  eslint.config.mjs   # ESLint flat config
```
