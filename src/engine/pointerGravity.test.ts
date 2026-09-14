import { describe, expect, it } from "vitest";
import {
  canStartSceneGravityDrag,
  DEFAULT_SCENE_GRAVITY,
  gravityFromSceneDrag,
} from "./pointerGravity";

describe("canStartSceneGravityDrag", () => {
  it("allows only the empty area of the item box to control gravity", () => {
    expect(canStartSceneGravityDrag(0)).toBe(true);
    expect(canStartSceneGravityDrag(1)).toBe(false);
  });
});

describe("gravityFromSceneDrag", () => {
  it("keeps default gravity until the pointer moves", () => {
    expect(gravityFromSceneDrag({ x: 100, y: 100 }, { x: 100, y: 100 }, 400, 300))
      .toEqual(DEFAULT_SCENE_GRAVITY);
  });

  it("maps drag direction to scene gravity and clamps extreme movement", () => {
    expect(gravityFromSceneDrag({ x: 100, y: 100 }, { x: 300, y: 100 }, 400, 300))
      .toEqual({ x: 2, y: 1 });
    expect(gravityFromSceneDrag({ x: 100, y: 100 }, { x: -500, y: -500 }, 400, 300))
      .toEqual({ x: -2, y: -2 });
  });

  it("falls back safely before the scene has dimensions", () => {
    expect(gravityFromSceneDrag({ x: 0, y: 0 }, { x: 30, y: 40 }, 0, 0))
      .toEqual(DEFAULT_SCENE_GRAVITY);
  });
});
