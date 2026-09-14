import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusPanel } from "../../components/StatusPanel";
import type { CollectedItem, CollectionSettings } from "../../domain/collection";
import { collectionSceneBridge } from "../../engine/collectionBridge";
import {
  collectionRepository,
  deletePocketchDatabase,
} from "../../services/storage/collectionRepository";
import { StorageError } from "../../services/storage/errors";
import { mirrorDeleteItem, mirrorItem, mirrorSettings, revokeSession } from "../../services/sync/sessionSync";
import { CaptureModal } from "./CaptureModal";
import { ShareSessionPanel } from "./ShareSessionPanel";
import { ScenePointerHint } from "./ScenePointerHint";
import { CollectionSceneView } from "../../engine/CollectionSceneView";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; items: CollectedItem[]; settings: CollectionSettings }
  | { status: "error"; error: StorageError };

function storageError(error: unknown, fallback: string): StorageError {
  return error instanceof StorageError
    ? error
    : new StorageError("read-failed", fallback, { cause: error });
}

export function CollectionPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const [items, settings] = await Promise.all([
        collectionRepository.getItems(),
        collectionRepository.getSettings(),
      ]);
      setState({ status: "ready", items, settings });
    } catch (error) {
      setState({ status: "error", error: storageError(error, "저장된 데이터를 읽지 못했습니다.") });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => collectionSceneBridge.onEvent((event) => {
    if (event.type === "item:detail-requested") setDetailId(event.itemId);
    if (event.type === "settings:changed") {
      const nextSettings = event.settings;
      setState((current) => current.status === "ready" ? { ...current, settings: nextSettings } : current);
      if (nextSettings.sessionId) void mirrorSettings(nextSettings.sessionId, nextSettings).catch(() => undefined);
    }
  }), []);

  const updateSettings = async (nextSettings: CollectionSettings) => {
    await collectionRepository.updateSettings(nextSettings);
    setState((current) => current.status === "ready" ? { ...current, settings: nextSettings } : current);
  };

  const resetCollection = async () => {
    setResetting(true);
    const sessionId = state.status === "ready" ? state.settings.sessionId : undefined;
    try {
      await collectionRepository.resetCollection();
      collectionSceneBridge.dispatch({ type: "collection:reset" });
      if (sessionId) void revokeSession(sessionId).catch(() => undefined);
      setResetOpen(false);
      await load();
    } catch (error) {
      setState({ status: "error", error: storageError(error, "채집물을 초기화하지 못했습니다.") });
      setResetOpen(false);
    } finally {
      setResetting(false);
    }
  };

  const resetDatabase = async () => {
    setResetting(true);
    try {
      await deletePocketchDatabase();
      setResetOpen(false);
      await load();
    } catch (error) {
      setState({ status: "error", error: storageError(error, "저장소를 초기화하지 못했습니다.") });
      setResetOpen(false);
    } finally {
      setResetting(false);
    }
  };

  const finishRegistration = (item: CollectedItem) => {
    const sessionId = state.status === "ready" ? state.settings.sessionId : undefined;
    setState((current) => current.status === "ready"
      ? { ...current, items: [...current.items, item] }
      : current);
    collectionSceneBridge.dispatch({ type: "item:add", item });
    setAddItemOpen(false);
    if (sessionId) void mirrorItem(sessionId, item).catch(() => undefined);
  };

  if (state.status === "loading") {
    return (
      <StatusPanel title="채집물을 불러오고 있어요" live>
        <p>기기에 저장된 이미지와 설정을 확인하고 있습니다.</p>
      </StatusPanel>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <StatusPanel
          tone="error"
          title="채집물을 불러오지 못했어요"
          action={
            <>
              <Button variant="primary" onClick={() => void load()}>다시 시도</Button>
              <Button variant="danger" onClick={() => setResetOpen(true)}>저장소 초기화</Button>
            </>
          }
        >
          <p>{state.error.message}</p>
          <p className="muted">초기화는 직접 선택하기 전까지 실행되지 않습니다.</p>
        </StatusPanel>
        <ConfirmDialog
          open={resetOpen}
          title="저장소를 초기화할까요?"
          description="이 브라우저에 저장된 Pocketch 데이터를 복구할 수 없게 됩니다. 오류가 반복될 때만 사용해 주세요."
          confirmLabel="저장소 초기화"
          busy={resetting}
          onCancel={() => setResetOpen(false)}
          onConfirm={() => void resetDatabase()}
        />
      </>
    );
  }

  return (
    <div className="collection-layout">
      <section className="collection-stage" aria-labelledby="collection-title">
        <div>
          <p className="eyebrow">COLLECTION</p>
          <h1 id="collection-title">내 물건을 모아보세요</h1>
          <p className="lead">사진은 기기 안에서 배경을 지운 뒤 투명 이미지로 저장됩니다.</p>
          <Button variant="primary" onClick={() => setAddItemOpen(true)}>물건 추가</Button>
          <ScenePointerHint />
        </div>
        <CollectionSceneView items={state.items} settings={state.settings} />
      </section>
      <CaptureModal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onSaved={finishRegistration}
        onManageItems={() => sidebarRef.current?.focus()}
      />

      <aside ref={sidebarRef} className="collection-sidebar" aria-label="채집 정보" tabIndex={-1}>
        <div className="metric"><span>모은 물건</span><strong>{state.items.length}</strong></div>
        <div className="metric"><span>축소 단계</span><strong>{state.settings.scaleLevel}</strong></div>
        <ShareSessionPanel settings={state.settings} onSettingsChange={updateSettings} />
        {state.items.length === 0 ? (
          <StatusPanel title="아직 모은 물건이 없어요">
            <p>물건을 촬영하고 이름을 붙이면 이곳에 바로 쌓입니다.</p>
          </StatusPanel>
        ) : (
          <ul className="item-list" aria-label="저장된 물건">
            {state.items.map((item) => (
              <li key={item.id}>
                <button className="item-list__button" onClick={() => setDetailId(item.id)}>
                  <strong>{item.name}</strong>
                  <span className="muted">자세히</span>
                </button>
                <time dateTime={item.createdAt}>
                  {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date(item.createdAt))}
                </time>
              </li>
            ))}
          </ul>
        )}
        <Button variant="danger" disabled={state.items.length === 0} onClick={() => setResetOpen(true)}>
          채집물 전체 초기화
        </Button>
      </aside>

      <ConfirmDialog
        open={resetOpen}
        title="채집물을 모두 지울까요?"
        description="저장한 물건과 축소 단계가 초기화되며 되돌릴 수 없습니다."
        confirmLabel="모두 초기화"
        busy={resetting}
        onCancel={() => setResetOpen(false)}
        onConfirm={() => void resetCollection()}
      />
      {(() => {
        const item = detailId ? state.items.find((candidate) => candidate.id === detailId) : undefined;
        if (!item) return null;
        return (
          <ItemDetailDialog
            item={item}
            sessionId={state.settings.sessionId}
            onClose={() => setDetailId(null)}
            onDeleted={() => { setDetailId(null); void load(); }}
          />
        );
      })()}
    </div>
  );
}

