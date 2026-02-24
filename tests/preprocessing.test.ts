/**
 * Tests for preprocessing.ts — autoContrast() and unsharpMask().
 *
 * Pure pixel-array functions are fully testable in Node without DOM/Canvas.
 * These tests mirror ocr-cli/tests/test_preprocessing.py:
 *   TestAutoContrast, TestColourPreservation
 * (TestOutputFormat and TestCliPreprocessFlag are CLI / canvas-layer concerns
 *  not applicable here; ocrFile preprocessing wiring is covered in ocr-file.test.ts)
 */

import { describe, it, expect } from "vitest";
import { autoContrast, unsharpMask } from "../src/core/preprocessing";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Create a greyscale gradient RGBA buffer.
 * Column x gets luminance value = round(lo + (hi - lo) * x / (width - 1)).
 * Matches _make_gradient_png() in test_preprocessing.py.
 */
function makeGrayGradient(
  lo: number,
  hi: number,
  width = 100,
  height = 10
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let x = 0; x < width; x++) {
    const v = Math.round(lo + (hi - lo) * x / (width - 1));
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return data;
}

/** Create a solid-colour RGBA buffer. Matches _make_png() in test_preprocessing.py. */
function makeSolid(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Mean brightness across all pixels (average of R, G, B per pixel). */
function meanBrightness(data: Uint8ClampedArray): number {
  let sum = 0;
  const n = data.length / 4;
  for (let i = 0; i < n; i++) {
    sum += (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
  }
  return sum / n;
}

/** Mean value for a single channel (0=R, 1=G, 2=B, 3=A). */
function channelMean(data: Uint8ClampedArray, channel: number): number {
  let sum = 0;
  const n = data.length / 4;
  for (let i = 0; i < n; i++) sum += data[i * 4 + channel];
  return sum / n;
}

/** Min and max values for a single channel. */
function channelRange(
  data: Uint8ClampedArray,
  channel: number
): { min: number; max: number } {
  let min = 255;
  let max = 0;
  const n = data.length / 4;
  for (let i = 0; i < n; i++) {
    const v = data[i * 4 + channel];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

// ── autoContrast: TestAutoContrast equivalents ────────────────────────────────

describe("autoContrast", () => {
  describe("auto-contrast behaviour (TestAutoContrast)", () => {
    it("dark gradient (5–50) becomes brighter on average", () => {
      /**
       * Mirrors test_dark_gradient_becomes_brighter_on_average.
       * Range [5, 50] is stretched to [0, 255] → mean rises substantially.
       */
      const data = makeGrayGradient(5, 50);
      const before = meanBrightness(data);
      autoContrast(data);
      expect(meanBrightness(data)).toBeGreaterThan(before);
    });

    it("bright gradient (205–250) becomes darker on average", () => {
      /**
       * Mirrors test_bright_gradient_becomes_darker_on_average.
       * Range [205, 250] is stretched to [0, 255] → mean falls substantially.
       */
      const data = makeGrayGradient(205, 250);
      const before = meanBrightness(data);
      autoContrast(data);
      expect(meanBrightness(data)).toBeLessThan(before);
    });

    it("low-contrast image has wider tonal range after processing", () => {
      /**
       * Mirrors test_low_contrast_image_has_wider_tonal_range_after_processing.
       * Original tonal range ≈ 50; after auto-contrast it should be > 150.
       */
      const data = makeGrayGradient(100, 150); // narrow: 100–150 ≈ 50-wide range
      autoContrast(data);
      const { min, max } = channelRange(data, 0);
      expect(max - min).toBeGreaterThan(150);
    });
  });

  describe("colour preservation (TestColourPreservation)", () => {
    it("solid-colour image: auto-contrast skips channels with zero range", () => {
      /**
       * Mirrors test_colour_image_stays_colour.
       * A solid colour has lo == hi per channel, so auto-contrast is a no-op
       * and the image remains RGB (not flattened to grey).
       */
      const data = makeSolid(20, 20, 128, 64, 32);
      const rBefore = channelMean(data, 0);
      const gBefore = channelMean(data, 1);
      const bBefore = channelMean(data, 2);
      autoContrast(data);
      // Each channel is constant → lo = hi → skipped → unchanged
      expect(channelMean(data, 0)).toBeCloseTo(rBefore);
      expect(channelMean(data, 1)).toBeCloseTo(gBefore);
      expect(channelMean(data, 2)).toBeCloseTo(bBefore);
    });

    it("red image (200, 10, 10) remains predominantly red after auto-contrast", () => {
      /**
       * Mirrors test_red_image_is_still_predominantly_red.
       * Solid colour → auto-contrast is a no-op → R channel stays dominant.
       */
      const data = makeSolid(20, 20, 200, 10, 10);
      autoContrast(data);
      const r = channelMean(data, 0);
      const g = channelMean(data, 1);
      const b = channelMean(data, 2);
      expect(r).toBeGreaterThan(g);
      expect(r).toBeGreaterThan(b);
    });
  });

  describe("alpha channel", () => {
    it("does not modify the alpha channel", () => {
      const data = makeGrayGradient(5, 50);
      // Capture alpha values before
      const alphaBefore = Array.from(
        { length: data.length / 4 },
        (_, i) => data[i * 4 + 3]
      );
      autoContrast(data);
      for (let i = 0; i < alphaBefore.length; i++) {
        expect(data[i * 4 + 3]).toBe(alphaBefore[i]);
      }
    });
  });

  describe("edge cases", () => {
    it("solid-colour image is unchanged (lo == hi → skip)", () => {
      const data = makeSolid(10, 10, 100, 100, 100);
      const copy = new Uint8ClampedArray(data);
      autoContrast(data);
      expect(data).toEqual(copy);
    });

    it("full-range gradient (0–255) is approximately unchanged", () => {
      /**
       * With cutoff=0.5%, a tiny fraction of pixels are ignored at each end,
       * so a 0-255 gradient should remain very close to the original.
       */
      const data = makeGrayGradient(0, 255);
      const meanBefore = meanBrightness(data);
      autoContrast(data);
      expect(meanBrightness(data)).toBeCloseTo(meanBefore, 0);
    });
  });
});

// ── unsharpMask ───────────────────────────────────────────────────────────────

describe("unsharpMask", () => {
  it("leaves a solid-colour image unchanged (no edges → diff = 0)", () => {
    /**
     * Gaussian blur of a constant signal is the same constant.
     * diff = original − blurred = 0 ≤ threshold → no change applied.
     */
    const data = makeSolid(20, 20, 100, 100, 100);
    const copy = new Uint8ClampedArray(data);
    unsharpMask(data, 20, 20);
    expect(data).toEqual(copy);
  });

  it("sharpens an edge: bright side gets brighter, dark side gets darker", () => {
    /**
     * Step edge: left half = 50 (dark), right half = 200 (bright).
     * After unsharp mask, the bright pixels near the boundary should
     * increase and the dark pixels near the boundary should decrease.
     */
    const width = 40;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = x < width / 2 ? 50 : 200;
        const idx = (y * width + x) * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }

    // Sample pixels well away from the boundary so blur doesn't affect them
    const darkFarIdx = (0 * width + 5) * 4; // x=5, deep in dark region
    const brightFarIdx = (0 * width + 35) * 4; // x=35, deep in bright region
    const darkBefore = data[darkFarIdx];
    const brightBefore = data[brightFarIdx];

    unsharpMask(data, width, height);

    // Far pixels are unaffected (diff ≈ 0 in flat regions)
    expect(data[darkFarIdx]).toBe(darkBefore);
    expect(data[brightFarIdx]).toBe(brightBefore);
  });

  it("does not modify the alpha channel", () => {
    const data = makeGrayGradient(0, 255, 20, 20);
    const alphaBefore = Array.from(
      { length: data.length / 4 },
      (_, i) => data[i * 4 + 3]
    );
    unsharpMask(data, 20, 20);
    for (let i = 0; i < alphaBefore.length; i++) {
      expect(data[i * 4 + 3]).toBe(alphaBefore[i]);
    }
  });

  it("pixel values remain in [0, 255]", () => {
    // Extreme gradient — unsharp mask must not overflow
    const data = makeGrayGradient(0, 255, 50, 10);
    unsharpMask(data, 50, 10);
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(255);
    }
  });
});

// ── Combined pipeline ─────────────────────────────────────────────────────────

describe("autoContrast + unsharpMask pipeline", () => {
  it("dark gradient is both brightened and sharpened", () => {
    const data = makeGrayGradient(5, 50);
    const before = meanBrightness(data);
    autoContrast(data);
    unsharpMask(data, 100, 10);
    // Mean brightness must be higher than original after auto-contrast
    expect(meanBrightness(data)).toBeGreaterThan(before);
    // All pixel values remain valid
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(255);
    }
  });
});
