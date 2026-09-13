import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COLLECTION_SETTINGS, type CollectedItem } from "../../domain/collection";
import { collectionRepository, deletePocketchDatabase } from "./collectionRepository";
import { StorageError, toStorageError } from "./errors";

const item = (overrides: Partial<CollectedItem> = {}): CollectedItem => ({
  id: "item-1",
  name: "노란 컵",
  description: "테스트 물건",
  image: new Blob(["webp"], { type: "image/webp" }),
  width: 640,
  height: 480,
  createdAt: "2026-09-12T10:00:00.000Z",
  ...overrides,
});

describe("collectionRepository", () => {
  beforeEach(async () => { await deletePocketchDatabase(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("creates the version-one stores when opening a new database", async () => {
    await collectionRepository.getItems();
    const request = indexedDB.open("pocketch", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    expect([...database.objectStoreNames]).toEqual([
      "collected-items",
      "collection-settings",
    ]);
    database.close();
  });

  it("stores items and restores their WebP blob and metadata", async () => {
    await collectionRepository.addItem(item());
    const restored = await collectionRepository.getItems();
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ id: "item-1", name: "노란 컵", width: 640, height: 480 });
    expect(restored[0].image).toBeInstanceOf(Blob);
    expect(restored[0].image.type).toBe("image/webp");
  });

  it("sorts items by creation time and deletes one item", async () => {
    await collectionRepository.addItem(item({ id: "later", createdAt: "2026-09-12T11:00:00.000Z" }));
    await collectionRepository.addItem(item({ id: "earlier", createdAt: "2026-09-12T09:00:00.000Z" }));
    expect((await collectionRepository.getItems()).map(({ id }) => id)).toEqual(["earlier", "later"]);
    await collectionRepository.deleteItem("earlier");
    expect((await collectionRepository.getItems()).map(({ id }) => id)).toEqual(["later"]);
  });

  it("returns defaults and persists collection scale settings", async () => {
    expect(await collectionRepository.getSettings()).toEqual(DEFAULT_COLLECTION_SETTINGS);
    await collectionRepository.updateSettings({ id: "collection-settings", scaleLevel: 2, globalScale: 0.49 });
    expect(await collectionRepository.getSettings()).toEqual({ id: "collection-settings", scaleLevel: 2, globalScale: 0.49 });
  });

  it("clears items and resets settings in one repository operation", async () => {
    await collectionRepository.addItem(item());
    await collectionRepository.updateSettings({ id: "collection-settings", scaleLevel: 3, globalScale: 0.343 });
    await collectionRepository.resetCollection();
    expect(await collectionRepository.getItems()).toEqual([]);
    expect(await collectionRepository.getSettings()).toEqual(DEFAULT_COLLECTION_SETTINGS);
  });

  it("rolls back item deletion when the settings write fails during reset", async () => {
    await collectionRepository.addItem(item());
    await collectionRepository.updateSettings({ id: "collection-settings", scaleLevel: 2, globalScale: 0.49 });

    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "collection-settings") {
        throw new DOMException("injected reset failure", "DataError");
      }
      return originalPut.call(this, value, key);
    });

    await expect(collectionRepository.resetCollection()).rejects.toMatchObject({ code: "reset-failed" });
    vi.restoreAllMocks();

    expect((await collectionRepository.getItems()).map(({ id }) => id)).toEqual(["item-1"]);
    expect(await collectionRepository.getSettings()).toEqual({
      id: "collection-settings",
      scaleLevel: 2,
      globalScale: 0.49,
    });
  });

  it("does not overwrite an existing item with add", async () => {
    await collectionRepository.addItem(item());
    await expect(collectionRepository.addItem(item({ name: "중복" }))).rejects.toMatchObject({ code: "write-failed" });
    expect((await collectionRepository.getItems())[0].name).toBe("노란 컵");
  });
});

describe("storage errors", () => {
  it("classifies quota errors separately", () => {
    const error = toStorageError(new DOMException("full", "QuotaExceededError"), "write");
    expect(error).toBeInstanceOf(StorageError);
    expect(error.code).toBe("quota-exceeded");
  });
});
