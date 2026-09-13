// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraError, captureVideoFrame } from "../../services/camera/camera";
import { CameraCapture } from "./CameraCapture";

vi.mock("../../services/camera/camera", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/camera/camera")>();
  return { ...actual, captureVideoFrame: vi.fn() };
});

const mockedCapture = vi.mocked(captureVideoFrame);

function stream(): MediaStream {
  return { getTracks: () => [] } as unknown as MediaStream;
}

describe("CameraCapture", () => {
  beforeEach(() => {
    mockedCapture.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:captured-frame"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("runs preview, capture, handoff, and retake without duplicate handoff", async () => {
    const frame = new Blob(["captured"], { type: "image/jpeg" });
    mockedCapture.mockResolvedValue(frame);
    const controller = { start: vi.fn().mockResolvedValue(stream()), stop: vi.fn() };
    const onHandoff = vi.fn();
    const onDiscard = vi.fn();
    const user = userEvent.setup();

    render(
      <CameraCapture
        controller={controller}
        onBackgroundRemovalRequested={onHandoff}
        onSourceDiscarded={onDiscard}
      />,
    );

    const captureButton = await screen.findByRole("button", { name: "촬영" });
    const video = screen.getByLabelText("실시간 카메라 미리보기");
    fireEvent.canPlay(video);
    await user.click(captureButton);

    expect(
      (await screen.findByAltText("촬영한 물건 미리보기")).getAttribute("src"),
    ).toBe("blob:captured-frame");
    expect(controller.stop).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "배경 제거" }));
    expect(onHandoff).toHaveBeenCalledOnce();
    expect(onHandoff).toHaveBeenCalledWith(frame);
    expect(
      (screen.getByRole("button", { name: "전달 완료" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "재촬영" }));
    await waitFor(() => expect(controller.start).toHaveBeenCalledTimes(2));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:captured-frame");
    expect(onDiscard).toHaveBeenCalledTimes(2);
  });

  it("shows a recoverable error and retries camera access", async () => {
    const controller = {
      start: vi
        .fn()
        .mockRejectedValueOnce(new CameraError("permission-denied", "권한을 허용해 주세요."))
        .mockResolvedValueOnce(stream()),
      stop: vi.fn(),
    };
    const user = userEvent.setup();

    render(
      <CameraCapture
        controller={controller}
        onBackgroundRemovalRequested={vi.fn()}
        onSourceDiscarded={vi.fn()}
      />,
    );

    expect(await screen.findByText("권한을 허용해 주세요.")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect((await screen.findByRole("button", { name: "촬영" }) as HTMLButtonElement).disabled).toBe(false);
    expect(controller.start).toHaveBeenCalledTimes(2);
  });
});
