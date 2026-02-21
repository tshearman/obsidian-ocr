"""Tests for ocr_cli.preprocessing — preprocess_for_ocr()."""

import io
import struct

import pytest
from PIL import Image, ImageStat

from ocr_cli.preprocessing import preprocess_for_ocr

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _make_png(width: int, height: int, color: tuple[int, int, int]) -> bytes:
    """Create a solid-colour PNG of the given size."""
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=color).save(buf, format="PNG")
    return buf.getvalue()


def _open(image_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(image_bytes))


def _mean_brightness(image_bytes: bytes) -> float:
    """Return the mean brightness of the image (0–255)."""
    img = _open(image_bytes).convert("L")
    return ImageStat.Stat(img).mean[0]


# ── Output format ──────────────────────────────────────────────────────────


class TestOutputFormat:
    def test_returns_bytes(self, png_bytes):
        result = preprocess_for_ocr(png_bytes)
        assert isinstance(result, bytes)

    def test_returns_valid_png(self, png_bytes):
        result = preprocess_for_ocr(png_bytes)
        assert result[:8] == PNG_MAGIC

    def test_output_dimensions_unchanged(self, png_bytes):
        original = _open(png_bytes)
        result = _open(preprocess_for_ocr(png_bytes))
        assert result.size == original.size

    def test_output_is_non_empty(self, png_bytes):
        assert len(preprocess_for_ocr(png_bytes)) > 0


# ── Auto-contrast ──────────────────────────────────────────────────────────


def _make_gradient_png(lo: int, hi: int, width: int = 100, height: int = 10) -> bytes:
    """Create a greyscale gradient from *lo* to *hi* pixel values, as RGB PNG."""
    img = Image.new("RGB", (width, height))
    for x in range(width):
        v = lo + int((hi - lo) * x / (width - 1))
        for y in range(height):
            img.putpixel((x, y), (v, v, v))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestAutoContrast:
    def test_dark_gradient_becomes_brighter_on_average(self):
        """A gradient confined to the dark range (5–50) should have its mean raised.

        A *solid* colour has a tonal range of zero so autocontrast has nothing
        to stretch.  A gradient that spans 5–50 gets stretched to 0–255, which
        substantially raises the average pixel value.
        """
        dark_gradient = _make_gradient_png(lo=5, hi=50)
        result = preprocess_for_ocr(dark_gradient)
        assert _mean_brightness(result) > _mean_brightness(dark_gradient)

    def test_bright_gradient_becomes_darker_on_average(self):
        """A gradient confined to the bright range (205–250) should have its mean lowered."""
        bright_gradient = _make_gradient_png(lo=205, hi=250)
        result = preprocess_for_ocr(bright_gradient)
        assert _mean_brightness(result) < _mean_brightness(bright_gradient)

    def test_low_contrast_image_has_wider_tonal_range_after_processing(self):
        """An image with compressed tonal range should be stretched by auto-contrast."""
        narrow = _make_gradient_png(lo=100, hi=150)  # values 100–150

        result = _open(preprocess_for_ocr(narrow)).convert("L")
        pixels = list(result.get_flattened_data())
        tonal_range = max(pixels) - min(pixels)
        # Original range was ~50; after autocontrast it should be much wider
        assert tonal_range > 150


# ── Colour preservation ────────────────────────────────────────────────────


class TestColourPreservation:
    def test_colour_image_stays_colour(self, png_bytes):
        """RGB input must remain RGB — not converted to grayscale."""
        result = _open(preprocess_for_ocr(png_bytes))
        assert result.mode in ("RGB", "RGBA")

    def test_red_image_is_still_predominantly_red(self):
        red_png = _make_png(20, 20, (200, 10, 10))
        result = _open(preprocess_for_ocr(red_png))
        r, g, b = [ImageStat.Stat(result).mean[i] for i in range(3)]
        assert r > g and r > b


# ── CLI --preprocess / --no-preprocess flag ────────────────────────────────


class TestCliPreprocessFlag:
    """Verify the flag controls whether preprocessing is applied."""

    def test_preprocess_flag_present_in_help(self, runner):
        from ocr_cli.cli import main
        result = runner.invoke(main, ["--help"])
        assert "--preprocess" in result.output or "--no-preprocess" in result.output

    def test_preprocessing_applied_to_image_by_default(
        self, runner, png_file, monkeypatch
    ):
        """By default, preprocess_for_ocr must be called for image files."""
        from unittest.mock import patch, MagicMock
        from ocr_cli.cli import main

        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        mock_provider = MagicMock()
        mock_provider.ocr.return_value = "result"

        with patch("ocr_cli.cli._build_provider", return_value=mock_provider), \
             patch("ocr_cli.cli.preprocess_for_ocr", return_value=b"preprocessed") as mock_pre:
            runner.invoke(main, [str(png_file)])

        mock_pre.assert_called_once()

    def test_no_preprocess_flag_skips_preprocessing_for_image(
        self, runner, png_file, monkeypatch
    ):
        from unittest.mock import patch, MagicMock
        from ocr_cli.cli import main

        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        mock_provider = MagicMock()
        mock_provider.ocr.return_value = "result"

        with patch("ocr_cli.cli._build_provider", return_value=mock_provider), \
             patch("ocr_cli.cli.preprocess_for_ocr") as mock_pre:
            runner.invoke(main, [str(png_file), "--no-preprocess"])

        mock_pre.assert_not_called()

    def test_preprocess_flag_forwarded_to_pdf_conversion(
        self, runner, single_page_pdf, monkeypatch
    ):
        from unittest.mock import patch, MagicMock
        from ocr_cli.cli import main

        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        mock_provider = MagicMock()
        mock_provider.ocr.return_value = "result"

        with patch("ocr_cli.cli._build_provider", return_value=mock_provider), \
             patch("ocr_cli.cli.pdf_to_images", return_value=[b"page"]) as mock_pdf:
            runner.invoke(main, [str(single_page_pdf), "--no-preprocess"])

        mock_pdf.assert_called_once()
        assert mock_pdf.call_args.kwargs.get("preprocess") is False

    def test_preprocess_true_forwarded_to_pdf_conversion(
        self, runner, single_page_pdf, monkeypatch
    ):
        from unittest.mock import patch, MagicMock
        from ocr_cli.cli import main

        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        mock_provider = MagicMock()
        mock_provider.ocr.return_value = "result"

        with patch("ocr_cli.cli._build_provider", return_value=mock_provider), \
             patch("ocr_cli.cli.pdf_to_images", return_value=[b"page"]) as mock_pdf:
            runner.invoke(main, [str(single_page_pdf)])

        assert mock_pdf.call_args.kwargs.get("preprocess") is True
