// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isOrientationSupported,
  requestOrientationPermission,
  subscribeToShake,
  subscribeToTilt,
  tiltToGravity,
} from "./deviceTilt";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("tiltToGravity", () => {
  it("maps gamma to x and beta to y, scaled to a unit vector at 45 degrees", () => {
    expect(tiltToGravity(45, 45)).toEqual({ x: 1, y: 1 });
    expect(tiltToGravity(-45, -45)).toEqual({ x: -1, y: -1 });
    expect(tiltToGravity(22.5, 0)).toEqual({ x: 0, y: 0.5 });
  });

  it("clamps beyond 45 degrees so extreme tilt cannot exceed unit magnitude", () => {
    expect(tiltToGravity(180, -180)).toEqual({ x: -1, y: 1 });
  });

  it("treats null readings as zero", () => {
    expect(tiltToGravity(null, null)).toEqual({ x: 0, y: 0 });
  });
});

describe("isOrientationSupported / requestOrientationPermission", () => {
  it("reports unsupported when DeviceOrientationEvent does not exist", async () => {
    vi.stubGlobal("DeviceOrientationEvent", undefined);
    expect(isOrientationSupported()).toBe(false);
    expect(await requestOrientationPermission()).toBe("unsupported");
  });

  it("grants immediately on platforms without a requestPermission gate (e.g. desktop/Android)", async () => {
    vi.stubGlobal("DeviceOrientationEvent", function DeviceOrientationEvent() {});
    expect(await requestOrientationPermission()).toBe("granted");
  });

  it("forwards iOS requestPermission grant/deny, and treats a thrown error as denied", async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("DeviceOrientationEvent", { requestPermission });

    requestPermission.mockResolvedValueOnce("granted");
    expect(await requestOrientationPermission()).toBe("granted");

    requestPermission.mockResolvedValueOnce("denied");
    expect(await requestOrientationPermission()).toBe("denied");

    requestPermission.mockRejectedValueOnce(new Error("blocked"));
    expect(await requestOrientationPermission()).toBe("denied");
  });
});

describe("subscribeToTilt", () => {
  it("converts deviceorientation events to gravity vectors until unsubscribed", () => {
    const onGravity = vi.fn();
    const unsubscribe = subscribeToTilt(onGravity);

    window.dispatchEvent(Object.assign(new Event("deviceorientation"), { beta: 45, gamma: 0 }));
    expect(onGravity).toHaveBeenLastCalledWith({ x: 0, y: 1 });

    unsubscribe();
    window.dispatchEvent(Object.assign(new Event("deviceorientation"), { beta: -45, gamma: 0 }));
    expect(onGravity).toHaveBeenCalledTimes(1);
  });
});

describe("subscribeToShake", () => {
  beforeEach(() => vi.useFakeTimers());

  function motion(magnitude: number): Event {
    return Object.assign(new Event("devicemotion"), {
      accelerationIncludingGravity: { x: magnitude, y: 0, z: 0 },
    });
  }

  it("fires once when acceleration jumps past the threshold, then enforces a cooldown", () => {
    const onShake = vi.fn();
    const unsubscribe = subscribeToShake(onShake);

    window.dispatchEvent(motion(0));
    window.dispatchEvent(motion(30));
    expect(onShake).toHaveBeenCalledTimes(1);

    window.dispatchEvent(motion(0));
    expect(onShake).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(801);
    window.dispatchEvent(motion(30));
    expect(onShake).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("ignores small jitters below the shake threshold", () => {
    const onShake = vi.fn();
    subscribeToShake(onShake);
    window.dispatchEvent(motion(0));
    window.dispatchEvent(motion(5));
    expect(onShake).not.toHaveBeenCalled();
  });
});
