/**
 * Tests for extractFrontmatterTags() from watcher.ts.
 * The module imports from 'obsidian' so we mock it to run in Node.
 */

import { describe, it, expect, vi } from "vitest";
import {
  extractFrontmatterTags,
  extractFrontmatterHash,
  buildKnownHashes,
  resolveModel,
  buildOutputContent,
} from "../src/plugin/watcher";
import { DEFAULT_SETTINGS } from "../src/plugin/settings";

// ── A valid 64-char sha256 hex digest used across tests ────────────────────
const VALID_HASH = "a".repeat(64);

describe("extractFrontmatterHash", () => {
  it("extracts a valid 64-char hex hash from frontmatter", () => {
    const text = `---\nsource: "[[doc.pdf]]"\nsource-hash: "${VALID_HASH}"\n---\nBody.`;
    expect(extractFrontmatterHash(text)).toBe(VALID_HASH);
  });

  it("returns null when source-hash field is absent", () => {
    const text = "---\nsource: \"[[doc.pdf]]\"\n---\nBody.";
    expect(extractFrontmatterHash(text)).toBeNull();
  });

  it("returns null when there is no frontmatter at all", () => {
    expect(extractFrontmatterHash("Just plain text.")).toBeNull();
  });

  it("returns null when hash is wrong length", () => {
    const text = "---\nsource-hash: \"abc123\"\n---\nBody.";
    expect(extractFrontmatterHash(text)).toBeNull();
  });

  it("returns null when hash contains non-hex characters", () => {
    const invalid = "z".repeat(64);
    const text = `---\nsource-hash: "${invalid}"\n---\nBody.`;
    expect(extractFrontmatterHash(text)).toBeNull();
  });

  it("handles hash without surrounding quotes", () => {
    const text = `---\nsource-hash: ${VALID_HASH}\n---\nBody.`;
    expect(extractFrontmatterHash(text)).toBe(VALID_HASH);
  });

  it("handles CRLF line endings", () => {
    const text = `---\r\nsource-hash: "${VALID_HASH}"\r\n---\r\nBody.`;
    expect(extractFrontmatterHash(text)).toBe(VALID_HASH);
  });
});

describe("buildKnownHashes", () => {
  it("collects source-hash values from all markdown files", async () => {
    const hash1 = "1".repeat(64);
    const hash2 = "2".repeat(64);
    const makeFile = (path: string) => ({ extension: "md", path });
    const files = [
      makeFile("a.md"),
      makeFile("b.md"),
      makeFile("c.md"),
    ];
    const contents: Record<string, string> = {
      "a.md": `---\nsource-hash: "${hash1}"\n---\nBody.`,
      "b.md": `---\nsource-hash: "${hash2}"\n---\nBody.`,
      "c.md": "---\ntitle: No hash here\n---\nBody.",
    };
    const vault = {
      getFiles: vi.fn().mockReturnValue(files),
      read: vi.fn((f: { path: string }) => Promise.resolve(contents[f.path])),
    };

    const result = await buildKnownHashes(vault as never);

    expect(result.size).toBe(2);
    expect(result.has(hash1)).toBe(true);
    expect(result.has(hash2)).toBe(true);
  });

  it("returns an empty set when no markdown files have source-hash", async () => {
    const vault = {
      getFiles: vi.fn().mockReturnValue([{ extension: "md", path: "note.md" }]),
      read: vi.fn().mockResolvedValue("Just plain text."),
    };
    const result = await buildKnownHashes(vault as never);
    expect(result.size).toBe(0);
  });

  it("ignores non-markdown files", async () => {
    const vault = {
      getFiles: vi.fn().mockReturnValue([
        { extension: "pdf", path: "doc.pdf" },
        { extension: "png", path: "img.png" },
      ]),
      read: vi.fn(),
    };
    const result = await buildKnownHashes(vault as never);
    expect(result.size).toBe(0);
    expect(vault.read).not.toHaveBeenCalled();
  });
});

