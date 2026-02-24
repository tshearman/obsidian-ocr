/**
 * Tests for normalizeLatexDelimiters() — bracket-to-dollar safety net.
 */

import { describe, it, expect } from "vitest";
import { normalizeLatexDelimiters } from "../src/core/postprocessing";

// ── Inline math: \( ... \) → $ ... $ ─────────────────────────────────────────

describe("inline math", () => {
  it("converts simple inline", () => {
    expect(normalizeLatexDelimiters(String.raw`\(x\)`)).toBe("$x$");
  });

  it("preserves inner spaces", () => {
    expect(normalizeLatexDelimiters(String.raw`\( x \)`)).toBe("$ x $");
  });

  it("converts inline inside a sentence", () => {
    const src = String.raw`the value of \( x \) is positive`;
    expect(normalizeLatexDelimiters(src)).toBe("the value of $ x $ is positive");
  });

  it("converts multiple inline occurrences", () => {
    const src = String.raw`\( a \) and \( b \)`;
    expect(normalizeLatexDelimiters(src)).toBe("$ a $ and $ b $");
  });

  it("preserves latex commands inside inline", () => {
    const src = String.raw`where \( \alpha + \beta = \gamma \)`;
    expect(normalizeLatexDelimiters(src)).toBe(
      String.raw`where $ \alpha + \beta = \gamma $`
    );
  });
});

// ── Display math: \[ ... \] → $$ ... $$ ──────────────────────────────────────

describe("display math", () => {
  it("converts simple display", () => {
    expect(normalizeLatexDelimiters(String.raw`\[E = mc^2\]`)).toBe(
      "$$E = mc^2$$"
    );
  });

  it("preserves inner spaces", () => {
    expect(normalizeLatexDelimiters(String.raw`\[ E = mc^2 \]`)).toBe(
      "$$ E = mc^2 $$"
    );
  });

  it("converts multiline display block", () => {
    const src = "\\[\n(0) \\quad (\\forall x)\n\\]";
    const expected = "$$\n(0) \\quad (\\forall x)\n$$";
    expect(normalizeLatexDelimiters(src)).toBe(expected);
  });

  it("removes \\[ and \\] from paragraph text", () => {
    const src = "Consider the equation:\n\\[\nf(x) = x^2\n\\]\nwhich is quadratic.";
    const result = normalizeLatexDelimiters(src);
    expect(result).not.toContain("\\[");
    expect(result).not.toContain("\\]");
    expect(result).toContain("$$\nf(x) = x^2\n$$");
  });

  it("EWD-style multiline quantifier", () => {
    const src =
      "\\[\n(0) \\quad (\\forall x \\ : \\ P.x) \\equiv (\\forall x \\ : \\ P'.x) \n\\]";
    const expected =
      "$$\n(0) \\quad (\\forall x \\ : \\ P.x) \\equiv (\\forall x \\ : \\ P'.x) \n$$";
    expect(normalizeLatexDelimiters(src)).toBe(expected);
  });
});

// ── Mixed content ─────────────────────────────────────────────────────────────

describe("mixed content", () => {
  it("handles inline and display together", () => {
    const src = String.raw`Let \( x \) satisfy \[x^2 = 4\]`;
    const result = normalizeLatexDelimiters(src);
    expect(result).not.toContain("\\(");
    expect(result).not.toContain("\\)");
    expect(result).not.toContain("\\[");
    expect(result).not.toContain("\\]");
    expect(result).toContain("$ x $");
    expect(result).toContain("$$x^2 = 4$$");
  });

  it("real-world example from LLM output", () => {
    const src =
      String.raw`In the following, \( x \) and \( y \) range over the elements ` +
      String.raw`of a well-founded set \((C, <)\)` +
      "\n\\[\n(0) \\quad (\\forall x)\n\\]";
    const result = normalizeLatexDelimiters(src);
    expect(result).not.toContain("\\(");
    expect(result).not.toContain("\\)");
    expect(result).not.toContain("\\[");
    expect(result).not.toContain("\\]");
    expect(result).toContain("$ x $");
    expect(result).toContain("$ y $");
  });

  it("idempotent with mixed content", () => {
    const src = String.raw`Let \( x \) satisfy \[ x^2 = 4 \]`;
    const once = normalizeLatexDelimiters(src);
    const twice = normalizeLatexDelimiters(once);
    expect(once).toBe(twice);
  });
});

// ── No-op: already uses $ delimiters ─────────────────────────────────────────

describe("no-op cases", () => {
  it("leaves already-inline-dollar text unchanged", () => {
    const text = "the value of $x$ is positive";
    expect(normalizeLatexDelimiters(text)).toBe(text);
  });

  it("leaves already-display-dollar block unchanged", () => {
    const text = "$$\nE = mc^2\n$$";
    expect(normalizeLatexDelimiters(text)).toBe(text);
  });

  it("leaves plain text unchanged", () => {
    const text = "No math here at all.";
    expect(normalizeLatexDelimiters(text)).toBe(text);
  });

  it("handles empty string", () => {
    expect(normalizeLatexDelimiters("")).toBe("");
  });

  it("leaves \\begin{align*} block unchanged", () => {
    const text =
      "$$\n\\begin{align*}\nP''.x &= \\{ \\text{hint} \\} \\\\\n      &= P'.x\n\\end{align*}\n$$";
    expect(normalizeLatexDelimiters(text)).toBe(text);
  });
});
