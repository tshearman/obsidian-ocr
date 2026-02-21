"""Tests for ocr_cli.postprocessing — normalize_latex_delimiters()."""

import pytest

from ocr_cli.postprocessing import normalize_latex_delimiters


# ── Inline math: \( ... \) → $ ... $ ──────────────────────────────────────────


class TestInlineMath:
    def test_simple_inline(self):
        assert normalize_latex_delimiters(r"\(x\)") == "$x$"

    def test_inline_with_spaces(self):
        assert normalize_latex_delimiters(r"\( x \)") == "$ x $"

    def test_inline_in_sentence(self):
        src = r"the value of \( x \) is positive"
        assert normalize_latex_delimiters(src) == "the value of $ x $ is positive"

    def test_multiple_inline(self):
        src = r"\( a \) and \( b \)"
        assert normalize_latex_delimiters(src) == "$ a $ and $ b $"

    def test_inline_with_latex_commands(self):
        src = r"where \( \alpha + \beta = \gamma \)"
        assert normalize_latex_delimiters(src) == r"where $ \alpha + \beta = \gamma $"


# ── Display math: \[ ... \] → $$ ... $$ ──────────────────────────────────────


class TestDisplayMath:
    def test_simple_display(self):
        assert normalize_latex_delimiters(r"\[E = mc^2\]") == "$$E = mc^2$$"

    def test_display_with_spaces(self):
        assert normalize_latex_delimiters(r"\[ E = mc^2 \]") == "$$ E = mc^2 $$"

    def test_multiline_display(self):
        src = "\\[\n(0) \\quad (\\forall x)\n\\]"
        expected = "$$\n(0) \\quad (\\forall x)\n$$"
        assert normalize_latex_delimiters(src) == expected

    def test_display_in_paragraph(self):
        src = "Consider the equation:\n\\[\nf(x) = x^2\n\\]\nwhich is quadratic."
        result = normalize_latex_delimiters(src)
        assert "\\[" not in result
        assert "\\]" not in result
        assert "$$\nf(x) = x^2\n$$" in result

    def test_ewd_style_multiline(self):
        """Real-world example: EWD-style quantifier expression on its own block."""
        src = "\\[\n(0) \\quad (\\forall x \\ : \\ P.x) \\equiv (\\forall x \\ : \\ P'.x) \n\\]"
        expected = "$$\n(0) \\quad (\\forall x \\ : \\ P.x) \\equiv (\\forall x \\ : \\ P'.x) \n$$"
        assert normalize_latex_delimiters(src) == expected


# ── Consecutive single-line $$ block merging ──────────────────────────────────


class TestMergeConsecutiveDisplayBlocks:
    def test_two_consecutive_blocks_merged(self):
        src = "$$A$$\n$$B$$"
        result = normalize_latex_delimiters(src)
        assert result == "$$\nA \\\\\nB\n$$"

    def test_many_consecutive_blocks_merged(self):
        src = "$$A$$\n$$B$$\n$$C$$"
        result = normalize_latex_delimiters(src)
        assert result == "$$\nA \\\\\nB \\\\\nC\n$$"

    def test_single_block_left_unchanged(self):
        text = "$$E = mc^2$$"
        assert normalize_latex_delimiters(text) == text

    def test_blank_line_prevents_merge(self):
        """A blank line between two blocks keeps them separate."""
        src = "$$A$$\n\n$$B$$"
        result = normalize_latex_delimiters(src)
        assert "$$A$$" in result
        assert "$$B$$" in result

    def test_surrounding_text_preserved(self):
        src = "for any $x$\n\n$$A$$\n$$B$$\n\nsome text"
        result = normalize_latex_delimiters(src)
        assert "for any $x$" in result
        assert "some text" in result
        assert "$$A$$\n$$B$$" not in result  # was merged

    def test_ewd_calculation_merged(self):
        """Real-world case: model outputs each step as its own $$...$$ block."""
        src = (
            'for any $x$\n'
            '\n'
            '$$P\'\'\\,.x$$\n'
            '$$= \\quad \\{(3)\\}$$\n'
            '$$P\'.x \\lor (\\exists y: y < x: \\neg P\'.y)$$\n'
            '$$= \\quad \\{(1)\\}$$\n'
            '$$P\'.x.$$\n'
            '\n'
            'In other words'
        )
        result = normalize_latex_delimiters(src)
        lines = result.split("\n")
        # Preamble and postamble preserved
        assert lines[0] == "for any $x$"
        assert lines[-1] == "In other words"
        # One merged block somewhere in the middle
        assert "$$" in result
        block_start = lines.index("$$")
        block_end = lines.index("$$", block_start + 1)
        content = lines[block_start + 1 : block_end]
        non_empty = [l for l in content if l]
        assert len(non_empty) == 5
        for line in non_empty[:-1]:
            assert line.endswith(r"\\"), f"Expected \\\\ at end of: {line!r}"
        assert not non_empty[-1].endswith(r"\\")

    def test_idempotent(self):
        src = "$$A$$\n$$B$$\n$$C$$"
        once = normalize_latex_delimiters(src)
        twice = normalize_latex_delimiters(once)
        assert once == twice


