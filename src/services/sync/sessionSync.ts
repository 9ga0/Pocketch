import type { CollectedItem, CollectionSettings } from "../../domain/collection";
import { createShareThumbnail } from "../image-processing/shareThumbnail";

export interface SharedSessionItem {
  id: string;
  name: string;
  description: string;
  imageBase64: string;
  imageContentType: string;
  width: number;
  height: number;
  createdAt: string;
}

export interface SharedSessionSettings {
  scaleLevel: number;
  globalScale: number;
}

export interface SharedSessionSnapshot {
  exists: boolean;
  settings: SharedSessionSettings | null;
  items: SharedSessionItem[];
}

// firebase SDK는 공유 기능을 실제로 사용할 때만 필요하다. 대다수 방문자는 공유를 켜지 않으므로
// 정적 import 대신 동적 import로 불러와 초기 번들 크기와 로드 시간에 영향을 주지 않게 한다.
function loadFirestore() {
  return import("firebase/firestore");
}

function loadClient() {
  return import("./firebaseClient");
}

export async function ensureSession(settings: CollectionSettings): Promise<string> {
  const [{ doc, setDoc }, { ensureAnonymousUid, getFirebaseServices }] = await Promise.all([
    loadFirestore(),
    loadClient(),
  ]);
  const ownerUid = await ensureAnonymousUid();
  const sessionId = settings.sessionId ?? crypto.randomUUID();
  await setDoc(
    doc(getFirebaseServices().firestore, "sessions", sessionId),
    {
      ownerUid,
      createdAt: new Date().toISOString(),
      scaleLevel: settings.scaleLevel,
      globalScale: settings.globalScale,
    },
    { merge: true },
  );
  return sessionId;
}

export async function mirrorSettings(sessionId: string, settings: CollectionSettings): Promise<void> {
  const [{ doc, setDoc }, { ensureAnonymousUid, getFirebaseServices }] = await Promise.all([
    loadFirestore(),
    loadClient(),
  ]);
  await ensureAnonymousUid();
  await setDoc(
    doc(getFirebaseServices().firestore, "sessions", sessionId),
    { scaleLevel: settings.scaleLevel, globalScale: settings.globalScale },
    { merge: true },
  );
}

/** 공유용 축소본이 예산을 넘겨 만들어지지 않으면(null) 해당 물건은 조용히 미러링을 건너뛴다. */
export async function mirrorItem(sessionId: string, item: CollectedItem): Promise<boolean> {
  const thumbnail = await createShareThumbnail(item.image);
  if (!thumbnail) return false;
  const [{ doc, setDoc }, { ensureAnonymousUid, getFirebaseServices }] = await Promise.all([
    loadFirestore(),
    loadClient(),
  ]);
  await ensureAnonymousUid();
  await setDoc(doc(getFirebaseServices().firestore, "sessions", sessionId, "items", item.id), {
    name: item.name,
    description: item.description,
    imageBase64: thumbnail.base64,
    imageContentType: thumbnail.contentType,
    width: thumbnail.width,
    height: thumbnail.height,
    createdAt: item.createdAt,
  });
  return true;
}

export async function mirrorDeleteItem(sessionId: string, itemId: string): Promise<void> {
  const [{ doc, deleteDoc }, { ensureAnonymousUid, getFirebaseServices }] = await Promise.all([
    loadFirestore(),
    loadClient(),
  ]);
  await ensureAnonymousUid();
  await deleteDoc(doc(getFirebaseServices().firestore, "sessions", sessionId, "items", itemId));
}

export async function revokeSession(sessionId: string): Promise<void> {
  const [{ collection, doc, getDocs, writeBatch }, { ensureAnonymousUid, getFirebaseServices }] = await Promise.all([
    loadFirestore(),
    loadClient(),
  ]);
  await ensureAnonymousUid();
  const { firestore } = getFirebaseServices();
  const snapshot = await getDocs(collection(firestore, "sessions", sessionId, "items"));
  const batch = writeBatch(firestore);
  snapshot.forEach((itemSnapshot) => batch.delete(itemSnapshot.ref));
  batch.delete(doc(firestore, "sessions", sessionId));
  await batch.commit();
}

export function subscribeToSharedSession(
  sessionId: string,
  onChange: (snapshot: SharedSessionSnapshot) => void,
  onError: (error: unknown) => void,
): () => void {
  let disposed = false;
  let unsubscribeSession: (() => void) | undefined;
  let unsubscribeItems: (() => void) | undefined;

  void (async () => {
    try {
      const [{ collection, doc, onSnapshot }, { getFirebaseServices }] = await Promise.all([
        loadFirestore(),
        loadClient(),
      ]);
      if (disposed) return;
      const { firestore } = getFirebaseServices();
      let sessionExists = false;
      let settings: SharedSessionSettings | null = null;
      let items: SharedSessionItem[] = [];
      const emit = () => onChange({ exists: sessionExists, settings, items });

      unsubscribeSession = onSnapshot(
        doc(firestore, "sessions", sessionId),
        (snapshot) => {
          sessionExists = snapshot.exists();
          const data = snapshot.data();
          settings = data ? { scaleLevel: data.scaleLevel ?? 0, globalScale: data.globalScale ?? 1 } : null;
          emit();
        },
        onError,
      );

      unsubscribeItems = onSnapshot(
        collection(firestore, "sessions", sessionId, "items"),
        (snapshot) => {
          items = snapshot.docs
            .map((itemSnapshot) => ({ id: itemSnapshot.id, ...itemSnapshot.data() }) as SharedSessionItem)
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
          emit();
        },
        onError,
      );

      if (disposed) {
        unsubscribeSession();
        unsubscribeItems();
      }
    } catch (error) {
      if (!disposed) onError(error);
    }
  })();

  return () => {
    disposed = true;
    unsubscribeSession?.();
    unsubscribeItems?.();
  };
}
