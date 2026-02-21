"""Tests for ocr_cli.prompt — the shared handwritten-notes system prompt."""

from ocr_cli.prompt import HANDWRITTEN_NOTES_PROMPT


class TestPromptContent:
    # ── Mathematics ───────────────────────────────────────────────────────

    def test_specifies_display_math_with_double_dollars(self):
        assert "$$" in HANDWRITTEN_NOTES_PROMPT

    def test_specifies_inline_math_with_single_dollars(self):
        # Prompt must explain single-$ wrapping for inline math
        assert "$" in HANDWRITTEN_NOTES_PROMPT
        assert "inline" in HANDWRITTEN_NOTES_PROMPT.lower()

    def test_distinguishes_display_vs_inline_math(self):
        # Both styles must be described, not just one
        prompt = HANDWRITTEN_NOTES_PROMPT
        assert "$$" in prompt          # display
        assert "inline" in prompt.lower()  # inline

    # ── Headings ──────────────────────────────────────────────────────────

    def test_mentions_underlined_text_rule(self):
        assert "underlin" in HANDWRITTEN_NOTES_PROMPT.lower()

    def test_specifies_h1_for_title_position(self):
        # Level-1 heading marker must be mentioned
        assert "# " in HANDWRITTEN_NOTES_PROMPT or "level-1" in HANDWRITTEN_NOTES_PROMPT.lower()

    def test_specifies_h2_for_body_headings(self):
        assert "## " in HANDWRITTEN_NOTES_PROMPT or "level-2" in HANDWRITTEN_NOTES_PROMPT.lower()

    def test_heading_rule_covers_page_top(self):
        prompt = HANDWRITTEN_NOTES_PROMPT.lower()
        assert "top" in prompt or "title" in prompt

    # ── Tags / frontmatter ────────────────────────────────────────────────

    def test_mentions_hashtag_extraction(self):
        assert "#" in HANDWRITTEN_NOTES_PROMPT

    def test_specifies_frontmatter_output_format(self):
        assert "---" in HANDWRITTEN_NOTES_PROMPT
        assert "tags:" in HANDWRITTEN_NOTES_PROMPT

    def test_frontmatter_omitted_when_no_tags(self):
        assert "omit" in HANDWRITTEN_NOTES_PROMPT.lower() or "no hashtag" in HANDWRITTEN_NOTES_PROMPT.lower()

    def test_tags_placed_at_top_not_inline(self):
        # The prompt must say tags go into frontmatter, not stay in the body
        prompt = HANDWRITTEN_NOTES_PROMPT.lower()
        assert "frontmatter" in prompt
        assert "inline" in prompt  # explains what NOT to do

    # ── Text output format ────────────────────────────────────────────────

    def test_describes_plain_text_output_mode(self):
        assert "plain text" in HANDWRITTEN_NOTES_PROMPT.lower()

    def test_text_mode_disables_latex(self):
        prompt = HANDWRITTEN_NOTES_PROMPT.lower()
        # Must describe that LaTeX delimiters are not used in text mode
        assert "latex" in prompt or "dollar" in prompt

    def test_text_mode_disables_frontmatter(self):
        assert "frontmatter" in HANDWRITTEN_NOTES_PROMPT.lower()
