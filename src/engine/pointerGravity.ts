export interface Point {
  x: number;
  y: number;
}

export interface GravityVector {
  x: number;
  y: number;
}

export const DEFAULT_SCENE_GRAVITY: GravityVector = { x: 0, y: 1 };
export const MAX_SCENE_GRAVITY = 2;

export function canStartSceneGravityDrag(interactiveTargetCount: number): boolean {
  return interactiveTargetCount === 0;
}

function clamp(value: number) {
  return Math.max(-MAX_SCENE_GRAVITY, Math.min(MAX_SCENE_GRAVITY, value));
}

export function gravityFromSceneDrag(
  start: Point,
  current: Point,
  width: number,
  height: number,
): GravityVector {
  if (width <= 0 || height <= 0) return DEFAULT_SCENE_GRAVITY;
  return {
    x: clamp(((current.x - start.x) / (width / 2)) * MAX_SCENE_GRAVITY),
    y: clamp(DEFAULT_SCENE_GRAVITY.y + ((current.y - start.y) / (height / 2)) * MAX_SCENE_GRAVITY),
  };
}
