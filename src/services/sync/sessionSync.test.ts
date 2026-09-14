import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDoc, getDocs, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import type { CollectedItem, CollectionSettings } from "../../domain/collection";
import { ensureAnonymousUid, getFirebaseServices } from "./firebaseClient";
import { createShareThumbnail } from "../image-processing/shareThumbnail";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((..._args: unknown[]) => ({ __type: "collection", path: _args.slice(1).join("/") })),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  doc: vi.fn((..._args: unknown[]) => ({ __type: "doc", path: _args.slice(1).join("/") })),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  setDoc: vi.fn().mockResolvedValue(undefined),
  writeBatch: vi.fn(),
}));

vi.mock("./firebaseClient", () => ({
  ensureAnonymousUid: vi.fn().mockResolvedValue("owner-uid"),
  getFirebaseServices: vi.fn(() => ({ firestore: { __type: "firestore" } })),
}));

vi.mock("../image-processing/shareThumbnail", () => ({
  createShareThumbnail: vi.fn(),
}));

const settings: CollectionSettings = { id: "collection-settings", scaleLevel: 1, globalScale: 0.7 };
const item: CollectedItem = {
  id: "item-1",
  name: "컵",
  description: "노란 컵",
  image: new Blob(["img"], { type: "image/webp" }),
  width: 200,
  height: 200,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("sessionSync", () => {
  beforeEach(() => {
    vi.mocked(ensureAnonymousUid).mockClear().mockResolvedValue("owner-uid");
    vi.mocked(setDoc).mockClear().mockResolvedValue(undefined);
    vi.mocked(deleteDoc).mockClear().mockResolvedValue(undefined);
    vi.mocked(createShareThumbnail).mockReset();
    vi.mocked(getDocs).mockReset();
    vi.mocked(onSnapshot).mockClear();
    vi.mocked(writeBatch).mockReset();
    vi.stubGlobal("crypto", { ...crypto, randomUUID: vi.fn(() => "generated-session-id") });
  });

  it("creates a session doc under the anonymous owner and reuses an existing sessionId", async () => {
    const { ensureSession } = await import("./sessionSync");

    const created = await ensureSession(settings);
    expect(created).toBe("generated-session-id");
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "sessions/generated-session-id" }),
      expect.objectContaining({ ownerUid: "owner-uid", scaleLevel: 1, globalScale: 0.7 }),
      { merge: true },
    );

    const reused = await ensureSession({ ...settings, sessionId: "existing-session" });
    expect(reused).toBe("existing-session");
  });

  it("mirrors an item when a share thumbnail fits the budget, and skips otherwise", async () => {
    const { mirrorItem } = await import("./sessionSync");
    vi.mocked(createShareThumbnail).mockResolvedValueOnce({
      base64: "aGVsbG8=",
      contentType: "image/webp",
      width: 240,
      height: 240,
    });
    const mirrored = await mirrorItem("session-1", item);
    expect(mirrored).toBe(true);
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "sessions/session-1/items/item-1" }),
      expect.objectContaining({ name: "컵", imageBase64: "aGVsbG8=" }),
    );

    vi.mocked(createShareThumbnail).mockResolvedValueOnce(null);
    const skipped = await mirrorItem("session-1", item);
    expect(skipped).toBe(false);
  });

  it("deletes an item mirror", async () => {
    const { mirrorDeleteItem } = await import("./sessionSync");
    await mirrorDeleteItem("session-1", "item-1");
    expect(deleteDoc).toHaveBeenCalledWith(expect.objectContaining({ path: "sessions/session-1/items/item-1" }));
  });

  it("revokes a session by deleting every item and the session doc in one batch", async () => {
    const batchDelete = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    vi.mocked(writeBatch).mockReturnValue({ delete: batchDelete, commit: batchCommit } as unknown as ReturnType<typeof writeBatch>);
    vi.mocked(getDocs).mockResolvedValue({
      forEach: (callback: (snap: { ref: unknown }) => void) => {
        callback({ ref: { __type: "doc", path: "session-1/items/a" } });
        callback({ ref: { __type: "doc", path: "session-1/items/b" } });
      },
    } as unknown as Awaited<ReturnType<typeof getDocs>>);

    const { revokeSession } = await import("./sessionSync");
    await revokeSession("session-1");

    expect(batchDelete).toHaveBeenCalledTimes(3);
    expect(batchCommit).toHaveBeenCalledOnce();
  });

  it("combines session and item snapshots into one change payload", async () => {
    const { subscribeToSharedSession } = await import("./sessionSync");
    const onChange = vi.fn();
    const onError = vi.fn();

    const unsubscribe = subscribeToSharedSession("session-1", onChange, onError);

    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(2));
    const [, sessionNext] = vi.mocked(onSnapshot).mock.calls[0];
    const [, itemsNext] = vi.mocked(onSnapshot).mock.calls[1];

    (sessionNext as (snap: unknown) => void)({
      exists: () => true,
      data: () => ({ scaleLevel: 2, globalScale: 0.49 }),
    });
    expect(onChange).toHaveBeenLastCalledWith({
      exists: true,
      settings: { scaleLevel: 2, globalScale: 0.49 },
      items: [],
    });

    (itemsNext as (snap: unknown) => void)({
      docs: [
        { id: "b", data: () => ({ name: "나중 물건", createdAt: "2026-01-02T00:00:00.000Z" }) },
        { id: "a", data: () => ({ name: "먼저 물건", createdAt: "2026-01-01T00:00:00.000Z" }) },
      ],
    });
    expect(onChange).toHaveBeenLastCalledWith({
      exists: true,
      settings: { scaleLevel: 2, globalScale: 0.49 },
      items: [
        expect.objectContaining({ id: "a", name: "먼저 물건" }),
        expect.objectContaining({ id: "b", name: "나중 물건" }),
      ],
    });

    unsubscribe();
  });

  it("uses getFirebaseServices' firestore instance for subscriptions", async () => {
    const { subscribeToSharedSession } = await import("./sessionSync");
    subscribeToSharedSession("session-1", vi.fn(), vi.fn());
    await vi.waitFor(() => expect(getFirebaseServices).toHaveBeenCalled());
  });
});
