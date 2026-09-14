import type { MPMask } from "@mediapipe/tasks-vision";

export interface NormalizedPoint {
  x: number;
  y: number;
}

export type SegmentationProgress = (phase: "model" | "segment") => void;

let segmenterPromise: Promise<import("@mediapipe/tasks-vision").InteractiveSegmenterLegacy> | null = null;

function assetUrl(fileName: string): string {
  return new URL(`${import.meta.env.BASE_URL}mediapipe/${fileName}`, window.location.origin).href;
}

async function createSegmenter() {
  const { FilesetResolver, InteractiveSegmenterLegacy } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(
    new URL(`${import.meta.env.BASE_URL}mediapipe`, window.location.origin).href,
  );
  return InteractiveSegmenterLegacy.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: assetUrl("magic_touch.tflite"),
      delegate: "CPU",
    },
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
}

function getSegmenter() {
  segmenterPromise ??= createSegmenter().catch((error) => {
    segmenterPromise = null;
    throw error;
  });
  return segmenterPromise;
}

export function preloadInteractiveSegmenter(): Promise<void> {
  return getSegmenter().then(() => undefined);
}

export function pointFromClientCoordinates(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
): NormalizedPoint {
  return {
    x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)),
  };
}

export function maskToAlphaImageData(mask: MPMask): ImageData {
  const confidence = mask.getAsFloat32Array();
  const pixels = new Uint8ClampedArray(mask.width * mask.height * 4);
  for (let index = 0; index < confidence.length; index += 1) {
    const offset = index * 4;
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = Math.round(Math.max(0, Math.min(1, confidence[index])) * 255);
  }
  return new ImageData(pixels, mask.width, mask.height);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("분리 결과 이미지를 만들지 못했습니다."));
    }, "image/png");
  });
}

export async function segmentObjectAtPoint(
  source: Blob,
  point: NormalizedPoint,
  onProgress: SegmentationProgress = () => undefined,
): Promise<Blob> {
  onProgress("model");
  const [segmenter, bitmap] = await Promise.all([getSegmenter(), createImageBitmap(source)]);
  try {
    onProgress("segment");
    const result = segmenter.segment(bitmap, { keypoint: point });
    try {
      const mask = result.confidenceMasks?.[0];
      if (!mask) throw new Error("선택한 물건의 영역을 찾지 못했습니다.");

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = mask.width;
      maskCanvas.height = mask.height;
      const maskContext = maskCanvas.getContext("2d");
      if (!maskContext) throw new Error("물건 영역을 처리할 수 없습니다.");
      maskContext.putImageData(maskToAlphaImageData(mask), 0, 0);

      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = bitmap.width;
      outputCanvas.height = bitmap.height;
      const outputContext = outputCanvas.getContext("2d");
      if (!outputContext) throw new Error("분리 결과를 처리할 수 없습니다.");
      outputContext.drawImage(bitmap, 0, 0);
      outputContext.globalCompositeOperation = "destination-in";
      outputContext.drawImage(maskCanvas, 0, 0, bitmap.width, bitmap.height);
      return await canvasBlob(outputCanvas);
    } finally {
      result.close();
    }
  } finally {
    bitmap.close();
  }
}
