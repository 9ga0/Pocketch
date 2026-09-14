import { describe, expect, it } from "vitest";
import { BASE_FALL_SPEED, bonusXForNormal, clampBasketX, createDirectionController, crossesBasket, dropForSlot, DROP_RULES, fallSpeedMultiplier, pickRandomIndex, randomSpawnX } from "./gameRules";

it("keeps every normal slot and schedules four additional bonus challenges", () => {
  const drops = Array.from({ length: 33 }, (_, i) => dropForSlot(i + 1));
  expect(drops.every(drop => drop.kind === "normal" && drop.points === 100)).toBe(true);
  expect(drops.filter(drop => drop.bonusKind).map(drop => drop.bonusKind)).toEqual(["fast", "fast", "super", "super"]);
  expect(dropForSlot(1).bonusKind).toBeUndefined();
  expect(DROP_RULES.fast).toMatchObject({ points: 300, speedMultiplier: 1.12 });
  expect(DROP_RULES.super).toMatchObject({ points: 500, speedMultiplier: 1.25 });
});

it("spawns bonus on the opposite side with enough reaction time", () => {
  expect(bonusXForNormal(96, 800)).toBe(704);
  const travelDistance = 600 - 52 - 54 - (-60);
  const initialNormalDuration = travelDistance / (BASE_FALL_SPEED * 600);
  const finalSuperDuration = travelDistance / (BASE_FALL_SPEED * fallSpeedMultiplier(30_000) * 600 * DROP_RULES.super.speedMultiplier);
  expect(initialNormalDuration).toBeGreaterThan(3_000);
  expect(finalSuperDuration).toBeGreaterThan(1_700);
});

it("catches a fast drop crossing the basket between frames", () => {
  expect(crossesBasket(400, 700, 54, 600)).toBe(true);
  expect(crossesBasket(300, 400, 54, 600)).toBe(false);
  expect(crossesBasket(610, 700, 54, 600)).toBe(false);
});
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
    expect(fallSpeedMultiplier(0, 30_000)).toBe(1);
    expect(fallSpeedMultiplier(15_000, 30_000)).toBeCloseTo(1.35);
    expect(fallSpeedMultiplier(30_000, 30_000)).toBeCloseTo(1.7);
    expect(fallSpeedMultiplier(60_000, 30_000)).toBeCloseTo(1.7);
  });
});
