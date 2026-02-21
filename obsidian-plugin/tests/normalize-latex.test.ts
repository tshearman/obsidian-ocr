/**
 * Tests for normalizeLatexDelimiters() — TypeScript mirror of
 * ocr-cli/tests/test_postprocessing.py.
 */

import { describe, it, expect } from "vitest";
import { normalizeLatexDelimiters } from "../src/ocr";

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

// ── Consecutive single-line $$ block merging ──────────────────────────────────

describe("merge consecutive display blocks", () => {
  it("merges two consecutive blocks", () => {
    const src = "$$A$$\n$$B$$";
    expect(normalizeLatexDelimiters(src)).toBe(
      "$$\n\\begin{gather}\n& A \\\\\n& B \\\\\n\\end{gather}\n$$"
    );
  });

  it("merges many consecutive blocks", () => {
    const src = "$$A$$\n$$B$$\n$$C$$";
    expect(normalizeLatexDelimiters(src)).toBe(
      "$$\n\\begin{gather}\n& A \\\\\n& B \\\\\n& C \\\\\n\\end{gather}\n$$"
    );
  });

  it("leaves a single block unchanged", () => {
    const text = "$$E = mc^2$$";
    expect(normalizeLatexDelimiters(text)).toBe(text);
  });

  it("blank line prevents merging", () => {
    const src = "$$A$$\n\n$$B$$";
    const result = normalizeLatexDelimiters(src);
    expect(result).toContain("$$A$$");
    expect(result).toContain("$$B$$");
  });

  it("preserves surrounding text", () => {
    const src = "for any $x$\n\n$$A$$\n$$B$$\n\nsome text";
    const result = normalizeLatexDelimiters(src);
    expect(result).toContain("for any $x$");
    expect(result).toContain("some text");
    expect(result).not.toContain("$$A$$\n$$B$$");
  });

  it("EWD calculation: all steps merged into one block", () => {
    const src =
      "for any $x$\n" +
      "\n" +
      "$$P''\\.x$$\n" +
      "$$= \\quad \\{(3)\\}$$\n" +
      "$$P'.x \\lor (\\exists y: y < x: \\neg P'.y)$$\n" +
      "$$= \\quad \\{(1)\\}$$\n" +
      "$$P'.x.$$\n" +
      "\n" +
      "In other words";
    const result = normalizeLatexDelimiters(src);
    const lines = result.split("\n");
    expect(lines[0]).toBe("for any $x$");
    expect(lines[lines.length - 1]).toBe("In other words");
    const blockStart = lines.indexOf("$$");
    expect(lines[blockStart + 1]).toBe("\\begin{gather}");
    const gatherEnd = lines.indexOf("\\end{gather}", blockStart);
    const content = lines.slice(blockStart + 2, gatherEnd);
    const nonEmpty = content.filter((l) => l);
    expect(nonEmpty).toHaveLength(5);
    for (const line of nonEmpty) {
      expect(line.startsWith("& ")).toBe(true);
      expect(line.endsWith("\\\\")).toBe(true);
    }
  });

  it("is idempotent", () => {
    const src = "$$A$$\n$$B$$\n$$C$$";
    const once = normalizeLatexDelimiters(src);
    const twice = normalizeLatexDelimiters(once);
    expect(once).toBe(twice);
  });
});

// ── Multi-line $$ blocks: \\ line terminators ─────────────────────────────────

