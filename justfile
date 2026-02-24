# List available tasks
default:
    just --list

# Install npm dependencies (also wires up git pre-commit hook)
bootstrap:
    npm install

# Convert a file to markdown via the LLM (output to stdout)
# Usage: just ocr path/to/file.pdf
# Usage: OCR_PROVIDER=openai just ocr path/to/image.png
ocr *args:
    npm run ocr -- {{args}}

# Watch mode (for development)
dev:
    npm run dev

# Production build
build:
    npm run build

# Run the test suite
test:
    npm test

# Integration check: OCR a real PDF and verify the output is non-empty text
# Usage: PROVIDER=anthropic API_KEY=sk-ant-... just check-ocr
check-ocr:
    npm run check-ocr

# Lint TypeScript sources
lint:
    npm run lint

# Format Nix files
fmt:
    nix fmt

# Symlink plugin into Obsidian for local testing (adjust vault path as needed)
# Usage: just install-plugin ~/path/to/vault
install-plugin vault:
    mkdir -p "{{vault}}/.obsidian/plugins/ocr-pdf-watcher"
    ln -sf "$(pwd)/dist/main.js" "{{vault}}/.obsidian/plugins/ocr-pdf-watcher/main.js"
    ln -sf "$(pwd)/manifest.json" "{{vault}}/.obsidian/plugins/ocr-pdf-watcher/manifest.json"
    ln -sf "$(pwd)/dist/pdf.worker.min.mjs" "{{vault}}/.obsidian/plugins/ocr-pdf-watcher/pdf.worker.min.mjs"
    ln -sf "$(pwd)/dist/preprocessing.worker.js" "{{vault}}/.obsidian/plugins/ocr-pdf-watcher/preprocessing.worker.js"
    echo "Plugin linked to {{vault}}/.obsidian/plugins/ocr-pdf-watcher/"
