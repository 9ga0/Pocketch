import { fitWithin } from "./transparentImage";

export interface ShareThumbnail {
  base64: string;
  contentType: string;
  width: number;
  height: number;
}

export interface ShareEncodingAttempt {
  maxSide: number;
  quality: number;
}

export const SHARE_THUMBNAIL_ATTEMPTS: ShareEncodingAttempt[] = [
  { maxSide: 1024, quality: 0.8 },
  { maxSide: 640, quality: 0.7 },
  { maxSide: 480, quality: 0.6 },
  { maxSide: 320, quality: 0.5 },
  { maxSide: 240, quality: 0.4 },
];

// Firestore 문서 크기는 1MiB로 제한된다. base64 인코딩은 원본 대비 약 33% 커지고
// 나머지 필드(name, description, createdAt 등)도 같은 문서에 들어가므로 여유를 둔다.
export const DEFAULT_SHARE_BASE64_BUDGET = 700_000;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("공유 이미지를 인코딩하지 못했습니다."));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("공유 이미지를 인코딩하지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

function encodeAttempt(bitmap: ImageBitmap, attempt: ShareEncodingAttempt): Promise<Blob | null> {
  const size = fitWithin(bitmap.width, bitmap.height, attempt.maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return new Promise((resolve) => canvas.toBlob((result) => resolve(result), "image/webp", attempt.quality));
}

/**
 * 로컬 원본(item.image)은 그대로 두고, 공유 세션에 올릴 축소본만 별도로 인코딩한다.
 * 가장 큰 시도부터 base64 길이가 예산 이내로 들어올 때까지 단계적으로 더 작게/낮은 품질로 재시도하고,
 * 가장 작은 단계에서도 예산을 넘으면 해당 물건은 공유를 건너뛴다(null).
 */
export async function createShareThumbnail(
  source: Blob,
  attempts: ShareEncodingAttempt[] = SHARE_THUMBNAIL_ATTEMPTS,
  budgetBytes = DEFAULT_SHARE_BASE64_BUDGET,
): Promise<ShareThumbnail | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    return null;
  }
  try {
    for (const attempt of attempts) {
      const blob = await encodeAttempt(bitmap, attempt);
      if (!blob) continue;
      const base64 = await blobToBase64(blob);
      if (base64.length <= budgetBytes) {
        const size = fitWithin(bitmap.width, bitmap.height, attempt.maxSide);
        return { base64, contentType: blob.type || "image/webp", width: size.width, height: size.height };
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}
