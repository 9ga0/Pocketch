import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { Button } from "../../components/Button";
import type { CollectedItem } from "../../domain/collection";
import { removeBackgroundInBrowser } from "../../services/image-processing/backgroundRemoval";
import {
  pointFromClientCoordinates,
  segmentObjectAtPoint,
  type NormalizedPoint,
} from "../../services/image-processing/interactiveSegmentation";
import { optimizeTransparentImage, type ProcessedTransparentImage } from "../../services/image-processing/transparentImage";
import { collectionRepository } from "../../services/storage/collectionRepository";
import { StorageError } from "../../services/storage/errors";

type ProcessingPhase = "model" | "segment" | "fallback" | "optimize";

type ProcessingState =
  | { status: "selecting" }
  | { status: "processing"; phase: ProcessingPhase; percent: number }
  | { status: "ready"; result: ProcessedTransparentImage; url: string }
  | { status: "error"; message: string }
  | { status: "saving"; result: ProcessedTransparentImage; url: string }
  | { status: "save-error"; result: ProcessedTransparentImage; url: string; error: StorageError };

export interface ItemRegistrationProps {
  source: Blob;
  onCancel: () => void;
  onSaved: (item: CollectedItem) => void;
  onManageItems: () => void;
  segmentObject?: typeof segmentObjectAtPoint;
  removeBackground?: typeof removeBackgroundInBrowser;
  optimizeImage?: typeof optimizeTransparentImage;
  addItem?: typeof collectionRepository.addItem;
}

function processingMessage(phase: ProcessingPhase) {
  if (phase === "model") return "물건 선택 모델을 준비하고 있어요";
  if (phase === "segment") return "선택한 물건의 테두리를 찾고 있어요";
  if (phase === "fallback") return "자동 배경 제거로 다시 시도하고 있어요";
  return "투명 여백과 크기를 정리하고 있어요";
}

export function ItemRegistration({
  source,
  onCancel,
  onSaved,
  onManageItems,
  segmentObject = segmentObjectAtPoint,
  removeBackground = removeBackgroundInBrowser,
  optimizeImage = optimizeTransparentImage,
  addItem = collectionRepository.addItem,
}: ItemRegistrationProps) {
  const generationRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const draftRef = useRef<CollectedItem | null>(null);
  const sourceUrl = useMemo(() => URL.createObjectURL(source), [source]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [state, setState] = useState<ProcessingState>({ status: "selecting" });

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  useEffect(() => () => {
    generationRef.current += 1;
    revokePreview();
    URL.revokeObjectURL(sourceUrl);
  }, [revokePreview, sourceUrl]);

  const process = useCallback(async (point: NormalizedPoint) => {
    const generation = ++generationRef.current;
    revokePreview();
    setState({ status: "processing", phase: "model", percent: 10 });
    try {
      let removed: Blob;
      try {
        removed = await segmentObject(source, point, (phase) => {
          if (generation !== generationRef.current) return;
          setState({ status: "processing", phase, percent: phase === "model" ? 20 : 55 });
        });
      } catch {
        if (generation !== generationRef.current) return;
        setState({ status: "processing", phase: "fallback", percent: 20 });
        removed = await removeBackground(source, (progress) => {
          if (generation !== generationRef.current) return;
          setState({
            status: "processing",
            phase: "fallback",
            percent: 20 + Math.round(progress.percent * 0.5),
          });
        });
      }
      if (generation !== generationRef.current) return;
      setState({ status: "processing", phase: "optimize", percent: 80 });
      const result = await optimizeImage(removed);
      if (generation !== generationRef.current) return;
      const url = URL.createObjectURL(result.blob);
      previewUrlRef.current = url;
      setState({ status: "ready", result, url });
    } catch (error) {
      if (generation !== generationRef.current) return;
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "물건을 분리하지 못했습니다. 다시 시도해 주세요.",
      });
    }
  }, [optimizeImage, removeBackground, revokePreview, segmentObject, source]);

  const selectPoint = (event: PointerEvent<HTMLButtonElement>) => {
    if (state.status !== "selecting") return;
    void process(pointFromClientCoordinates(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    ));
  };

  const selectAgain = () => {
    generationRef.current += 1;
    revokePreview();
    setState({ status: "selecting" });
  };

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

  if (state.status === "selecting") {
    return (
      <section className="registration-card registration-card--selection" aria-labelledby="object-selection-title">
        <div className="object-selection-copy">
          <p className="eyebrow">SELECT OBJECT</p>
          <h2 id="object-selection-title">남길 물건을 터치하세요</h2>
          <p>물건 가운데를 한 번 누르면 주변 배경을 자동으로 제거합니다.</p>
        </div>
        <button className="object-selection" type="button" onPointerDown={selectPoint}>
          <img src={sourceUrl} alt="분리할 물건 선택" draggable={false} />
          <span aria-hidden="true">+</span>
        </button>
        <div className="registration-actions">
          <Button onClick={cancel}>취소</Button>
        </div>
      </section>
    );
  }

  if (state.status === "processing") {
    return (
      <section className="registration-card registration-card--processing" aria-live="polite">
        <span className="camera-loader" aria-hidden="true" />
        <h2>{processingMessage(state.phase)}</h2>
        <progress max="100" value={state.percent}>{state.percent}%</progress>
        <p>{state.percent}% · 첫 실행은 모델을 준비하느라 시간이 조금 더 걸릴 수 있습니다.</p>
        <Button onClick={cancel}>취소</Button>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="registration-card registration-card--processing" role="alert">
        <p className="eyebrow">PROCESSING ERROR</p>
        <h2>물건을 분리하지 못했어요</h2>
        <p className="registration-error">{state.message}</p>
        <div className="registration-actions">
          <Button onClick={cancel}>취소</Button>
          <Button variant="primary" onClick={selectAgain}>다시 선택</Button>
        </div>
      </section>
    );
  }

  const busy = state.status === "saving";
  const storageError = state.status === "save-error" ? state.error : null;
  return (
    <section className="registration-card" aria-labelledby="registration-title">
      <div className="transparent-preview">
        <img src={state.url} alt="배경을 제거한 물건 미리보기" />
        <span>{state.result.width} × {state.result.height} WebP</span>
      </div>
      <form onSubmit={(event) => void save(event)} noValidate>
        <p className="eyebrow">REGISTER ITEM</p>
        <h2 id="registration-title">물건 정보를 입력하세요</h2>
        <label>
          이름 <span aria-hidden="true">*</span>
          <input value={name} disabled={busy} maxLength={80} aria-invalid={Boolean(nameError)} onChange={(event) => setName(event.target.value)} />
        </label>
        {nameError ? <p className="registration-error" role="alert">{nameError}</p> : null}
        <label>
          설명 <span className="muted">선택</span>
          <textarea value={description} disabled={busy} maxLength={300} rows={3} onChange={(event) => setDescription(event.target.value)} />
        </label>
        {storageError ? (
          <div className="save-error" role="alert">
            <p>{storageError.message}</p>
            {storageError.code === "quota-exceeded" ? <Button type="button" onClick={onManageItems}>채집물 관리</Button> : null}
          </div>
        ) : null}
        <div className="registration-actions">
          <Button type="button" disabled={busy} onClick={selectAgain}>다시 선택</Button>
          <Button type="button" disabled={busy} onClick={cancel}>취소</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "저장 중…" : storageError ? "저장 다시 시도" : "채집물에 추가"}
          </Button>
        </div>
      </form>
    </section>
  );
}
