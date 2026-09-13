import { describe, expect, it, vi } from "vitest";
import {
  CAMERA_CONSTRAINTS,
  CameraController,
  CameraError,
  captureVideoFrame,
  toCameraError,
  type CameraPlatform,
} from "./camera";

function fakeStream() {
  const stop = vi.fn();
  return {
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("CameraController", () => {
  it("rejects unsupported and insecure environments before requesting a device", async () => {
    await expect(new CameraController({ secureContext: false }).start()).rejects.toMatchObject({
      code: "insecure-context",
    });
    await expect(new CameraController({ secureContext: true }).start()).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it.each([
    ["NotAllowedError", "permission-denied"],
    ["NotFoundError", "device-not-found"],
    ["NotReadableError", "device-busy"],
    ["OverconstrainedError", "constraints-failed"],
  ])("maps %s to %s", (name, code) => {
    expect(toCameraError(new DOMException("camera", name))).toMatchObject({ code });
  });

  it("requests video without audio and stops an active stream", async () => {
    const { stream, stop } = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const controller = new CameraController({ secureContext: true, getUserMedia });

    await expect(controller.start()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith(CAMERA_CONSTRAINTS);
    controller.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("stops a stream returned by a request that was superseded", async () => {
    const first = deferred<MediaStream>();
    const second = deferred<MediaStream>();
    const stale = fakeStream();
    const current = fakeStream();
    const getUserMedia = vi
      .fn<NonNullable<CameraPlatform["getUserMedia"]>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = new CameraController({ secureContext: true, getUserMedia });

    const firstStart = controller.start();
    const secondStart = controller.start();
    first.resolve(stale.stream);
    second.resolve(current.stream);

    await expect(firstStart).rejects.toMatchObject({ code: "cancelled" });
    await expect(secondStart).resolves.toBe(current.stream);
    expect(stale.stop).toHaveBeenCalledOnce();
    expect(current.stop).not.toHaveBeenCalled();
  });

  it("marks a rejected superseded request as cancelled", async () => {
    const first = deferred<MediaStream>();
    const current = fakeStream();
    const getUserMedia = vi
      .fn<NonNullable<CameraPlatform["getUserMedia"]>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(current.stream);
    const controller = new CameraController({ secureContext: true, getUserMedia });

    const firstStart = controller.start();
    await controller.start();
    first.reject(new DOMException("denied", "NotAllowedError"));

    await expect(firstStart).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("captureVideoFrame", () => {
  it("rejects capture before the video has pixels", async () => {
    const video = { readyState: 1, videoWidth: 0, videoHeight: 0 } as HTMLVideoElement;
    await expect(captureVideoFrame(video)).rejects.toMatchObject({ code: "capture-not-ready" });
  });

  it("draws the intrinsic frame and creates a JPEG blob", async () => {
    const drawImage = vi.fn();
    const blob = new Blob(["frame"], { type: "image/jpeg" });
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (callback: BlobCallback, type?: string, quality?: number) => {
        expect(type).toBe("image/jpeg");
        expect(quality).toBe(0.92);
        callback(blob);
      },
    } as unknown as HTMLCanvasElement;
    const video = { readyState: 2, videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;

    await expect(captureVideoFrame(video, () => canvas)).resolves.toBe(blob);
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
  });

  it("reports a failure when the canvas returns an empty blob", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (callback: BlobCallback) => callback(null),
    } as unknown as HTMLCanvasElement;
    const video = { readyState: 2, videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;

    await expect(captureVideoFrame(video, () => canvas)).rejects.toBeInstanceOf(CameraError);
  });
});
