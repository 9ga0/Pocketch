export interface AlphaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProcessedTransparentImage {
  blob: Blob;
  width: number;
  height: number;
}

export class TransparentImageError extends Error {
  constructor(
    public readonly code: "decode-failed" | "empty-foreground" | "encode-failed",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TransparentImageError";
  }
}

export function findAlphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 1,
): AlphaBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX < 0
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function fitWithin(width: number, height: number, maxSide = 1024) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob
        ? resolve(blob)
        : reject(new TransparentImageError("encode-failed", "투명 이미지를 WebP로 만들지 못했습니다.")),
      "image/webp",
      0.9,
    );
  });
}

export async function optimizeTransparentImage(source: Blob): Promise<ProcessedTransparentImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch (error) {
    throw new TransparentImageError("decode-failed", "배경 제거 결과를 읽지 못했습니다.", { cause: error });
  }

  try {
    const scanCanvas = document.createElement("canvas");
    scanCanvas.width = bitmap.width;
    scanCanvas.height = bitmap.height;
    const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });
    if (!scanContext) throw new TransparentImageError("decode-failed", "이미지를 분석할 수 없습니다.");
    scanContext.drawImage(bitmap, 0, 0);
    const pixels = scanContext.getImageData(0, 0, bitmap.width, bitmap.height);
    const bounds = findAlphaBounds(pixels.data, bitmap.width, bitmap.height);
    if (!bounds) {
      throw new TransparentImageError("empty-foreground", "남은 물건이 없습니다. 배경과 구분되도록 다시 촬영해 주세요.");
    }

    const size = fitWithin(bounds.width, bounds.height);
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = size.width;
    outputCanvas.height = size.height;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) throw new TransparentImageError("encode-failed", "이미지를 변환할 수 없습니다.");
    outputContext.drawImage(
      bitmap,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      size.width,
      size.height,
    );
    const blob = await canvasBlob(outputCanvas);
    if (blob.type !== "image/webp") {
      throw new TransparentImageError("encode-failed", "이 브라우저는 투명 WebP 저장을 지원하지 않습니다.");
    }
    return { blob, ...size };
  } finally {
    bitmap.close();
  }
}
