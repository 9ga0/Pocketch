import type { CollectedItem } from "./collection";

export const COLLECTION_SCALE_FACTOR = 0.7;
export const COLLECTION_HEIGHT_THRESHOLD = 0.25;

export function globalScaleForLevel(scaleLevel: number): number {
  return Math.pow(COLLECTION_SCALE_FACTOR, Math.max(0, scaleLevel));
}

export function shouldShrinkCollection(top: number, viewportHeight: number): boolean {
  return viewportHeight > 0 && top <= viewportHeight * COLLECTION_HEIGHT_THRESHOLD;
}

export function itemDisplaySize(item: CollectedItem, viewportWidth: number, viewportHeight: number, globalScale: number) {
  const longestSide = Math.max(item.width, item.height, 1);
  const targetLongestSide = Math.min(180, Math.max(72, viewportHeight * 0.18));
  const size = targetLongestSide / longestSide * globalScale;
  return { width: Math.max(1, item.width * size), height: Math.max(1, item.height * size) };
}
