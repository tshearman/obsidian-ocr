"""Tests for the Anthropic and OpenAI provider implementations.

LLM API clients are mocked at their construction point so no network
calls are made and no API keys are required.
"""

import base64
from unittest.mock import MagicMock, patch

import pytest

from ocr_cli.prompt import HANDWRITTEN_NOTES_PROMPT
from ocr_cli.providers.anthropic import AnthropicProvider
from ocr_cli.providers.anthropic import SYSTEM_PROMPT as ANTHROPIC_SYSTEM_PROMPT
from ocr_cli.providers.openai import OpenAIProvider
from ocr_cli.providers.openai import SYSTEM_PROMPT as OPENAI_SYSTEM_PROMPT

FAKE_IMAGE_A = b"fake-image-bytes-page-A"
FAKE_IMAGE_B = b"fake-image-bytes-page-B"


# ── Helpers ────────────────────────────────────────────────────────────────


def _content_types(content: list) -> list[str]:
    return [block["type"] for block in content]


# ══════════════════════════════════════════════════════════════════════════
# AnthropicProvider
# ══════════════════════════════════════════════════════════════════════════


class TestAnthropicProvider:
    @pytest.fixture
    def mock_anthropic_client(self):
        """Patch anthropic.Anthropic so no real client is created."""
        with patch("ocr_cli.providers.anthropic.anthropic.Anthropic") as MockCls:
            yield MockCls.return_value

    @pytest.fixture
    def provider(self, mock_anthropic_client):
        return AnthropicProvider(api_key="test-key", model="claude-test-model")

    def _stub_response(self, mock_client: MagicMock, text: str) -> None:
        response = MagicMock()
        response.content = [MagicMock(text=text)]
        mock_client.messages.create.return_value = response

    # ── Single-image layout ───────────────────────────────────────────────

    def test_single_image_content_has_no_page_header(self, provider, mock_anthropic_client):
        self._stub_response(mock_anthropic_client, "result")
        provider.ocr([FAKE_IMAGE_A])
        content = mock_anthropic_client.messages.create.call_args.kwargs["messages"][0]["content"]
        # Expected: [image_block, instruction_text] — no leading page-header text
        assert _content_types(content) == ["image", "text"]

    def test_single_image_is_base64_encoded_correctly(self, provider, mock_anthropic_client):
        self._stub_response(mock_anthropic_client, "result")
        provider.ocr([FAKE_IMAGE_A])
        content = mock_anthropic_client.messages.create.call_args.kwargs["messages"][0]["content"]
        image_block = content[0]
        assert image_block["type"] == "image"
        assert image_block["source"]["type"] == "base64"
        assert image_block["source"]["media_type"] == "image/png"
        decoded = base64.standard_b64decode(image_block["source"]["data"])
        assert decoded == FAKE_IMAGE_A

    # ── Multi-image layout ────────────────────────────────────────────────

    def test_multi_image_content_has_page_headers(self, provider, mock_anthropic_client):
        self._stub_response(mock_anthropic_client, "result")
        provider.ocr([FAKE_IMAGE_A, FAKE_IMAGE_B])
        content = mock_anthropic_client.messages.create.call_args.kwargs["messages"][0]["content"]
        # Expected: [text, image, text, image, text(instruction)]
        assert _content_types(content) == ["text", "image", "text", "image", "text"]

    def test_multi_image_page_header_labels_are_correct(self, provider, mock_anthropic_client):
        self._stub_response(mock_anthropic_client, "result")
        provider.ocr([FAKE_IMAGE_A, FAKE_IMAGE_B])
        content = mock_anthropic_client.messages.create.call_args.kwargs["messages"][0]["content"]
        assert content[0]["text"] == "[Page 1]"
        assert content[2]["text"] == "[Page 2]"

    def test_multi_image_each_page_is_base64_encoded(self, provider, mock_anthropic_client):
        self._stub_response(mock_anthropic_client, "result")
        provider.ocr([FAKE_IMAGE_A, FAKE_IMAGE_B])
        content = mock_anthropic_client.messages.create.call_args.kwargs["messages"][0]["content"]
        # image blocks are at indices 1 and 3
        for idx, original in [(1, FAKE_IMAGE_A), (3, FAKE_IMAGE_B)]:
            decoded = base64.standard_b64decode(content[idx]["source"]["data"])
            assert decoded == original

    # ── API call parameters ───────────────────────────────────────────────

    def test_uses_the_configured_model(self, provider, mock_anthropic_client):
        self._stub_response(mock_anthropic_client, "result")
        provider.ocr([FAKE_IMAGE_A])
        assert mock_anthropic_client.messages.create.call_args.kwargs["model"] == "claude-test-model"

    def test_system_prompt_is_passed(self, provider, mock_anthropic_client):
        self._stub_response(mock_anthropic_client, "result")
        provider.ocr([FAKE_IMAGE_A])
        assert mock_anthropic_client.messages.create.call_args.kwargs["system"] == ANTHROPIC_SYSTEM_PROMPT

    def test_max_tokens_is_8192(self, provider, mock_anthropic_client):
        self._stub_response(mock_anthropic_client, "result")
        provider.ocr([FAKE_IMAGE_A])
        assert mock_anthropic_client.messages.create.call_args.kwargs["max_tokens"] == 8192

    def test_format_appears_in_instruction(self, provider, mock_anthropic_client):
        self._stub_response(mock_anthropic_client, "result")
        provider.ocr([FAKE_IMAGE_A], output_format="text")
        content = mock_anthropic_client.messages.create.call_args.kwargs["messages"][0]["content"]
        instruction = content[-1]["text"]
        assert "text" in instruction

    # ── Return value ──────────────────────────────────────────────────────

    def test_returns_text_from_response_content(self, provider, mock_anthropic_client):
        self._stub_response(mock_anthropic_client, "Extracted markdown text")
        result = provider.ocr([FAKE_IMAGE_A])
        assert result == "Extracted markdown text"


