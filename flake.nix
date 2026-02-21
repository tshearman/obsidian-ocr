{
  description = "OCR CLI + Obsidian plugin — LLM-powered document OCR";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];

      forAllSystems = nixpkgs.lib.genAttrs systems;

      pkgsFor = system: import nixpkgs {
        inherit system;
        config = { };
      };
    in
    {
      # ── Nix package: installable via `nix profile install .#ocr-cli` ──
      packages = forAllSystems (system:
        let
          pkgs = pkgsFor system;

          ocrCli = pkgs.python312.pkgs.buildPythonApplication {
            pname = "ocr-cli";
            version = "0.1.0";
            pyproject = true;

            src = ./ocr-cli;

            build-system = [
              pkgs.python312.pkgs.hatchling
            ];

            dependencies = with pkgs.python312.pkgs; [
              anthropic
              openai
              pymupdf
              click
              python-dotenv
              pillow
              rich
            ];

            doCheck = false;

            meta = {
              description = "CLI tool for OCR of images and PDFs using LLM vision APIs";
              mainProgram = "ocr";
            };
          };
        in
        {
          ocr-cli = ocrCli;
          default = ocrCli;
        }
      );

      # ── Dev shell: `nix develop` ────────────────────────────────────────
      devShells = forAllSystems (system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            name = "ocr-dev";

            packages = [
              # Python toolchain — uv manages the venv, Nix provides the interpreter
              pkgs.python312
              pkgs.uv

              # Node.js LTS for Obsidian plugin development
              pkgs.nodejs_22

              # Task runner
              pkgs.just

              # File watching (useful during plugin dev)
              pkgs.watchman

              pkgs.git
            ];

            shellHook = ''
              # Point uv at the Nix-provided Python so versions stay consistent
              export UV_PYTHON_DOWNLOADS=never
              export UV_PYTHON="${pkgs.python312}/bin/python3"

              # Find the project root (directory containing flake.nix) regardless
              # of where `nix develop` is invoked from.
              _ocr_find_root() {
                local dir="$PWD"
                while [[ "$dir" != "/" ]]; do
                  [[ -f "$dir/flake.nix" ]] && echo "$dir" && return
                  dir="$(dirname "$dir")"
                done
                echo "$PWD"
              }
              OCR_ROOT="$(_ocr_find_root)"
              unset -f _ocr_find_root

              # Auto-create venv on first enter
              if [ -d "$OCR_ROOT/ocr-cli" ] && [ ! -d "$OCR_ROOT/ocr-cli/.venv" ]; then
                echo "Creating Python venv for ocr-cli..."
                (cd "$OCR_ROOT/ocr-cli" && uv sync --quiet)
              fi

              echo ""
              echo "ocr dev shell  (root: $OCR_ROOT)"
              echo "  Python $(python3 --version)"
              echo "  Node   $(node --version)"
              echo "  uv     $(uv --version)"
              echo ""
              echo "  cd ocr-cli/         → Python CLI (uv run ocr ...)"
              echo "  cd obsidian-plugin/ → npm run dev"
              echo "  just --list         → available tasks"
              echo ""
            '';
          };
        }
      );

      formatter = forAllSystems (system: (pkgsFor system).nixfmt-rfc-style);
    };
}
