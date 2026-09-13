import { useState } from "react";
import { Button } from "../../components/Button";
import type { CollectionSettings } from "../../domain/collection";
import { isFirebaseConfigured } from "../../services/sync/firebaseConfig";
import { ensureSession, revokeSession } from "../../services/sync/sessionSync";

export interface ShareSessionPanelProps {
  settings: CollectionSettings;
  onSettingsChange: (settings: CollectionSettings) => Promise<void>;
}

type PanelState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "error"; message: string };

export function sharedSessionUrl(origin: string, baseUrl: string, sessionId: string): string {
  return `${origin}${baseUrl}?session=${encodeURIComponent(sessionId)}`;
}

export function ShareSessionPanel({ settings, onSettingsChange }: ShareSessionPanelProps) {
  const [state, setState] = useState<PanelState>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  if (!isFirebaseConfigured()) {
    return (
      <div className="share-panel share-panel--disabled">
        <p className="eyebrow">SHARE</p>
        <p className="muted">공유 기능을 사용하려면 Firebase 설정이 필요합니다.</p>
      </div>
    );
  }

  const share = async () => {
    setState({ status: "working" });
    try {
      const sessionId = await ensureSession(settings);
      await onSettingsChange({ ...settings, sessionId });
      setState({ status: "idle" });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "공유 링크를 만들지 못했습니다.",
      });
    }
  };

  const revoke = async () => {
    if (!settings.sessionId) return;
    setState({ status: "working" });
    try {
      await revokeSession(settings.sessionId);
      await onSettingsChange({ ...settings, sessionId: undefined });
      setState({ status: "idle" });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "공유를 해제하지 못했습니다.",
      });
    }
  };

  const copyLink = async () => {
    if (!settings.sessionId) return;
    const url = sharedSessionUrl(window.location.origin, import.meta.env.BASE_URL, settings.sessionId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const busy = state.status === "working";

  return (
    <div className="share-panel">
      <p className="eyebrow">SHARE</p>
      {settings.sessionId ? (
        <>
          <p className="muted">다른 사람이 이 링크로 채집물을 조회할 수 있어요. 추가·삭제는 이 기기에서만 가능해요.</p>
          <div className="share-panel__link">
            <input
              readOnly
              aria-label="공유 링크"
              value={sharedSessionUrl(window.location.origin, import.meta.env.BASE_URL, settings.sessionId)}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button type="button" onClick={() => void copyLink()}>{copied ? "복사됨" : "복사"}</Button>
          </div>
          <Button type="button" variant="danger" disabled={busy} onClick={() => void revoke()}>
            {busy ? "해제 중…" : "공유 해제"}
          </Button>
        </>
      ) : (
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void share()}>
          {busy ? "준비 중…" : "공유 링크 만들기"}
        </Button>
      )}
      {state.status === "error" ? <p className="share-panel__error" role="alert">{state.message}</p> : null}
    </div>
  );
}
