# List available tasks
default:
    just --list

# Bootstrap all dependencies
bootstrap: bootstrap-py bootstrap-node

bootstrap-py:
    cd ocr-cli && uv sync

bootstrap-node:
    cd obsidian-plugin && npm install

# Run the OCR CLI
ocr *args:
    cd ocr-cli && uv run ocr {{args}}

# Build the Nix package
build:
    nix build .#ocr-cli

# Obsidian plugin — watch mode (for development)
plugin-dev:
    cd obsidian-plugin && npm run dev

# Obsidian plugin — production build
plugin-build:
    cd obsidian-plugin && npm run build

# Run all tests (Python CLI + Obsidian plugin)
test: test-py test-ts

# Run Python tests
test-py:
    cd ocr-cli && uv run pytest tests/ -v

# Run Obsidian plugin tests
test-ts:
    cd obsidian-plugin && npm test

# Format Nix files
fmt:
    nix fmt

# Symlink plugin into Obsidian for local testing (adjust vault path as needed)
# Usage: just install-plugin ~/path/to/vault
install-plugin vault:
    mkdir -p "{{vault}}/.obsidian/plugins/ocr-pdf-watcher"
    ln -sf "$(pwd)/obsidian-plugin/dist/main.js" "{{vault}}/.obsidian/plugins/ocr-pdf-watcher/main.js"
    ln -sf "$(pwd)/obsidian-plugin/dist/pdf.worker.min.mjs" "{{vault}}/.obsidian/plugins/ocr-pdf-watcher/pdf.worker.min.mjs"
    ln -sf "$(pwd)/obsidian-plugin/manifest.json" "{{vault}}/.obsidian/plugins/ocr-pdf-watcher/manifest.json"
    echo "Plugin linked to {{vault}}/.obsidian/plugins/ocr-pdf-watcher/"
