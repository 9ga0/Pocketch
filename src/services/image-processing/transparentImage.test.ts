import { describe, expect, it } from "vitest";
import { findAlphaBounds, fitWithin } from "./transparentImage";

function pixels(width: number, height: number, opaque: Array<[number, number]>) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255;
  return data;
}

describe("transparent image geometry", () => {
  it("finds the smallest rectangle containing visible alpha pixels", () => {
    const data = pixels(6, 5, [[1, 2], [4, 2], [2, 4]]);
    expect(findAlphaBounds(data, 6, 5)).toEqual({ x: 1, y: 2, width: 4, height: 3 });
  });

  it("rejects an entirely transparent result", () => {
    expect(findAlphaBounds(pixels(3, 2, []), 3, 2)).toBeNull();
  });

  it("keeps aspect ratio and limits only the longest side", () => {
    expect(fitWithin(2048, 512)).toEqual({ width: 1024, height: 256 });
    expect(fitWithin(320, 640)).toEqual({ width: 320, height: 640 });
  });
});
