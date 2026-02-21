"""PDF to image conversion using PyMuPDF."""

from pathlib import Path

import fitz  # PyMuPDF

from ocr_cli.preprocessing import preprocess_for_ocr


def pdf_to_images(pdf_path: Path, dpi: int = 150, preprocess: bool = True) -> list[bytes]:
    """Convert each page of a PDF to a PNG byte string.

    150 DPI balances legibility with file size. Use 200 DPI for dense
    technical documents with small text.

    Args:
        pdf_path:   Path to the PDF file.
        dpi:        Render resolution.  Higher = better quality, larger payload.
        preprocess: Apply the standard OCR preprocessing pipeline (auto-contrast
                    + unsharp masking) before returning each page.
    """
    doc = fitz.open(str(pdf_path))
    results = []
    matrix = fitz.Matrix(dpi / 72, dpi / 72)  # 72 is the base DPI in the PDF spec

    for page in doc:
        pixmap = page.get_pixmap(matrix=matrix, colorspace=fitz.csRGB)
        img_bytes = pixmap.tobytes("png")
        if preprocess:
            img_bytes = preprocess_for_ocr(img_bytes)
        results.append(img_bytes)

    doc.close()
    return results
