/**
 * Image preprocessing to improve LLM OCR quality.
 *
 * Matches the pipeline in ocr-cli/src/ocr_cli/preprocessing.py.
 *
 * Pipeline
 * --------
 * 1. Auto-contrast  — stretches the histogram per RGB channel so the darkest
 *                     pixel maps to black and the brightest to white (with a
 *                     small cutoff to ignore outlier pixels).  Compensates for
 *                     faint pencil marks, yellowed paper, dark photographs.
 *
 * 2. Unsharp mask   — sharpens symbol edges without amplifying background
 *                     noise.  Makes fine strokes in mathematical notation
 *                     crisper for the model to distinguish.
 *
 * Intentionally omitted (matches Python version)
 * -----------------------------------------------
 * * Grayscale conversion — colour carries meaning in annotated notes.
 * * Binarisation         — destroys gradient information; hurts handwriting.
 */

// ── Pure pixel-array functions (testable without DOM) ─────────────────────────

/**
 * Apply Pillow-style auto-contrast to RGBA pixel data in-place.
 * Each RGB channel is processed independently; the alpha channel is unchanged.
 *
 * @param data     Raw RGBA bytes (Uint8ClampedArray from ImageData).
 * @param cutoff   Percentage of pixels to ignore at each histogram extreme
 *                 (default 0.5 — matches Pillow's autocontrast cutoff=0.5).
 */
export function autoContrast(data: Uint8ClampedArray, cutoff = 0.5): void {
  const numPixels = data.length / 4;
  const cutoffCount = (cutoff / 100) * numPixels;

  for (let c = 0; c < 3; c++) {
    // Build per-channel histogram
    const hist = new Uint32Array(256);
    for (let i = 0; i < numPixels; i++) hist[data[i * 4 + c]]++;

    // lo: first value where cumulative count from the bottom >= cutoffCount
    let lo = 0;
    let n = 0;
    for (let v = 0; v < 256; v++) {
      n += hist[v];
      if (n >= cutoffCount) {
        lo = v;
        break;
      }
    }

    // hi: first value where cumulative count from the top >= cutoffCount
    let hi = 255;
    n = 0;
    for (let v = 255; v >= 0; v--) {
      n += hist[v];
      if (n >= cutoffCount) {
        hi = v;
        break;
      }
    }

    if (lo >= hi) continue; // solid colour — nothing to stretch

    const scale = 255 / (hi - lo);
    for (let i = 0; i < numPixels; i++) {
      const v = data[i * 4 + c];
      data[i * 4 + c] = Math.max(0, Math.min(255, Math.round((v - lo) * scale)));
    }
  }
}

/** Build a normalised 1-D Gaussian kernel. */
function gaussianKernel(sigma: number): Float64Array {
  const radius = Math.ceil(sigma * 3);
  const size = 2 * radius + 1;
  const kernel = new Float64Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

/**
 * Separable Gaussian blur over RGB channels (alpha is copied unchanged).
 * Returns a new Uint8ClampedArray; the input is not modified.
 */
function gaussianBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number
): Uint8ClampedArray {
  const kernel = gaussianKernel(sigma);
  const radius = (kernel.length - 1) / 2;
  const temp = new Float64Array(data.length);
  const out = new Uint8ClampedArray(data.length);

  // Horizontal pass: data → temp
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let val = 0;
        for (let k = 0; k < kernel.length; k++) {
          const sx = Math.min(Math.max(x + k - radius, 0), width - 1);
          val += kernel[k] * data[(y * width + sx) * 4 + c];
        }
        temp[(y * width + x) * 4 + c] = val;
      }
      temp[(y * width + x) * 4 + 3] = data[(y * width + x) * 4 + 3];
    }
  }

  // Vertical pass: temp → out
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let val = 0;
        for (let k = 0; k < kernel.length; k++) {
          const sy = Math.min(Math.max(y + k - radius, 0), height - 1);
          val += kernel[k] * temp[(sy * width + x) * 4 + c];
        }
        out[(y * width + x) * 4 + c] = Math.max(0, Math.min(255, Math.round(val)));
      }
      out[(y * width + x) * 4 + 3] = data[(y * width + x) * 4 + 3];
    }
  }

  return out;
}

/**
 * Apply unsharp mask to RGBA pixel data in-place.
 * Parameters match Pillow's UnsharpMask(radius=1.5, percent=150, threshold=3).
 *
 * @param data      Raw RGBA bytes.
 * @param width     Image width in pixels.
 * @param height    Image height in pixels.
 * @param radius    Gaussian sigma (blur neighbourhood size).
 * @param percent   Edge amplification percentage (150 → 1.5× edge added back).
 * @param threshold Only sharpen where |original − blurred| > this value.
 */
export function unsharpMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius = 1.5,
  percent = 150,
  threshold = 3
): void {
  const blurred = gaussianBlur(data, width, height, radius);
  const factor = percent / 100;
  const numPixels = data.length / 4;

  for (let i = 0; i < numPixels; i++) {
    for (let c = 0; c < 3; c++) {
      const orig = data[i * 4 + c];
      const blur = blurred[i * 4 + c];
      const diff = orig - blur;
      if (Math.abs(diff) > threshold) {
        data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(orig + diff * factor)));
      }
    }
  }
}

// ── Canvas integration (runs in Electron/Obsidian) ────────────────────────────

/**
 * Preprocess an image data URL for OCR: auto-contrast then unsharp mask.
 * Returns a new PNG data URL with the same dimensions.
 *
 * Requires DOM APIs (HTMLImageElement, HTMLCanvasElement) — available in
 * Electron's renderer process / Obsidian.
 */
export async function preprocessImageDataUrl(dataUrl: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () =>
      reject(new Error("Failed to load image for preprocessing"));
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D canvas context");

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  autoContrast(imageData.data);
  unsharpMask(imageData.data, canvas.width, canvas.height);

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}
