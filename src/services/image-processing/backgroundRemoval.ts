export interface RemovalProgress {
  phase: "model" | "remove";
  percent: number;
}

type ProgressListener = (progress: RemovalProgress) => void;

export async function removeBackgroundInBrowser(
  source: Blob,
  onProgress: ProgressListener,
): Promise<Blob> {
  const { removeBackground } = await import("@imgly/background-removal");

  try {
    return await removeBackground(source, {
      publicPath: backgroundRemovalAssetPath(import.meta.env.BASE_URL, window.location.origin),
      model: "isnet_quint8",
      device: "cpu",
      output: { format: "image/png", quality: 1 },
      progress(key: string, current: number, total: number) {
        const phase = key.startsWith("fetch:") ? "model" : "remove";
        const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        onProgress({ phase, percent });
      },
    });
  } catch (error) {
    const isNetworkFailure = error instanceof TypeError;
    if (!navigator.onLine && isNetworkFailure) {
      throw new Error("오프라인 배경제거 자산이 준비되지 않았습니다. 인터넷에 연결해 ‘오프라인 준비 완료’를 확인한 뒤 다시 시도해 주세요.", { cause: error });
    }
    throw error;
  }
}

export function backgroundRemovalAssetPath(baseUrl: string, origin: string): string {
  return new URL(`${baseUrl}background-removal/`, origin).href;
}
