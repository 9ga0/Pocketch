export const GAME_DURATION_SECONDS = 30;
export const GAME_COUNTDOWN_SECONDS = 3;
export const CATCH_SCORE = 100;

export function validNickname(value: string): boolean { return value.trim().length > 0; }
export function clampBasketX(x: number, viewportWidth: number, basketWidth: number): number {
  return Math.max(basketWidth / 2, Math.min(viewportWidth - basketWidth / 2, x));
}
