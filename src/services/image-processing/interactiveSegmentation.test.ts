// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maskToAlphaImageData, pointFromClientCoordinates } from "./interactiveSegmentation";

describe("interactive segmentation helpers", () => {
  beforeEach(() => {
    class MockImageData {
      constructor(
        public readonly data: Uint8ClampedArray,
        public readonly width: number,
        public readonly height: number,
      ) {}
    }
    vi.stubGlobal("ImageData", MockImageData);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("normalizes and clamps a pointer position", () => {
    const bounds = { left: 10, top: 20, width: 200, height: 100 };
    expect(pointFromClientCoordinates(110, 70, bounds)).toEqual({ x: 0.5, y: 0.5 });
    expect(pointFromClientCoordinates(-10, 200, bounds)).toEqual({ x: 0, y: 1 });
  });

  it("converts confidence values to a soft alpha mask", () => {
    const getAsFloat32Array = vi.fn(() => new Float32Array([-1, 0.5, 2]));
    const image = maskToAlphaImageData({ width: 3, height: 1, getAsFloat32Array } as never);
    expect(Array.from(image.data)).toEqual([
      255, 255, 255, 0,
      255, 255, 255, 128,
      255, 255, 255, 255,
    ]);
  });
});
