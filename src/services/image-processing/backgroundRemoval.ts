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

  return removeBackground(source, {
    model: "isnet_quint8",
    device: "cpu",
    output: { format: "image/png", quality: 1 },
    progress(key: string, current: number, total: number) {
      const phase = key.startsWith("fetch:") ? "model" : "remove";
      const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
      onProgress({ phase, percent });
    },
  });
}
