export interface Point {
  x: number;
  y: number;
}

export interface PushVector {
  x: number;
  y: number;
}

export const POINTER_PUSH_RADIUS = 110;
export const MAX_POINTER_PUSH_SPEED = 14;

function closestPointOnSegment(point: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return start;
  const progress = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return { x: start.x + dx * progress, y: start.y + dy * progress };
}

export function pointerPushForBody(
  previous: Point,
  current: Point,
  body: Point,
  radius = POINTER_PUSH_RADIUS,
): PushVector | null {
  const moveX = current.x - previous.x;
  const moveY = current.y - previous.y;
  const moveDistance = Math.hypot(moveX, moveY);
  if (moveDistance < 1 || radius <= 0) return null;

  const closest = closestPointOnSegment(body, previous, current);
  const awayX = body.x - closest.x;
  const awayY = body.y - closest.y;
  const distance = Math.hypot(awayX, awayY);
  if (distance >= radius) return null;

  const falloff = 1 - distance / radius;
  const moveUnitX = moveX / moveDistance;
  const moveUnitY = moveY / moveDistance;
  const awayUnitX = distance > 0 ? awayX / distance : -moveUnitY;
  const awayUnitY = distance > 0 ? awayY / distance : moveUnitX;
  const rawX = moveUnitX + awayUnitX * 0.28 * falloff;
  const rawY = moveUnitY + awayUnitY * 0.28 * falloff;
  const rawLength = Math.hypot(rawX, rawY) || 1;
  const speed = Math.min(MAX_POINTER_PUSH_SPEED, moveDistance * 0.45) * (0.35 + falloff * 0.65);

  return { x: (rawX / rawLength) * speed, y: (rawY / rawLength) * speed };
}
