import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { StatusPanel } from "../../components/StatusPanel";
import {
  CameraController,
  CameraError,
  captureVideoFrame,
} from "../../services/camera/camera";
import { preloadInteractiveSegmenter } from "../../services/image-processing/interactiveSegmentation";

type CameraState =
  | { status: "requesting" }
  | { status: "live"; stream: MediaStream }
  | { status: "captured"; blob: Blob; url: string }
  | { status: "error"; error: CameraError };

interface CameraCaptureProps {
  onBackgroundRemovalRequested: (source: Blob) => void;
  onSourceDiscarded: () => void;
  controller?: Pick<CameraController, "start" | "stop">;
}

export function CameraCapture({
  onBackgroundRemovalRequested,
  onSourceDiscarded,
  controller,
}: CameraCaptureProps) {
  const controllerRef = useRef<Pick<CameraController, "start" | "stop"> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [state, setState] = useState<CameraState>({ status: "requesting" });
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [handedOff, setHandedOff] = useState(false);

  if (!controllerRef.current) controllerRef.current = controller ?? new CameraController();

  const discardPreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  const requestCamera = useCallback(async () => {
    discardPreview();
    onSourceDiscarded();
    setCaptureError(null);
    setHandedOff(false);
    setState({ status: "requesting" });
    try {
      const stream = await controllerRef.current!.start();
      setState({ status: "live", stream });
    } catch (error) {
      if (error instanceof CameraError && error.code === "cancelled") return;
      setState({
        status: "error",
        error:
          error instanceof CameraError
            ? error
            : new CameraError("unknown", "카메라를 시작하지 못했습니다.", { cause: error }),
      });
    }
  }, [discardPreview, onSourceDiscarded]);

  useEffect(() => {
    if ("createImageBitmap" in globalThis) {
      void preloadInteractiveSegmenter().catch(() => undefined);
    }
    void requestCamera();
    return () => {
      controllerRef.current?.stop();
      discardPreview();
    };
  }, [discardPreview, requestCamera]);

  useEffect(() => {
    if (state.status !== "live" || !videoRef.current) return;
    const video = videoRef.current;
    let active = true;
    video.srcObject = state.stream;
    void video.play().catch((error: unknown) => {
      if (!active) return;
      controllerRef.current?.stop();
      setState({
        status: "error",
        error: new CameraError(
          "unknown",
          "카메라 미리보기를 재생하지 못했습니다. 다시 시도해 주세요.",
          { cause: error },
        ),
      });
    });
    return () => {
      active = false;
      video.srcObject = null;
    };
  }, [state]);

  const capture = async () => {
    if (state.status !== "live" || !videoRef.current || capturing) return;
    setCapturing(true);
    setCaptureError(null);
    try {
      const blob = await captureVideoFrame(videoRef.current);
      controllerRef.current?.stop();
      discardPreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setState({ status: "captured", blob, url });
    } catch (error) {
      setCaptureError(
        error instanceof CameraError
          ? error.message
          : "촬영 중 오류가 발생했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setCapturing(false);
    }
  };

  if (state.status === "requesting") {
    return (
      <div className="camera-card camera-card--centered" aria-live="polite">
        <span className="camera-loader" aria-hidden="true" />
        <strong>카메라 권한을 확인하고 있어요</strong>
        <p>브라우저에서 카메라 사용을 허용해 주세요.</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <StatusPanel
        tone="error"
        title="카메라를 사용할 수 없어요"
        action={<Button variant="primary" onClick={() => void requestCamera()}>다시 시도</Button>}
      >
        <p>{state.error.message}</p>
      </StatusPanel>
    );
  }

  if (state.status === "captured") {
    return (
      <div className="camera-card">
        <div className="camera-viewport">
          <img src={state.url} alt="촬영한 물건 미리보기" />
          <span className="camera-badge">촬영 결과</span>
        </div>
        <div className="camera-actions">
          <Button onClick={() => void requestCamera()}>재촬영</Button>
          <Button
            variant="primary"
            disabled={handedOff}
            onClick={() => {
              onBackgroundRemovalRequested(state.blob);
              setHandedOff(true);
            }}
          >
            {handedOff ? "전달 완료" : "배경 제거"}
          </Button>
        </div>
        {handedOff ? (
          <p className="camera-notice" aria-live="polite">
            촬영 이미지를 배경 제거 단계에 전달했습니다.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="camera-card">
      <div className="camera-viewport">
        <video ref={videoRef} autoPlay muted playsInline aria-label="실시간 카메라 미리보기" />
        <span className="camera-badge camera-badge--live"><i aria-hidden="true" /> LIVE</span>
      </div>
      <div className="camera-actions">
        <Button variant="primary" disabled={capturing} onClick={() => void capture()}>
          {capturing ? "촬영 중…" : "촬영"}
        </Button>
      </div>
      {captureError ? <p className="camera-error" role="alert">{captureError}</p> : null}
    </div>
  );
}
