# List available tasks
default:
    just --list

# Install npm dependencies (also wires up git pre-commit hook)
bootstrap:
    cd obsidian-plugin && npm install

# Convert a file to markdown via the LLM (output to stdout)
# Usage: just ocr path/to/file.pdf
# Usage: OCR_PROVIDER=openai just ocr path/to/image.png
ocr *args:
    cd obsidian-plugin && npm run ocr -- {{args}}

# Obsidian plugin — watch mode (for development)
dev:
    cd obsidian-plugin && npm run dev

# Obsidian plugin — production build
build:
    cd obsidian-plugin && npm run build

# Run the test suite
test:
    cd obsidian-plugin && npm test

# Lint TypeScript sources
lint:
    cd obsidian-plugin && npm run lint

# Format Nix files
fmt:
    nix fmt

# Symlink plugin into Obsidian for local testing (adjust vault path as needed)
# Usage: just install-plugin ~/path/to/vault
install-plugin vault:
    mkdir -p "{{vault}}/.obsidian/plugins/ocr-pdf-watcher"
    ln -sf "$(pwd)/obsidian-plugin/dist/main.js" "{{vault}}/.obsidian/plugins/ocr-pdf-watcher/main.js"
    ln -sf "$(pwd)/obsidian-plugin/manifest.json" "{{vault}}/.obsidian/plugins/ocr-pdf-watcher/manifest.json"
    echo "Plugin linked to {{vault}}/.obsidian/plugins/ocr-pdf-watcher/"
