"""Image preprocessing to improve LLM OCR quality.

The pipeline is optimised for handwritten documents (including mathematical
notation) sent to vision LLMs.  It uses only Pillow — no extra dependencies.

Pipeline
--------
1. Auto-contrast  — stretches the histogram so the darkest pixel maps to
                    black and the lightest to white (with a small cutoff to
                    ignore outlier pixels).  Compensates for faint pencil
                    marks, yellowed paper, and dark / uneven photographs.

2. Unsharp mask   — sharpens symbol edges without amplifying background
                    noise.  Makes fine strokes in mathematical notation
                    crisper and easier for the model to distinguish.

Intentionally omitted
---------------------
* Grayscale conversion — colour carries meaning in annotated notes
  (red corrections, multiple ink colours).
* Binarisation       — destroys the gradient information that vision LLMs
  can exploit; hurts rather than helps for handwriting.
* Deskewing          — beneficial but requires OpenCV; noted as a future
  improvement.
"""

import io

from PIL import Image, ImageFilter, ImageOps


def preprocess_for_ocr(image_bytes: bytes) -> bytes:
    """Run the standard preprocessing pipeline and return the result as PNG bytes."""
    img = Image.open(io.BytesIO(image_bytes))

    # Step 1: auto-contrast
    # cutoff=0.5 ignores the brightest/darkest 0.5 % of pixels so that a few
    # extreme outlier pixels (dirt, bright specular reflections) don't compress
    # the useful tonal range.
    img = ImageOps.autocontrast(img, cutoff=0.5)

    # Step 2: unsharp mask
    # radius=1.5  — neighbourhood size; small enough not to thicken strokes
    # percent=150 — 150 % edge amplification
    # threshold=3 — only sharpen where contrast delta > 3/255; leaves smooth
    #               paper background untouched
    img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=150, threshold=3))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
