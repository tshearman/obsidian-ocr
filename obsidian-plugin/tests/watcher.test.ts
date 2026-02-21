/**
 * Tests for extractFrontmatterTags() from watcher.ts.
 * The module imports from 'obsidian' so we mock it to run in Node.
 */

import { describe, it, expect } from "vitest";
import { extractFrontmatterTags } from "../src/watcher";

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