# ── Mixed content ──────────────────────────────────────────────────────────────


class TestMixedContent:
    def test_inline_and_display_together(self):
        src = r"Let \( x \) satisfy \[x^2 = 4\]"
        result = normalize_latex_delimiters(src)
        assert "\\(" not in result
        assert "\\)" not in result
        assert "\\[" not in result
        assert "\\]" not in result
        assert "$ x $" in result
        assert "$$x^2 = 4$$" in result

    def test_real_world_example(self):
        """Mirrors the example from the user's actual LLM output."""
        src = (
            r"In the following, \( x \) and \( y \) range over the elements "
            r"of a well-founded set \((C, <)\)"
            "\n\\[\n(0) \\quad (\\forall x)\n\\]"
        )
        result = normalize_latex_delimiters(src)
        assert "\\(" not in result
        assert "\\)" not in result
        assert "\\[" not in result
        assert "\\]" not in result
        assert "$ x $" in result
        assert "$ y $" in result


# ── Multi-line $$ blocks: \\ line terminators ────────────────────────────────


class TestDisplayMathLinebreaks:
    def test_single_content_line_unchanged(self):
        """A $$ block with one content line must not have \\ appended."""
        text = "$$\nE = mc^2\n$$"
        assert normalize_latex_delimiters(text) == text

    def test_two_line_block(self):
        text = "$$\nA\nB\n$$"
        result = normalize_latex_delimiters(text)
        assert result == "$$\nA \\\\\nB\n$$"

    def test_trailing_spaces_stripped_before_linebreak(self):
        """Trailing whitespace on each line is stripped before \\ is appended."""
        text = "$$\nA   \nB   \n$$"
        result = normalize_latex_delimiters(text)
        assert result == "$$\nA \\\\\nB\n$$"

    def test_last_line_has_no_linebreak(self):
        text = "$$\nA\nB\nC\n$$"
        result = normalize_latex_delimiters(text)
        lines = result.strip("$\n").split("\n")
        assert lines[-1] == "C"  # last line unchanged

    def test_already_terminated_lines_not_doubled(self):
        """Lines already ending with \\ must not get a second \\."""
        text = "$$\nA \\\\\nB\n$$"
        assert normalize_latex_delimiters(text) == text

    def test_idempotent_simple(self):
        """Applying normalize_latex_delimiters twice must equal applying it once."""
        text = "$$\nA\nB\nC\n$$"
        once = normalize_latex_delimiters(text)
        twice = normalize_latex_delimiters(once)
        assert once == twice

    def test_idempotent_ewd_style(self):
        """Idempotency holds for a realistic multi-step proof block."""
        src = (
            "$$\n"
            "P''.x \n"
            "= \\{(3)\\} \n"
            "P'.x \\lor (\\exists y: y \\prec x: \\neg P'.y) \n"
            "P'.x .\n"
            "$$"
        )
        once = normalize_latex_delimiters(src)
        twice = normalize_latex_delimiters(once)
        assert once == twice

    def test_idempotent_mixed_content(self):
        """Idempotency holds when inline and display math appear together."""
        src = r"Let \( x \) satisfy \[ x^2 = 4 \]"
        once = normalize_latex_delimiters(src)
        twice = normalize_latex_delimiters(once)
        assert once == twice

    def test_ewd_full_calculation(self):
        """The EWD-style step-by-step proof block from the user's note."""
        src = (
            "$$\n"
            "P''.x \n"
            "= \\{(3)\\} \n"
            "P'.x \\lor (\\exists y: y \\prec x: \\neg P'.y) \n"
            "= \\{(1)\\} \n"
            "P'.x .\n"
            "$$"
        )
        result = normalize_latex_delimiters(src)
        lines = result.split("\n")
        # Opening and closing markers unchanged
        assert lines[0] == "$$"
        assert lines[-1] == "$$"
        # Every content line except the last ends with \\
        content = lines[1:-1]
        non_empty = [l for l in content if l]
        for line in non_empty[:-1]:
            assert line.endswith(r"\\"), f"Expected \\\\ at end of: {line!r}"
        # Last content line must NOT end with \\
        assert not non_empty[-1].endswith(r"\\")


# ── No-op cases: already uses $ delimiters ────────────────────────────────────


class TestNoOp:
    def test_already_inline_dollar(self):
        text = "the value of $x$ is positive"
        assert normalize_latex_delimiters(text) == text

    def test_already_display_dollar(self):
        text = "$$\nE = mc^2\n$$"
        assert normalize_latex_delimiters(text) == text

    def test_plain_text_unchanged(self):
        text = "No math here at all."
        assert normalize_latex_delimiters(text) == text

    def test_empty_string(self):
        assert normalize_latex_delimiters("") == ""
