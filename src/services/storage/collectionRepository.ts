import {
  DEFAULT_COLLECTION_SETTINGS,
  type CollectedItem,
  type CollectionSettings, type GameResult,
} from "../../domain/collection";
import { toStorageError } from "./errors";

export const DATABASE_NAME = "pocketch";
export const DATABASE_VERSION = 2;
const ITEM_STORE = "collected-items";
const SETTINGS_STORE = "collection-settings";
const RESULTS_STORE = "game-results";
let resultOperationQueue: Promise<void> = Promise.resolve();

function serializeResultOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = resultOperationQueue.then(operation, operation);
  resultOperationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB request failed")),
      { once: true },
    );
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => reject(transaction.error ?? new Error("IndexedDB transaction failed")),
      { once: true },
    );
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in globalThis)) {
    throw toStorageError(new Error("IndexedDB is unavailable"), "open");
  }
  try {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ITEM_STORE)) {
        database.createObjectStore(ITEM_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(RESULTS_STORE)) {
        database.createObjectStore(RESULTS_STORE, { keyPath: "id" });
      }
    });
    return await requestResult(request);
  } catch (error) {
    throw toStorageError(error, "open");
  }
}

async function useDatabase<T>(
  operation: "read" | "write" | "reset",
  callback: (database: IDBDatabase) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await callback(database);
  } catch (error) {
    throw toStorageError(error, operation);
  } finally {
    database.close();
  }
}

export const collectionRepository = {
  async getItems(): Promise<CollectedItem[]> {
    return useDatabase("read", async (database) => {
      const transaction = database.transaction(ITEM_STORE, "readonly");
      const items = await requestResult<CollectedItem[]>(
        transaction.objectStore(ITEM_STORE).getAll(),
      );
      await transactionDone(transaction);
      return items.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    });
  },

  async addItem(item: CollectedItem): Promise<void> {
    return useDatabase("write", async (database) => {
      const transaction = database.transaction(ITEM_STORE, "readwrite");
      transaction.objectStore(ITEM_STORE).add(item);
      await transactionDone(transaction);
    });
  },

  async deleteItem(id: string): Promise<void> {
    return useDatabase("write", async (database) => {
      const transaction = database.transaction(ITEM_STORE, "readwrite");
      transaction.objectStore(ITEM_STORE).delete(id);
      await transactionDone(transaction);
    });
  },

  async getSettings(): Promise<CollectionSettings> {
    return useDatabase("read", async (database) => {
      const transaction = database.transaction(SETTINGS_STORE, "readonly");
      const settings = await requestResult<CollectionSettings | undefined>(
        transaction.objectStore(SETTINGS_STORE).get(DEFAULT_COLLECTION_SETTINGS.id),
      );
      await transactionDone(transaction);
      return settings ?? { ...DEFAULT_COLLECTION_SETTINGS };
    });
  },

  async updateSettings(settings: CollectionSettings): Promise<void> {
    return useDatabase("write", async (database) => {
      const transaction = database.transaction(SETTINGS_STORE, "readwrite");
      transaction.objectStore(SETTINGS_STORE).put(settings);
      await transactionDone(transaction);
    });
  },

  async addGameResult(result: GameResult): Promise<void> {
    return serializeResultOperation(() => useDatabase("write", async (database) => {
      const transaction = database.transaction(RESULTS_STORE, "readwrite");
      transaction.objectStore(RESULTS_STORE).put(result);
      await transactionDone(transaction);
    }));
  },

  async getGameResults(): Promise<GameResult[]> {
    await resultOperationQueue;
    return useDatabase("read", async (database) => {
      const transaction = database.transaction(RESULTS_STORE, "readonly");
      const results = await requestResult<GameResult[]>(transaction.objectStore(RESULTS_STORE).getAll());
      await transactionDone(transaction);
      return results
        .map((result, index) => ({ result, index }))
        .sort((left, right) => right.result.score - left.result.score || left.result.playedAt.localeCompare(right.result.playedAt) || left.index - right.index)
        .map(({ result }) => result);
    });
  },

  async getTopResults(limit = 10): Promise<GameResult[]> {
    return (await this.getGameResults()).slice(0, Math.max(0, limit));
  },

  async resetResults(): Promise<void> {
    return serializeResultOperation(() => useDatabase("reset", async (database) => {
      const transaction = database.transaction(RESULTS_STORE, "readwrite");
      transaction.objectStore(RESULTS_STORE).clear();
      await transactionDone(transaction);
    }));
  },

  async resetCollection(): Promise<void> {
    return useDatabase("reset", async (database) => {
      const transaction = database.transaction([ITEM_STORE, SETTINGS_STORE], "readwrite");
      const completion = transactionDone(transaction);
      try {
        transaction.objectStore(ITEM_STORE).clear();
        transaction.objectStore(SETTINGS_STORE).put({ ...DEFAULT_COLLECTION_SETTINGS });
        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // A request failure may already have aborted the transaction.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    });
  },
};

export async function deletePocketchDatabase(): Promise<void> {
  if (!("indexedDB" in globalThis)) return;
  try {
    await requestResult(indexedDB.deleteDatabase(DATABASE_NAME));
  } catch (error) {
    throw toStorageError(error, "reset");
  }
}
