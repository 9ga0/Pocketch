export const GAME_DURATION_SECONDS = 30;
export const GAME_COUNTDOWN_SECONDS = 3;
export const CATCH_SCORE = 100;
export const STARTING_HEARTS = 3;

// 등록된 아이템 개수와 무관하게, 경과 시간(일시정지 제외)만을 입력으로 낙하 속도를 계산한다.
export const BASE_FALL_SPEED = 0.00038;
export const MAX_FALL_SPEED_MULTIPLIER = 2.2;
export const FALL_SPEED_RAMP_MS = 20_000;

/** 경과 시간에 비례해 1배에서 최대 배율까지 선형으로 올라가고, 그 이후로는 최대치에서 멈춘다. */
export function fallSpeedMultiplier(elapsedMs: number, rampMs = FALL_SPEED_RAMP_MS): number {
  const progress = rampMs > 0 ? Math.max(0, Math.min(1, elapsedMs / rampMs)) : 1;
  return 1 + progress * (MAX_FALL_SPEED_MULTIPLIER - 1);
}

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
