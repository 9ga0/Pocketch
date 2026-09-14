import { describe, expect, it } from "vitest";
import { dropForSlot, bonusLaunchY, DROP_RULES, crossesBasket } from "./gameRules";

it("keeps every normal slot and schedules four additional bonus challenges", () => {
  const drops = Array.from({ length: 33 }, (_, i) => dropForSlot(i + 1));
  expect(drops.every(drop => drop.kind === "normal" && drop.points === 100 && drop.costsHeart)).toBe(true);
  expect(drops.filter(drop => drop.bonusKind).map(drop => drop.bonusKind)).toEqual(["fast", "fast", "super", "super"]);
  expect(dropForSlot(1).bonusKind).toBeUndefined();
  expect(DROP_RULES.fast).toMatchObject({ points: 300, costsHeart: false });
  expect(DROP_RULES.super).toMatchObject({ points: 500, costsHeart: false });
});

it("launches bonus so both opposite-side drops reach the basket together", () => {
  const catchY = 600 - 52 - 54;
  for (const multiplier of [1.35, 1.7]) {
    const bonusY = bonusLaunchY(200, 600, 54, multiplier);
    expect((catchY - bonusY) / multiplier).toBeCloseTo(catchY - 200);
  }
});

it("catches a fast drop crossing the basket between frames", () => {
  expect(crossesBasket(400, 700, 54, 600)).toBe(true);
  expect(crossesBasket(300, 400, 54, 600)).toBe(false);
  expect(crossesBasket(610, 700, 54, 600)).toBe(false);
});
import { clampBasketX, createDirectionController, fallSpeedMultiplier, pickRandomIndex, randomSpawnX } from "./gameRules";

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

  it("ramps fall speed linearly with elapsed time and caps at the maximum multiplier", () => {
    expect(fallSpeedMultiplier(0, 20_000)).toBe(1);
    expect(fallSpeedMultiplier(10_000, 20_000)).toBeCloseTo(1.6);
    expect(fallSpeedMultiplier(20_000, 20_000)).toBeCloseTo(2.2);
    expect(fallSpeedMultiplier(60_000, 20_000)).toBeCloseTo(2.2);
  });
});
