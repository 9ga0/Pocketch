import { describe, expect, it } from "vitest";
import { clampBasketX, createDirectionController, pickRandomIndex, randomSpawnX } from "./gameRules";

describe("catch game rules", () => {
  it("tracks physical keys independently and ignores auto-repeat", () => {
    const controller = createDirectionController();
    controller.press("ArrowLeft", "left"); controller.press("a", "left");
    expect(controller.size()).toBe(2);
    controller.press("ArrowRight", "right"); controller.press("ArrowRight", "right", true);
    expect(controller.current()).toBe("right");
    controller.release("ArrowRight"); expect(controller.current()).toBe("left");
    controller.release("ArrowLeft"); expect(controller.current()).toBe("left");
    controller.release("a"); expect(controller.current()).toBeNull();
  });

  it("clamps the basket and uses injected random boundaries safely", () => {
    expect(clampBasketX(-10, 800, 100)).toBe(50);
    expect(clampBasketX(900, 800, 100)).toBe(750);
    expect(pickRandomIndex(0, 3)).toBe(0); expect(pickRandomIndex(0.99999, 3)).toBe(2); expect(pickRandomIndex(1, 3)).toBe(2);
    expect(randomSpawnX(0, 800, 100)).toBe(62); expect(randomSpawnX(1, 800, 100)).toBe(738);
  });
});