describe("display math line breaks", () => {
  it("leaves single-content-line block unchanged", () => {
    const text = "$$\nE = mc^2\n$$";
    expect(normalizeLatexDelimiters(text)).toBe(text);
  });

  it("wraps multiline block in gather with & prefix and \\\\ on all lines", () => {
    const src = "$$\nP(x)\n= 12 x + 3\n= 6 y + 7\n$$";
    expect(normalizeLatexDelimiters(src)).toBe(
      "$$\n\\begin{gather}\n& P(x) \\\\\n& = 12 x + 3 \\\\\n& = 6 y + 7 \\\\\n\\end{gather}\n$$"
    );
  });

  it("adds \\\\ to first line of two-line block", () => {
    const text = "$$\nA\nB\n$$";
    expect(normalizeLatexDelimiters(text)).toBe(
      "$$\n\\begin{gather}\n& A \\\\\n& B \\\\\n\\end{gather}\n$$"
    );
  });

  it("strips trailing whitespace before adding \\\\", () => {
    const text = "$$\nA   \nB   \n$$";
    expect(normalizeLatexDelimiters(text)).toBe(
      "$$\n\\begin{gather}\n& A \\\\\n& B \\\\\n\\end{gather}\n$$"
    );
  });

  it("all lines including last have \\\\", () => {
    const text = "$$\nA\nB\nC\n$$";
    const result = normalizeLatexDelimiters(text);
    expect(result).toContain("& C \\\\");
    expect(result).toContain("\\end{gather}");
  });

  it("does not double \\\\ on already-terminated lines", () => {
    const text = "$$\nA \\\\\nB\n$$";
    expect(normalizeLatexDelimiters(text)).toBe(
      "$$\n\\begin{gather}\n& A \\\\\n& B \\\\\n\\end{gather}\n$$"
    );
  });

  it("idempotent: simple block", () => {
    const text = "$$\nA\nB\nC\n$$";
    const once = normalizeLatexDelimiters(text);
    const twice = normalizeLatexDelimiters(once);
    expect(once).toBe(twice);
  });

  it("idempotent: EWD-style block", () => {
    const src =
      "$$\n" +
      "P''.x \n" +
      "= \\{(3)\\} \n" +
      "P'.x \\lor (\\exists y: y \\prec x: \\neg P'.y) \n" +
      "P'.x .\n" +
      "$$";
    const once = normalizeLatexDelimiters(src);
    const twice = normalizeLatexDelimiters(once);
    expect(once).toBe(twice);
  });

  it("EWD full calculation block", () => {
    const src =
      "$$\n" +
      "P''.x \n" +
      "= \\{(3)\\} \n" +
      "P'.x \\lor (\\exists y: y \\prec x: \\neg P'.y) \n" +
      "= \\{(1)\\} \n" +
      "P'.x .\n" +
      "$$";
    const result = normalizeLatexDelimiters(src);
    const lines = result.split("\n");
    expect(lines[0]).toBe("$$");
    expect(lines[1]).toBe("\\begin{gather}");
    expect(lines[lines.length - 1]).toBe("$$");
    expect(lines[lines.length - 2]).toBe("\\end{gather}");
    const content = lines.slice(2, -2);
    const nonEmpty = content.filter((l) => l);
    for (const line of nonEmpty) {
      expect(line.startsWith("& ")).toBe(true);
      expect(line.endsWith("\\\\")).toBe(true);
    }
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
    expect(result).toContain("$x^2 = 4$");
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

// ── fixInlineDoubleDollar ─────────────────────────────────────────────────────

describe("fixInlineDoubleDollar", () => {
  it("converts $$...$$ inline in a sentence to $...$", () => {
    const src = "The truth of $$(\\forall x: Px)$$ by induction.";
    expect(normalizeLatexDelimiters(src)).toBe(
      "The truth of $(\\forall x: Px)$ by induction."
    );
  });

  it("converts numbered formula prefix (1) $$...$$ to inline math", () => {
    const src = "(1) $$(\\forall x: P'x \\equiv Px)$$";
    expect(normalizeLatexDelimiters(src)).toBe(
      "(1) $(\\forall x: P'x \\equiv Px)$"
    );
  });

  it("leaves standalone $$...$$ on its own line unchanged", () => {
    const src = "$$\\forall x: Px$$";
    expect(normalizeLatexDelimiters(src)).toBe(src);
  });

  it("leaves bare $$ delimiter lines unchanged", () => {
    const src = "$$\n\\forall x: Px\n$$";
    expect(normalizeLatexDelimiters(src)).toBe(src);
  });

  it("converts multiple inline $$...$$ on the same line", () => {
    const src = "Since $$a$$ and $$b$$ hold, we conclude.";
    expect(normalizeLatexDelimiters(src)).toBe(
      "Since $a$ and $b$ hold, we conclude."
    );
  });
});

// ── addDisplayLinebreaks — prose guard ────────────────────────────────────────

describe("addDisplayLinebreaks prose guard", () => {
  it("does not add \\\\ to a multi-line $$ block containing prose", () => {
    // Model wrapped prose + math in one big $$ block
    const src =
      "$$\nwhere $P'$ is given by\n\\forall x: P'x \\equiv Px\n* * *\n$$";
    const result = normalizeLatexDelimiters(src);
    // The prose line must not gain a trailing \\
    expect(result).not.toContain("where $P'$ is given by \\\\");
    expect(result).not.toContain("* * * \\\\");
  });

  it("still adds \\\\ to a multi-line $$ block containing only math", () => {
    const src =
      "$$\n\\forall x: P'x \\equiv Px\n\\forall x: P''x \\equiv P'x\n$$";
    const result = normalizeLatexDelimiters(src);
    expect(result).toContain("& \\forall x: P'x \\equiv Px \\\\");
    expect(result).toContain("& \\forall x: P''x \\equiv P'x \\\\");
  });

  it("wraps block containing \\text{...} annotations (not prose)", () => {
    const src =
      "$$\n" +
      "P(x)\n" +
      "= \\{ \\text{predicate calculus} \\}\n" +
      "P(x) \\lor Q(x)\n" +
      "$$";
    const result = normalizeLatexDelimiters(src);
    expect(result).toContain("\\begin{gather}");
    expect(result).toContain("& P(x) \\\\");
    expect(result).toContain("& = \\{ \\text{predicate calculus} \\} \\\\");
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
});
