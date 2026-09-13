import { useCallback, useEffect, useState } from "react";
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

  const resetCollection = async () => {
    setResetting(true);
    try {
      await collectionRepository.resetCollection();
      collectionSceneBridge.dispatch({ type: "collection:reset" });
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
          <p className="lead">카메라 촬영 기능은 다음 구현 단계에서 이곳에 연결됩니다.</p>
        </div>
        <div className="stage-placeholder" aria-label="채집 물리 장면 준비 중">
          <span>물리 장면 준비 중</span>
        </div>
      </section>

      <aside className="collection-sidebar" aria-label="채집 정보">
        <div className="metric"><span>모은 물건</span><strong>{state.items.length}</strong></div>
        <div className="metric"><span>축소 단계</span><strong>{state.settings.scaleLevel}</strong></div>
        {state.items.length === 0 ? (
          <StatusPanel title="아직 모은 물건이 없어요">
            <p>카메라 기능이 연결되면 물건을 촬영해 이곳에 쌓을 수 있습니다.</p>
          </StatusPanel>
        ) : (
          <ul className="item-list" aria-label="저장된 물건">
            {state.items.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
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
    </div>
  );
}
