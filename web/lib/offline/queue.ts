// web/lib/offline/queue.ts
// Client-side IndexedDB queue of shopping ops made while offline.
// Insertion order is preserved via the autoincrement key.

const DB_NAME = "cookless-offline";
const STORE = "pending-ops";
const DB_VERSION = 1;

export type QueuedOp = {
  id: number;
  kind: "toggle" | "uncheck-all";
  payload: Record<string, unknown>;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function enqueue(op: Omit<QueuedOp, "id">): Promise<void> {
  await tx("readwrite", (store) => store.add(op));
}

export async function all(): Promise<QueuedOp[]> {
  return tx<QueuedOp[]>("readonly", (store) => store.getAll());
}

export async function remove(id: number): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
}

export async function count(): Promise<number> {
  return tx<number>("readonly", (store) => store.count());
}

export async function clear(): Promise<void> {
  await tx("readwrite", (store) => store.clear());
}
