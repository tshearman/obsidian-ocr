"""Shared fixtures for the test suite.

All fixtures here produce real files / real bytes so tests exercise actual
code paths rather than hand-crafted stubs.
"""

import io
from pathlib import Path

import fitz  # PyMuPDF
import pytest
from click.testing import CliRunner
from PIL import Image


# ── CLI runner ─────────────────────────────────────────────────────────────


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


# ── Image fixtures ─────────────────────────────────────────────────────────


@pytest.fixture
def png_bytes() -> bytes:
    """A real, valid 10×10 red PNG image as raw bytes."""
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(255, 0, 0)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def png_file(tmp_path: Path, png_bytes: bytes) -> Path:
    """The PNG written to a temporary file on disk."""
    path = tmp_path / "test.png"
    path.write_bytes(png_bytes)
    return path


# ── PDF fixtures ───────────────────────────────────────────────────────────


@pytest.fixture
def single_page_pdf(tmp_path: Path) -> Path:
    """A real single-page PDF containing a text line."""
    path = tmp_path / "single.pdf"
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4
    page.insert_text((72, 100), "Hello, OCR world!")
    doc.save(str(path))
    doc.close()
    return path


@pytest.fixture
def multi_page_pdf(tmp_path: Path) -> Path:
    """A real 3-page PDF with distinct text on each page."""
    path = tmp_path / "multi.pdf"
    doc = fitz.open()
    for i in range(3):
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 100), f"Page {i + 1} content")
    doc.save(str(path))
    doc.close()
    return path
