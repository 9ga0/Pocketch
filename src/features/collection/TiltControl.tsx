import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { collectionSceneBridge } from "../../engine/collectionBridge";
import {
  isOrientationSupported,
  requestOrientationPermission,
  subscribeToShake,
  subscribeToTilt,
} from "../../services/motion/deviceTilt";

type TiltState = "idle" | "active" | "denied" | "unsupported";

export function TiltControl() {
  const [state, setState] = useState<TiltState>(() => (isOrientationSupported() ? "idle" : "unsupported"));

  useEffect(() => {
    if (state !== "active") return;
    const unsubscribeTilt = subscribeToTilt((gravity) => {
      collectionSceneBridge.dispatch({ type: "physics:gravity", x: gravity.x, y: gravity.y });
    });
    const unsubscribeShake = subscribeToShake(() => {
      collectionSceneBridge.dispatch({ type: "physics:shake" });
    });
    return () => {
      unsubscribeTilt();
      unsubscribeShake();
    };
  }, [state]);

  const enable = async () => {
    const permission = await requestOrientationPermission();
    setState(permission === "granted" ? "active" : permission);
  };

  if (state === "unsupported") {
    return <p className="tilt-control muted">이 기기는 기울기 센서를 지원하지 않아요. 손가락으로 물건을 끌어보세요.</p>;
  }

  if (state === "active") {
    return (
      <p className="tilt-control muted" aria-live="polite">
        기기를 기울이거나 흔들어 채집물을 섞어보세요.
      </p>
    );
  }

  return (
    <div className="tilt-control">
      <Button type="button" variant="secondary" onClick={() => void enable()}>기울기로 섞기 켜기</Button>
      {state === "denied" ? (
        <p className="muted">권한이 거부됐어요. 손가락으로 물건을 끌어도 섞을 수 있어요.</p>
      ) : null}
    </div>
  );
}
