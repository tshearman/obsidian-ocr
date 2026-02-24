{
  description = "OCR Obsidian plugin — LLM-powered document OCR";

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
      # ── Dev shell: `nix develop` ────────────────────────────────────────
      devShells = forAllSystems (system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            name = "ocr-dev";

            packages = [
              # Node.js LTS for Obsidian plugin development
              pkgs.nodejs_22

              # Task runner
              pkgs.just

              # File watching (useful during plugin dev)
              pkgs.watchman

              pkgs.git
            ];

            shellHook = ''
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

              # Auto-install npm deps on first enter
              if [ ! -d "$OCR_ROOT/node_modules" ]; then
                echo "Installing npm dependencies..."
                (cd "$OCR_ROOT" && npm install --silent)
              fi

              echo ""
              echo "ocr dev shell  (root: $OCR_ROOT)"
              echo "  Node   $(node --version)"
              echo "  npm    $(npm --version)"
              echo ""
              echo "  npm run dev  → watch mode"
              echo "  just --list  → available tasks"
              echo ""
            '';
          };
        }
      );

      formatter = forAllSystems (system: (pkgsFor system).nixfmt-rfc-style);
    };
}
