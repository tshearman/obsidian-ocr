"""Tests for the ocr CLI entry point.

The provider is always mocked so no LLM API is called. Real PDF and image
files (from conftest fixtures) are used so Click's path-existence validation
is satisfied and code paths through pdf_to_images / read_bytes run as normal.
"""

from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from ocr_cli.cli import main


FAKE_OCR_OUTPUT = "# OCR Result\n\nExtracted text from the document."


@pytest.fixture
def mock_provider() -> MagicMock:
    provider = MagicMock()
    provider.ocr.return_value = FAKE_OCR_OUTPUT
    return provider


@contextmanager
def stub_provider(mock_provider: MagicMock):
    """Replace _build_provider so the CLI returns our mock without touching any API."""
    with patch("ocr_cli.cli._build_provider", return_value=mock_provider):
        yield


# ── Help and version ───────────────────────────────────────────────────────


class TestCliHelp:
    def test_help_exits_zero(self, runner):
        result = runner.invoke(main, ["--help"])
        assert result.exit_code == 0

    def test_help_shows_input_path_argument(self, runner):
        result = runner.invoke(main, ["--help"])
        assert "INPUT_PATH" in result.output

    def test_help_shows_provider_option(self, runner):
        result = runner.invoke(main, ["--help"])
        assert "--provider" in result.output

    def test_help_shows_format_option(self, runner):
        result = runner.invoke(main, ["--help"])
        assert "--format" in result.output

    def test_help_shows_dpi_option(self, runner):
        result = runner.invoke(main, ["--help"])
        assert "--dpi" in result.output


# ── Missing API key ────────────────────────────────────────────────────────


class TestCliMissingApiKey:
    def test_exits_nonzero_when_no_api_key_set(self, runner, png_file, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        result = runner.invoke(main, [str(png_file)])
        assert result.exit_code != 0

    def test_exits_nonzero_for_openai_without_key(self, runner, png_file, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        result = runner.invoke(main, [str(png_file), "--provider", "openai"])
        assert result.exit_code != 0


# ── Unsupported file types ─────────────────────────────────────────────────


class TestCliUnsupportedExtension:
    def test_txt_file_exits_nonzero(self, runner, tmp_path, monkeypatch):
        txt = tmp_path / "doc.txt"
        txt.write_text("hello")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        result = runner.invoke(main, [str(txt)])
        assert result.exit_code != 0

    def test_csv_file_exits_nonzero(self, runner, tmp_path, monkeypatch):
        csv = tmp_path / "data.csv"
        csv.write_text("a,b,c")
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        result = runner.invoke(main, [str(csv)])
        assert result.exit_code != 0


# ── Normal operation with mocked provider ─────────────────────────────────


class TestCliNormalOperation:
    def test_png_ocr_succeeds(self, runner, png_file, mock_provider, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider):
            result = runner.invoke(main, [str(png_file)])
        assert result.exit_code == 0

    def test_png_ocr_result_printed_to_stdout(self, runner, png_file, mock_provider, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider):
            result = runner.invoke(main, [str(png_file)])
        assert FAKE_OCR_OUTPUT in result.output

    def test_pdf_ocr_succeeds(self, runner, single_page_pdf, mock_provider, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider):
            result = runner.invoke(main, [str(single_page_pdf)])
        assert result.exit_code == 0

    def test_png_bytes_passed_to_provider_as_single_element_list(
        self, runner, png_file, png_bytes, mock_provider, monkeypatch
    ):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider):
            runner.invoke(main, [str(png_file)])
        mock_provider.ocr.assert_called_once()
        images = mock_provider.ocr.call_args.kwargs["images"]
        assert images == [png_bytes]

    def test_pdf_pages_passed_to_provider(
        self, runner, single_page_pdf, mock_provider, monkeypatch
    ):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider):
            runner.invoke(main, [str(single_page_pdf)])
        images = mock_provider.ocr.call_args.kwargs["images"]
        assert len(images) == 1
        assert isinstance(images[0], bytes)

    def test_multi_page_pdf_passes_all_pages(
        self, runner, multi_page_pdf, mock_provider, monkeypatch
    ):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider):
            runner.invoke(main, [str(multi_page_pdf)])
        images = mock_provider.ocr.call_args.kwargs["images"]
        assert len(images) == 3


# ── --output flag ──────────────────────────────────────────────────────────


