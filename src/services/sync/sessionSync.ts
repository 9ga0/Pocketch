import type { Firestore } from "firebase/firestore";
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

type FirestoreModule = Awaited<ReturnType<typeof loadFirestore>>;

/** 익명 로그인을 보장한 뒤 Firestore 모듈·인스턴스·소유자 uid를 콜백에 넘긴다(쓰기 전용 헬퍼). */
async function withOwnerContext<T>(
  action: (firestore: FirestoreModule, db: Firestore, ownerUid: string) => Promise<T>,
): Promise<T> {
  const [firestore, { ensureAnonymousUid, getFirebaseServices }] = await Promise.all([
    loadFirestore(),
    loadClient(),
  ]);
  const ownerUid = await ensureAnonymousUid();
  return action(firestore, getFirebaseServices().firestore, ownerUid);
}

export async function ensureSession(settings: CollectionSettings): Promise<string> {
  const sessionId = settings.sessionId ?? crypto.randomUUID();
  await withOwnerContext(async ({ doc, setDoc }, db, ownerUid) => {
    await setDoc(
      doc(db, "sessions", sessionId),
      {
        ownerUid,
        createdAt: new Date().toISOString(),
        scaleLevel: settings.scaleLevel,
        globalScale: settings.globalScale,
      },
      { merge: true },
    );
  });
  return sessionId;
}

export async function mirrorSettings(sessionId: string, settings: CollectionSettings): Promise<void> {
  await withOwnerContext(async ({ doc, setDoc }, db) => {
    await setDoc(
      doc(db, "sessions", sessionId),
      { scaleLevel: settings.scaleLevel, globalScale: settings.globalScale },
      { merge: true },
    );
  });
}

/** 공유용 축소본이 예산을 넘겨 만들어지지 않으면(null) 해당 물건은 조용히 미러링을 건너뛴다. */
export async function mirrorItem(sessionId: string, item: CollectedItem): Promise<boolean> {
  const thumbnail = await createShareThumbnail(item.image);
  if (!thumbnail) return false;
  await withOwnerContext(async ({ doc, setDoc }, db) => {
    await setDoc(doc(db, "sessions", sessionId, "items", item.id), {
      name: item.name,
      description: item.description,
      imageBase64: thumbnail.base64,
      imageContentType: thumbnail.contentType,
      width: thumbnail.width,
      height: thumbnail.height,
      createdAt: item.createdAt,
    });
  });
  return true;
}

export async function mirrorDeleteItem(sessionId: string, itemId: string): Promise<void> {
  await withOwnerContext(async ({ doc, deleteDoc }, db) => {
    await deleteDoc(doc(db, "sessions", sessionId, "items", itemId));
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await withOwnerContext(async ({ collection, doc, getDocs, writeBatch }, db) => {
    const snapshot = await getDocs(collection(db, "sessions", sessionId, "items"));
    const batch = writeBatch(db);
    snapshot.forEach((itemSnapshot) => batch.delete(itemSnapshot.ref));
    batch.delete(doc(db, "sessions", sessionId));
    await batch.commit();
  });
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
