import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
  },
  resolve: {
    alias: {
      // obsidian ships types only (no JS entry); redirect to our manual mock
      obsidian: resolve(__dirname, "tests/__mocks__/obsidian.ts"),
    },
  },
});