# ══════════════════════════════════════════════════════════════════════════
# OpenAIProvider
# ══════════════════════════════════════════════════════════════════════════


class TestOpenAIProvider:
    @pytest.fixture
    def mock_openai_client(self):
        """Patch openai.OpenAI so no real client is created."""
        with patch("ocr_cli.providers.openai.OpenAI") as MockCls:
            yield MockCls.return_value

    @pytest.fixture
    def provider(self, mock_openai_client):
        return OpenAIProvider(api_key="test-key", model="gpt-test-model")

    def _stub_response(self, mock_client: MagicMock, text: str | None) -> None:
        response = MagicMock()
        response.choices = [MagicMock(message=MagicMock(content=text))]
        mock_client.chat.completions.create.return_value = response

    def _user_content(self, mock_client: MagicMock) -> list:
        messages = mock_client.chat.completions.create.call_args.kwargs["messages"]
        return messages[1]["content"]

    # ── Single-image layout ───────────────────────────────────────────────

    def test_single_image_content_has_no_page_header(self, provider, mock_openai_client):
        self._stub_response(mock_openai_client, "result")
        provider.ocr([FAKE_IMAGE_A])
        types = _content_types(self._user_content(mock_openai_client))
        # Expected: [image_url, text(instruction)] — no page-header text
        assert types == ["image_url", "text"]

    def test_single_image_is_base64_data_url(self, provider, mock_openai_client):
        self._stub_response(mock_openai_client, "result")
        provider.ocr([FAKE_IMAGE_A])
        image_block = self._user_content(mock_openai_client)[0]
        url = image_block["image_url"]["url"]
        assert url.startswith("data:image/png;base64,")
        decoded = base64.b64decode(url.split(",", 1)[1])
        assert decoded == FAKE_IMAGE_A

    def test_single_image_uses_high_detail(self, provider, mock_openai_client):
        self._stub_response(mock_openai_client, "result")
        provider.ocr([FAKE_IMAGE_A])
        image_block = self._user_content(mock_openai_client)[0]
        assert image_block["image_url"]["detail"] == "high"

    # ── Multi-image layout ────────────────────────────────────────────────

    def test_multi_image_content_has_page_headers(self, provider, mock_openai_client):
        self._stub_response(mock_openai_client, "result")
        provider.ocr([FAKE_IMAGE_A, FAKE_IMAGE_B])
        types = _content_types(self._user_content(mock_openai_client))
        # Expected: [text, image_url, text, image_url, text(instruction)]
        assert types == ["text", "image_url", "text", "image_url", "text"]

    def test_multi_image_page_header_labels_are_correct(self, provider, mock_openai_client):
        self._stub_response(mock_openai_client, "result")
        provider.ocr([FAKE_IMAGE_A, FAKE_IMAGE_B])
        content = self._user_content(mock_openai_client)
        assert content[0]["text"] == "[Page 1]"
        assert content[2]["text"] == "[Page 2]"

    def test_multi_image_each_page_is_base64_data_url(self, provider, mock_openai_client):
        self._stub_response(mock_openai_client, "result")
        provider.ocr([FAKE_IMAGE_A, FAKE_IMAGE_B])
        content = self._user_content(mock_openai_client)
        for idx, original in [(1, FAKE_IMAGE_A), (3, FAKE_IMAGE_B)]:
            url = content[idx]["image_url"]["url"]
            decoded = base64.b64decode(url.split(",", 1)[1])
            assert decoded == original

    # ── API call parameters ───────────────────────────────────────────────

    def test_system_message_is_first_in_messages_list(self, provider, mock_openai_client):
        self._stub_response(mock_openai_client, "result")
        provider.ocr([FAKE_IMAGE_A])
        messages = mock_openai_client.chat.completions.create.call_args.kwargs["messages"]
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == OPENAI_SYSTEM_PROMPT

    def test_uses_the_configured_model(self, provider, mock_openai_client):
        self._stub_response(mock_openai_client, "result")
        provider.ocr([FAKE_IMAGE_A])
        assert mock_openai_client.chat.completions.create.call_args.kwargs["model"] == "gpt-test-model"

    def test_format_appears_in_instruction(self, provider, mock_openai_client):
        self._stub_response(mock_openai_client, "result")
        provider.ocr([FAKE_IMAGE_A], output_format="text")
        instruction = self._user_content(mock_openai_client)[-1]["text"]
        assert "text" in instruction

    # ── Return value ──────────────────────────────────────────────────────

    def test_returns_text_from_response(self, provider, mock_openai_client):
        self._stub_response(mock_openai_client, "OpenAI OCR output")
        result = provider.ocr([FAKE_IMAGE_A])
        assert result == "OpenAI OCR output"

    def test_returns_empty_string_when_content_is_none(self, provider, mock_openai_client):
        self._stub_response(mock_openai_client, None)
        result = provider.ocr([FAKE_IMAGE_A])
        assert result == ""


# ══════════════════════════════════════════════════════════════════════════
# Shared prompt
# ══════════════════════════════════════════════════════════════════════════


class TestSharedPrompt:
    def test_both_providers_use_the_same_prompt(self):
        assert ANTHROPIC_SYSTEM_PROMPT is HANDWRITTEN_NOTES_PROMPT
        assert OPENAI_SYSTEM_PROMPT is HANDWRITTEN_NOTES_PROMPT

    def test_prompt_mentions_latex_display_math(self):
        assert "$$" in HANDWRITTEN_NOTES_PROMPT

    def test_prompt_mentions_latex_inline_math(self):
        assert "$x$" in HANDWRITTEN_NOTES_PROMPT or "single dollar" in HANDWRITTEN_NOTES_PROMPT

    def test_prompt_mentions_underlined_headings(self):
        assert "nderlin" in HANDWRITTEN_NOTES_PROMPT  # "Underlined" / "underlined"

    def test_prompt_mentions_frontmatter_tags(self):
        assert "tags:" in HANDWRITTEN_NOTES_PROMPT
        assert "frontmatter" in HANDWRITTEN_NOTES_PROMPT

    def test_prompt_covers_text_output_format(self):
        assert "text" in HANDWRITTEN_NOTES_PROMPT
