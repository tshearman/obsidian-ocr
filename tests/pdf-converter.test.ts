/**
 * Tests for pdf-converter.ts — pure utility functions only.
 * pdfToDataUrls() requires DOM/canvas so it is not tested here.
 */

import { describe, it, expect } from "vitest";
import { dpiToScale } from "../src/core/pdf-converter";

describe("dpiToScale", () => {
  it("72 DPI → scale 1.0 (pdf.js base)", () => {
    expect(dpiToScale(72)).toBe(1.0);
  });

  it("144 DPI → scale 2.0 (double resolution)", () => {
    expect(dpiToScale(144)).toBe(2.0);
  });

  it("150 DPI → scale ≈ 2.083", () => {
    expect(dpiToScale(150)).toBeCloseTo(150 / 72);
  });

  it("300 DPI → scale ≈ 4.167 (high-res)", () => {
    expect(dpiToScale(300)).toBeCloseTo(300 / 72);
  });

  it("scales linearly", () => {
    expect(dpiToScale(216)).toBeCloseTo(3.0);
  });
});