function ItemDetailDialog({
  item,
  sessionId,
  onClose,
  onDeleted,
}: {
  item: CollectedItem;
  sessionId?: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const imageUrl = useMemo(() => URL.createObjectURL(item.image), [item]);
  useEffect(() => () => URL.revokeObjectURL(imageUrl), [imageUrl]);
  const remove = async () => {
    setDeleting(true);
    try {
      await collectionRepository.deleteItem(item.id);
      collectionSceneBridge.dispatch({ type: "item:remove", itemId: item.id });
      if (sessionId) void mirrorDeleteItem(sessionId, item.id).catch(() => undefined);
      onDeleted();
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="dialog item-detail" role="dialog" aria-modal="true" aria-labelledby="item-detail-title" onClick={(event) => event.stopPropagation()}>
        <button className="dialog__close" onClick={onClose} aria-label="상세 닫기">×</button>
        <img src={imageUrl} alt="" />
        <p className="eyebrow">COLLECTED ITEM</p>
        <h2 id="item-detail-title">{item.name}</h2>
        <p>{item.description || "설명이 없습니다."}</p>
        <time dateTime={item.createdAt}>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "full", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
        <div className="dialog__actions"><Button onClick={onClose}>닫기</Button><Button variant="danger" onClick={() => setDeleteOpen(true)}>삭제</Button></div>
      </div>
      <ConfirmDialog open={deleteOpen} title="이 물건을 삭제할까요?" description="삭제하면 현재 채집 장면과 저장된 목록에서 함께 사라집니다." confirmLabel="삭제" busy={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={() => void remove()} />
    </div>
  );
}
