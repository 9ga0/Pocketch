import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { StatusPanel } from "../../components/StatusPanel";
import type { CollectedItem, CollectionSettings } from "../../domain/collection";
import { collectionSceneBridge } from "../../engine/collectionBridge";
import { CollectionSceneView } from "../../engine/CollectionSceneView";
import {
  subscribeToSharedSession,
  type SharedSessionItem,
  type SharedSessionSnapshot,
} from "../../services/sync/sessionSync";
import { TiltControl } from "./TiltControl";

export interface SharedSessionPageProps {
  sessionId: string;
  onExit: () => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; snapshot: SharedSessionSnapshot }
  | { status: "error"; message: string };

function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: contentType });
}

function toCollectedItem(item: SharedSessionItem): CollectedItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    image: base64ToBlob(item.imageBase64, item.imageContentType),
    width: item.width,
    height: item.height,
    createdAt: item.createdAt,
  };
}

export function SharedSessionPage({ sessionId, onExit }: SharedSessionPageProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    setState({ status: "loading" });
    return subscribeToSharedSession(
      sessionId,
      (snapshot) => setState({ status: "ready", snapshot }),
      (error) => setState({
        status: "error",
        message: error instanceof Error ? error.message : "공유된 채집물을 불러오지 못했습니다.",
      }),
    );
  }, [sessionId]);

  useEffect(() => collectionSceneBridge.onEvent((event) => {
    if (event.type === "item:detail-requested") setDetailId(event.itemId);
  }), []);

  const items = useMemo(
    () => (state.status === "ready" ? state.snapshot.items.map(toCollectedItem) : []),
    [state],
  );

  if (state.status === "loading") {
    return (
      <StatusPanel title="공유된 채집물을 불러오고 있어요" live>
        <p>잠시만 기다려 주세요.</p>
      </StatusPanel>
    );
  }

  if (state.status === "error" || !state.snapshot.exists) {
    return (
      <StatusPanel
        tone="error"
        title="이 공유 링크를 열 수 없어요"
        action={<Button variant="primary" onClick={onExit}>내 채집물로 이동</Button>}
      >
        <p>{state.status === "error" ? state.message : "소유자가 공유를 해제했거나 링크가 잘못됐어요."}</p>
      </StatusPanel>
    );
  }

  const settings: CollectionSettings = {
    id: "collection-settings",
    scaleLevel: state.snapshot.settings?.scaleLevel ?? 0,
    globalScale: state.snapshot.settings?.globalScale ?? 1,
  };
  const detailItem = detailId ? items.find((item) => item.id === detailId) : undefined;

  return (
    <div className="collection-layout">
      <section className="collection-stage" aria-labelledby="shared-session-title">
        <div>
          <p className="eyebrow">SHARED COLLECTION</p>
          <h1 id="shared-session-title">공유된 채집물 보기</h1>
          <p className="lead">읽기 전용이에요. 이 기기에서는 추가하거나 삭제할 수 없어요.</p>
          <Button variant="secondary" onClick={onExit}>내 채집물로 이동</Button>
          <TiltControl />
        </div>
        <CollectionSceneView items={items} settings={settings} />
      </section>
      <aside className="collection-sidebar" aria-label="공유 정보">
        <div className="metric"><span>공유된 물건</span><strong>{items.length}</strong></div>
        {items.length === 0 ? (
          <StatusPanel title="아직 공유된 물건이 없어요">
            <p>소유자가 물건을 추가하면 이곳에 실시간으로 나타나요.</p>
          </StatusPanel>
        ) : null}
      </aside>
      {detailItem ? <SharedItemDetail item={detailItem} onClose={() => setDetailId(null)} /> : null}
    </div>
  );
}

function SharedItemDetail({ item, onClose }: { item: CollectedItem; onClose: () => void }) {
  const imageUrl = useMemo(() => URL.createObjectURL(item.image), [item]);
  useEffect(() => () => URL.revokeObjectURL(imageUrl), [imageUrl]);
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog item-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shared-item-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="dialog__close" onClick={onClose} aria-label="상세 닫기">×</button>
        <img src={imageUrl} alt="" />
        <p className="eyebrow">COLLECTED ITEM</p>
        <h2 id="shared-item-detail-title">{item.name}</h2>
        <p>{item.description || "설명이 없습니다."}</p>
        <div className="dialog__actions"><Button onClick={onClose}>닫기</Button></div>
      </div>
    </div>
  );
}