// ── Round-trip: hash written by buildOutputContent must be readable back ──────
// These tests confirm that the format produced by buildOutputContent is
// correctly parsed by extractFrontmatterHash.  If they fail, extraction is
// broken.  If they pass, the "all files reprocessed on restart" bug is caused
// by vault.getFiles() returning an empty list before layout is ready (fixed in
// main.ts by deferring initializeAndScan to workspace.onLayoutReady).
describe("hash round-trip (buildOutputContent → extractFrontmatterHash)", () => {
  const file = { name: "doc.pdf", basename: "doc", ctime: 0, mtime: 0 };

  it("extracts the hash from plain OCR output (no tags)", () => {
    const hash = "1".repeat(64);
    const content = buildOutputContent(file, "Body text.", hash, "claude-sonnet-4-6", "anthropic");
    expect(extractFrontmatterHash(content)).toBe(hash);
  });

  it("extracts the hash when LLM output includes frontmatter tags", () => {
    const hash = "2".repeat(64);
    const llmOutput = "---\ntags:\n  - mathematics\n  - physics\n---\nBody.";
    const content = buildOutputContent(file, llmOutput, hash, "claude-sonnet-4-6", "anthropic");
    expect(extractFrontmatterHash(content)).toBe(hash);
  });

  it("buildKnownHashes returns the correct hash when given output from buildOutputContent", async () => {
    const hash = "3".repeat(64);
    const content = buildOutputContent(file, "Body.", hash, "gpt-4o", "openai");
    const vault = {
      getFiles: vi.fn().mockReturnValue([{ extension: "md", path: "ocr.md" }]),
      read: vi.fn().mockResolvedValue(content),
    };
    const result = await buildKnownHashes(vault as never);
    expect(result.has(hash)).toBe(true);
  });

  it("buildKnownHashes on an empty vault (simulates pre-layout-ready state) returns empty set", async () => {
    // This models what happens when vault.getFiles() is called before Obsidian
    // has finished loading — it returns an empty array.  The resulting empty
    // knownHashes causes scanWatchedFolders to enqueue every PDF, triggering
    // a full reprocessing run on every restart.
    // Fix: defer initializeAndScan until workspace.onLayoutReady().
    const vault = {
      getFiles: vi.fn().mockReturnValue([]), // empty — vault not ready yet
      read: vi.fn(),
    };
    const result = await buildKnownHashes(vault as never);
    expect(result.size).toBe(0); // empty → all PDFs will be reprocessed
  });
});

describe("buildOutputContent", () => {
  const file = { name: "document.pdf", basename: "document", ctime: 0, mtime: 0 };
  const hash = "abc123";
  const model = "claude-sonnet-4-6";
  const provider = "anthropic";

  it("uses file.name (with extension) in the source link", () => {
    const result = buildOutputContent(file, "Body text.", hash, model, provider);
    expect(result).toContain('source: "[[document.pdf]]"');
    expect(result).not.toContain('source: "[[document]]"');
  });

  it("includes provider, model, and hash in frontmatter", () => {
    const result = buildOutputContent(file, "Body.", hash, model, provider);
    expect(result).toContain(`provider: "${provider}"`);
    expect(result).toContain(`model: "${model}"`);
    expect(result).toContain(`source-hash: "${hash}"`);
  });

  it("appends the body after the frontmatter block", () => {
    const result = buildOutputContent(file, "Body text.", hash, model, provider);
    expect(result).toMatch(/---\nBody text\.$/);
  });

  it("hoists LLM-emitted tags into the frontmatter", () => {
    const markdown = "---\ntags:\n  - math\n  - physics\n---\nBody.";
    const result = buildOutputContent(file, markdown, hash, model, provider);
    expect(result).toContain("tags:");
    expect(result).toContain("  - math");
    expect(result).toContain("  - physics");
    // Format is "---\n<yaml>\n---\n<body>", so split on "---\n" yields [before, yaml, body].
    const afterFrontmatter = result.split("---\n")[2];
    expect(afterFrontmatter).toBe("Body.");
  });

  it("omits tags block when LLM output has no tags", () => {
    const result = buildOutputContent(file, "No tags here.", hash, model, provider);
    expect(result).not.toContain("tags:");
  });
});

describe("resolveModel", () => {
  it("returns anthropicModel when provider is anthropic", () => {
    const settings = { ...DEFAULT_SETTINGS, provider: "anthropic" as const, anthropicModel: "claude-opus-4-6" };
    expect(resolveModel(settings)).toBe("claude-opus-4-6");
  });

  it("returns openaiModel when provider is openai", () => {
    const settings = { ...DEFAULT_SETTINGS, provider: "openai" as const, openaiModel: "gpt-4o-mini" };
    expect(resolveModel(settings)).toBe("gpt-4o-mini");
  });

  it("returns ollamaModel when provider is ollama", () => {
    const settings = { ...DEFAULT_SETTINGS, provider: "ollama" as const, ollamaModel: "llama3.2-vision" };
    expect(resolveModel(settings)).toBe("llama3.2-vision");
  });
});

