export const GAME_DURATION_SECONDS = 30;
export const GAME_COUNTDOWN_SECONDS = 3;
export const CATCH_SCORE = 100;

export function validNickname(value: string): boolean { return value.trim().length > 0; }
export function clampBasketX(x: number, viewportWidth: number, basketWidth: number): number {
  return Math.max(basketWidth / 2, Math.min(viewportWidth - basketWidth / 2, x));
}

export type MoveDirection = "left" | "right";

export function createDirectionController() {
  const pressed = new Map<string, { direction: MoveDirection; order: number }>();
  let order = 0;
  return {
    press(key: string, direction: MoveDirection, repeat = false) { if (!repeat && !pressed.has(key)) pressed.set(key, { direction, order: ++order }); },
    release(key: string) { pressed.delete(key); },
    current(): MoveDirection | null { return [...pressed.values()].sort((a, b) => b.order - a.order)[0]?.direction ?? null; },
    clear() { pressed.clear(); },
    size() { return pressed.size; },
  };
}

export function pickRandomIndex(random: number, length: number): number | null {
  if (length <= 0 || !Number.isFinite(random)) return null;
  return Math.min(length - 1, Math.max(0, Math.floor(random * length)));
}

export function randomSpawnX(random: number, viewportWidth: number, itemWidth: number, padding = 12): number {
  const min = itemWidth / 2 + padding;
  const max = Math.max(min, viewportWidth - itemWidth / 2 - padding);
  return min + Math.max(0, Math.min(1, random)) * (max - min);
}
