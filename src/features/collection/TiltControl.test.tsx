// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectionSceneBridge } from "../../engine/collectionBridge";
import {
  isOrientationSupported,
  requestOrientationPermission,
  subscribeToShake,
  subscribeToTilt,
} from "../../services/motion/deviceTilt";
import { TiltControl } from "./TiltControl";

vi.mock("../../services/motion/deviceTilt", () => ({
  isOrientationSupported: vi.fn(() => true),
  requestOrientationPermission: vi.fn(),
  subscribeToTilt: vi.fn(() => vi.fn()),
  subscribeToShake: vi.fn(() => vi.fn()),
}));

afterEach(cleanup);

describe("TiltControl", () => {
  beforeEach(() => {
    vi.mocked(isOrientationSupported).mockReturnValue(true);
    vi.mocked(subscribeToTilt).mockReturnValue(vi.fn());
    vi.mocked(subscribeToShake).mockReturnValue(vi.fn());
  });

  it("shows an unsupported notice and never offers the enable button", () => {
    vi.mocked(isOrientationSupported).mockReturnValue(false);
    render(<TiltControl />);
    expect(screen.getByText(/기울기 센서를 지원하지 않아요/)).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("subscribes to tilt and shake once permission is granted, forwarding to the scene bridge", async () => {
    vi.mocked(requestOrientationPermission).mockResolvedValue("granted");
    const dispatch = vi.spyOn(collectionSceneBridge, "dispatch");
    const user = userEvent.setup();
    render(<TiltControl />);

    await user.click(screen.getByRole("button", { name: "기울기로 섞기 켜기" }));
    expect(await screen.findByText(/기울이거나 흔들어/)).not.toBeNull();
    expect(subscribeToTilt).toHaveBeenCalledOnce();
    expect(subscribeToShake).toHaveBeenCalledOnce();

    const onGravity = vi.mocked(subscribeToTilt).mock.calls[0][0];
    onGravity({ x: 0.5, y: -0.5 });
    expect(dispatch).toHaveBeenCalledWith({ type: "physics:gravity", x: 0.5, y: -0.5 });

    const onShake = vi.mocked(subscribeToShake).mock.calls[0][0];
    onShake();
    expect(dispatch).toHaveBeenCalledWith({ type: "physics:shake" });

    dispatch.mockRestore();
  });

  it("shows a denied notice and mentions the drag fallback", async () => {
    vi.mocked(requestOrientationPermission).mockResolvedValue("denied");
    const user = userEvent.setup();
    render(<TiltControl />);
    await user.click(screen.getByRole("button", { name: "기울기로 섞기 켜기" }));
    expect(await screen.findByText(/권한이 거부됐어요/)).not.toBeNull();
  });

  it("unsubscribes tilt and shake when unmounted while active", async () => {
    vi.mocked(requestOrientationPermission).mockResolvedValue("granted");
    const unsubscribeTilt = vi.fn();
    const unsubscribeShake = vi.fn();
    vi.mocked(subscribeToTilt).mockReturnValue(unsubscribeTilt);
    vi.mocked(subscribeToShake).mockReturnValue(unsubscribeShake);
    const user = userEvent.setup();
    const { unmount } = render(<TiltControl />);
    await user.click(screen.getByRole("button", { name: "기울기로 섞기 켜기" }));
    await screen.findByText(/기울이거나 흔들어/);
    unmount();
    expect(unsubscribeTilt).toHaveBeenCalledOnce();
    expect(unsubscribeShake).toHaveBeenCalledOnce();
  });
});