class TestCliOutputFlag:
    def test_output_flag_writes_result_to_file(
        self, runner, png_file, mock_provider, tmp_path, monkeypatch
    ):
        out = tmp_path / "result.md"
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider):
            runner.invoke(main, [str(png_file), "--output", str(out)])
        assert out.exists()
        assert FAKE_OCR_OUTPUT in out.read_text()

    def test_output_flag_suppresses_stdout(
        self, runner, png_file, mock_provider, tmp_path, monkeypatch
    ):
        out = tmp_path / "result.md"
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider):
            result = runner.invoke(main, [str(png_file), "--output", str(out)])
        assert FAKE_OCR_OUTPUT not in result.output


# ── --format flag ──────────────────────────────────────────────────────────


class TestCliFormatFlag:
    def test_format_markdown_passed_to_provider(
        self, runner, png_file, mock_provider, monkeypatch
    ):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider):
            runner.invoke(main, [str(png_file), "--format", "markdown"])
        assert mock_provider.ocr.call_args.kwargs["output_format"] == "markdown"

    def test_format_text_passed_to_provider(
        self, runner, png_file, mock_provider, monkeypatch
    ):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider):
            runner.invoke(main, [str(png_file), "--format", "text"])
        assert mock_provider.ocr.call_args.kwargs["output_format"] == "text"

    def test_default_format_is_markdown(self, runner, png_file, mock_provider, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider):
            runner.invoke(main, [str(png_file)])
        assert mock_provider.ocr.call_args.kwargs["output_format"] == "markdown"


# ── --dpi flag ─────────────────────────────────────────────────────────────


class TestCliDpiFlag:
    def test_dpi_flag_forwarded_to_pdf_conversion(
        self, runner, single_page_pdf, mock_provider, monkeypatch
    ):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider), patch(
            "ocr_cli.cli.pdf_to_images", return_value=[b"fake-img"]
        ) as mock_pdf:
            runner.invoke(main, [str(single_page_pdf), "--dpi", "200"])
        mock_pdf.assert_called_once()
        assert mock_pdf.call_args.kwargs["dpi"] == 200

    def test_dpi_not_forwarded_for_image_files(
        self, runner, png_file, mock_provider, monkeypatch
    ):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider), patch(
            "ocr_cli.cli.pdf_to_images"
        ) as mock_pdf:
            runner.invoke(main, [str(png_file), "--dpi", "200"])
        mock_pdf.assert_not_called()


# ── --provider and --api-key flags ─────────────────────────────────────────


class TestCliProviderAndApiKey:
    def test_provider_flag_selects_openai(self, runner, png_file, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        captured: list[str] = []

        def capturing_build(config):
            captured.append(config.provider.value)
            p = MagicMock()
            p.ocr.return_value = "result"
            return p

        with patch("ocr_cli.cli._build_provider", side_effect=capturing_build):
            runner.invoke(main, [str(png_file), "--provider", "openai"])

        assert captured == ["openai"]

    def test_default_provider_is_anthropic(self, runner, png_file, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        captured: list[str] = []

        def capturing_build(config):
            captured.append(config.provider.value)
            p = MagicMock()
            p.ocr.return_value = "result"
            return p

        with patch("ocr_cli.cli._build_provider", side_effect=capturing_build):
            runner.invoke(main, [str(png_file)])

        assert captured == ["anthropic"]

    def test_api_key_flag_passed_as_override_to_config(
        self, runner, png_file, mock_provider, monkeypatch
    ):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with stub_provider(mock_provider), patch("ocr_cli.cli.Config") as MockConfig:
            mock_cfg = MagicMock()
            mock_cfg.provider.value = "anthropic"
            MockConfig.from_env.return_value = mock_cfg
            runner.invoke(main, [str(png_file), "--api-key", "my-direct-key"])

        kwargs = MockConfig.from_env.call_args.kwargs
        assert kwargs.get("api_key_override") == "my-direct-key"

    def test_model_flag_passed_as_override_to_config(
        self, runner, png_file, mock_provider, monkeypatch
    ):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with stub_provider(mock_provider), patch("ocr_cli.cli.Config") as MockConfig:
            mock_cfg = MagicMock()
            mock_cfg.provider.value = "anthropic"
            MockConfig.from_env.return_value = mock_cfg
            runner.invoke(main, [str(png_file), "--model", "claude-custom"])

        kwargs = MockConfig.from_env.call_args.kwargs
        assert kwargs.get("model_override") == "claude-custom"
