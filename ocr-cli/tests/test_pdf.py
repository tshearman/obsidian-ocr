"""Tests for ocr_cli.pdf — pdf_to_images()."""

import struct

import pytest

from ocr_cli.pdf import pdf_to_images

# PNG files always begin with this 8-byte magic header.
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _png_width(data: bytes) -> int:
    """Read the width field from a PNG IHDR chunk (bytes 16-20)."""
    return struct.unpack(">I", data[16:20])[0]


def _png_height(data: bytes) -> int:
    """Read the height field from a PNG IHDR chunk (bytes 20-24)."""
    return struct.unpack(">I", data[20:24])[0]


class TestPdfToImages:
    # ── Page count ────────────────────────────────────────────────────────

    def test_single_page_pdf_returns_one_image(self, single_page_pdf):
        images = pdf_to_images(single_page_pdf)
        assert len(images) == 1

    def test_multi_page_pdf_returns_one_image_per_page(self, multi_page_pdf):
        images = pdf_to_images(multi_page_pdf)
        assert len(images) == 3

    # ── Output types ──────────────────────────────────────────────────────

    def test_returns_list_of_bytes(self, single_page_pdf):
        images = pdf_to_images(single_page_pdf)
        assert isinstance(images, list)
        for img in images:
            assert isinstance(img, bytes)

    def test_each_image_is_non_empty(self, multi_page_pdf):
        for img in pdf_to_images(multi_page_pdf):
            assert len(img) > 0

    # ── PNG validity ──────────────────────────────────────────────────────

    def test_output_is_valid_png(self, single_page_pdf):
        images = pdf_to_images(single_page_pdf)
        assert images[0][:8] == PNG_MAGIC

    def test_all_pages_are_valid_png(self, multi_page_pdf):
        for img in pdf_to_images(multi_page_pdf):
            assert img[:8] == PNG_MAGIC

    # ── DPI parameter ─────────────────────────────────────────────────────

    def test_higher_dpi_produces_wider_image(self, single_page_pdf):
        lo = pdf_to_images(single_page_pdf, dpi=72)
        hi = pdf_to_images(single_page_pdf, dpi=144)
        assert _png_width(hi[0]) > _png_width(lo[0])

    def test_higher_dpi_produces_taller_image(self, single_page_pdf):
        lo = pdf_to_images(single_page_pdf, dpi=72)
        hi = pdf_to_images(single_page_pdf, dpi=144)
        assert _png_height(hi[0]) > _png_height(lo[0])

    def test_doubling_dpi_doubles_pixel_dimensions(self, single_page_pdf):
        """72 → 144 DPI should double width and height (within 5% rounding error)."""
        lo = pdf_to_images(single_page_pdf, dpi=72)
        hi = pdf_to_images(single_page_pdf, dpi=144)
        width_ratio = _png_width(hi[0]) / _png_width(lo[0])
        height_ratio = _png_height(hi[0]) / _png_height(lo[0])
        assert abs(width_ratio - 2.0) < 0.05
        assert abs(height_ratio - 2.0) < 0.05

    def test_default_dpi_is_between_72_and_300(self, single_page_pdf):
        """Default 150 DPI should produce dimensions larger than 72 and smaller than 300."""
        lo = pdf_to_images(single_page_pdf, dpi=72)
        default = pdf_to_images(single_page_pdf)
        hi = pdf_to_images(single_page_pdf, dpi=300)
        assert _png_width(lo[0]) < _png_width(default[0]) < _png_width(hi[0])
