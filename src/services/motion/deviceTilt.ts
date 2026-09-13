export type OrientationPermissionState = "granted" | "denied" | "unsupported";

export interface GravityVector {
  x: number;
  y: number;
}

interface RequestPermissionCapable {
  requestPermission?: () => Promise<"granted" | "denied">;
}

const MAX_TILT_DEGREES = 45;
const GRAVITY_MAGNITUDE = 1;
const SHAKE_MAGNITUDE_DELTA = 18;
const SHAKE_MIN_INTERVAL_MS = 800;

export function isOrientationSupported(): boolean {
  return Boolean((window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent);
}

export async function requestOrientationPermission(): Promise<OrientationPermissionState> {
  if (!isOrientationSupported()) return "unsupported";
  const ctor = window.DeviceOrientationEvent as unknown as RequestPermissionCapable;
  if (typeof ctor.requestPermission !== "function") return "granted";
  try {
    const result = await ctor.requestPermission();
    return result === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** beta(앞뒤 기울기)는 y, gamma(좌우 기울기)는 x 중력으로 변환하고 ±45도에서 최대 크기로 clamp한다. */
export function tiltToGravity(beta: number | null, gamma: number | null): GravityVector {
  return {
    x: (clamp(gamma ?? 0, MAX_TILT_DEGREES) / MAX_TILT_DEGREES) * GRAVITY_MAGNITUDE,
    y: (clamp(beta ?? 0, MAX_TILT_DEGREES) / MAX_TILT_DEGREES) * GRAVITY_MAGNITUDE,
  };
}

export function subscribeToTilt(onGravity: (gravity: GravityVector) => void): () => void {
  const handleOrientation = (event: DeviceOrientationEvent) => {
    onGravity(tiltToGravity(event.beta, event.gamma));
  };
  window.addEventListener("deviceorientation", handleOrientation);
  return () => window.removeEventListener("deviceorientation", handleOrientation);
}

/** 연속된 가속도 샘플 간 크기 변화가 임계값을 넘으면 흔들기로 판정하고, 재판정까지 최소 간격을 둔다. */
export function subscribeToShake(onShake: () => void): () => void {
  let lastShakeAt = 0;
  let lastMagnitude: number | null = null;

  const handleMotion = (event: DeviceMotionEvent) => {
    const acceleration = event.accelerationIncludingGravity ?? event.acceleration;
    if (!acceleration) return;
    const magnitude = Math.sqrt(
      (acceleration.x ?? 0) ** 2 + (acceleration.y ?? 0) ** 2 + (acceleration.z ?? 0) ** 2,
    );
    if (lastMagnitude !== null) {
      const delta = Math.abs(magnitude - lastMagnitude);
      const now = Date.now();
      if (delta > SHAKE_MAGNITUDE_DELTA && now - lastShakeAt > SHAKE_MIN_INTERVAL_MS) {
        lastShakeAt = now;
        onShake();
      }
    }
    lastMagnitude = magnitude;
  };

  window.addEventListener("devicemotion", handleMotion);
  return () => window.removeEventListener("devicemotion", handleMotion);
}
