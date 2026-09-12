import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import type { CollectedItem } from "../../domain/collection";
import { removeBackgroundInBrowser, type RemovalProgress } from "../../services/image-processing/backgroundRemoval";
import { optimizeTransparentImage, type ProcessedTransparentImage } from "../../services/image-processing/transparentImage";
import { collectionRepository } from "../../services/storage/collectionRepository";
import { StorageError } from "../../services/storage/errors";

type ProcessingState =
  | { status: "processing"; progress: RemovalProgress | { phase: "optimize"; percent: number } }
  | { status: "ready"; result: ProcessedTransparentImage; url: string }
  | { status: "error"; message: string }
  | { status: "saving"; result: ProcessedTransparentImage; url: string }
  | { status: "save-error"; result: ProcessedTransparentImage; url: string; error: StorageError };

export interface ItemRegistrationProps {
  source: Blob;
  onCancel: () => void;
  onSaved: (item: CollectedItem) => void;
  onManageItems: () => void;
  removeBackground?: typeof removeBackgroundInBrowser;
  optimizeImage?: typeof optimizeTransparentImage;
  addItem?: typeof collectionRepository.addItem;
}

function processingMessage(progress: ProcessingState & { status: "processing" }) {
  if (progress.progress.phase === "model") return "배경 제거 모델을 준비하고 있어요";
  if (progress.progress.phase === "remove") return "사진에서 물건을 분리하고 있어요";
  return "투명 여백과 크기를 정리하고 있어요";
}

export function ItemRegistration({
  source,
  onCancel,
  onSaved,
  onManageItems,
  removeBackground = removeBackgroundInBrowser,
  optimizeImage = optimizeTransparentImage,
  addItem = collectionRepository.addItem,
}: ItemRegistrationProps) {
  const generationRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const draftRef = useRef<CollectedItem | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [state, setState] = useState<ProcessingState>({
    status: "processing",
    progress: { phase: "model", percent: 0 },
  });

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  const process = useCallback(async () => {
    const generation = ++generationRef.current;
    revokePreview();
    setState({ status: "processing", progress: { phase: "model", percent: 0 } });
    try {
      const removed = await removeBackground(source, (progress) => {
        if (generation === generationRef.current) setState({ status: "processing", progress });
      });
      if (generation !== generationRef.current) return;
      setState({ status: "processing", progress: { phase: "optimize", percent: 70 } });
      const result = await optimizeImage(removed);
      if (generation !== generationRef.current) return;
      const url = URL.createObjectURL(result.blob);
      previewUrlRef.current = url;
      setState({ status: "ready", result, url });
    } catch (error) {
      if (generation !== generationRef.current) return;
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "배경을 제거하지 못했습니다. 다시 시도해 주세요.",
      });
    }
  }, [optimizeImage, removeBackground, revokePreview, source]);

  useEffect(() => {
    void process();
    return () => {
      generationRef.current += 1;
      revokePreview();
    };
  }, [process, revokePreview]);

  const cancel = () => {
    generationRef.current += 1;
    revokePreview();
    onCancel();
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if ((state.status !== "ready" && state.status !== "save-error") || savingRef.current) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("물건 이름을 입력해 주세요.");
      return;
    }
    setNameError(null);
    savingRef.current = true;
    const { result, url } = state;
    const item: CollectedItem = {
      id: draftRef.current?.id ?? crypto.randomUUID(),
      name: trimmedName,
      description: description.trim(),
      image: result.blob,
      width: result.width,
      height: result.height,
      createdAt: draftRef.current?.createdAt ?? new Date().toISOString(),
    };
    draftRef.current = item;
    setState({ status: "saving", result, url });
    try {
      await addItem(item);
      onSaved(item);
    } catch (error) {
      const storageError = error instanceof StorageError
        ? error
        : new StorageError("write-failed", "물건을 저장하지 못했습니다. 다시 시도해 주세요.", { cause: error });
      setState({ status: "save-error", result, url, error: storageError });
    } finally {
      savingRef.current = false;
    }
  };

  if (state.status === "processing") {
    return (
      <section className="registration-card registration-card--processing" aria-live="polite">
        <span className="camera-loader" aria-hidden="true" />
        <h2>{processingMessage(state)}</h2>
        <progress max="100" value={state.progress.percent}>{state.progress.percent}%</progress>
        <p>{state.progress.percent}% · 첫 실행은 모델을 내려받아 시간이 더 걸릴 수 있습니다.</p>
        <Button onClick={cancel}>취소</Button>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="registration-card" role="alert">
        <p className="eyebrow">PROCESSING ERROR</p>
        <h2>배경을 제거하지 못했어요</h2>
        <p className="registration-error">{state.message}</p>
        <div className="registration-actions">
          <Button onClick={cancel}>취소</Button>
          <Button variant="primary" onClick={() => void process()}>다시 시도</Button>
        </div>
      </section>
    );
  }

  const busy = state.status === "saving";
  const storageError = state.status === "save-error" ? state.error : null;
  return (
    <section className="registration-card" aria-labelledby="registration-title">
      <div className="transparent-preview">
        <img src={state.url} alt="배경이 제거된 물건 미리보기" />
        <span>{state.result.width} × {state.result.height} WebP</span>
      </div>
      <form onSubmit={(event) => void save(event)} noValidate>
        <p className="eyebrow">REGISTER ITEM</p>
        <h2 id="registration-title">물건 정보를 입력하세요</h2>
        <label>
          이름 <span aria-hidden="true">*</span>
          <input
            value={name}
            disabled={busy}
            maxLength={80}
            aria-invalid={Boolean(nameError)}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {nameError ? <p className="registration-error" role="alert">{nameError}</p> : null}
        <label>
          설명 <span className="muted">선택</span>
          <textarea
            value={description}
            disabled={busy}
            maxLength={300}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {storageError ? (
          <div className="save-error" role="alert">
            <p>{storageError.message}</p>
            {storageError.code === "quota-exceeded" ? (
              <Button type="button" onClick={onManageItems}>채집물 관리</Button>
            ) : null}
          </div>
        ) : null}
        <div className="registration-actions">
          <Button type="button" disabled={busy} onClick={cancel}>취소</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "저장 중…" : storageError ? "저장 다시 시도" : "채집물에 추가"}
          </Button>
        </div>
      </form>
    </section>
  );
}