describe("extractFrontmatterTags", () => {
  describe("no frontmatter", () => {
    it("returns empty tags and full text as body", () => {
      const text = "Just some plain text.";
      expect(extractFrontmatterTags(text)).toEqual({ tags: [], body: text });
    });

    it("handles empty string", () => {
      expect(extractFrontmatterTags("")).toEqual({ tags: [], body: "" });
    });

    it("does not mistake a --- in body as frontmatter", () => {
      const text = "Some text\n---\nMore text";
      expect(extractFrontmatterTags(text)).toEqual({ tags: [], body: text });
    });
  });

  describe("frontmatter without tags", () => {
    it("strips frontmatter and returns empty tags", () => {
      const text = "---\ntitle: My Note\nauthor: Someone\n---\nBody text here.";
      const result = extractFrontmatterTags(text);
      expect(result.tags).toEqual([]);
      expect(result.body).toBe("Body text here.");
    });

    it("handles frontmatter with no body", () => {
      const text = "---\ntitle: My Note\n---\n";
      const result = extractFrontmatterTags(text);
      expect(result.tags).toEqual([]);
      expect(result.body).toBe("");
    });
  });

  describe("block-form tags", () => {
    it("extracts a single tag", () => {
      const text = "---\ntags:\n  - math\n---\nBody.";
      const result = extractFrontmatterTags(text);
      expect(result.tags).toEqual(["math"]);
      expect(result.body).toBe("Body.");
    });

    it("extracts multiple tags", () => {
      const text = "---\ntags:\n  - math\n  - physics\n  - notes\n---\nBody.";
      const result = extractFrontmatterTags(text);
      expect(result.tags).toEqual(["math", "physics", "notes"]);
    });

    it("extracts tags alongside other frontmatter fields", () => {
      const text =
        "---\ntitle: EWD Notes\ntags:\n  - ewd\n  - logic\nauthor: Dijkstra\n---\nContent.";
      const result = extractFrontmatterTags(text);
      expect(result.tags).toEqual(["ewd", "logic"]);
      expect(result.body).toBe("Content.");
    });

    it("trims whitespace from tag values", () => {
      const text = "---\ntags:\n  - foo  \n  - bar\n---\nBody.";
      const result = extractFrontmatterTags(text);
      expect(result.tags).toEqual(["foo", "bar"]);
    });
  });

  describe("flow-form tags", () => {
    it("extracts flow-form tags", () => {
      const text = "---\ntags: [math, physics]\n---\nBody.";
      const result = extractFrontmatterTags(text);
      expect(result.tags).toEqual(["math", "physics"]);
    });

    it("trims whitespace around flow-form tags", () => {
      const text = "---\ntags: [ foo , bar , baz ]\n---\nBody.";
      const result = extractFrontmatterTags(text);
      expect(result.tags).toEqual(["foo", "bar", "baz"]);
    });

    it("handles single flow-form tag", () => {
      const text = "---\ntags: [solo]\n---\nBody.";
      const result = extractFrontmatterTags(text);
      expect(result.tags).toEqual(["solo"]);
    });
  });

  describe("body handling", () => {
    it("strips leading whitespace from body", () => {
      const text = "---\ntags:\n  - math\n---\n\n\nBody after blank lines.";
      const result = extractFrontmatterTags(text);
      expect(result.body).toBe("Body after blank lines.");
    });

    it("preserves body content including math", () => {
      const text =
        "---\ntags:\n  - math\n---\nLet $x$ satisfy $$\nf(x) = 0\n$$";
      const result = extractFrontmatterTags(text);
      expect(result.body).toContain("$x$");
      expect(result.body).toContain("$$\nf(x) = 0\n$$");
    });

    it("preserves multi-paragraph body", () => {
      const text = "---\ntitle: Test\n---\nPara one.\n\nPara two.";
      const result = extractFrontmatterTags(text);
      expect(result.body).toBe("Para one.\n\nPara two.");
    });
  });

  describe("CRLF line endings", () => {
    it("handles CRLF frontmatter delimiter", () => {
      const text = "---\r\ntags:\r\n  - math\r\n---\r\nBody.";
      const result = extractFrontmatterTags(text);
      expect(result.tags).toEqual(["math"]);
    });
  });
});
