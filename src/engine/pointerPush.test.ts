import { describe, expect, it } from "vitest";
import { MAX_POINTER_PUSH_SPEED, pointerPushForBody } from "./pointerPush";

describe("pointerPushForBody", () => {
  it("does nothing before the pointer has meaningfully moved", () => {
    expect(pointerPushForBody({ x: 10, y: 10 }, { x: 10.5, y: 10 }, { x: 10, y: 10 })).toBeNull();
  });

  it("pushes only bodies close to the pointer movement path", () => {
    const nearby = pointerPushForBody({ x: 0, y: 50 }, { x: 40, y: 50 }, { x: 20, y: 70 }, 40);
    expect(nearby).not.toBeNull();
    expect(nearby!.x).toBeGreaterThan(0);
    expect(nearby!.y).toBeGreaterThan(0);
    expect(pointerPushForBody({ x: 0, y: 50 }, { x: 40, y: 50 }, { x: 20, y: 100 }, 40)).toBeNull();
  });

  it("detects bodies along a fast pointer sweep and caps the impulse", () => {
    const push = pointerPushForBody({ x: 0, y: 0 }, { x: 1_000, y: 0 }, { x: 500, y: 0 }, 50);
    expect(push).not.toBeNull();
    expect(Math.hypot(push!.x, push!.y)).toBeCloseTo(MAX_POINTER_PUSH_SPEED);
  });
});
