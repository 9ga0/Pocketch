export type CameraErrorCode =
  | "unsupported"
  | "insecure-context"
  | "permission-denied"
  | "device-not-found"
  | "device-busy"
  | "constraints-failed"
  | "capture-not-ready"
  | "capture-failed"
  | "cancelled"
  | "unknown";

export class CameraError extends Error {
  constructor(
    public readonly code: CameraErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CameraError";
  }
}

export interface CameraPlatform {
  secureContext: boolean;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

function browserCameraPlatform(): CameraPlatform {
  return {
    secureContext: window.isSecureContext,
    getUserMedia: navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices),
  };
}

export function toCameraError(error: unknown): CameraError {
  if (error instanceof CameraError) return error;
  if (error instanceof DOMException) {
    const errors: Partial<Record<DOMException["name"], CameraError>> = {
      NotAllowedError: new CameraError(
        "permission-denied",
        "카메라 권한이 거부되었습니다. 주소창의 사이트 설정에서 카메라를 허용한 뒤 다시 시도해 주세요.",
        { cause: error },
      ),
      SecurityError: new CameraError(
        "permission-denied",
        "브라우저 보안 설정에서 카메라 접근을 허용하지 않았습니다.",
        { cause: error },
      ),
      NotFoundError: new CameraError(
        "device-not-found",
        "사용할 수 있는 카메라를 찾지 못했습니다. 카메라 연결 상태를 확인해 주세요.",
        { cause: error },
      ),
      NotReadableError: new CameraError(
        "device-busy",
        "다른 앱에서 카메라를 사용 중일 수 있습니다. 해당 앱을 닫고 다시 시도해 주세요.",
        { cause: error },
      ),
      OverconstrainedError: new CameraError(
        "constraints-failed",
        "카메라가 요청한 촬영 설정을 지원하지 않습니다.",
        { cause: error },
      ),
    };
    const mappedError = errors[error.name];
    if (mappedError) return mappedError;
  }
  return new CameraError(
    "unknown",
    "카메라를 시작하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
    { cause: error },
  );
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export class CameraController {
  private requestVersion = 0;
  private activeStream: MediaStream | null = null;

  constructor(private readonly platform: CameraPlatform = browserCameraPlatform()) {}

  async start(): Promise<MediaStream> {
    if (!this.platform.secureContext) {
      throw new CameraError(
        "insecure-context",
        "카메라는 HTTPS 또는 localhost에서만 사용할 수 있습니다.",
      );
    }
    if (!this.platform.getUserMedia) {
      throw new CameraError(
        "unsupported",
        "이 브라우저는 카메라 촬영을 지원하지 않습니다. 최신 데스크톱 Chrome을 사용해 주세요.",
      );
    }

    const version = ++this.requestVersion;
    stopStream(this.activeStream);
    this.activeStream = null;

    let stream: MediaStream;
    try {
      stream = await this.platform.getUserMedia(CAMERA_CONSTRAINTS);
    } catch (error) {
      if (version !== this.requestVersion) {
        throw new CameraError("cancelled", "취소된 카메라 요청입니다.");
      }
      throw toCameraError(error);
    }

    if (version !== this.requestVersion) {
      stopStream(stream);
      throw new CameraError("cancelled", "취소된 카메라 요청입니다.");
    }
    this.activeStream = stream;
    return stream;
  }

  stop(): void {
    this.requestVersion += 1;
    stopStream(this.activeStream);
    this.activeStream = null;
  }
}

export type CanvasFactory = () => HTMLCanvasElement;

export async function captureVideoFrame(
  video: HTMLVideoElement,
  createCanvas: CanvasFactory = () => document.createElement("canvas"),
): Promise<Blob> {
  if (
    video.readyState < 2 ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0
  ) {
    throw new CameraError(
      "capture-not-ready",
      "카메라 화면이 준비되지 않았습니다. 잠시 후 다시 촬영해 주세요.",
    );
  }

  const canvas = createCanvas();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new CameraError("capture-failed", "촬영 화면을 처리하지 못했습니다.");
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.size > 0) resolve(blob);
        else reject(new CameraError("capture-failed", "촬영 이미지를 만들지 못했습니다."));
      },
      "image/jpeg",
      0.92,
    );
  });
}
